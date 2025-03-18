import React from "react";
import { TaoRuntimeState } from "../../src/core/Tao";
import { Tao } from "../../src/core/Tao";

interface TaskCardProps {
  tao: TaoRuntimeState;
  onDelete: (name: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ tao, onDelete }) => {
  // 获取步骤状态样式
  const getStepStatusStyle = (status: string) => {
    switch (status) {
      case "completed":
        return "status-completed";
      case "running":
        return "status-running";
      case "failed":
        return "status-failed";
      case "cancelled":
        return "status-cancelled";
      default:
        return "status-pending";
    }
  };

  // 获取任务控制按钮
  const getTaskControls = () => {
    if (tao.status === "running") {
      return (
        <div className="task-controls">
          <button
            className="btn btn-warning"
            onClick={() => Tao.pause(tao.name)}
          >
            暂停
          </button>
          <button
            className="btn btn-danger"
            onClick={() => Tao.cancel(tao.name)}
          >
            取消
          </button>
        </div>
      );
    } else if (tao.status === "paused") {
      return (
        <div className="task-controls">
          <button
            className="btn btn-success"
            onClick={() => Tao.resume(tao.name)}
          >
            恢复
          </button>
          <button
            className="btn btn-danger"
            onClick={() => Tao.cancel(tao.name)}
          >
            取消
          </button>
        </div>
      );
    } else if (tao.status === "failed" || tao.status === "cancelled") {
      return (
        <div className="task-controls">
          <button className="btn btn-danger" onClick={() => onDelete(tao.name)}>
            删除
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="task-card">
      <div className="task-header">
        <div className="task-title">
          <h3>{tao.name}</h3>
          <button
            className="btn btn-icon delete-btn"
            onClick={() => onDelete(tao.name)}
          >
            ×
          </button>
        </div>
        <span className={`status-badge ${getStepStatusStyle(tao.status)}`}>
          {tao.status}
        </span>
      </div>

      <div className="task-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${tao.progress}%` }}
          />
        </div>
        <span className="progress-text">{tao.progress}%</span>
      </div>

      <div className="task-info">
        <div className="info-item">
          <span className="label">执行时间:</span>
          <span className="value">
            {tao.executionTime
              ? `${(tao.executionTime / 1000).toFixed(2)}秒`
              : "未开始"}
          </span>
        </div>
      </div>

      <div className="task-steps">
        {tao.zens.map((zen) => (
          <div key={zen.id} className="step-item">
            <div className="step-header">
              <span className="step-name">{zen.name}</span>
              <span className={`step-status ${getStepStatusStyle(zen.status)}`}>
                {zen.status}
              </span>
            </div>
            {zen.error && <div className="step-error">{zen.error}</div>}
            {zen.result && (
              <div className="step-result">{JSON.stringify(zen.result)}</div>
            )}
          </div>
        ))}
      </div>

      {getTaskControls()}
    </div>
  );
};
