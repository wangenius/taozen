import { gen } from "./generator";
import { Tao } from "./Tao";
import { ZenConfig, ZenExecutor, ZenRetryConfig, ZenStatus } from "./type";

// Zen类 - 表示任务中的单个执行步骤
export class Zen<TInput = any, TOutput = any> {
  private status: ZenStatus = "pending"; // 步骤状态
  private value?: TOutput; // 步骤执行结果
  private error?: Error; // 执行错误信息
  private startTime?: number; // 开始执行时间
  private endTime?: number; // 结束执行时间
  private dependencies: Set<string> = new Set(); // 依赖的其他步骤ID集合
  private cleanupFunctions: Array<() => void> = []; // 清理函数数组
  private executor: ZenExecutor<TInput, TOutput> = () =>
    Promise.resolve({} as TOutput); // 步骤执行器
  private config: ZenConfig = {}; // 步骤配置
  readonly id: string; // 步骤唯一标识

  /**
   * 创建一个新的执行步骤
   * @param id - 步骤唯一标识
   * @param name - 步骤名称
   * @param executor - 步骤执行器函数
   * @param task - 所属的 Task 实例
   * @param config - 步骤配置
   */
  constructor(
    private readonly name: string, // 步骤名称
    private task: Tao // 所属任务实例
  ) {
    this.id = gen.id();
    this.name = name;
    this.task = task;
  }

  // 获取步骤执行结果 - 只有在完成状态才返回
  get result(): TOutput | undefined {
    if (this.status !== "completed") return undefined;
    return this.value;
  }

  /**
   * 设置当前步骤依赖的其他步骤
   * @param zens - 依赖的步骤数组
   * @returns this - 返回当前实例以支持链式调用
   */
  after(...zens: Zen[]): this {
    zens.forEach((zen) => this.dependencies.add(zen.getId()));
    return this;
  }

  /**
   * 设置取消回调函数
   * @param callback - 取消回调函数
   * @returns this - 返回当前实例以支持链式调用
   */
  cancel(callback: () => void): this {
    this.config.onCancel = callback;
    return this;
  }

  exe(executor: ZenExecutor<TInput, TOutput>): this {
    this.executor = executor;
    return this;
  }

  /**
   * 内部执行方法，由 Task 调用
   * @param signal - 中断信号
   * @returns Promise<TOutput> - 执行结果
   * @throws Error - 执行失败时抛出错误
   */
  async _execute(signal: AbortSignal): Promise<TOutput> {
    // 检查是否已取消
    if (signal.aborted) {
      throw new Error("Zen cancelled");
    }

    // 初始化执行状态
    this.status = "running";
    this.startTime = Date.now();
    this.value = undefined;
    this.error = undefined;

    // 发出步骤开始事件
    this.task.emit({
      type: "zen:start",
      zenId: this.id,
      timestamp: Date.now(),
    });

    try {
      // 等待所有依赖完成并获取结果
      const depResults = await this.waitForDependencies();

      // 执行重试逻辑
      const retryConfig = this.config.retry;

      if (retryConfig) {
        return await this.executeWithRetry(depResults, signal, retryConfig);
      }

      // 执行超时逻辑
      if (this.config.timeout) {
        return await this.executeWithTimeout(depResults, signal);
      }

      // 普通执行
      return await this.executeCore(depResults, signal);
    } catch (error) {
      // 处理执行错误
      await this.handleZenError(error);
      throw error;
    } finally {
      this.endTime = Date.now();
    }
  }

