import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { Echo } from "echo-state";
import React, { useState } from "react";
import { Tao } from "../../src/core/Tao";

const task = new Echo<string>("").localStorage({ name: "current_task" });

/**
 * 已优化：ZenInput接口现在使用Record<string, any>替代Map<string, any>，
 * 简化了依赖数据的获取方式，提高了API的易用性和性能。
 *
 * 步骤之间的数据获取现在可以通过input.get(step)直接获取上游步骤的输出，
 * 无需手动处理数据格式问题。
 */

// 任务重试演示组件
export const RetryDemo: React.FC = () => {
  const [tao, setTao] = useState<Tao | null>(null);
  const taskId = task.use();
  const [taskError, setTaskError] = useState<string | null>(null);
  const [retryFailedZensOnly, setRetryFailedZensOnly] = useState(true);

  // 从存储中获取任务状态 - 确保 hooks 调用在每次渲染中顺序一致
  const taoState = Tao.use((state) => state.taos[taskId]);

  // 创建并注册新任务
  const createTask = () => {
    // 清理所有存在的任务
    const currentTaos = Tao.current().taos;
    if (currentTaos) {
      Object.keys(currentTaos).forEach((key) => {
        try {
          Tao.remove(key);
        } catch (error) {
          console.error(`清理任务失败 ${key}:`, error);
        }
      });
    }

    // 清理之前的任务
    if (tao && taskId) {
      try {
        Tao.remove(taskId);
      } catch (error) {
        console.error("清理任务失败:", error);
      }
    }

    setTaskError(null);

    // 创建新任务
    const newTao = new Tao({
      name: "演示任务重试功能",
      description: "这个任务包含多个步骤，展示数据流和依赖关系",
      retryFailedZensOnly: retryFailedZensOnly, // 使用状态变量
    });

    // 添加步骤1：初始化数据
    const step1 = newTao
      .zen<{ id: number; source: string }>("步骤1：初始化数据")
      .exe(async () => {
        await simulateWork(1000);
        return {
          id: Math.floor(Math.random() * 1000),
          source: "数据源A",
        };
      });

    // 添加步骤2：处理数据(依赖步骤1的结果)
    const step2 = newTao
      .zen<{ id: number; processedData: string; processingTime: number }>(
        "步骤2：处理数据"
      )
      .exe(async (input) => {
        await simulateWork(1500);

        // 通过input.get获取步骤1的结果
        const step1Result = input.get(step1);
        if (!step1Result) {
          console.error("步骤2无法获取步骤1的结果");
          throw new Error("数据处理失败 - 无法获取依赖步骤结果");
        }

        // 随机失败 (50%概率)
        if (Math.random() < 0.5) {
          throw new Error(`数据处理失败 - ID: ${step1Result.id}`);
        }

        return {
          id: step1Result.id,
          processedData: `来自${step1Result.source}的数据已处理`,
          processingTime: 1500,
        };
      })
      .after(step1);

    // 添加步骤3：验证数据(依赖步骤1的结果)
    const step3 = newTao
      .zen<{ id: number; isValid: boolean; validationTime: number }>(
        "步骤3：验证数据"
      )
      .exe(async (input) => {
        await simulateWork(1000);

        // 通过input.get获取步骤1的结果
        const step1Result = input.get(step1);
        if (!step1Result) {
          console.error("步骤3无法获取步骤1的结果");
          throw new Error("数据验证失败 - 无法获取依赖步骤结果");
        }

        return {
          id: step1Result.id,
          isValid: true,
          validationTime: 1000,
        };
      })
      .after(step1);

    // 添加步骤4：存储结果(依赖步骤2和步骤3的结果)
    const step4 = newTao
      .zen<{
        id: number;
        finalData: string;
        totalTime: number;
        success: boolean;
      }>("步骤4：存储结果")
      .exe(async (input) => {
        await simulateWork(2000);

        // 通过input.get获取步骤2和步骤3的结果
        const step2Result = input.get(step2);
        const step3Result = input.get(step3);

        if (!step2Result || !step3Result) {
          console.error("步骤4无法获取依赖步骤的结果:", {
            step2: !!step2Result,
            step3: !!step3Result,
          });
          throw new Error("存储结果失败 - 无法获取依赖步骤结果");
        }

        // 随机失败 (30%概率)
        if (Math.random() < 0.3) {
          throw new Error(`结果存储失败 - ID: ${step2Result.id}`);
        }

        return {
          id: step2Result.id,
          finalData: step3Result.isValid
            ? `${step2Result.processedData} (已验证)`
            : `${step2Result.processedData} (验证失败)`,
          totalTime:
            step2Result.processingTime + step3Result.validationTime + 2000,
          success: true,
        };
      })
      .after(step2, step3);

    // 注册任务
    newTao.register();
    setTao(newTao);
    task.set(newTao.getId() || "");
  };

  // 运行任务
  const runTask = async () => {
    if (!tao) return;

    try {
      setTaskError(null);
      await tao.run();
    } catch (error) {
      if (error instanceof Error) {
        setTaskError(error.message);
      } else {
        setTaskError("任务执行出错");
      }
    }
  };

  // 使用实例方法重试任务
  const retryTask = async () => {
    if (!tao) return;

    try {
      setTaskError(null);
      await tao.retry();
    } catch (error) {
      if (error instanceof Error) {
        setTaskError(error.message);
      } else {
        setTaskError("任务重试出错");
      }
    }
  };

  // 更改重试模式
  const toggleRetryMode = () => {
    // 更新状态变量
    const newMode = !retryFailedZensOnly;
    setRetryFailedZensOnly(newMode);

    // 创建新任务
    createTask();
  };

  // 模拟异步工作
  const simulateWork = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // 任务状态图标
  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case "completed":
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case "failed":
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
      case "running":
        return (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
        );
      default:
        return (
          <div className="w-5 h-5 rounded-full border border-gray-300"></div>
        );
    }
  };

  // 格式化显示步骤结果
  const formatResult = (result: any) => {
    if (!result) return "-";

    try {
      if (typeof result === "object") {
        return JSON.stringify(result, null, 2);
      }
      return String(result);
    } catch (e) {
      return String(result);
    }
  };

  return (
    <div className="bg-white shadow-lg rounded-xl p-6 mb-6 border border-gray-100">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">
        Taozen 任务重试演示
      </h1>

      <div className="flex gap-4 mb-6 flex-wrap">
        <button
          onClick={createTask}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          重置任务
        </button>

        <button
          onClick={runTask}
          disabled={
            !tao ||
            (taoState?.status !== "pending" && taoState?.status !== "failed")
          }
          className={`px-4 py-2 ${
            !tao ||
            (taoState?.status !== "pending" && taoState?.status !== "failed")
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          } text-white rounded-lg transition-colors flex items-center`}
        >
          <PlayIcon className="w-4 h-4 mr-1" />
          运行任务
        </button>

        <button
          onClick={retryTask}
          disabled={
            !tao ||
            (taoState?.status !== "failed" && taoState?.status !== "cancelled")
          }
          className={`px-4 py-2 ${
            !tao ||
            (taoState?.status !== "failed" && taoState?.status !== "cancelled")
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-yellow-500 hover:bg-yellow-600"
          } text-white rounded-lg transition-colors flex items-center`}
        >
          <ArrowPathIcon className="w-4 h-4 mr-1" />
          实例方法重试
        </button>

        <button
          onClick={toggleRetryMode}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          {retryFailedZensOnly ? "模式: 只重试失败步骤" : "模式: 重试所有步骤"}
        </button>
      </div>

      {taoState && (
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            {taoState.name}
          </h2>
          <p className="text-gray-600 mb-3">{taoState.description}</p>

          <div className="flex items-center space-x-4 mb-3">
            <div className="flex items-center">
              <div className="w-64 bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${taoState.progress}%` }}
                ></div>
              </div>
              <span className="ml-2 text-sm text-gray-600">
                {taoState.progress}%
              </span>
            </div>

            <span
              className={`text-sm px-2 py-1 rounded-full ${
                taoState.status === "running"
                  ? taoState.paused
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-blue-100 text-blue-700"
                  : taoState.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : taoState.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : taoState.status === "cancelled"
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {taoState.paused ? "已暂停" : taoState.status}
            </span>

            {taoState.executionTime && (
              <span className="text-sm text-gray-500 inline-flex items-center">
                <ClockIcon className="w-4 h-4 mr-1" />
                {(taoState.executionTime / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {taskError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex">
                <ExclamationCircleIcon className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-red-700">{taskError}</span>
              </div>
            </div>
          )}

          {/* 依赖关系图 */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-700 mb-3">
              步骤依赖关系
            </h3>
            <div className="relative p-4">
              {/* 步骤节点 */}
              <div className="grid grid-cols-2 gap-6 mb-2">
                <div
                  className={`p-3 rounded-lg border-2 ${
                    taoState.zens &&
                    taoState.zens.length > 0 &&
                    taoState.zens[0]?.status === "completed"
                      ? "border-green-500 bg-green-50"
                      : taoState.zens &&
                        taoState.zens.length > 0 &&
                        taoState.zens[0]?.status === "failed"
                      ? "border-red-500 bg-red-50"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  <div className="font-medium">步骤1：初始化数据</div>
                  <div className="text-xs text-gray-500 mt-1">
                    输出: id, source
                  </div>
                </div>

                <div className="flex justify-center items-center">
                  {/* 空白占位 */}
                </div>

                <div
                  className={`p-3 rounded-lg border-2 ${
                    taoState.zens &&
                    taoState.zens.length > 1 &&
                    taoState.zens[1]?.status === "completed"
                      ? "border-green-500 bg-green-50"
                      : taoState.zens &&
                        taoState.zens.length > 1 &&
                        taoState.zens[1]?.status === "failed"
                      ? "border-red-500 bg-red-50"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  <div className="font-medium">步骤2：处理数据</div>
                  <div className="text-xs text-gray-500 mt-1">
                    输入: id, source
                    <br />
                    输出: id, processedData
                  </div>
                </div>

                <div
                  className={`p-3 rounded-lg border-2 ${
                    taoState.zens &&
                    taoState.zens.length > 2 &&
                    taoState.zens[2]?.status === "completed"
                      ? "border-green-500 bg-green-50"
                      : taoState.zens &&
                        taoState.zens.length > 2 &&
                        taoState.zens[2]?.status === "failed"
                      ? "border-red-500 bg-red-50"
                      : "border-gray-300 bg-white"
                  }`}
                >
                  <div className="font-medium">步骤3：验证数据</div>
                  <div className="text-xs text-gray-500 mt-1">
                    输入: id, source
                    <br />
                    输出: id, isValid
                  </div>
                </div>

                <div
                  className={`p-3 rounded-lg border-2 col-span-2 mx-auto ${
                    taoState.zens &&
                    taoState.zens.length > 3 &&
                    taoState.zens[3]?.status === "completed"
                      ? "border-green-500 bg-green-50"
                      : taoState.zens &&
                        taoState.zens.length > 3 &&
                        taoState.zens[3]?.status === "failed"
                      ? "border-red-500 bg-red-50"
                      : "border-gray-300 bg-white"
                  }`}
                  style={{ width: "50%" }}
                >
                  <div className="font-medium">步骤4：存储结果</div>
                  <div className="text-xs text-gray-500 mt-1">
                    输入: 处理结果 + 验证结果
                    <br />
                    输出: finalData, success
                  </div>
                </div>
              </div>

              {/* 连接线 */}
              <svg
                className="absolute top-0 left-0 w-full h-full"
                style={{ zIndex: -1 }}
              >
                {/* 步骤1 -> 步骤2 */}
                <path
                  d="M 150,70 L 340,160"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />

                {/* 步骤1 -> 步骤3 */}
                <path
                  d="M 200,70 L 420,160"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />

                {/* 步骤2 -> 步骤4 */}
                <path
                  d="M 120,190 L 290,260"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />

                {/* 步骤3 -> 步骤4 */}
                <path
                  d="M 430,190 L 320,260"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />

                {/* 箭头标记 */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
            <h3 className="text-lg font-medium text-blue-700 mb-2">使用说明</h3>
            <ol className="list-decimal list-inside text-blue-700 space-y-1">
              <li>点击"运行任务"开始执行任务</li>
              <li>部分步骤会随机失败，导致整个任务失败</li>
              <li>
                任务失败后，可以使用以下两种方式重试：
                <ul className="list-disc list-inside ml-5 mt-1">
                  <li>实例方法重试：使用 tao.retry() 方法</li>
                  <li>静态方法重试：使用 Tao.retry(taskId, options) 方法</li>
                </ul>
              </li>
              <li>切换重试模式可以选择"只重试失败步骤"或"重试所有步骤"</li>
              <li>图表展示了步骤间的数据流动和依赖关系</li>
            </ol>
          </div>
        </div>
      )}

      {/* 步骤列表 */}
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                步骤
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                状态
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                数据输入/输出
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                错误
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {taoState?.zens && taoState.zens.length > 0 ? (
              taoState.zens.map((zen) => (
                <tr key={zen.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {zen.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <StatusIcon status={zen.status} />
                      <span className="ml-2 text-sm text-gray-500">
                        {zen.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-700 font-mono whitespace-pre-wrap bg-gray-50 p-2 rounded-lg text-xs overflow-auto max-h-24">
                      {zen.result ? formatResult(zen.result) : "-"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-red-500">
                      {zen.error || "-"}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  暂无步骤数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
