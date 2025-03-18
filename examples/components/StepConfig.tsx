import React from "react";

export interface StepConfig {
  name: string;
  timeout?: number;
  retry?: {
    maxAttempts: number;
    initialDelay: number;
    backoffFactor: number;
    maxDelay: number;
  };
  hasCancel?: boolean;
  dependencies?: string[];
}

interface StepConfigProps {
  step: StepConfig;
  index: number;
  allSteps: StepConfig[];
  onChange: (index: number, config: Partial<StepConfig>) => void;
  onRemove: (index: number) => void;
}

export const StepConfig: React.FC<StepConfigProps> = ({
  step,
  index,
  allSteps,
  onChange,
  onRemove,
}) => {
  return (
    <div className="step-config">
      <div className="step-header">
        <h4>步骤 {index + 1}</h4>
        <button
          className="btn btn-icon remove-btn"
          onClick={() => onRemove(index)}
        >
          ×
        </button>
      </div>

      <div className="form-group">
        <label>步骤名称:</label>
        <input
          type="text"
          value={step.name}
          onChange={(e) => onChange(index, { name: e.target.value })}
          placeholder="输入步骤名称"
        />
      </div>

      <div className="form-group">
        <label>超时时间 (ms):</label>
        <input
          type="number"
          value={step.timeout || ""}
          onChange={(e) =>
            onChange(index, { timeout: parseInt(e.target.value) || undefined })
          }
          placeholder="输入超时时间"
        />
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={step.hasCancel || false}
            onChange={(e) => onChange(index, { hasCancel: e.target.checked })}
          />
          启用取消功能
        </label>
      </div>

      <div className="form-group">
        <label>依赖步骤:</label>
        <div className="dependencies-list">
          {allSteps.map(
            (s, i) =>
              i !== index && (
                <label key={i} className="dependency-item">
                  <input
                    type="checkbox"
                    checked={step.dependencies?.includes(s.name) || false}
                    onChange={(e) => {
                      const newDeps = e.target.checked
                        ? [...(step.dependencies || []), s.name]
                        : (step.dependencies || []).filter(
                            (dep) => dep !== s.name
                          );
                      onChange(index, { dependencies: newDeps });
                    }}
                  />
                  {s.name}
                </label>
              )
          )}
        </div>
      </div>
    </div>
  );
};
