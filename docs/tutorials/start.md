---
title: Getting Started
order: 1
---

# Taozen Task Management Library

Taozen is a lightweight task management library designed for React applications, supporting various storage modes and rich state management features.

## Installation

```bash
npm install taozen
# or
yarn add taozen
```

## Core Concepts

Taozen's core concepts include:

- **Tao**: Represents a complete task flow containing multiple execution steps
- **Zen**: Represents an individual execution step in a task, with configurable dependencies, retry strategies, etc.
- **State Management**: Implemented using the [Echo State Management](https://wangenius.github.io/echo-state/) library, supporting local storage and state synchronization
- **Event System**: Supports event listening at both task and step levels

## Quick Start

### Creating a Simple Task

```typescript
import { Tao } from "taozen";

// Create a simple task
const tao = new Tao({ name: "My Task" });

// Add execution steps
const step1 = tao.zen("Step 1").exe(async () => {
  console.log("Executing Step 1");
  return "Step 1 Result";
});

const step2 = tao
  .zen("Step 2")
  .after(step1) // Set dependency
  .exe(async (input) => {
    console.log("Executing Step 2, Input:", input);
    return "Step 2 Result";
  });

// Execute the task
try {
  const results = await tao.run();
  console.log("Task completed:", results);
} catch (error) {
  console.error("Task failed:", error);
}
```

### Using Retry Mechanism

```typescript
const step = tao
  .zen("Retry Step")
  .exe(async () => {
    // Operation that might fail
    throw new Error("Temporary error");
  })
  .retry({
    maxAttempts: 3, // Maximum retry attempts
    initialDelay: 1000, // Initial delay (milliseconds)
    backoffFactor: 2, // Delay growth factor
    maxDelay: 10000, // Maximum delay (milliseconds)
  });
```

### Setting Timeout

```typescript
const step = tao
  .zen("Timeout Step")
  .exe(async () => {
    // Long-running operation
    await new Promise((resolve) => setTimeout(resolve, 60000));
  })
  .timeout(5000); // 5 seconds timeout
```

### Listening to Events

```typescript
// Listen to task events
tao.on((event) => {
  switch (event.type) {
    case "tao:start":
      console.log("Task started");
      break;
    case "tao:complete":
      console.log("Task completed");
      break;
    case "tao:fail":
      console.log("Task failed:", event.error);
      break;
  }
});

// Listen to events from a specific step
tao.onZen(step1.getId(), (event) => {
  switch (event.type) {
    case "zen:start":
      console.log("Step 1 started");
      break;
    case "zen:complete":
      console.log("Step 1 completed:", event.data);
      break;
  }
});
```

### Task Control

```typescript
// Pause the task
await tao.pause();

// Resume the task
await tao.resume();

// Cancel the task
await tao.cancel();
```

### State Management

```typescript
// Register the task for storage
tao.register();

// Get task status
const status = tao.getStatus();

// Get task progress
const progress = tao.getProgress();

// Get execution time
const executionTime = tao.getExecutionTime();
```

## React Hooks Integration

Taozen provides the `Tao.use()` method for easy use of task management features in components.

### Using Tao.use()

```typescript
import { Tao } from "taozen";

function TaskComponent() {
  // Use Tao.use() to get task state
  const { taos, states, events } = Tao.use();

  // Get the state of a specific task
  const taskId = "your-task-id";
  const taskState = taos[taskId];
  const taskEvents = events[taskId] || [];

  // Render task state
  return (
    <div>
      {taskState && (
        <>
          <h3>{taskState.name}</h3>
          <p>Status: {taskState.status}</p>
          <p>Progress: {taskState.progress}%</p>
          <p>Execution time: {taskState.executionTime}ms</p>

          {/* Render step status */}
          <div>
            <h4>Step List</h4>
            {taskState.zens.map((zen) => (
              <div key={zen.id}>
                <p>
                  {zen.name}: {zen.status}
                </p>
                {zen.error && <p className="error">{zen.error}</p>}
              </div>
            ))}
          </div>

          {/* Render event history */}
          <div>
            <h4>Event History</h4>
            {taskEvents.map((event, index) => (
              <div key={index}>
                <p>
                  {event.type} - {new Date(event.timestamp).toLocaleString()}
                </p>
                {event.error && <p className="error">{event.error.message}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

### Using Selectors for Performance Optimization

```typescript
function TaskProgress() {
  // Subscribe only to a specific task's progress
  const progress = Tao.use(
    (state) => state.taos["your-task-id"]?.progress ?? 0
  );

  return (
    <div>
      <h3>Task Progress</h3>
      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }} />
      </div>
      <p>{progress}%</p>
    </div>
  );
}
```

### Task Control Example

```typescript
function TaskControl() {
  const taskId = "your-task-id";

  const handlePause = async () => {
    await Tao.pause(taskId);
  };

  const handleResume = async () => {
    await Tao.resume(taskId);
  };

  const handleCancel = async () => {
    await Tao.cancel(taskId);
  };

  return (
    <div>
      <button onClick={handlePause}>Pause</button>
      <button onClick={handleResume}>Resume</button>
      <button onClick={handleCancel}>Cancel</button>
    </div>
  );
}
```

## Task Retry Functionality

Taozen provides a powerful task retry mechanism, supporting two retry modes:

1. **Retry All**: Re-execute all steps
2. **Retry Failed Steps Only**: Only re-execute failed steps, preserving results from successful steps

```typescript
// Create a task with retry support
const tao = new Tao({
  name: "Retryable Task",
  description: "Task demonstrating retry functionality",
  retryFailedZensOnly: true, // Set to true to retry only failed steps, false to retry all steps
});

