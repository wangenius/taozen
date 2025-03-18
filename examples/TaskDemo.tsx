import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import React, { useCallback, useEffect, useRef } from "react";
import { Tao } from "../src/core/Tao";
// 任务卡片组件
const OrbitCard: React.FC<{
  orbit: Tao;
  onRemove: () => void;
}> = ({ orbit, onRemove }) => {
  const orbitId = orbit.getId() || "";
  const orbitState = Tao.use((state) => state.taos[orbitId]);
  const states = Tao.use((state) => state.states[orbitId] || new Map());
  const events = Tao.use((state) => state.events[orbitId] || []);

  if (!orbitState) {
    return null;
  }

  return (
    <div className="bg-white shadow-lg rounded-xl p-6 mb-4 border border-gray-100 hover:border-blue-100 transition-all">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">
            {orbitState.name}
          </h3>
          <div className="flex items-center space-x-3 mt-2">
            <div className="flex items-center">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${orbitState.progress}%` }}
                ></div>
              </div>
              <span className="ml-2 text-sm text-gray-600">
                {orbitState.progress}%
              </span>
            </div>
            <span
              className={`text-sm px-2 py-1 rounded-full ${
                orbitState.status === "running"
                  ? orbitState.paused
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-blue-100 text-blue-700"
                  : orbitState.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : orbitState.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {orbitState.paused ? "已暂停" : orbitState.status}
            </span>
            {orbitState.executionTime && (
              <span className="text-sm text-gray-500 inline-flex items-center">
                <ClockIcon className="w-4 h-4 mr-1" />
                {(orbitState.executionTime / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>

        <div className="space-x-2">
          {orbitState.status === "pending" && (
            <button
              onClick={() => orbit.run()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors inline-flex items-center"
            >
              <PlayIcon className="w-4 h-4 mr-1" />
              运行
            </button>
          )}
          {orbitState.status === "running" && !orbitState.paused && (
            <button
              onClick={() => orbit.pause()}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors inline-flex items-center"
            >
              <PauseIcon className="w-4 h-4 mr-1" />
              暂停
            </button>
          )}
          {orbitState.status === "paused" && (
            <button
              onClick={() => orbit.resume()}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors inline-flex items-center"
            >
              <PlayIcon className="w-4 h-4 mr-1" />
              恢复
            </button>
          )}
          {orbitState.status === "running" && (
            <button
              onClick={() => orbit.cancel()}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors inline-flex items-center"
            >
              <StopIcon className="w-4 h-4 mr-1" />
              取消
            </button>
          )}
          {(orbitState.status === "completed" ||
            orbitState.status === "failed" ||
            orbitState.status === "cancelled") && (
            <button
              onClick={onRemove}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors inline-flex items-center"
            >
              <TrashIcon className="w-4 h-4 mr-1" />
              移除
            </button>
          )}
        </div>
      </div>

      {/* 步骤状态 */}
      <div className="space-y-3 mb-6">
        {orbitState.zens.map((zen) => (
          <div
            key={zen.id}
            className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {zen.status === "running" && !orbitState.paused && (
              <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />
            )}
            {zen.status === "completed" && (
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
            )}
            {zen.status === "failed" && (
              <ExclamationCircleIcon className="w-4 h-4 text-red-500" />
            )}
            <div
              className={`w-3 h-3 rounded-full ${
                zen.status === "pending"
                  ? "bg-gray-400"
                  : zen.status === "running"
                  ? orbitState.paused
                    ? "bg-yellow-400"
                    : "bg-blue-400 animate-pulse"
                  : zen.status === "completed"
                  ? "bg-green-400"
                  : "bg-red-400"
              }`}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-700">
                {zen.name}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {zen.status === "running"
                  ? orbitState.paused
                    ? "已暂停"
                    : "正在运行..."
                  : zen.status}
                {zen.error && (
                  <span className="text-red-500 ml-2">{zen.error}</span>
                )}
                {zen.result && (
                  <span className="text-green-500 ml-2">
                    结果: {JSON.stringify(zen.result)}
                  </span>
                )}
              </div>
            </div>
            {zen.startTime && (
              <div className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(zen.startTime).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 错误信息 */}
      {orbitState.zens.some((zen) => zen.error) && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-100">
          <div className="text-sm font-medium text-red-800 mb-2">错误信息:</div>
          {orbitState.zens
            .filter((zen) => zen.error)
            .map((zen) => (
              <div key={zen.id} className="text-xs text-red-600 mt-1">
                {zen.name}: {zen.error}
              </div>
            ))}
        </div>
      )}

      {/* 事件日志 */}
      <div className="mt-4">
        <div className="text-sm font-medium text-gray-700 mb-3">事件日志</div>
        <div className="text-xs bg-gray-50 rounded-lg p-4 h-24 overflow-auto space-y-2">
          {events.map((event, index) => (
            <div key={index} className="flex items-center space-x-2">
              <span className="text-gray-400 font-mono">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full ${
                  event.type.includes("fail")
                    ? "bg-red-100 text-red-700"
                    : event.type.includes("complete")
                    ? "bg-green-100 text-green-700"
                    : event.type.includes("pause")
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {event.type}
              </span>
              {event.error && (
                <span className="text-red-500">{event.error.message}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 主任务管理组件
export const TaosDemo: React.FC = () => {
  // 使用 ref 保存实例引用
  const orbitsRef = useRef<Map<string, Tao>>(new Map());
  const orbits = Tao.use((state) => state.taos);

  // 创建新任务
  const createOrbit = useCallback(() => {
    const orbit = new Tao({
      name: `轨道 ${Object.keys(orbits).length + 1}`,
    });

    // 创建步骤
    const comet1 = orbit
      .zen("加载数据")
      .exe(() => new Promise((r) => setTimeout(r, 2000)))
      .retry();

    const comet2 = orbit
      .zen("处理数据 A")
      .exe(async () => {
        await new Promise((r) => setTimeout(r, 1500));
        if (Math.random() > 0.7) throw new Error("随机错误");
        return "ok";
      })
      .after(comet1)
      .retry();

    const comet3 = orbit
      .zen("处理数据 B")
      .exe(async () => {
        await new Promise((r) => setTimeout(r, 1500));
        if (Math.random() > 0.7) throw new Error("随机错误");
        return "ok";
      })
      .after(comet1)
      .retry();

    orbit
      .zen("保存结果")
      .exe(() => new Promise((r) => setTimeout(r, 1000)))
      .after(comet2, comet3);

    // 注册并保存实例引用
    const id = orbit.register().getId()!;
    orbitsRef.current.set(id, orbit);

    return id;
  }, [orbits]);

  // 移除任务
  const removeOrbit = useCallback((orbitId: string) => {
    const orbit = orbitsRef.current.get(orbitId);
    if (orbit) {
      orbit.remove();
      orbitsRef.current.delete(orbitId);
    }
  }, []);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      orbitsRef.current.forEach((orbit) => orbit.remove());
      orbitsRef.current.clear();
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">轨道管理器</h2>
          <div className="text-sm text-gray-500 mt-1">
            当前轨道数: {Object.keys(orbits).length}
          </div>
        </div>
        <button
          onClick={createOrbit}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors
			  flex items-center space-x-2"
        >
          <PlusIcon className="w-5 h-5" />
          <span>创建新轨道</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.keys(orbits).map((orbitId) => {
          const orbit = orbitsRef.current.get(orbitId);
          if (!orbit) return null;
          return (
            <OrbitCard
              key={orbitId}
              orbit={orbit}
              onRemove={() => removeOrbit(orbitId)}
            />
          );
        })}
      </div>
    </div>
  );
};
