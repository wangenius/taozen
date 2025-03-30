---
title: Working with Events
order: 2
---

# Working with Events in Taozen

Taozen provides a comprehensive event system that allows you to monitor and react to various stages of task and step execution. This tutorial covers event handling in Taozen, including event types, event listeners, and practical use cases.

## Event Types

Taozen emits events at both the task level and the step level:

### Task Events

- `tao:start` - Emitted when a task starts execution
- `tao:complete` - Emitted when a task completes successfully
- `tao:fail` - Emitted when a task fails
- `tao:pause` - Emitted when a task is paused
- `tao:resume` - Emitted when a task is resumed
- `tao:retry` - Emitted when a task retry is initiated

### Step Events

- `zen:start` - Emitted when a step starts execution
- `zen:complete` - Emitted when a step completes successfully
- `zen:fail` - Emitted when a step fails
- `zen:retry` - Emitted when a step retry is initiated
- `zen:pause` - Emitted when a step is paused
- `zen:resume` - Emitted when a step is resumed

## The Event Object

All event listeners receive an event object with the following structure:

```typescript
interface TaoEvent {
  type: TaozenEventType; // Event type (e.g., 'tao:start', 'zen:complete')
  zenId?: string; // ID of the related step (for step events)
  timestamp: number; // Timestamp when the event occurred
  data?: any; // Optional data related to the event
  error?: Error; // Error object (for failure events)
}
```

## Listening to Task Events

You can listen to all events from a task using the `on` method:

```typescript
const tao = new Tao({ name: "My Task" });

// Register an event listener
const unsubscribe = tao.on((event) => {
  console.log(
    `Event: ${event.type} at ${new Date(event.timestamp).toISOString()}`
  );

  // Handle specific event types
  switch (event.type) {
    case "tao:start":
      console.log("Task started");
      break;
    case "tao:complete":
      console.log("Task completed successfully");
      break;
    case "tao:fail":
      console.error("Task failed:", event.error?.message);
      break;
    // Handle other event types...
  }
});

// Execute the task
await tao.run();

// Later, when you no longer need the listener
unsubscribe();
```

## Listening to Step Events

For more granular control, you can listen to events from a specific step:

```typescript
const step = tao.zen("Data Processing").exe(async () => {
  // Step implementation...
});

// Listen to events from this specific step
const unsubscribe = tao.onZen(step.getId(), (event) => {
  switch (event.type) {
    case "zen:start":
      console.log("Step started");
      break;
    case "zen:complete":
      console.log("Step completed with result:", event.data);
      break;
    case "zen:fail":
      console.error("Step failed:", event.error?.message);
      break;
    case "zen:retry":
      console.log("Retrying step, attempt:", event.data?.attempt);
      break;
  }
});
```

## Real-World Examples

### Progress Tracking

```typescript
function createProgressTracker(tao) {
  const steps = new Set();
  const completedSteps = new Set();

  return tao.on((event) => {
    if (event.type === "zen:start" && event.zenId) {
      steps.add(event.zenId);
    }

    if (event.type === "zen:complete" && event.zenId) {
      completedSteps.add(event.zenId);
    }

    // Calculate progress
    const totalSteps = steps.size;
    const completed = completedSteps.size;
    const progress = totalSteps > 0 ? (completed / totalSteps) * 100 : 0;

    console.log(
      `Progress: ${Math.round(progress)}% (${completed}/${totalSteps} steps)`
    );
  });
}
```

### Execution Time Tracking

```typescript
function trackExecutionTime(tao) {
  const startTimes = new Map();

  return tao.on((event) => {
    if (event.type === "zen:start" && event.zenId) {
      startTimes.set(event.zenId, event.timestamp);
    }

    if (
      (event.type === "zen:complete" || event.type === "zen:fail") &&
      event.zenId
    ) {
      const startTime = startTimes.get(event.zenId);
      if (startTime) {
        const executionTime = event.timestamp - startTime;
        console.log(`Step ${event.zenId} execution time: ${executionTime}ms`);
      }
    }
  });
}
```

## Implementing a Logger

Here's a more comprehensive example of a logger that uses events to track task execution:

