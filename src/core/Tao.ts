import { Echo } from "echo-state";
import {
  TaoConfig,
  TaoEvent,
  TaoEventListener,
  TaoStatus,
  TaozenEventType,
  ZenExecutor,
  ZenInput,
  ZenRetryConfig,
  ZenState,
  ZenStatus,
} from "./type";
import { Zen } from "./Zen";

// 添加一个新的接口来描述任务的运行时状态
export interface TaoRuntimeState {
  name: string; // 任务名称
  description?: string; // 任务描述
  status: TaoStatus; // 任务状态
  progress: number; // 任务进度(0-100)
  paused: boolean; // 是否暂停
  executionTime?: number; // 执行时间(毫秒)
  zens: {
    // 步骤信息数组
    id: string; // 步骤ID
    name: string; // 步骤名称
    status: ZenStatus; // 步骤状态
    error?: string; // 错误信息
    result?: any; // 执行结果
    startTime?: number; // 开始时间
  }[];
}

export interface TaoState {
  taos: Record<string, TaoRuntimeState>;
  states: Record<string, Record<string, ZenState>>;
  events: Record<string, TaoEvent[]>;
}

// Tao类 - 管理整个任务流程
export class Tao {
  // 静态存储实例，用于管理**注册**任务的状态
  private static store: Echo<TaoState> = new Echo<TaoState>({
    taos: {},
    states: {},
    events: {},
  }).localStorage({
    name: "taozen-store",
  });

  // 静态初始化块 - 应用启动时执行一次
  static {
    Tao.initializeFromStorage();
  }

  // 从存储中恢复实例
  static initializeFromStorage() {
    // 尝试从localStorage恢复所有任务
    try {
      const state = Tao.store.current;
      const taoIds = Object.keys(state.taos || {});

      if (taoIds.length > 0) {
        console.log(`发现 ${taoIds.length} 个已保存的任务，尝试恢复...`);

        for (const taoId of taoIds) {
          // 只恢复失败或取消的任务，其他状态的任务可能不需要恢复
          const taoData = state.taos[taoId];
          if (taoData.status === "failed" || taoData.status === "cancelled") {
            Tao.restoreInstance(taoId);
          }
        }

        console.log(`恢复完成，当前有 ${Tao.instances.size} 个任务实例`);
      }
    } catch (error) {
      console.error("恢复任务实例时出错:", error);
    }
  }

  // 绑定store的use方法
  static use = <T = TaoState>(selector?: (state: TaoState) => T) =>
    Tao.store.use(selector);

  static current() {
    return Tao.store.current;
  }
  // 实例属性
  /* 步骤映射 */
  private zens = new Map<string, Zen<any, any>>();
  /* 事件监听器集合 */
  private eventListeners = new Set<TaoEventListener>();
  /* 中断控制器 */
  private abortController = new AbortController();

  /* 暂停Promise */
  private pausePromise?: Promise<void>;
  /* 暂停解决函数 */
  private pauseResolve?: (value: void) => void;
  /* 是否已运行标志 */
  private hasRun = false;
  /* 任务ID */
  private id?: string;
  /* 任务状态 */
  private status: TaoStatus = "pending";
  /* 运行中的步骤集合 */
  private runningZens = new Set<string>();
  /* 任务实例映射 */
  private static instances = new Map<string, Tao>();
  /* 清理函数数组 */
  private cleanupFunctions: Array<() => void> = [];
  /* 最大并发任务数 */
  private static maxConcurrentTaos = 10;
  /* 当前运行任务数 */
  private static runningTaos = 0;

  /**
   * 创建任务实例
   * @param config - 任务配置
   */
  constructor(private config: TaoConfig) {}

  /**
   * 注册任务到存储
   * @returns string - 返回任务ID
   * @throws Error - 如果任务已注册则抛出错误
   */
  register(): Tao {
    /* 如果任务已注册，则抛出错误 */
    if (this.id) {
      throw new Error("Tao already registered");
    }

    /* 生成任务ID */
    const id = `tao-${Date.now()}`;
    /* 设置任务ID */
    this.id = id;
    /* 添加到实例映射 */
    Tao.instances.set(id, this);

    /* 更新状态存储 */
    Tao.store.set((state) => ({
      taos: {
        ...state.taos,
        [id]: this.getRuntimeState(),
      },
      states: { ...state.states, [id]: this.getAllZenStates() },
      events: { ...state.events, [id]: [] },
    }));

    /* 监听事件并更新状态 */
    const unsubscribe = this.on((event) => {
      if (!this.id) return;
      Tao.store.set((state) => {
        const currentEvents = state.events[id] || [];
        return {
          taos: {
            ...state.taos,
            [id]: this.getRuntimeState(),
          },
          events: {
            ...state.events,
            [id]: [...currentEvents, event],
          },
          states: {
            ...state.states,
            [id]: this.getAllZenStates(),
          },
        };
      });
    });

    /* 存储清理函数以便后续调用 */
    this.cleanupFunctions.push(unsubscribe);

    /* 返回任务ID */
    return this;
  }

