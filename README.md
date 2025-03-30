# Taozen

A lightweight task management library providing simple, flexible, and efficient task flow control.

## Features

- **Flexible task flow design**: Build complex task flows with Tao and Zen combinations
- **State management**: Built-in state storage and tracking, with React integration support
- **Dependency control**: Support for step dependencies and ordered execution
- **Retry mechanism**: Built-in configurable failure retry strategies
- **Timeout control**: Timeout protection for long-running tasks
- **Event system**: Complete event notification system to track task and step execution status
- **Pause/Resume/Cancel**: Support for dynamic control of task execution flow

## Installation

```bash
npm install taozen
# or
yarn add taozen
# or
pnpm add taozen
```

## Basic Usage

```ts
import { Tao } from "taozen";

// Create a task
const tao = new Tao({ name: "Data Processing Task" });

// Register for state management
tao.register();

// Create the first step: fetch data
const fetchData = tao.zen("Fetch Data").exe(async () => {
  const response = await fetch("https://api.example.com/data");
  return response.json();
});

// Create the second step: process data (depends on the first step)
const processData = tao
  .zen("Process Data")
  .after(fetchData) // Set dependency
  .exe(async (input) => {
    // Get the result from the previous step
    const data = input.get(fetchData);
    // Process data
    return data.map((item) => ({ ...item, processed: true }));
  });

// Execute the task
try {
  const results = await tao.run();
  console.log("Task completed:", results);
} catch (error) {
  console.error("Task failed:", error);
}
```

## Advanced Features

### Retry Mechanism

```ts
const unreliableStep = tao
  .zen("Unreliable API Call")
  .exe(async () => {
    // Operation that might fail
    return fetch("https://unstable-api.example.com/data");
  })
  .retry({
    maxAttempts: 3, // Maximum retry attempts
    initialDelay: 1000, // Initial delay (milliseconds)
    backoffFactor: 2, // Delay growth factor
    maxDelay: 10000, // Maximum delay (milliseconds)
  });
```

### Timeout Control

```ts
const longRunningStep = tao
  .zen("Time-consuming Operation")
  .exe(async () => {
    // Long-running operation
    return performLongCalculation();
  })
  .timeout(30000); // 30 seconds timeout
```

### Event Listening

```ts
// Listen to task events
tao.on((event) => {
  console.log(
    `Event: ${event.type}, Time: ${new Date(event.timestamp).toISOString()}`
  );

  if (event.error) {
    console.error("Error:", event.error);
  }
});

// Listen to events from a specific step
tao.onZen(fetchData.getId(), (event) => {
  if (event.type === "zen:complete") {
    console.log("Data fetching completed:", event.data);
  }
});
```

### Pause and Resume

```ts
// Pause execution
await tao.pause();

// Resume execution
await tao.resume();

// Cancel execution
await tao.cancel();
```

## React Integration

Taozen can be easily integrated into React applications:

```tsx
import { Tao } from "taozen";
import { useEffect, useState } from "react";

function TaskManager() {
  // Use Tao.use() to subscribe to task state changes
  const { taos } = Tao.use();

  // Get the state of a specific task
  const myTask = taos["task-id"];

  return (
    <div>
      {myTask && (
        <>
          <h2>{myTask.name}</h2>
          <p>Status: {myTask.status}</p>
          <p>Progress: {myTask.progress}%</p>

          <button onClick={() => Tao.pause(myTask.id)}>Pause</button>
          <button onClick={() => Tao.resume(myTask.id)}>Resume</button>
          <button onClick={() => Tao.cancel(myTask.id)}>Cancel</button>

          <h3>Steps:</h3>
          <ul>
            {myTask.zens.map((zen) => (
              <li key={zen.id}>
                {zen.name}: {zen.status}
                {zen.error && <p className="error">{zen.error}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

## Documentation

View the complete documentation and API reference: [Taozen Documentation](https://wangenius.github.io/taozen/)

## License

MIT