```typescript
class TaoLogger {
  private logEntries: Array<{
    level: "info" | "warning" | "error";
    message: string;
    timestamp: number;
    data?: any;
  }> = [];

  constructor(private tao: Tao) {
    // Subscribe to all task events
    tao.on(this.handleEvent);
  }

  private handleEvent = (event: TaoEvent) => {
    switch (event.type) {
      case "tao:start":
        this.info(`Task '${this.tao.getName()}' started`);
        break;
      case "tao:complete":
        this.info(`Task '${this.tao.getName()}' completed successfully`);
        break;
      case "tao:fail":
        this.error(
          `Task '${this.tao.getName()}' failed: ${event.error?.message}`,
          event.error
        );
        break;
      case "tao:pause":
        this.info(`Task '${this.tao.getName()}' paused`);
        break;
      case "tao:resume":
        this.info(`Task '${this.tao.getName()}' resumed`);
        break;
      case "zen:start":
        if (event.zenId) {
          const zenName = this.getZenName(event.zenId);
          this.info(`Step '${zenName}' started`);
        }
        break;
      case "zen:complete":
        if (event.zenId) {
          const zenName = this.getZenName(event.zenId);
          this.info(`Step '${zenName}' completed`, { result: event.data });
        }
        break;
      case "zen:fail":
        if (event.zenId) {
          const zenName = this.getZenName(event.zenId);
          this.error(
            `Step '${zenName}' failed: ${event.error?.message}`,
            event.error
          );
        }
        break;
      case "zen:retry":
        if (event.zenId) {
          const zenName = this.getZenName(event.zenId);
          this.warning(
            `Retrying step '${zenName}', attempt ${event.data?.attempt}/${event.data?.maxAttempts}`
          );
        }
        break;
    }
  };

  private getZenName(zenId: string): string {
    try {
      return this.tao.getZenById(zenId).getName();
    } catch {
      return zenId;
    }
  }

  info(message: string, data?: any) {
    this.log("info", message, data);
  }

  warning(message: string, data?: any) {
    this.log("warning", message, data);
  }

  error(message: string, data?: any) {
    this.log("error", message, data);
  }

  private log(
    level: "info" | "warning" | "error",
    message: string,
    data?: any
  ) {
    const entry = {
      level,
      message,
      timestamp: Date.now(),
      data,
    };

    this.logEntries.push(entry);

    // Also log to console for demonstration
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (level === "error") {
      console.error(`${prefix} ${message}`, data);
    } else if (level === "warning") {
      console.warn(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`, data);
    }
  }

  getLogs() {
    return [...this.logEntries];
  }

  dispose() {
    // Clean up references to avoid memory leaks
    this.tao.on(this.handleEvent);
  }
}
```

Usage:

```typescript
const tao = new Tao({ name: "Complex Task" });

// Setup steps...

// Create and attach the logger
const logger = new TaoLogger(tao);

// Run the task
try {
  await tao.run();
} catch (error) {
  console.error("Task execution failed:", error);
} finally {
  // Print all logs
  console.log("Task execution log:", logger.getLogs());

  // Clean up
  logger.dispose();
}
```

## Integrating with Monitoring Systems

For more advanced use cases, you can use Taozen events to integrate with monitoring systems, analytics, or application metrics:

```typescript
function connectToMonitoring(tao) {
  return tao.on((event) => {
    switch (event.type) {
      case "tao:start":
        metrics.startTimer(`task.${tao.getName()}.execution`);
        break;
      case "tao:complete":
        metrics.stopTimer(`task.${tao.getName()}.execution`);
        metrics.increment(`task.${tao.getName()}.success`);
        break;
      case "tao:fail":
        metrics.stopTimer(`task.${tao.getName()}.execution`);
        metrics.increment(`task.${tao.getName()}.failure`);
        errorReporting.captureException(event.error);
        break;
      case "zen:retry":
        metrics.increment(`step.retry.count`);
        break;
    }
  });
}
```

## Conclusion

The event system in Taozen provides powerful capabilities for monitoring and responding to task execution. By leveraging events, you can create sophisticated logging, monitoring, and error handling systems that enhance the reliability and observability of your applications.

For more information on available events and their structure, refer to the [Tao API documentation](/api/tao) and [Zen API documentation](/api/zen).
