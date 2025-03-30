---
title: Tao Class
order: 1
---

# Tao Class

The `Tao` class is the central component of the Taozen library, responsible for managing the entire task flow. It provides methods for creating, executing, and controlling tasks.

## Importing

```typescript
import { Tao } from "taozen";
```

## Constructor

Creates a new `Tao` instance.

```typescript
const tao = new Tao(config: TaoConfig);
```

### Parameters

- `config`: Configuration object for the task
  - `name` (string): Task name
  - `description` (string, optional): Task description
  - `retryFailedZensOnly` (boolean, optional): When set to true, only failed steps will be retried. Default is false.

### Example

```typescript
const tao = new Tao({
  name: "Data Processing Task",
  description: "Fetches and processes data from the API",
  retryFailedZensOnly: true,
});
```

## Instance Methods

### `zen(name: string): Zen<any, any>`

Creates a new step in the task.

#### Parameters

- `name` (string): The name of the step

#### Returns

- A new `Zen` instance

#### Example

```typescript
const fetchData = tao.zen("Fetch Data");
```

### `register(): Tao`

Registers the task to the state store for state management.

#### Returns

- The `Tao` instance (for chaining)

#### Example

```typescript
tao.register();
```

### `run(): Promise<Map<string, any>>`

Executes the task and all its steps according to their dependencies.

#### Returns

- A promise that resolves to a Map containing the results of all steps, keyed by step ID

#### Example

```typescript
try {
  const results = await tao.run();
  console.log("Task completed successfully:", results);
} catch (error) {
  console.error("Task failed:", error);
}
```

### `pause(): Promise<void>`

Pauses the task execution. Steps that are already running will complete their execution.

#### Example

```typescript
await tao.pause();
```

### `resume(): Promise<void>`

Resumes a paused task.

#### Example

```typescript
await tao.resume();
```

### `cancel(): Promise<void>`

Cancels the task execution. Running steps will be terminated.

#### Example

```typescript
await tao.cancel();
```

### `on(listener: TaoEventListener): () => void`

Adds an event listener for task events.

#### Parameters

- `listener` (function): Event listener function

#### Returns

- A function to remove the event listener

#### Example

```typescript
const unsubscribe = tao.on((event) => {
  console.log(
    `Event: ${event.type}, Time: ${new Date(event.timestamp).toISOString()}`
  );
});

// Later, to unsubscribe
unsubscribe();
```

### `onZen(zenId: string, listener: (event: TaoEvent) => void): () => void`

Adds an event listener for a specific step's events.

#### Parameters

- `zenId` (string): ID of the step to listen to
- `listener` (function): Event listener function

#### Returns

- A function to remove the event listener

#### Example

```typescript
const step = tao.zen("Some Step");
const unsubscribe = tao.onZen(step.getId(), (event) => {
  console.log(`Step event: ${event.type}`);
});
```

### `retry(): Promise<Map<string, any>>`

Retries a failed task. Behavior depends on the `retryFailedZensOnly` configuration.

#### Returns

- A promise that resolves to a Map containing the results of all steps

#### Example

```typescript
try {
  await tao.run();
} catch (error) {
  try {
    const results = await tao.retry();
    console.log("Retry succeeded:", results);
  } catch (retryError) {
    console.error("Retry failed:", retryError);
  }
}
```

### `getStatus(): TaoStatus`

Gets the current status of the task.

#### Returns

- The task status: `'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'`

#### Example

```typescript
const status = tao.getStatus();
```

### `getProgress(): number`

Gets the current progress of the task as a percentage.

#### Returns

- A number between 0 and 100 representing the progress percentage

#### Example

```typescript
const progress = tao.getProgress();
console.log(`Task is ${progress}% complete`);
```

### `getExecutionTime(): number | undefined`

Gets the total execution time of the task in milliseconds.

#### Returns

- The execution time in milliseconds, or undefined if the task hasn't started yet

#### Example

```typescript
const time = tao.getExecutionTime();
if (time) {
  console.log(`Task took ${time}ms to execute`);
}
```

### `getId(): string | undefined`

Gets the unique ID of the task if it's registered.

#### Returns

- The task ID, or undefined if the task isn't registered

#### Example

```typescript
const id = tao.getId();
```

## Static Methods

### `Tao.run<T = any>(name: string, executor: ZenExecutor<ZenInput, T>, options?: object): Promise<T>`

A utility method to quickly run a single-step task.

#### Parameters

- `name` (string): The name of the task
- `executor` (function): The function to execute
- `options` (object, optional):
  - `retry` (ZenRetryConfig, optional): Retry configuration
  - `timeout` (number, optional): Timeout in milliseconds
  - `onEvent` (TaoEventListener, optional): Event listener
  - `onCancel` (function, optional): Cancel callback
  - `register` (boolean, optional): Whether to register the task

#### Returns

- A promise that resolves to the result of the execution

#### Example

```typescript
const result = await Tao.run(
  "Quick Task",
  async () => {
    const response = await fetch("https://api.example.com/data");
    return response.json();
  },
  {
    timeout: 5000,
    retry: {
      maxAttempts: 3,
      initialDelay: 1000,
      backoffFactor: 2,
      maxDelay: 10000,
    },
    register: true,
  }
);
```

### `Tao.use<T = TaoState>(selector?: (state: TaoState) => T)`

A hook to subscribe to task state changes. Can be used with selectors for performance optimization.

#### Parameters

- `selector` (function, optional): A selector function to extract specific data from the state

#### Returns

- The selected state or the entire state if no selector is provided

#### Example

```typescript
// In a React component
const { taos } = Tao.use();

// With a selector
const progress = Tao.use((state) => state.taos["task-id"]?.progress ?? 0);
```

### `Tao.pause(taoId: string): Promise<boolean>`

Pauses a registered task by ID.

#### Parameters

- `taoId` (string): The ID of the task to pause

#### Returns

- A promise that resolves to true if the task was paused successfully, false otherwise

#### Example

```typescript
const success = await Tao.pause("task-id");
```

### `Tao.resume(taoId: string): Promise<boolean>`

Resumes a paused task by ID.

#### Parameters

- `taoId` (string): The ID of the task to resume

#### Returns

- A promise that resolves to true if the task was resumed successfully, false otherwise

#### Example

```typescript
const success = await Tao.resume("task-id");
```

### `Tao.cancel(taoId: string): Promise<boolean>`

Cancels a running task by ID.

#### Parameters

- `taoId` (string): The ID of the task to cancel

#### Returns

- A promise that resolves to true if the task was cancelled successfully, false otherwise

#### Example

```typescript
const success = await Tao.cancel("task-id");
```

### `Tao.retry(taoId: string): Promise<boolean>`

Retries a failed task by ID.

#### Parameters

- `taoId` (string): The ID of the task to retry

#### Returns

- A promise that resolves to true if the retry was initiated successfully, false otherwise

#### Example

```typescript
const success = await Tao.retry("task-id");
```

### `Tao.remove(taoId: string): boolean`

Removes a task from the state store.

#### Parameters

- `taoId` (string): The ID of the task to remove

#### Returns

- true if the task was removed successfully, false otherwise

#### Example

```typescript
const success = Tao.remove("task-id");
```
