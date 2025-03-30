---
title: React Integration
order: 3
---

# React Integration with Taozen

Taozen provides seamless integration with React applications through its state management system. This tutorial covers how to use Taozen's features in React components, including task management, state tracking, and building user interfaces for task monitoring.

## Basic Integration

To use Taozen in a React application, you'll first need to import the library:

```typescript
import { Tao } from "taozen";
```

## Using the Tao.use() Hook

Taozen provides a `use()` method which works like a React hook to subscribe to task state changes:

```tsx
import React from "react";
import { Tao } from "taozen";

function TaskMonitor() {
  // Subscribe to all task states
  const { taos } = Tao.use();

  return (
    <div className="task-monitor">
      <h2>Tasks</h2>
      {Object.entries(taos).length === 0 ? (
        <p>No tasks registered</p>
      ) : (
        <ul>
          {Object.entries(taos).map(([id, task]) => (
            <li key={id}>
              <strong>{task.name}</strong> - {task.status} ({task.progress}%)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## Selectors for Performance Optimization

To optimize performance, you can use selectors to subscribe only to specific parts of the state:

```tsx
function TaskProgress({ taskId }) {
  // Subscribe only to the progress of a specific task
  const progress = Tao.use((state) => state.taos[taskId]?.progress ?? 0);

  return (
    <div className="progress-bar">
      <div className="progress" style={{ width: `${progress}%` }} />
      <span>{progress}%</span>
    </div>
  );
}
```

## Creating and Managing Tasks in Components

Here's an example of a component that creates and manages a task:

```tsx
import React, { useState, useEffect, useCallback } from "react";
import { Tao } from "taozen";