// After task failure, use the instance method to retry
try {
  await tao.run();
} catch (error) {
  console.error("Task execution failed:", error);

  // Use instance method to retry
  try {
    const results = await tao.retry();
    console.log("Retry succeeded:", results);
  } catch (retryError) {
    console.error("Retry failed:", retryError);
  }
}
```

#### Retry Usage Example

```typescript
// Instance-based task retry
const retryTask = async () => {
  if (!tao) return;

  try {
    // Retry the entire task, retry mode determined by retryFailedZensOnly configuration
    await tao.retry();
    console.log("Task retry succeeded");
  } catch (error) {
    console.error("Task retry failed:", error);
  }
};

// Async step execution example with retry
const stepWithRetry = tao
  .zen("Potentially Failing Step")
  .exe(async (input) => {
    // Some operation that might fail
    if (Math.random() < 0.5) {
      throw new Error("Random failure");
    }
    return "Success result";
  })
  // Single step retry configuration, complementary to task-level retry
  .retry({
    maxAttempts: 3,
    initialDelay: 1000,
  });
```

#### Getting Upstream Step Data

In retry mode, you can conveniently get dependency step results using the `input.get(step)` method:

```typescript
// Add an execution step that depends on another step
const step2 = tao
  .zen("Process Data")
  .exe(async (input) => {
    // Directly get the result from the upstream step
    const step1Result = input.get(step1);

    // Process using upstream data
    return {
      id: step1Result.id,
      processedData: `Processed data: ${step1Result.value}`,
    };
  })
  .after(step1); // Set dependency relationship
```

## Advanced Features

### Task Persistence

Taozen uses the Echo library for state management, supporting local storage:

```typescript
// Task state is automatically saved to localStorage
const tao = new Tao({ name: "Persistent Task" });
tao.register();
```

### Concurrency Control

Taozen has a built-in concurrency control mechanism, with a default maximum of 10 concurrent tasks:

```typescript
// Modify maximum concurrent tasks
Tao.maxConcurrentTaos = 5;
```

### Error Handling

Taozen provides a comprehensive error handling mechanism:

```typescript
try {
  await tao.run();
} catch (error) {
  // Get all step errors
  const errors = tao.getErrors();
  console.error("Task execution failed:", errors);
}
```

## Best Practices

1. **Task Design**

   - Break complex tasks into small, reusable steps
   - Set reasonable dependencies between steps
   - Avoid circular dependencies

2. **Error Handling**

   - Set retry mechanisms for critical steps
   - Set reasonable timeout values
   - Implement graceful error recovery strategies

3. **State Management**

   - Register tasks promptly to enable state persistence
   - Use event listeners judiciously
   - Regularly clean up completed tasks

4. **Performance Optimization**
   - Control the number of concurrent tasks
   - Avoid unnecessary state updates
   - Clean up resources promptly

## Notes

1. Tasks can only be executed once; a new instance must be created for re-execution
2. Running tasks cannot be deleted
3. Paused tasks will wait for the current step to complete
4. Canceling a task will interrupt all running steps
5. Ensure proper handling of asynchronous operations and resource cleanup