  /**
   * 从存储中移除任务
   * @throws Error - 如果任务未注册则抛出错误
   */
  remove(): void {
    /* 如果任务未注册，则抛出错误 */
    if (!this.id) {
      throw new Error("Tao not registered");
    }

    // 清理资源
    this.dispose();

    // 从存储中移除任务相关数据
    Tao.store.set((state) => {
      const { [this.id!]: _, ...restTaos } = state.taos;
      const { [this.id!]: __, ...restStates } = state.states;
      const { [this.id!]: ___, ...restEvents } = state.events;
      return {
        taos: restTaos,
        states: restStates,
        events: restEvents,
      };
    });

    // 从实例映射中移除
    Tao.instances.delete(this.id);
    this.id = undefined;
  }

  /**
   * 清理任务资源
   * 包括：
   * 1. 取消所有运行中的步骤
   * 2. 清理事件监听器
   * 3. 清理步骤资源
   * 4. 重置运行时状态
   * 5. 执行注册的清理函数
   */
  private dispose(): void {
    // 取消所有运行中的步骤
    this.abortController.abort();

    // 清理事件监听器
    this.eventListeners.clear();

    // 清理步骤资源
    this.zens.forEach((zen) => {
      zen.dispose();
    });
    this.zens.clear();

    // 清理运行时状态
    this.runningZens.clear();
    this.pausePromise = undefined;
    this.pauseResolve = undefined;

    // 执行所有注册的清理函数
    this.cleanupFunctions.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    });
    this.cleanupFunctions = [];

    // 减少运行中的任务计数
    if (this.status === "running") {
      Tao.runningTaos = Math.max(0, Tao.runningTaos - 1);
    }
  }

  /**
   * 获取任务ID
   * @returns string - 任务ID
   * @throws Error - 如果任务未注册则抛出错误
   */
  getId(): string | undefined {
    return this.id;
  }

  /**
   * 创建新的任务步骤
   * @template TOutput - 输出结果类型
   * @param name - 步骤名称
   * @returns Zen - 创建的步骤实例
   */
  zen<TOutput = any>(name: string): Zen<ZenInput, TOutput> {
    /* 创建新的步骤实例 */
    const zen = new Zen<ZenInput, TOutput>(name, this);
    /* 将步骤添加到步骤映射中 */
    this.zens.set(zen.id, zen);
    /* 返回步骤实例 */
    return zen;
  }

  set description(description: string) {
    this.config.description = description;

    if (this.id && Tao.store.current.taos[this.id]) {
      Tao.store.set((state) => ({
        taos: {
          ...state.taos,
          [this.id!]: {
            ...state.taos[this.id!],
            description,
          },
        },
      }));
    }
  }

  /**
   * 执行整个任务流程
   * @returns Promise<Map<string, any>> - 所有步骤的执行结果
   * @throws Error - 任务执行失败时抛出错误
   */
  async run(): Promise<Map<string, any>> {
    /* 检查任务是否已运行过 */
    if (this.hasRun) {
      throw new Error(
        "Tao can only be run once. Create a new instance to run again."
      );
    }

    /* 检查是否超过最大并发任务数 */
    if (Tao.runningTaos >= Tao.maxConcurrentTaos) {
      throw new Error(
        `Too many concurrent taos. Maximum allowed: ${Tao.maxConcurrentTaos}`
      );
    }

    /* 增加运行中任务计数 */
    Tao.runningTaos++;
    this.hasRun = true;

    try {
      /* 更新任务状态为运行中 */
      await this.updateStatus("running");

      /* 检查是否已取消 */
      if (this.abortController.signal.aborted) {
        await this.updateStatus("cancelled");
        throw new Error("Tao cancelled");
      }

      /* 存储执行结果 */
      const results = new Map<string, any>();
      /* 获取步骤执行顺序 */
      const executionOrder = this.getExecutionOrder();

      /* 按批次执行步骤 */
      for (const batch of executionOrder) {
        /* 检查是否已取消 */
        if (this.abortController.signal.aborted) {
          await this.updateStatus("cancelled");
          throw new Error("Tao cancelled");
        }

        /* 并行执行当前批次的所有步骤 */
        await Promise.all(
          batch.map(async (zenId) => {
            const zen = this.zens.get(zenId)!;
            this.runningZens.add(zenId);

            try {
              /* 执行步骤并获取结果 */
              const result = await this.executeZen(zen);
              results.set(zenId, result);
              this.runningZens.delete(zenId);

              /* 发出步骤完成事件 */
              this.emit({
                type: "zen:complete",
                zenId,
                timestamp: Date.now(),
                data: result,
              });
            } catch (error) {
              /* 从运行中步骤集合中移除 */
              this.runningZens.delete(zenId);
              throw error;
            }
          })
        );
      }

      /* 最后检查一次是否已取消 */
      if (this.abortController.signal.aborted) {
        await this.updateStatus("cancelled");
        throw new Error("Tao cancelled");
      }

      /* 更新任务状态为已完成 */
      await this.updateStatus("completed");
      return results;
    } catch (error) {
      /* 处理执行过程中的错误 */
      await this.handleZenError(
        error instanceof Error ? error : new Error(String(error)),
        ""
      );
      throw error;
    } finally {
      /* 减少运行中任务计数 */
      Tao.runningTaos = Math.max(0, Tao.runningTaos - 1);
    }
  }

  /**
   * 暂停任务执行
   * 已开始执行的步骤会继续到完成，但不会开始新的步骤
   * @returns Promise<void>
   */
  async pause(): Promise<void> {
    /* 如果已暂停或不在运行状态，直接返回 */
    if (this.status !== "running") return;

    /* 设置暂停标志 */
    this.status = "paused";
    /* 创建暂停Promise */
    this.pausePromise = new Promise<void>((resolve) => {
      this.pauseResolve = resolve;
    });

    /* 发出任务暂停事件 */
    this.emit({
      type: "tao:pause",
      timestamp: Date.now(),
    });

    /* 等待暂停完全生效 */
    await Promise.resolve();
  }

  /**
   * 恢复已暂停的任务
   * 从暂停点继续执行剩余步骤
   * @returns Promise<void>
   */
  async resume(): Promise<void> {
    /* 如果未暂停或不在运行状态，直接返回 */
    if (this.status !== "paused") return;

    // 重置暂停标志
    this.status = "running";
    // 解决暂停Promise
    if (this.pauseResolve) {
      this.pauseResolve();
    }
    // 清理暂停相关状态
    this.pausePromise = undefined;
    this.pauseResolve = undefined;

    // 发出任务恢复事件
    this.emit({
      type: "tao:resume",
      timestamp: Date.now(),
    });
  }

  /**
   * 取消任务执行
   * 会中断所有正在执行的步骤，并执行清理操作
   * @returns Promise<void>
   */
  async cancel(): Promise<void> {
    // 如果任务已取消或已中断，直接返回
    if (this.status === "cancelled") {
      return;
    }

    try {
      // 先更新状态，避免重复取消
      this.status = "cancelled";

      // 清理暂停状态
      this.pausePromise = undefined;
      this.pauseResolve = undefined;

      // 执行所有Zen的onCancel回调
      for (const zen of this.zens.values()) {
        try {
          zen.executeOnCancel();
        } catch (error) {
          console.error(
            `Error executing onCancel for zen ${zen.getName()}:`,
            error
          );
        }
      }

      // 清空运行中的步骤集合
      this.runningZens.clear();

      // 发出任务取消事件
      this.emit({
        type: "tao:fail",
        timestamp: Date.now(),
        error: new Error("Tao cancelled"),
      });

      // 最后才中断所有运行中的步骤
      if (!this.abortController.signal.aborted) {
        this.abortController.abort();
      }

      // 更新存储状态
      await this.updateStatus("cancelled");
    } catch (error) {
      console.error("Error during tao cancellation:", error);
    }
  }

  /**
   * 注册事件监听器
   * @param listener - 事件处理函数
   * @returns () => void - 用于移除监听器的函数
   */
  on(listener: TaoEventListener): () => void {
    // 添加监听器到集合
    this.eventListeners.add(listener);
    // 返回用于移除监听器的函数
    return () => this.eventListeners.delete(listener);
  }

  onFinish(listener: () => void): () => void {
    return this.on((event) => {
      if (event.type === "tao:complete") {
        listener();
      }
    });
  }

  /**
   * 发出任务事件
   * 将事件通知所有注册的监听器
   * @param event - 事件角色
   */
  emit(event: TaoEvent) {
    // 遍历所有监听器并调用
    this.eventListeners.forEach((listener) => listener(event));
  }

  /**
   * 为特定步骤注册事件监听器
   * @param zenId - 步骤ID
   * @param listener - 事件处理函数
   * @returns () => void - 用于移除监听器的函数
   */
  onZen(zenId: string, listener: (event: TaoEvent) => void): () => void {
    // 创建包装的监听器，只处理指定步骤的事件
    const wrappedListener = (event: TaoEvent) => {
      if (event.zenId === zenId) {
        listener(event);
      }
    };
    // 注册包装的监听器
    return this.on(wrappedListener);
  }

  /**
   * 获取任务名称
   * @returns string - 任务名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取所有步骤的状态
   * @returns Map<string, ZenState> - 步骤ID到步骤状态的映射
   */
  getAllZenStates(): Record<string, ZenState> {
    const states: Record<string, ZenState> = {};
    this.zens.forEach((zen) => {
      states[zen.getId()] = {
        id: zen.getId(),
        name: zen.getName(),
        status: zen.getStatus(),
        result: zen.getResult(),
        error: zen.getError(),
        startTime: zen.getStartTime(),
        endTime: zen.getEndTime(),
        dependencies: zen.getDependencies(),
      };
    });
    return states;
  }

  /**
   * 获取任务执行进度
   * 计算规则：
   * 1. 已完成步骤计算全部权重
   * 2. 运行中步骤根据运行时间估算进度
   * 3. 失败或取消的步骤计算已执行时间比例
   * @returns number - 已完成步骤的百分比(0-100)
   */
  getProgress(): number {
    const total = this.zens.size;
    if (total === 0) return 0;

    // 如果任务已完成，直接返回100%
    if (this.status === "completed") return 100;

    // 计算每个步骤的权重
    const zenWeight = 100 / total;

    let progress = 0;

    // 遍历所有步骤计算进度
    this.zens.forEach((zen) => {
      const status = zen.getStatus();
      switch (status) {
        case "completed":
          // 已完成的步骤计算全部权重
          progress += zenWeight;
          break;
        case "running":
          // 运行中的步骤，根据运行时间估算进度
          const startTime = zen.getStartTime();
          if (startTime) {
            // 假设每个步骤平均运行时间为30秒
            const avgZenTime = 30000;
            const runningTime = Date.now() - startTime;
            const zenProgress = Math.min(runningTime / avgZenTime, 0.95); // 最高计算到95%
            progress += zenWeight * zenProgress;
          } else {
            // 刚开始运行，计算10%
            progress += zenWeight * 0.1;
          }
          break;
        case "failed":
        case "cancelled":
          // 失败或取消的步骤，计算已执行的时间比例
          const endTime = zen.getEndTime();
          const zenStartTime = zen.getStartTime();
          if (zenStartTime && endTime) {
            const executionTime = endTime - zenStartTime;
            const zenProgress = Math.min(executionTime / 30000, 1);
            progress += zenWeight * zenProgress;
          }
          break;
        case "pending":
          // 等待中的步骤不计算进度
          break;
      }
    });

    // 确保进度在0-100之间
    return Math.min(Math.max(Math.floor(progress), 0), 100);
  }

  /**
   * 获取任务状态
   * @returns 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' - 任务状态
   */
  getStatus(): TaoStatus {
    return this.status;
  }

  /**
   * 获取任务执行时间
   * 计算从第一个步骤开始到最后一个步骤结束的时间
   * @returns number | undefined - 执行时间(毫秒)，如果未开始执行则返回undefined
   */
  getExecutionTime(): number | undefined {
    const zens = Array.from(this.zens.values());
    if (zens.length === 0) return undefined;

    // 获取所有步骤的开始和结束时间
    const startTimes = zens
      .map((s) => s.getStartTime())
      .filter(Boolean) as number[];
    const endTimes = zens
      .map((s) => s.getEndTime())
      .filter(Boolean) as number[];

    if (startTimes.length === 0) return undefined;
    // 计算从最早开始到最晚结束的时间差
    const start = Math.min(...startTimes);
    const end = endTimes.length > 0 ? Math.max(...endTimes) : Date.now();

    return end - start;
  }

  /**
   * 获取所有步骤的错误信息
   * @returns Map<string, Error> - 步骤ID到错误信息的映射
   */
  getErrors(): Map<string, Error> {
    const errors = new Map<string, Error>();
    this.zens.forEach((zen) => {
      const error = zen.getError();
      if (error) {
        errors.set(zen.getId(), error);
      }
    });
    return errors;
  }

  /**
   * 根据ID获取步骤实例
   * @param id - 步骤ID
   * @returns Zen<any, any> - 步骤实例
   * @throws Error - 如果步骤不存在则抛出错误
   */
  getZenById(id: string): Zen<any, any> {
    const zen = this.zens.get(id);
    if (!zen) throw new Error(`Zen ${id} not found`);
    return zen;
  }

  /**
   * 根据名称获取步骤实例
   * @param name - 步骤名称
   * @returns Zen<any, any> | undefined - 步骤实例，如果不存在则返回undefined
   */
  getZenByName(name: string): Zen<any, any> | undefined {
    return this.findZen((zen) => zen.getName() === name);
  }

  /**
   * 根据条件查找步骤实例
   * @param predicate - 查找条件函数
   * @returns Zen<any, any> | undefined - 符合条件的步骤实例，如果不存在则返回undefined
   */
  findZen(
    predicate: (zen: Zen<any, any>) => boolean
  ): Zen<any, any> | undefined {
    for (const zen of this.zens.values()) {
      if (predicate(zen)) {
        return zen;
      }
    }
    return undefined;
  }

  /**
   * 获取任务的依赖关系树
   * @param zenId - 步骤ID
   * @returns Array - 包含步骤ID和其依赖的数组
   */
  getDependencyTree(zenId: string): { id: string; dependencies: string[] }[] {
    const result: { id: string; dependencies: string[] }[] = [];
    const visited = new Set<string>();

    // 递归遍历依赖树
    const traverse = (id: string) => {
      // 避免循环依赖
      if (visited.has(id)) return;
      visited.add(id);

      // 获取步骤实例和其依赖
      const zen = this.getZenById(id);
      const deps = zen.getDependencies();
      result.push({ id, dependencies: deps });

      // 递归处理所有依赖
      deps.forEach((depId) => traverse(depId));
    };

    traverse(zenId);
    return result;
  }

  /**
   * 执行单个步骤
   * @param zen - 要执行的步骤实例
   * @returns Promise<any> - 步骤执行结果
   * @throws Error - 执行失败时抛出错误
   */
  private async executeZen(zen: Zen<any, any>): Promise<any> {
    // 检查是否已取消
    if (this.abortController.signal.aborted) {
      throw new Error("Tao cancelled");
    }

    // 发出步骤开始事件
    this.emit({
      type: "zen:start",
      zenId: zen.getId(),
      timestamp: Date.now(),
    });

    // 处理暂停逻辑
    if (this.status === "paused") {
      this.emit({
        type: "zen:pause",
        zenId: zen.getId(),
        timestamp: Date.now(),
        data: { message: "Zen paused before execution" },
      });

      try {
        // 等待恢复或取消
        await Promise.race([
          this.pausePromise,
          new Promise((_, reject) => {
            const abortHandler = () => {
              reject(new Error("Tao cancelled while paused"));
            };
            this.abortController.signal.addEventListener("abort", abortHandler);
            // 确保清理函数被调用
            this.cleanupFunctions.push(() => {
              this.abortController.signal.removeEventListener(
                "abort",
                abortHandler
              );
            });
          }),
        ]);
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error(String(error));
      }
    }

    try {
      // 执行步骤
      const result = await zen._execute(this.abortController.signal);

      // 检查是否暂停
      if (this.status === "paused") {
        this.emit({
          type: "zen:pause",
          zenId: zen.getId(),
          timestamp: Date.now(),
          data: { message: "Tao paused after zen completion" },
        });

        await this.pausePromise;
      }

      return result;
    } catch (error) {
      // 处理执行错误
      await this.handleZenError(error, zen.getId());
      throw error;
    }
  }

  /**
   * 计算步骤的执行顺序
   * 使用拓扑排序算法，将步骤按依赖关系分组
   * @returns string[][] - 按批次分组的步骤ID数组
   * @throws Error - 如果存在循环依赖则抛出错误
   */
  private getExecutionOrder(): string[][] {
    const visited = new Set<string>();
    const layers: string[][] = [];

    while (visited.size < this.zens.size) {
      // 找出当前可执行的步骤（所有依赖都已访问）
      const currentLayer = Array.from(this.zens.values())
        .filter((zen) => {
          if (visited.has(zen.getId())) return false;
          return zen.getDependencies().every((depId) => visited.has(depId));
        })
        .map((zen) => zen.getId());

      // 如果没有可执行的步骤但还有未访问的步骤，说明存在循环依赖
      if (currentLayer.length === 0 && visited.size < this.zens.size) {
        throw new Error("Circular dependency detected");
      }

      // 将当前层添加到结果中
      layers.push(currentLayer);
      // 标记当前层的步骤为已访问
      currentLayer.forEach((id) => visited.add(id));
    }

    return layers;
  }

  /**
   * 获取任务的运行时状态
   * @returns TaoRuntimeState - 包含任务名称、状态、进度等信息
   */
  getRuntimeState(): TaoRuntimeState {
    return {
      name: this.config.name, // 任务名称
      description: this.config.description, // 任务描述
      status: this.status, // 任务状态
      progress: this.getProgress(), // 执行进度
      paused: this.status === "paused", // 是否暂停
      executionTime: this.getExecutionTime(), // 执行时间
      zens: Array.from(this.zens.values()).map((zen) => ({
        id: zen.getId(), // 步骤ID
        name: zen.getName(), // 步骤名称
        status: zen.getStatus(), // 步骤状态
        error: zen.getError()?.message, // 错误信息
        result: zen.getResult(), // 执行结果
        startTime: zen.getStartTime(), // 开始时间
      })),
    };
  }

  /**
   * 快速执行单个任务
   * 创建一个只包含单个步骤的任务并执行
   * @param name - 任务名称
   * @param executor - 执行函数
   * @param options - 可选配置项
   * @returns Promise<any> - 执行结果
   */
  static async run<T = any>(
    name: string,
    executor: ZenExecutor<ZenInput, T>,
    options?: {
      retry?: ZenRetryConfig; // 重试配置
      timeout?: number; // 超时时间
      onEvent?: TaoEventListener; // 事件监听器
      onCancel?: () => void; // 取消回调
      register?: boolean; // 是否注册到任务实例
    }
  ): Promise<T> {
    // 创建新的任务实例
    const tao = new Tao({ name });

    // 注册事件监听器
    if (options?.onEvent) {
      tao.on(options.onEvent);
    }
    if (options?.register) {
      tao.register();
    }
    // 创建步骤
    const zen = tao.zen<T>(name).exe(executor);

    if (options?.onCancel) {
      zen.cancel(options.onCancel);
    }
    // 配置重试
    if (options?.retry) {
      zen.retry(options.retry);
    }

    // 配置超时
    if (options?.timeout) {
      zen.timeout(options.timeout);
    }

    // 执行任务并返回结果
    const results = await tao.run();
    return results.get(zen.getId()) as T;
  }

  /**
   * 暂停指定的任务
   * @param taoId - 任务ID
   * @returns Promise<boolean> - 是否成功暂停
   */
  static async pause(taoId: string): Promise<boolean> {
    try {
      const store = Tao.store;
      const state = store.current;
      const tao = state.taos[taoId];

      // 检查任务是否可以暂停
      if (!tao || tao.status !== "running" || tao.paused) {
        return false;
      }

      // 更新存储中的任务状态
      store.set((state) => ({
        ...state,
        taos: {
          ...state.taos,
          [taoId]: {
            ...state.taos[taoId],
            paused: true,
          },
        },
      }));

      return true;
    } catch (error) {
      console.error("Failed to pause tao:", error);
      return false;
    }
  }

  /**
   * 恢复指定的任务
   * @param taoId - 任务ID
   * @returns Promise<boolean> - 是否成功恢复
   */
  static async resume(taoId: string): Promise<boolean> {
    try {
      const store = Tao.store;
      const state = store.current;
      const tao = state.taos[taoId];

      // 检查任务是否可以恢复
      if (!tao || tao.status !== "running" || !tao.paused) {
        return false;
      }

      // 更新存储中的任务状态
      store.set((state) => ({
        ...state,
        taos: {
          ...state.taos,
          [taoId]: {
            ...state.taos[taoId],
            paused: false,
          },
        },
      }));

      return true;
    } catch (error) {
      console.error("Failed to resume tao:", error);
      return false;
    }
  }

  /**
   * 取消指定的任务
   * @param taoId - 任务ID
   * @returns Promise<boolean> - 是否成功取消
   */
  static async cancel(taoId: string): Promise<boolean> {
    try {
      const store = Tao.store;
      const state = store.current;
      const tao = state.taos[taoId];

      // 检查任务是否可以取消
      if (!tao || tao.status !== "running") {
        console.log("Cannot cancel: tao not found or not running", taoId);
        return false;
      }

      // 获取任务实例并中断执行
      const instance = Tao.instances.get(taoId);
      if (instance) {
        // 先执行所有运行中步骤的 onCancel 回调
        const runningZens = instance.zens.values();
        for (const zen of runningZens) {
          if (zen.getStatus() === "running") {
            try {
              const config = zen["config"];
              if (config && config.onCancel) {
                await config.onCancel();
              }
            } catch (error) {
              console.error("Error executing onCancel:", error);
            }
          }
        }
        // 然后中断执行
        instance.abortController.abort();
      }

      // 更新存储中的任务状态
      store.set(
        (state) => ({
          ...state,
          taos: {
            ...state.taos,
            [taoId]: {
              ...state.taos[taoId],
              status: "cancelled",
              paused: false,
              zens: tao.zens.map((zen) => ({
                ...zen,
                status: zen.status === "running" ? "cancelled" : zen.status,
                error: zen.status === "running" ? "任务已取消" : zen.error,
              })),
            },
          },
          events: {
            ...state.events,
            [taoId]: [
              ...(state.events[taoId] || []),
              {
                type: "tao:fail",
                timestamp: Date.now(),
                error: new Error("任务已取消"),
              },
            ],
          },
        }),
        {
          replace: true,
        }
      );

      return true;
    } catch (error) {
      console.error("Failed to cancel tao:", error);
      return false;
    }
  }

  /**
   * 从存储中移除指定的任务
   * @param taoId - 任务ID
   * @returns boolean - 是否成功移除
   */
  static remove(taoId: string): boolean {
    try {
      const store = Tao.store;
      const state = store.current;

      console.log(state);
      console.log(taoId);

      // 检查任务是否存在
      if (!state.taos[taoId]) {
        return false;
      }

      // 检查任务状态
      const tao = state.taos[taoId];
      if (tao.status === "running" && !tao.paused) {
        return false;
      }

      // 从存储中移除任务相关数据
      store.set(
        (state) => {
          const { [taoId]: _, ...restTaos } = state.taos;
          const { [taoId]: __, ...restStates } = state.states;
          const { [taoId]: ___, ...restEvents } = state.events;
          return {
            taos: restTaos,
            states: restStates,
            events: restEvents,
          };
        },
        {
          replace: true,
        }
      );

      return true;
    } catch (error) {
      console.error("Failed to remove tao:", error);
      return false;
    }
  }

  // 改进状态更新方法
  private async updateStatus(newStatus: TaoStatus) {
    try {
      const oldStatus = this.status;
      this.status = newStatus;

      // 如果状态确实发生了变化，才触发事件
      if (oldStatus !== newStatus) {
        this.emit({
          type: `tao:${newStatus}` as TaozenEventType,
          timestamp: Date.now(),
        });

        // 更新存储中的状态
        if (this.id) {
          Tao.store.set((state) => {
            if (!state || !state.taos || !state.taos[this.id!]) return state;
            return {
              ...state,
              taos: {
                ...state.taos,
                [this.id!]: {
                  ...state.taos[this.id!],
                  status: newStatus,
                },
              },
            };
          });
        }
      }
    } catch (error) {
      console.error("Error updating tao status:", error);
    }
  }

  // 改进错误恢复机制
  private async handleZenError(error: unknown, zenId: string): Promise<void> {
    const isTaoCancelled =
      error instanceof Error &&
      (error.message === "Tao cancelled" ||
        error.message === "Tao cancelled while paused");

    // 更新步骤状态
    const zen = this.zens.get(zenId);
    if (zen) {
      zen.setStatus(isTaoCancelled ? "cancelled" : "failed");
      zen.setError(error instanceof Error ? error : new Error(String(error)));
    }

    // 如果不是取消错误，尝试优雅地停止其他运行中的步骤
    if (!isTaoCancelled) {
      const runningZenIds = Array.from(this.runningZens);
      await Promise.all(
        runningZenIds
          .filter((id) => id !== zenId)
          .map(async (id) => {
            const runningZen = this.zens.get(id);
            if (runningZen) {
              try {
                runningZen.executeOnCancel();
                runningZen.setStatus("failed");
                runningZen.setError(
                  new Error("Tao failed due to another zen error")
                );
              } catch (cleanupError) {
                console.error(`Error cleaning up zen ${id}:`, cleanupError);
              }
            }
          })
      );
    }

    // 更新任务状态
    await this.updateStatus(isTaoCancelled ? "cancelled" : "failed");
  }

  /**
   * 重试任务
   * 如果任务失败，可以使用此方法重新运行任务
   * 默认情况下会重新运行所有步骤
   * 如果配置了retryFailedZensOnly=true，则只重新运行失败的步骤
   * @returns Promise<Map<string, any>> - 所有步骤的执行结果
   * @throws Error - 如果任务未失败或未注册则抛出错误
   */
  async retry(): Promise<Map<string, any>> {
    // 检查任务是否可以重试
    if (this.status !== "failed" && this.status !== "cancelled") {
      throw new Error("Only failed or cancelled tasks can be retried");
    }

    // 检查是否已注册
    if (!this.id) {
      throw new Error("Tao not registered");
    }

    // 重置中断控制器
    this.abortController = new AbortController();

    // 确定需要重置的步骤
    if (this.config.retryFailedZensOnly) {
      // 只重置失败的步骤
      this.zens.forEach((zen) => {
        if (zen.getStatus() === "failed" || zen.getStatus() === "cancelled") {
          zen.reset();
        }
      });
    } else {
      // 重置所有步骤
      this.zens.forEach((zen) => zen.reset());
    }

    // 清空运行中的步骤集合
    this.runningZens.clear();

    // 重置暂停相关状态
    this.pausePromise = undefined;
    this.pauseResolve = undefined;

    // 发出任务重试事件
    this.emit({
      type: "tao:retry",
      timestamp: Date.now(),
    });

    try {
      // 更新任务状态为运行中
      await this.updateStatus("running");

      // 执行任务
      const results = new Map<string, any>();
      const executionOrder = this.getExecutionOrder();

      // 按批次执行步骤
      for (const batch of executionOrder) {
        // 检查是否已取消
        if (this.abortController.signal.aborted) {
          await this.updateStatus("cancelled");
          throw new Error("Tao cancelled");
        }

        // 并行执行当前批次的步骤
        await Promise.all(
          batch.map(async (zenId) => {
            const zen = this.zens.get(zenId)!;

            // 如果只重试失败的步骤且当前步骤已完成，则跳过
            if (
              this.config.retryFailedZensOnly &&
              zen.getStatus() === "completed"
            ) {
              // 已完成的步骤，直接添加结果到结果集
              results.set(zenId, zen.getResult());
              return;
            }

            // 执行需要重试的步骤
            this.runningZens.add(zenId);

            try {
              const result = await this.executeZen(zen);
              results.set(zenId, result);
              this.runningZens.delete(zenId);

              this.emit({
                type: "zen:complete",
                zenId,
                timestamp: Date.now(),
                data: result,
              });
            } catch (error) {
              this.runningZens.delete(zenId);
              throw error;
            }
          })
        );
      }

      // 最后检查一次是否已取消
      if (this.abortController.signal.aborted) {
        await this.updateStatus("cancelled");
        throw new Error("Tao cancelled");
      }

      // 更新任务状态为已完成
      await this.updateStatus("completed");
      return results;
    } catch (error) {
      // 处理执行过程中的错误
      await this.handleZenError(
        error instanceof Error ? error : new Error(String(error)),
        ""
      );
      throw error;
    }
  }

  /**
   * 重试指定的任务
   * @param taoId - 任务ID
   * @param options - 重试选项
   * @param options.retryFailedZensOnly - 是否只重试失败的步骤
   * @returns Promise<boolean> - 是否成功重试
   */
  static async retry(
    taoId: string,
    options?: { retryFailedZensOnly?: boolean }
  ): Promise<boolean> {
    try {
      const store = Tao.store;
      const state = store.current;
      const tao = state.taos[taoId];

      // 检查任务是否存在
      if (!tao) {
        console.error(`Tao ${taoId} not found`);
        return false;
      }

      // 检查任务状态是否可以重试
      if (tao.status !== "failed" && tao.status !== "cancelled") {
        console.error(`Tao ${taoId} is not failed or cancelled, cannot retry`);
        return false;
      }

      // 获取任务实例，如果实例不存在则尝试恢复
      let instance = Tao.instances.get(taoId);
      if (!instance) {
        console.log(`尝试从localStorage恢复Tao实例 ${taoId}`);
        instance = Tao.restoreInstance(taoId);

        if (!instance) {
          console.error(`无法恢复Tao实例 ${taoId}`);
          return false;
        }
      }

      // 确保实例已初始化
      if (!instance.id || !instance.zens || instance.zens.size === 0) {
        console.error(`Tao实例 ${taoId} 未完全初始化，无法重试`);
        return false;
      }

      // 应用重试选项
      if (options && options.retryFailedZensOnly !== undefined) {
        instance.config.retryFailedZensOnly = options.retryFailedZensOnly;
      }

      // 执行重试
      try {
        await instance.retry();
        return true;
      } catch (error) {
        console.error(`Error retrying tao ${taoId}:`, error);
        return false;
      }
    } catch (error) {
      console.error("Failed to retry tao:", error);
      return false;
    }
  }

  // 从localStorage恢复Tao实例
  private static restoreInstance(taoId: string): Tao | undefined {
    try {
      const state = Tao.store.current;
      const taoData = state.taos[taoId];

      if (!taoData) return undefined;

      // 创建新的Tao实例
      const tao = new Tao({
        name: taoData.name,
        description: taoData.description,
      });
      tao.id = taoId;
      tao.status = taoData.status;
      // 设置已运行标志，以便可以重试
      tao.hasRun = true;

      // 记录所有创建的zen ID的映射关系，方便后续建立依赖关系
      const zenIdMap = new Map<string, Zen<any, any>>();

      // 从taoData.zens创建步骤 - 第一步：创建所有Zen实例
      if (taoData.zens && taoData.zens.length > 0) {
        for (const zenData of taoData.zens) {
          // 创建新的Zen实例
          const zen = tao.zen(zenData.name);

          // 将自动生成的ID保存下来
          const originalId = zen.id;

          // 直接将Zen添加到映射中，但使用原始ID
          tao.zens.delete(originalId);
          tao.zens.set(zenData.id, zen);

          // 保存ID映射关系
          zenIdMap.set(zenData.id, zen);

          // 使用setter方法设置状态和错误信息，而不是直接修改属性
          zen.setStatus(zenData.status);

          // 如果是失败状态，设置错误信息
          if (zenData.error) {
            zen.setError(new Error(zenData.error));
          }

          // 确保已完成的步骤不会重新执行
          if (zenData.status === "completed") {
            // 由于我们无法直接恢复结果值，这里可能需要特殊处理
            // 例如：可以在UI上显示"结果已丢失"或类似信息
            console.log(
              `步骤 ${zenData.name} (${zenData.id}) 已完成，但结果可能已丢失`
            );
          }

          // 确保所有失败或取消的步骤都被重置为pending状态以便重试
          if (zenData.status === "failed" || zenData.status === "cancelled") {
            zen.reset();
            console.log(
              `步骤 ${zenData.name} (${zenData.id}) 状态已从 ${zenData.status} 重置为 pending，准备重试`
            );
          }
        }
      }

      // 从存储中读取步骤状态
      const zenStates = state.states[taoId];

      // 设置依赖关系
      if (zenStates && Object.keys(zenStates).length > 0) {
        // 第二步：为每个Zen建立依赖关系
        for (const zenId in zenStates) {
          const zenState = zenStates[zenId];
          const zen = tao.zens.get(zenId);

          if (
            zen &&
            zenState.dependencies &&
            zenState.dependencies.length > 0
          ) {
            // 添加每个依赖项
            for (const depId of zenState.dependencies) {
              const depZen = tao.zens.get(depId);
              if (depZen) {
                zen.after(depZen);
              } else {
                console.warn(
                  `依赖项 ${depId} 不存在，无法为Zen ${zenId} 建立依赖关系`
                );
              }
            }
          }
        }
      }

      // 将恢复的实例添加到instances映射中
      Tao.instances.set(taoId, tao);
      console.log(`成功从存储中恢复任务 ${taoId}，步骤数量: ${tao.zens.size}`);
      return tao;
    } catch (error) {
      console.error(`恢复任务 ${taoId} 失败:`, error);
      return undefined;
    }
  }
}
