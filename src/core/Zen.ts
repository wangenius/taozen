import { gen } from "./gen";
import { Tao } from "./Tao";
import {
  ZenConfig,
  ZenExecutor,
  ZenInput,
  ZenRetryConfig,
  ZenStatus,
} from "./type";

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
   * 添加清理函数
   * @param cleanup - 清理函数
   */
  private addCleanup(cleanup: () => void) {
    this.cleanupFunctions.push(cleanup);
  }

  /**
   * 执行清理函数
   */
  private executeCleanup() {
    this.cleanupFunctions.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.error(`Error during cleanup for zen ${this.name}:`, error);
      }
    });
    this.cleanupFunctions = [];
  }

  /**
   * 包装依赖结果为ZenInput
   * @param depResults - 依赖步骤的执行结果
   * @returns ZenInput - 包装后的输入对象
   */
  private wrapDependencyResults(depResults: Record<string, any>): ZenInput {
    return {
      get<T>(step: Zen<any, T>): T | undefined {
        return depResults[step.getId()] as T | undefined;
      },
      getById<T>(stepId: string): T | undefined {
        return depResults[stepId] as T | undefined;
      },
      getRaw(): Record<string, any> {
        return depResults;
      },
    };
  }

  /**
   * 内部执行方法
   * @param signal - 中断信号
   * @returns Promise<TOutput> - 执行结果
   * @private
   */
  async _execute(signal: AbortSignal): Promise<TOutput> {
    // 检查是否正在运行
    if (this.status === "running") {
      throw new Error(`Zen ${this.name} is already running`);
    }

    // 检查任务是否已被取消
    if (signal.aborted) {
      this.status = "cancelled";
      throw new Error("Task cancelled before execution");
    }

    try {
      // 设置状态为正在执行
      this.status = "running";
      this.startTime = Date.now();
      this.endTime = undefined;
      this.error = undefined;

      // 等待所有依赖完成
      let dependencyResults: Record<string, any>;
      try {
        dependencyResults = await this.waitForDependencies();
      } catch (error) {
        this.status = "failed";
        this.error =
          error instanceof Error
            ? error
            : new Error(`Failed to resolve dependencies: ${String(error)}`);
        this.endTime = Date.now();
        throw this.error;
      }

      // 包装依赖结果为ZenInput
      const zenInput = this.wrapDependencyResults(dependencyResults);

      // 根据配置应用重试或超时逻辑
      let result: TOutput;
      try {
        if (this.config.retry) {
          result = await this.executeWithRetry(
            zenInput as any,
            signal,
            this.config.retry
          );
        } else if (this.config.timeout && this.config.timeout > 0) {
          result = await this.executeWithTimeout(zenInput as any, signal);
        } else {
          result = await this.executeCore(zenInput as any, signal);
        }
      } catch (error) {
        // 记录详细错误
        console.error(`执行Zen步骤 ${this.name} (${this.id}) 失败:`, error);
        throw error;
      }

      // 更新状态和结果
      this.status = "completed";
      this.value = result;
      this.endTime = Date.now();
      return result;
    } catch (error) {
      // 处理执行错误
      this.endTime = Date.now();
      await this.handleZenError(error);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      // 清理临时资源
      this.executeCleanup();
    }
  }

  /**
   * 核心执行逻辑
   * @param zenInput - 输入参数，包含依赖结果
   * @param signal - 中断信号
   * @returns Promise<TOutput> - 执行结果
   * @private
   */
  private async executeCore(
    zenInput: ZenInput,
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
        return await new Promise<TOutput>((resolve, reject) => {
          // 设置清理函数
          const abortHandler = () => {
            if (this.status !== "cancelled") {
              this.status = "cancelled";
            }
            reject(new Error("Task cancelled"));
          };

          // 监听取消信号
          signal.addEventListener("abort", abortHandler);
          this.addCleanup(() =>
            signal.removeEventListener("abort", abortHandler)
          );

          // 执行实际的任务
          this.executor(zenInput as any)
            .then(resolve)
            .catch(reject);
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
        cleanup();
      }
      abortController.abort();
    }
  }

  /**
   * 重试执行逻辑
   * @param zenInput - 输入参数
   * @param signal - 中断信号
   * @param config - 重试配置
   * @returns Promise<TOutput> - 执行结果
   */
  private async executeWithRetry(
    zenInput: ZenInput,
    signal: AbortSignal,
    config: ZenRetryConfig
  ): Promise<TOutput> {
    // 确保重试配置有效
    const retryConfig = {
      maxAttempts: Math.max(1, config.maxAttempts || 3),
      initialDelay: Math.max(0, config.initialDelay || 1000),
      backoffFactor: Math.max(1, config.backoffFactor || 2),
      maxDelay: Math.max(0, config.maxDelay || 30000),
    };

    let lastError: Error | undefined;
    let isTaskCancelled = false;

    // 循环尝试执行
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      // 检查是否已取消
      if (signal.aborted) {
        isTaskCancelled = true;
        throw new Error("Task cancelled during retry");
      }

      try {
        // 记录重试尝试
        if (attempt > 1) {
          console.log(
            `Zen ${this.name} (${this.id}): 第 ${attempt}/${retryConfig.maxAttempts} 次重试`
          );
        }

        // 执行实际操作
        return await this.executeCore(zenInput, signal);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 检查是否任务被取消，如果已取消则不再重试
        if (
          error instanceof Error &&
          (error.message === "Task cancelled" ||
            error.message === "Task cancelled before execution")
        ) {
          isTaskCancelled = true;
          break;
        }

        // 判断是否已达到最大重试次数
        if (attempt === retryConfig.maxAttempts) {
          console.error(
            `Zen ${this.name} (${this.id}): 已达到最大重试次数 (${retryConfig.maxAttempts})，不再重试`
          );
          break;
        }

        // 计算重试延迟时间
        const delay = Math.min(
          retryConfig.initialDelay *
            Math.pow(retryConfig.backoffFactor, attempt - 1),
          retryConfig.maxDelay
        );

        // 发出重试事件
        try {
          this.task.emit({
            type: "zen:retry",
            zenId: this.id,
            timestamp: Date.now(),
            data: { attempt, delay, maxAttempts: retryConfig.maxAttempts },
            error: lastError,
          });
        } catch (emitError) {
          console.error(`发送重试事件时出错:`, emitError);
        }

        // 等待重试延迟时间
        await new Promise((resolve) => {
          const timeoutId = setTimeout(resolve, delay);

          // 如果任务被取消，清除延迟
          const abortHandler = () => {
            clearTimeout(timeoutId);
            isTaskCancelled = true;
            resolve(undefined);
          };

          signal.addEventListener("abort", abortHandler);
          this.addCleanup(() =>
            signal.removeEventListener("abort", abortHandler)
          );
        });

        // 再次检查是否已取消
        if (signal.aborted || isTaskCancelled) {
          throw new Error("Task cancelled during retry wait");
        }
      }
    }

    // 如果是被取消的任务，抛出取消错误
    if (isTaskCancelled) {
      throw new Error("Task cancelled");
    }

    // 所有重试都失败，抛出最后一个错误
    throw lastError || new Error("Unknown error during retry");
  }

  /**
   * 超时执行逻辑
   * @param zenInput - 输入参数
   * @param signal - 中断信号
   * @returns Promise<TOutput> - 执行结果
   */
  private async executeWithTimeout(
    zenInput: ZenInput,
    signal: AbortSignal
  ): Promise<TOutput> {
    let timeoutId: NodeJS.Timeout;
    let abortListener: ((ev: Event) => void) | undefined;

    try {
      // 使用Promise.race实现超时控制
      const result = await Promise.race([
        this.executeCore(zenInput, signal),
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
          const abortHandler = () => {
            clearTimeout(timeoutId);
            reject(new Error("Task cancelled"));
          };
          signal.addEventListener("abort", abortHandler);
          this.addCleanup(() => {
            clearTimeout(timeoutId);
            signal.removeEventListener("abort", abortHandler);
          });
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
   * @returns Promise<Record<string, any>> - 依赖步骤的执行结果
   */
  private async waitForDependencies(): Promise<Record<string, any>> {
    if (this.dependencies.size === 0) return {};

    // 收集所有依赖的结果到对象中
    const results: Record<string, any> = {};

    for (const depId of this.dependencies) {
      const depZen = this.task.getZenById(depId);
      if (depZen.getStatus() === "completed") {
        results[depId] = depZen.getResult();
      } else {
        throw new Error(`依赖步骤 ${depZen.getName()} 未完成`);
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
    // 只设置状态和错误，不修改时间戳
    this.status = "pending";
    this.value = undefined;
    this.error = undefined;
    // 不再设置时间戳，它们会在执行时自动设置
    // this.startTime = undefined;
    // this.endTime = undefined;
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
    this.executeCleanup();
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
    // 标准化错误对象
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : String(error));

    // 确定错误类型和状态
    const isTaskCancelled =
      normalizedError.message.includes("Task cancelled") ||
      normalizedError.message.includes("cancelled before execution") ||
      normalizedError.message.includes("cancelled during retry");

    // 更新步骤状态
    this.status = isTaskCancelled ? "cancelled" : "failed";
    this.error = normalizedError;

    // 记录错误信息
    if (isTaskCancelled) {
      console.log(`Zen ${this.name} (${this.id}) 已取消`);
    } else {
      console.error(`Zen ${this.name} (${this.id}) 执行失败:`, normalizedError);
    }

    try {
      // 发出错误事件 - 无论是取消还是失败，都使用zen:fail事件类型
      this.task.emit({
        type: "zen:fail",
        zenId: this.id,
        timestamp: Date.now(),
        error: normalizedError,
      });
    } catch (emitError) {
      console.error(`发送错误事件时出错:`, emitError);
    }
  }
}
