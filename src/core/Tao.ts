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
   * @returns Tao - 返回任务实例
   * @throws Error - 如果任务已注册则抛出错误
   */
  register(): Tao {
    if (this.id) {
      throw new Error("Tao already registered");
    }

    const id = `tao-${Date.now()}`;
    this.id = id;
    Tao.instances.set(id, this);

    // 更新状态存储
    Tao.store.set((state) => ({
      taos: {
        ...state.taos,
        [id]: this.getRuntimeState(),
      },
      states: { ...state.states, [id]: this.getAllZenStates() },
      events: { ...state.events, [id]: [] },
    }));

    // 监听事件并更新状态
    const unsubscribe = this.on((event) => {
      if (!this.id) return;

      Tao.store.set((state) => ({
        taos: {
          ...state.taos,
          [id]: this.getRuntimeState(),
        },
        events: {
          ...state.events,
          [id]: [...(state.events[id] || []), event],
        },
        states: {
          ...state.states,
          [id]: this.getAllZenStates(),
        },
      }));
    });

    this.cleanupFunctions.push(unsubscribe);
    return this;
  }

  /**
   * 从存储中移除任务
   * @throws Error - 如果任务未注册则抛出错误
   */
  remove(): void {
    if (!this.id) {
      throw new Error("Tao not registered");
    }

    this.dispose();

    // 从存储中移除数据
    const id = this.id;
    Tao.store.set((state) => {
      const { [id]: _, ...restTaos } = state.taos;
      const { [id]: __, ...restStates } = state.states;
      const { [id]: ___, ...restEvents } = state.events;
      return { taos: restTaos, states: restStates, events: restEvents };
    });

    Tao.instances.delete(id);
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
    this.abortController.abort();
    this.eventListeners.clear();

    this.zens.forEach((zen) => zen.dispose());
    this.zens.clear();

    this.runningZens.clear();
    this.pausePromise = undefined;
    this.pauseResolve = undefined;

    // 执行清理函数
    this.cleanupFunctions.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    });
    this.cleanupFunctions = [];

    // 减少运行中任务计数
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
    // 检查任务条件
    if (this.hasRun) {
      throw new Error(
        "Tao can only be run once. Create a new instance to run again."
      );
    }

    if (Tao.runningTaos >= Tao.maxConcurrentTaos) {
      throw new Error(
        `Too many concurrent taos. Maximum allowed: ${Tao.maxConcurrentTaos}`
      );
    }

    // 初始化运行状态
    Tao.runningTaos++;
    this.hasRun = true;

    try {
      await this.updateStatus("running");

      // 检查是否已取消
      if (this.abortController.signal.aborted) {
        await this.updateStatus("cancelled");
        throw new Error("Tao cancelled");
      }

      const results = new Map<string, any>();
      const executionOrder = this.getExecutionOrder();

      // 按批次执行步骤
      for (const batch of executionOrder) {
        if (this.abortController.signal.aborted) {
          await this.updateStatus("cancelled");
          throw new Error("Tao cancelled");
        }

        // 并行执行当前批次的所有步骤
        await Promise.all(
          batch.map(async (zenId) => {
            const zen = this.zens.get(zenId)!;
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

      // 检查最终状态
      if (this.abortController.signal.aborted) {
        await this.updateStatus("cancelled");
        throw new Error("Tao cancelled");
      }

      await this.updateStatus("completed");
      return results;
    } catch (error) {
      await this.handleZenError(
        error instanceof Error ? error : new Error(String(error)),
        ""
      );
      throw error;
    } finally {
      Tao.runningTaos = Math.max(0, Tao.runningTaos - 1);
    }
  }

  /**
   * 暂停任务执行
   * @returns Promise<void>
   */
  async pause(): Promise<void> {
    if (this.status !== "running") return;

    this.status = "paused";
    this.pausePromise = new Promise<void>((resolve) => {
      this.pauseResolve = resolve;
    });

    this.emit({
      type: "tao:pause",
      timestamp: Date.now(),
    });

    await Promise.resolve();
  }

  /**
   * 恢复已暂停的任务
   * @returns Promise<void>
   */
  async resume(): Promise<void> {
    if (this.status !== "paused") return;

    this.status = "running";

    if (this.pauseResolve) {
      this.pauseResolve();
    }

    this.pausePromise = undefined;
    this.pauseResolve = undefined;

    this.emit({
      type: "tao:resume",
      timestamp: Date.now(),
    });
  }

  /**
   * 取消任务执行
   * @returns Promise<void>
   */
  async cancel(): Promise<void> {
    if (this.status === "cancelled") return;

    try {
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

      this.runningZens.clear();

      // 发出任务取消事件
      this.emit({
        type: "tao:fail",
        timestamp: Date.now(),
        error: new Error("Tao cancelled"),
      });

      if (!this.abortController.signal.aborted) {
        this.abortController.abort();
      }

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
   */
  getProgress(): number {
    const total = this.zens.size;
    if (total === 0) return 0;
    if (this.status === "completed") return 100;

    const zenWeight = 100 / total;
    let progress = 0;

    this.zens.forEach((zen) => {
      const status = zen.getStatus();
      switch (status) {
        case "completed":
          progress += zenWeight;
          break;
        case "running":
          const startTime = zen.getStartTime();
          if (startTime) {
            const avgZenTime = 30000;
            const runningTime = Date.now() - startTime;
            progress += zenWeight * Math.min(runningTime / avgZenTime, 0.95);
          } else {
            progress += zenWeight * 0.1;
          }
          break;
        case "failed":
        case "cancelled":
          const endTime = zen.getEndTime();
          const zenStartTime = zen.getStartTime();
          if (zenStartTime && endTime) {
            progress +=
              zenWeight * Math.min((endTime - zenStartTime) / 30000, 1);
          }
          break;
      }
    });

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
   */
  getExecutionTime(): number | undefined {
    const zens = Array.from(this.zens.values());
    if (zens.length === 0) return undefined;

    const startTimes = zens
      .map((s) => s.getStartTime())
      .filter(Boolean) as number[];
    if (startTimes.length === 0) return undefined;

    const endTimes = zens
      .map((s) => s.getEndTime())
      .filter(Boolean) as number[];
    const start = Math.min(...startTimes);
    const end = endTimes.length > 0 ? Math.max(...endTimes) : Date.now();

    return end - start;
  }

  /**
   * 获取所有步骤的错误信息
   */
  getErrors(): Map<string, Error> {
    const errors = new Map<string, Error>();
    this.zens.forEach((zen) => {
      const error = zen.getError();
      if (error) errors.set(zen.getId(), error);
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
   */
  private async executeZen(zen: Zen<any, any>): Promise<any> {
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
        await Promise.race([
          this.pausePromise,
          new Promise((_, reject) => {
            const abortHandler = () =>
              reject(new Error("Tao cancelled while paused"));
            this.abortController.signal.addEventListener("abort", abortHandler);
            this.cleanupFunctions.push(() => {
              this.abortController.signal.removeEventListener(
                "abort",
                abortHandler
              );
            });
          }),
        ]);
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
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
   */
  getRuntimeState(): TaoRuntimeState {
    return {
      name: this.config.name,
      description: this.config.description,
      status: this.status,
      progress: this.getProgress(),
      paused: this.status === "paused",
      executionTime: this.getExecutionTime(),
      zens: Array.from(this.zens.values()).map((zen) => ({
        id: zen.getId(),
        name: zen.getName(),
        status: zen.getStatus(),
        error: zen.getError()?.message,
        result: zen.getResult(),
        startTime: zen.getStartTime(),
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
      const state = Tao.store.current;
      const tao = state.taos[taoId];

      // 检查任务是否可以暂停
      if (!tao || tao.status !== "running" || tao.paused) {
        return false;
      }

      // 更新存储中的任务状态
      Tao.store.set((state) => ({
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
      const state = Tao.store.current;
      const tao = state.taos[taoId];

      // 检查任务是否可以恢复
      if (!tao || tao.status !== "running" || !tao.paused) {
        return false;
      }

      // 更新存储中的任务状态
      Tao.store.set((state) => ({
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
      const state = Tao.store.current;
      const tao = state.taos[taoId];

      // 检查任务是否可以取消
      if (!tao || tao.status !== "running") {
        return false;
      }

      // 获取任务实例并中断执行
      const instance = Tao.instances.get(taoId);
      if (instance) {
        // 执行运行中步骤的onCancel回调
        for (const zen of instance.zens.values()) {
          if (zen.getStatus() === "running") {
            try {
              const config = zen["config"];
              if (config?.onCancel) {
                await config.onCancel();
              }
            } catch (error) {
              console.error("Error executing onCancel:", error);
            }
          }
        }
        // 中断执行
        instance.abortController.abort();
      }

      // 更新存储中的任务状态
      Tao.store.set(
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
        { replace: true }
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
      const state = Tao.store.current;
      const tao = state.taos[taoId];

      // 检查任务是否存在且不在运行中或已暂停
      if (!tao || (tao.status === "running" && !tao.paused)) {
        return false;
      }

      // 从存储中移除任务相关数据
      Tao.store.set(
        (state) => {
          const { [taoId]: _, ...restTaos } = state.taos;
          const { [taoId]: __, ...restStates } = state.states;
          const { [taoId]: ___, ...restEvents } = state.events;
          return { taos: restTaos, states: restStates, events: restEvents };
        },
        { replace: true }
      );

      return true;
    } catch (error) {
      console.error("Failed to remove tao:", error);
      return false;
    }
  }

  // 改进状态更新方法
  private async updateStatus(newStatus: TaoStatus) {
    const oldStatus = this.status;
    this.status = newStatus;

    // 只在状态变化时触发事件和更新存储
    if (oldStatus !== newStatus) {
      this.emit({
        type: `tao:${newStatus}` as TaozenEventType,
        timestamp: Date.now(),
      });

      // 更新存储中的状态
      if (this.id && Tao.store.current.taos?.[this.id]) {
        Tao.store.set((state) => ({
          ...state,
          taos: {
            ...state.taos,
            [this.id!]: {
              ...state.taos[this.id!],
              status: newStatus,
            },
          },
        }));
      }
    }
  }

  // 简化错误处理机制
  private async handleZenError(error: unknown, zenId: string): Promise<void> {
    const isTaoCancelled =
      error instanceof Error &&
      ["Tao cancelled", "Tao cancelled while paused"].includes(error.message);

    // 更新步骤状态
    const zen = this.zens.get(zenId);
    if (zen) {
      zen.setStatus(isTaoCancelled ? "cancelled" : "failed");
      zen.setError(error instanceof Error ? error : new Error(String(error)));
    }

    // 非取消错误时，停止其他运行中的步骤
    if (!isTaoCancelled) {
      await Promise.all(
        Array.from(this.runningZens)
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
              } catch (err) {
                console.error(`Error cleaning up zen ${id}:`, err);
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
   * @returns Promise<Map<string, any>> - 所有步骤的执行结果
   */
  async retry(): Promise<Map<string, any>> {
    // 检查任务条件
    if (this.status !== "failed" && this.status !== "cancelled") {
      throw new Error("Only failed or cancelled tasks can be retried");
    }

    if (!this.id) {
      throw new Error("Tao not registered");
    }

    // 重置状态
    this.abortController = new AbortController();

    // 重置步骤
    if (this.config.retryFailedZensOnly) {
      this.zens.forEach((zen) => {
        if (["failed", "cancelled"].includes(zen.getStatus())) {
          zen.reset();
        }
      });
    } else {
      this.zens.forEach((zen) => zen.reset());
    }

    this.runningZens.clear();
    this.pausePromise = undefined;
    this.pauseResolve = undefined;

    // 发出重试事件
    this.emit({
      type: "tao:retry",
      timestamp: Date.now(),
    });

    try {
      await this.updateStatus("running");

      const results = new Map<string, any>();
      const executionOrder = this.getExecutionOrder();

      // 按批次执行步骤
      for (const batch of executionOrder) {
        if (this.abortController.signal.aborted) {
          await this.updateStatus("cancelled");
          throw new Error("Tao cancelled");
        }

        await Promise.all(
          batch.map(async (zenId) => {
            const zen = this.zens.get(zenId)!;

            // 跳过不需要重试的步骤
            if (
              this.config.retryFailedZensOnly &&
              zen.getStatus() === "completed"
            ) {
              results.set(zenId, zen.getResult());
              return;
            }

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

      if (this.abortController.signal.aborted) {
        await this.updateStatus("cancelled");
        throw new Error("Tao cancelled");
      }

      await this.updateStatus("completed");
      return results;
    } catch (error) {
      await this.handleZenError(
        error instanceof Error ? error : new Error(String(error)),
        ""
      );
      throw error;
    }
  }
}
