---
title: Zen Class
order: 2
---

# Zen Class

The `Zen` class represents an individual execution step within a task. It provides methods for configuring dependencies, retry strategies, timeouts, and other execution parameters.

## Creating a Zen Instance

Zen instances are created by calling the `zen()` method on a `Tao` instance.

```typescript
import { Tao } from "taozen";

const tao = new Tao({ name: "My Task" });
const step = tao.zen("Step Name");
```

## Methods

### `exe<TOutput = any>(executor: ZenExecutor<TInput, TOutput>): Zen<TInput, TOutput>`

Sets the executor function for the step.

#### Parameters

- `executor` (function): The function to execute when this step runs. It receives an input object containing results from dependent steps and should return a Promise.

#### Returns

- The Zen instance (for chaining)

#### Example

```typescript
const fetchData = tao.zen("Fetch Data").exe(async () => {
  const response = await fetch("https://api.example.com/data");
  return response.json();
});
```

### `after(...zens: Zen[]): Zen<TInput, TOutput>`

Sets dependencies for the step. The step will only execute after all its dependencies have completed successfully.

#### Parameters

- `...zens` (Zen instances): One or more Zen instances that this step depends on

#### Returns

- The Zen instance (for chaining)

#### Example

```typescript
const processData = tao
  .zen("Process Data")
  .after(fetchData)
  .exe(async (input) => {
    const data = input.get(fetchData);
    return processDataFunction(data);
  });
```

### `retry(config?: ZenRetryConfig): Zen<TInput, TOutput>`

Configures retry behavior for the step.

#### Parameters

- `config` (object): Retry configuration
  - `maxAttempts` (number): Maximum number of retry attempts
  - `initialDelay` (number): Initial delay in milliseconds before the first retry
  - `backoffFactor` (number): Factor by which the delay increases between retries
  - `maxDelay` (number): Maximum delay in milliseconds between retries

#### Returns

- The Zen instance (for chaining)

#### Example

```typescript
const unreliableStep = tao
  .zen("Unreliable API Call")
  .exe(async () => {
    return fetch("https://unstable-api.example.com/data");
  })
  .retry({
    maxAttempts: 3,
    initialDelay: 1000,
    backoffFactor: 2,
    maxDelay: 10000,
  });
```

### `timeout(ms: number): Zen<TInput, TOutput>`

Sets a timeout for the step execution.

#### Parameters

- `ms` (number): Timeout duration in milliseconds

#### Returns

- The Zen instance (for chaining)

#### Example

```typescript
const longRunningStep = tao
  .zen("Time-consuming Operation")
  .exe(async () => {
    return performLongCalculation();
  })
  .timeout(30000); // 30 seconds timeout
```

### `cancel(callback: () => void): Zen<TInput, TOutput>`

Sets a callback function to be called when the step is cancelled.

#### Parameters

- `callback` (function): Function to execute when the step is cancelled

#### Returns

- The Zen instance (for chaining)

#### Example

```typescript
const step = tao
  .zen("Cancellable Operation")
  .exe(async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    // Store the controller in a closure for the cancel callback to access
    return fetch("https://api.example.com/data", { signal });
  })
  .cancel(() => {
    // Cleanup code here
    console.log("Step cancelled, performing cleanup");
  });
```

## Accessing Dependency Results

When executing a step that depends on other steps, you can access the results of those steps using the `input` parameter passed to the executor function.

### `input.get<T>(step: Zen<any, T>): T | undefined`

Gets the result of a specific step.

#### Example

```typescript
const step2 = tao
  .zen("Step 2")
  .after(step1)
  .exe(async (input) => {
    // Get the result from step1
    const step1Result = input.get(step1);

    // Use the result
    return transformData(step1Result);
  });
```

### `input.getById<T>(stepId: string): T | undefined`

Gets the result of a step by its ID.

#### Example

```typescript
const step2 = tao
  .zen("Step 2")
  .after(step1)
  .exe(async (input) => {
    // Get the result from step1 by ID
    const step1Result = input.getById(step1.getId());

    // Use the result
    return transformData(step1Result);
  });
```

### `input.getRaw(): Record<string, any>`

Gets all dependency results as a raw object.

#### Example

```typescript
const step3 = tao
  .zen("Step 3")
  .after(step1, step2)
  .exe(async (input) => {
    // Get all dependency results
    const allResults = input.getRaw();

    // Use the results
    return {
      combinedResult: {
        fromStep1: allResults[step1.getId()],
        fromStep2: allResults[step2.getId()],
      },
    };
  });
```

## Information Methods

### `getId(): string`

Gets the unique ID of the step.

#### Returns

- The step ID

#### Example

```typescript
const stepId = step.getId();
```

### `getName(): string`

Gets the name of the step.

#### Returns

- The step name

#### Example

```typescript
const stepName = step.getName();
```

### `getStatus(): ZenStatus`

Gets the current status of the step.

#### Returns

- The step status: `'pending' | 'running' | 'completed' | 'failed' | 'cancelled'`

#### Example

```typescript
const status = step.getStatus();
```

### `getResult(): TOutput | undefined`

Gets the result of the step. Only returns a value if the step has completed successfully.

#### Returns

- The step result, or undefined if the step hasn't completed

#### Example

```typescript
const result = step.getResult();
```

### `getError(): Error | undefined`

Gets the error from a failed step.

#### Returns

- The error object, or undefined if the step hasn't failed

#### Example

```typescript
const error = step.getError();
```

### `getStartTime(): number | undefined`

Gets the time when the step started executing.

#### Returns

- The start time as a timestamp, or undefined if the step hasn't started

#### Example

```typescript
const startTime = step.getStartTime();
```

### `getEndTime(): number | undefined`

Gets the time when the step finished executing.

#### Returns

- The end time as a timestamp, or undefined if the step hasn't finished

#### Example

```typescript
const endTime = step.getEndTime();
```

### `getDependencies(): string[]`

Gets the IDs of all steps that this step depends on.

#### Returns

- An array of step IDs

#### Example

```typescript
const dependencies = step.getDependencies();
```