function DataProcessor() {
  const [tao, setTao] = useState(null);
  const [taskId, setTaskId] = useState(null);

  // Get task state if taskId exists
  const taskState = Tao.use((state) => (taskId ? state.taos[taskId] : null));

  // Initialize task
  const initializeTask = useCallback(() => {
    // Create a new task
    const newTao = new Tao({
      name: "Data Processing",
      description: "Fetches and processes data from the API",
    });

    // Add steps
    const fetchStep = newTao.zen("Fetch Data").exe(async () => {
      const response = await fetch("https://api.example.com/data");
      return response.json();
    });

    const processStep = newTao
      .zen("Process Data")
      .after(fetchStep)
      .exe(async (input) => {
        const data = input.get(fetchStep);
        return data.map((item) => ({ ...item, processed: true }));
      });

    // Register the task to enable state tracking
    newTao.register();

    // Store the task and its ID
    setTao(newTao);
    setTaskId(newTao.getId());

    return newTao;
  }, []);

  // Start task execution
  const startTask = useCallback(async () => {
    if (!tao) return;

    try {
      const results = await tao.run();
      console.log("Task completed:", results);
    } catch (error) {
      console.error("Task failed:", error);
    }
  }, [tao]);

  // Task control functions
  const pauseTask = useCallback(() => tao?.pause(), [tao]);
  const resumeTask = useCallback(() => tao?.resume(), [tao]);
  const cancelTask = useCallback(() => tao?.cancel(), [tao]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (taskId) {
        Tao.remove(taskId);
      }
    };
  }, [taskId]);

  return (
    <div className="data-processor">
      <h2>Data Processor</h2>

      {!tao ? (
        <button onClick={initializeTask}>Initialize Task</button>
      ) : (
        <>
          <div className="task-info">
            <p>Task: {taskState?.name}</p>
            <p>Status: {taskState?.status}</p>
            <p>Progress: {taskState?.progress}%</p>
          </div>

          <div className="task-controls">
            {taskState?.status === "pending" && (
              <button onClick={startTask}>Start</button>
            )}

            {taskState?.status === "running" && !taskState?.paused && (
              <button onClick={pauseTask}>Pause</button>
            )}

            {taskState?.status === "paused" && (
              <button onClick={resumeTask}>Resume</button>
            )}

            {(taskState?.status === "running" ||
              taskState?.status === "paused") && (
              <button onClick={cancelTask}>Cancel</button>
            )}
          </div>

          {/* Display steps */}
          <div className="task-steps">
            <h3>Steps</h3>
            <ul>
              {taskState?.zens.map((zen) => (
                <li key={zen.id}>
                  {zen.name}: {zen.status}
                  {zen.error && <span className="error"> - {zen.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
```

## Building a Task Dashboard

You can create a more sophisticated task dashboard component that displays multiple tasks and allows users to manage them:

```tsx
import React from "react";
import { Tao } from "taozen";

function TaskDashboard() {
  const { taos } = Tao.use();

  const handlePause = async (taskId) => {
    await Tao.pause(taskId);
  };

  const handleResume = async (taskId) => {
    await Tao.resume(taskId);
  };

  const handleCancel = async (taskId) => {
    await Tao.cancel(taskId);
  };

  const handleRetry = async (taskId) => {
    await Tao.retry(taskId);
  };

  const handleRemove = (taskId) => {
    Tao.remove(taskId);
  };

  return (
    <div className="task-dashboard">
      <h2>Task Dashboard</h2>

      {Object.entries(taos).length === 0 ? (
        <p>No tasks registered</p>
      ) : (
        <div className="task-list">
          {Object.entries(taos).map(([id, task]) => (
            <div key={id} className="task-card">
              <div className="task-header">
                <h3>{task.name}</h3>
                <span className={`status status-${task.status}`}>
                  {task.status}
                </span>
              </div>

              <div className="task-progress">
                <div className="progress-bar">
                  <div
                    className="progress"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <span>{task.progress}%</span>
              </div>

              <div className="task-details">
                <p>
                  <strong>Started:</strong>{" "}
                  {task.startTime
                    ? new Date(task.startTime).toLocaleString()
                    : "Not started"}
                </p>
                {task.executionTime && (
                  <p>
                    <strong>Duration:</strong>{" "}
                    {(task.executionTime / 1000).toFixed(2)}s
                  </p>
                )}
              </div>

              <div className="task-steps">
                <h4>Steps ({task.zens.length})</h4>
                <ul>
                  {task.zens.map((zen) => (
                    <li key={zen.id} className={`step-${zen.status}`}>
                      {zen.name}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="task-actions">
                {task.status === "running" && !task.paused && (
                  <button onClick={() => handlePause(id)}>Pause</button>
                )}

                {task.status === "paused" && (
                  <button onClick={() => handleResume(id)}>Resume</button>
                )}

                {(task.status === "running" || task.status === "paused") && (
                  <button onClick={() => handleCancel(id)}>Cancel</button>
                )}

                {(task.status === "failed" || task.status === "cancelled") && (
                  <button onClick={() => handleRetry(id)}>Retry</button>
                )}

                {task.status !== "running" && (
                  <button onClick={() => handleRemove(id)}>Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Custom Hook for Task Creation

You can create a custom hook to simplify task creation and management:

```tsx
import { useState, useEffect, useCallback } from "react";
import { Tao, ZenExecutor, ZenInput } from "taozen";

export function useTaoTask(name, options = {}) {
  const [tao, setTao] = useState(null);
  const [taskId, setTaskId] = useState(null);

  // Initialize task on mount if autoInit is true
  useEffect(() => {
    if (options.autoInit) {
      initializeTask();
    }

    // Cleanup on unmount
    return () => {
      if (taskId && options.autoRemove !== false) {
        Tao.remove(taskId);
      }
    };
  }, []);

  // Get task state
  const taskState = Tao.use((state) => (taskId ? state.taos[taskId] : null));

  // Initialize task
  const initializeTask = useCallback(() => {
    const newTao = new Tao({
      name,
      description: options.description,
      retryFailedZensOnly: options.retryFailedZensOnly,
    });

    if (options.autoRegister !== false) {
      newTao.register();
    }

    setTao(newTao);
    setTaskId(newTao.getId());

    return newTao;
  }, [
    name,
    options.description,
    options.retryFailedZensOnly,
    options.autoRegister,
  ]);

  // Create a step with consistent error handling
  const createStep = useCallback(
    (stepName, executor, stepOptions = {}) => {
      if (!tao) return null;

      const step = tao.zen(stepName);

      // Set executor
      step.exe(async (input) => {
        try {
          return await executor(input);
        } catch (error) {
          console.error(`Step "${stepName}" failed:`, error);
          throw error;
        }
      });

      // Set dependencies
      if (stepOptions.dependencies) {
        step.after(...stepOptions.dependencies);
      }

      // Set retry config
      if (stepOptions.retry) {
        step.retry(stepOptions.retry);
      }

      // Set timeout
      if (stepOptions.timeout) {
        step.timeout(stepOptions.timeout);
      }

      // Set cancel handler
      if (stepOptions.onCancel) {
        step.cancel(stepOptions.onCancel);
      }

      return step;
    },
    [tao]
  );

  // Run the task
  const runTask = useCallback(async () => {
    if (!tao) return null;

    try {
      return await tao.run();
    } catch (error) {
      console.error(`Task "${name}" failed:`, error);
      throw error;
    }
  }, [tao, name]);

  // Task control functions
  const pauseTask = useCallback(() => tao?.pause(), [tao]);
  const resumeTask = useCallback(() => tao?.resume(), [tao]);
  const cancelTask = useCallback(() => tao?.cancel(), [tao]);
  const retryTask = useCallback(() => tao?.retry(), [tao]);

  return {
    tao,
    taskId,
    taskState,
    initializeTask,
    createStep,
    runTask,
    pauseTask,
    resumeTask,
    cancelTask,
    retryTask,
  };
}
```

Usage of the custom hook:

```tsx
function DataImporter() {
  const {
    taskState,
    initializeTask,
    createStep,
    runTask,
    pauseTask,
    resumeTask,
    cancelTask,
  } = useTaoTask("Data Import", { autoInit: true });

  useEffect(() => {
    if (!taskState) return;

    // Create steps
    const fetchStep = createStep(
      "Fetch Data",
      async () => {
        return fetch("https://api.example.com/data").then((res) => res.json());
      },
      {
        retry: { maxAttempts: 3, initialDelay: 1000 },
      }
    );

    const validateStep = createStep(
      "Validate Data",
      async (input) => {
        const data = input.get(fetchStep);
        return validateData(data);
      },
      {
        dependencies: [fetchStep],
      }
    );

    const importStep = createStep(
      "Import Data",
      async (input) => {
        const validData = input.get(validateStep);
        return importToDatabase(validData);
      },
      {
        dependencies: [validateStep],
        timeout: 30000,
      }
    );
  }, [taskState, createStep]);

  return (
    <div>
      <h2>Data Importer</h2>

      {taskState && (
        <>
          <div className="task-info">
            <p>Status: {taskState.status}</p>
            <p>Progress: {taskState.progress}%</p>
          </div>

          <div className="task-controls">
            {taskState.status === "pending" && (
              <button onClick={runTask}>Start Import</button>
            )}

            {taskState.status === "running" && !taskState.paused && (
              <button onClick={pauseTask}>Pause</button>
            )}

            {taskState.status === "paused" && (
              <button onClick={resumeTask}>Resume</button>
            )}

            {(taskState.status === "running" ||
              taskState.status === "paused") && (
              <button onClick={cancelTask}>Cancel</button>
            )}
          </div>

          <div className="steps">
            {taskState.zens.map((zen) => (
              <div key={zen.id} className={`step step-${zen.status}`}>
                {zen.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

## Styling Task Components

Here's an example of CSS styles for task components:

```css
/* Task Dashboard Styles */
.task-dashboard {
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

.task-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.task-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  background-color: #fff;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-header h3 {
  margin: 0;
  font-size: 18px;
}

.status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-pending {
  background-color: #e0e0e0;
  color: #616161;
}

.status-running {
  background-color: #bbdefb;
  color: #1976d2;
}

.status-completed {
  background-color: #c8e6c9;
  color: #388e3c;
}

.status-failed {
  background-color: #ffcdd2;
  color: #d32f2f;
}

.status-cancelled {
  background-color: #ffe0b2;
  color: #f57c00;
}

.status-paused {
  background-color: #e1bee7;
  color: #7b1fa2;
}

.task-progress {
  margin-bottom: 16px;
}

.progress-bar {
  height: 8px;
  background-color: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress {
  height: 100%;
  background-color: #2196f3;
  transition: width 0.3s ease;
}

.task-details {
  margin-bottom: 16px;
  font-size: 14px;
}

.task-steps {
  margin-bottom: 16px;
}

.task-steps h4 {
  margin-bottom: 8px;
}

.task-steps ul {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.task-steps li {
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 14px;
}

.step-pending {
  background-color: #f5f5f5;
}

.step-running {
  background-color: #e3f2fd;
}

.step-completed {
  background-color: #e8f5e9;
}

.step-failed {
  background-color: #ffebee;
}

.step-cancelled {
  background-color: #fff3e0;
}

.task-actions {
  display: flex;
  gap: 8px;
}

.task-actions button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

button {
  background-color: #2196f3;
  color: white;
}

button:hover {
  background-color: #1976d2;
}

button:disabled {
  background-color: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
```

## Conclusion

Taozen's React integration provides a powerful way to build task management UIs with minimal boilerplate. By leveraging Taozen's state management and event system, you can create responsive interfaces that show real-time task progress and allow users to control task execution.

The `Tao.use()` hook and selector pattern help keep your components efficient by only re-rendering when the relevant state changes. This makes Taozen an excellent choice for applications that need to manage complex, multi-step processes with user interaction.