  /**
   * 核心执行逻辑
   * @param depResults - 依赖步骤的执行结果
   * @param signal - 中断信号
   * @returns Promise<TOutput> - 执行结果
   */
  private async executeCore(
    depResults: Map<string, any>,
    signal: AbortSignal
  ): Promise<TOutput> {
    // 创建中断控制器
    const abortController = new AbortController();
    let cleanup: (() => void) | undefined;

    try {
      // 如果已经取消，直接返回取消状态
      if (signal.aborted || this.status === "cancelled") {
        throw new Error("Task cancelled");
      }

      // 包装执行器函数
      const wrappedExecutor = async () => {
        const dependencyData = Object.fromEntries(depResults) as TInput;

        return await new Promise<TOutput>((resolve, reject) => {
          // 设置清理函数
          cleanup = () => {
            if (this.status !== "cancelled") {
              this.status = "cancelled";
            }
            reject(new Error("Task cancelled"));
          };

          // 监听取消信号
          signal.addEventListener("abort", cleanup);

          // 执行实际的任务
          this.executor(dependencyData).then(resolve).catch(reject);
        });
      };

      // 执行并获取结果
      const result = await wrappedExecutor();

      // 设置执行结果和状态
      this.value = result;
      this.status = "completed";
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "Task cancelled") {
        this.status = "cancelled";
      }
      throw error;
    } finally {
      // 清理资源
      if (cleanup) {
        signal.removeEventListener("abort", cleanup);
      }
      abortController.abort();
    }
  }

  /**
   * 重试执行逻辑
   * @param depResults - 依赖步骤的执行结果
   * @param signal - 中断信号
   * @param config - 重试配置
   * @returns Promise<TOutput> - 执行结果
   */
  private async executeWithRetry(
    depResults: Map<string, any>,
    signal: AbortSignal,
    config: ZenRetryConfig
  ): Promise<TOutput> {
    let lastError: Error | undefined;

    // 循环尝试执行
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await this.executeCore(depResults, signal);
      } catch (error) {
        lastError = error as Error;
        if (attempt === config.maxAttempts) break;

        // 计算重试延迟时间
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        );

        // 发出重试事件
        this.task.emit({
          type: "zen:retry",
          zenId: this.id,
          timestamp: Date.now(),
          data: { attempt, delay },
          error: error as Error,
        });

        // 等待重试延迟时间
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * 超时执行逻辑
   * @param depResults - 依赖步骤的执行结果
   * @param signal - 中断信号
   * @returns Promise<TOutput> - 执行结果
   */
  private async executeWithTimeout(
    depResults: Map<string, any>,
    signal: AbortSignal
  ): Promise<TOutput> {
    let timeoutId: NodeJS.Timeout;
    let abortListener: ((ev: Event) => void) | undefined;

    try {
      // 使用Promise.race实现超时控制
      const result = await Promise.race([
        this.executeCore(depResults, signal),
        new Promise<never>((_, reject) => {
          // 设置超时定时器
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                `Zen ${this.name} timed out after ${this.config.timeout}ms`
              )
            );
          }, this.config.timeout);

          // 监听中断信号
          abortListener = () => {
            clearTimeout(timeoutId);
            reject(new Error("Task cancelled"));
          };
          signal.addEventListener("abort", abortListener);
        }),
      ]);

      return result;
    } finally {
      // 清理资源
      clearTimeout(timeoutId!);
      if (abortListener) {
        signal.removeEventListener("abort", abortListener);
      }
    }
  }

  /**
   * 等待依赖步骤完成
   * @returns Promise<Map<string, any>> - 依赖步骤的执行结果
   */
  private async waitForDependencies(): Promise<Map<string, any>> {
    if (this.dependencies.size === 0) return new Map();

    // 收集所有依赖的结果到 Map 中
    const results = new Map<string, any>();

    for (const depId of this.dependencies) {
      const depZen = this.task.getZenById(depId);
      if (depZen.getStatus() === "completed") {
        results.set(depId, depZen.getResult());
      } else {
        throw new Error(`Dependency ${depZen.getName()} not completed`);
      }
    }

    return results;
  }

  // 获取步骤信息的方法
  getId = () => this.id; // 获取步骤ID
  getName = () => this.name; // 获取步骤名称
  getStatus = () => this.status; // 获取步骤状态
  getResult = () => this.result; // 获取步骤结果
  getError = () => this.error; // 获取错误信息
  getDependencies = () => Array.from(this.dependencies); // 获取依赖列表
  getStartTime = () => this.startTime; // 获取开始时间
  getEndTime = () => this.endTime; // 获取结束时间

  /**
   * 设置步骤状态
   * @param status - 新的状态
   */
  setStatus(status: ZenStatus) {
    this.status = status;
  }

  /**
   * 设置错误信息
   * @param error - 错误角色
   */
  setError(error: Error) {
    this.error = error;
  }

  /**
   * 重置步骤状态
   */
  reset() {
    this.status = "pending";
    this.value = undefined;
    this.error = undefined;
    this.startTime = undefined;
    this.endTime = undefined;
  }

  /**
   * 设置重试配置
   * @param config - 重试配置
   * @returns this - 返回当前实例以支持链式调用
   */
  retry(config?: ZenRetryConfig): this {
    this.config.retry = config;
    return this;
  }

  /**
   * 设置超时时间
   * @param ms - 超时时间(毫秒)
   * @returns this - 返回当前实例以支持链式调用
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * 执行取消回调
   */
  executeOnCancel() {
    if (this.config.onCancel) {
      try {
        this.config.onCancel();
      } catch (error) {
        console.error(`Error executing onCancel for zen ${this.name}:`, error);
      }
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    // 执行所有清理函数
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    this.cleanupFunctions = [];
    // 清理事件监听器
    if (this.config.onCancel) {
      this.config.onCancel = undefined;
    }
  }

  /**
   * 处理步骤执行过程中的错误
   * @param error - 错误对象
   */
  private async handleZenError(error: unknown): Promise<void> {
    const isTaskCancelled =
      error instanceof Error &&
      (error.message === "Task cancelled" ||
        error.message === "Task cancelled while paused");

    // 更新步骤状态
    this.status = isTaskCancelled ? "cancelled" : "failed";
    this.error = new Error(String(error));

    // 发出错误事件
    this.task.emit({
      type: "zen:fail",
      zenId: this.id,
      timestamp: Date.now(),
      error: this.error,
    });
  }
}
