/** 定义任务事件类型，用于任务执行过程中的事件通知 */
import type { Zen } from "./Zen";

export type TaozenEventType =
  | "zen:start" // 步骤开始
  | "zen:complete" // 步骤完成
  | "zen:fail" // 步骤失败
  | "zen:retry" // 步骤重试
  | "zen:pause" // 步骤暂停
  | "zen:resume" // 步骤恢复
  | "tao:start" // 任务开始
  | "tao:complete" // 任务完成
  | "tao:fail" // 任务失败
  | "tao:pause" // 任务暂停
  | "tao:resume" // 任务恢复
  | "tao:retry"; // 任务重试
/**
 * Tao 任务配置接口
 * @property name - 任务名称
 * @property description - 任务描述(可选)
 * @property retryFailedZensOnly - 重试时是否只重试失败的步骤(可选)，默认false
 */
export interface TaoConfig {
  name: string;
  description?: string;
  retryFailedZensOnly?: boolean;
}
/**
 * 步骤配置接口
 * @property retry - 重试配置
 * @property timeout - 超时时间
 * @property onCancel - 取消回调函数
 */
export interface ZenConfig {
  retry?: ZenRetryConfig;
  timeout?: number;
  onCancel?: () => void;
}
/** 任务状态 */
export type TaoStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

/** 步骤状态 */
export type ZenStatus =
  | "pending" // 等待执行
  | "running" // 正在执行
  | "completed" // 执行完成
  | "failed" // 执行失败
  | "cancelled"; // 已取消

/**
 * 执行器类型 - 定义步骤的执行逻辑
 * @template TInput - 输入参数类型，通常是ZenInput
 * @template TOutput - 输出结果类型
 * @param input - 执行器的输入参数
 * @returns Promise<TOutput> - 异步执行结果
 */
export type ZenExecutor<TInput = ZenInput, TOutput = any> = (
  data: TInput
) => Promise<TOutput>;

/**
 * Zen输入接口 - 提供访问依赖步骤结果的方法
 * 允许步骤通过get方法直接访问依赖步骤的输出结果
 */
export interface ZenInput {
  // 通过步骤实例获取其结果，泛型T会被推断为步骤的输出类型
  get<T>(step: Zen<any, T>): T | undefined;
  // 通过步骤ID获取其结果
  getById<T>(stepId: string): T | undefined;
  // 获取原始依赖数据
  getRaw(): Record<string, any>;
}

/**
 * 重试配置接口
 * @property maxAttempts - 最大重试次数
 * @property initialDelay - 初始重试延迟时间(毫秒)
 * @property maxDelay - 最大重试延迟时间(毫秒)
 * @property backoffFactor - 重试延迟时间的增长因子
 */
export interface ZenRetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

/**
 * Tao 事件接口
 * @property type - 事件类型
 * @property zenId - 相关步骤ID(可选)
 * @property timestamp - 事件发生时间戳
 * @property data - 事件相关数据(可选)
 * @property error - 错误信息(可选)
 */
export interface TaoEvent {
  type: TaozenEventType;
  zenId?: string;
  timestamp: number;
  data?: any;
  error?: Error;
}

/**
 * Tao 事件监听器类型
 * @param event - Tao事件角色
 */
export type TaoEventListener = (event: TaoEvent) => void;

/**
 * 步骤状态接口
 * @property id - 步骤唯一标识
 * @property name - 步骤名称
 * @property status - 步骤执行状态
 * @property result - 执行结果(可选)
 * @property error - 错误信息(可选)
 * @property startTime - 开始执行时间(可选)
 * @property endTime - 结束执行时间(可选)
 * @property dependencies - 依赖关系数组
 */
export interface ZenState {
  id: string;
  name: string;
  status: ZenStatus;
  result?: any;
  error?: Error;
  startTime?: number;
  endTime?: number;
  dependencies?: string[];
}
