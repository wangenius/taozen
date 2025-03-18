import React from "react";
import { StepConfig } from "./StepConfig";

interface CreateTaskDialogProps {
  onClose: () => void;
  onCreate: (name: string, steps: StepConfig[]) => void;
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  onClose,
  onCreate,
}) => {
  const [taskName, setTaskName] = React.useState("");
  const [steps, setSteps] = React.useState<StepConfig[]>([
    { name: "步骤1", timeout: 5000, hasCancel: true },
  ]);

  const addStep = () => {
    setSteps([
      ...steps,
      { name: `步骤${steps.length + 1}`, timeout: 5000, hasCancel: true },
    ]);
  };

  const updateStep = (index: number, config: Partial<StepConfig>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...config };
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleCreate = () => {
    if (!taskName.trim()) return;
    onCreate(taskName, steps);
    setTaskName("");
    setSteps([{ name: "步骤1", timeout: 5000, hasCancel: true }]);
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content">
        <div className="dialog-header">
          <h2>创建新任务</h2>
          <button className="btn btn-icon close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-group">
          <label>任务名称:</label>
          <input
            type="text"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="输入任务名称"
          />
        </div>

        <div className="steps-config">
          <div className="steps-header">
            <h3>步骤配置</h3>
            <button className="btn btn-primary" onClick={addStep}>
              添加步骤
            </button>
          </div>

          {steps.map((step, index) => (
            <StepConfig
              key={index}
              step={step}
              index={index}
              allSteps={steps}
              onChange={updateStep}
              onRemove={removeStep}
            />
          ))}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleCreate}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
};
