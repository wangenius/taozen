---
title: 开始
order: 1
---

# Taozen 任务管理库

Taozen 是一个轻量级的任务管理库，专为 React 应用设计，支持多种存储模式和丰富的状态管理功能。

## 安装

```bash
npm install taozen
# 或
yarn add taozen
```

## 基本概念

Taozen 的核心概念包括：

- **Tao（道）**: 表示一个完整的任务流程，包含多个执行步骤
- **Zen（禅）**: 表示任务中的单个执行步骤，可以设置依赖关系、重试策略等
- **状态管理**: 使用 Echo 库实现，支持本地存储和状态同步
- **事件系统**: 支持任务和步骤级别的事件监听

## 快速开始

### 创建简单任务

```typescript
import { Tao } from "taozen";

// 创建一个简单的任务
const tao = new Tao({ name: "我的任务" });

// 添加执行步骤
const step1 = tao.zen("步骤1").exe(async () => {
  console.log("执行步骤1");
  return "步骤1结果";
});

const step2 = tao
  .zen("步骤2")
  .after(step1) // 设置依赖关系
  .exe(async (input) => {
    console.log("执行步骤2，输入:", input);
    return "步骤2结果";
  });

// 执行任务
try {
  const results = await tao.run();
  console.log("任务完成:", results);
} catch (error) {
  console.error("任务失败:", error);
}
```

### 使用重试机制

```typescript
const step = tao
  .zen("重试步骤")
  .exe(async () => {
    // 可能失败的操作
    throw new Error("临时错误");
  })
  .retry({
    maxAttempts: 3, // 最大重试次数
    initialDelay: 1000, // 初始延迟（毫秒）
    backoffFactor: 2, // 延迟增长因子
    maxDelay: 10000, // 最大延迟（毫秒）
  });
```

### 设置超时

```typescript
const step = tao
  .zen("超时步骤")
  .exe(async () => {
    // 长时间运行的操作
    await new Promise((resolve) => setTimeout(resolve, 60000));
  })
  .timeout(5000); // 5秒超时
```

### 监听事件

```typescript
// 监听任务事件
tao.on((event) => {
  switch (event.type) {
    case "tao:start":
      console.log("任务开始");
      break;
    case "tao:complete":
      console.log("任务完成");
      break;
    case "tao:fail":
      console.log("任务失败:", event.error);
      break;
  }
});

// 监听特定步骤的事件
tao.onZen(step1.getId(), (event) => {
  switch (event.type) {
    case "zen:start":
      console.log("步骤1开始");
      break;
    case "zen:complete":
      console.log("步骤1完成:", event.data);
      break;
  }
});
```

### 任务控制

```typescript
// 暂停任务
await tao.pause();

// 恢复任务
await tao.resume();

// 取消任务
await tao.cancel();
```

### 状态管理

```typescript
// 注册任务到存储
tao.register();

// 获取任务状态
const status = tao.getStatus();

// 获取任务进度
const progress = tao.getProgress();

// 获取执行时间
const executionTime = tao.getExecutionTime();
```

## React Hooks 集成

Taozen 提供了 `Tao.use()` 方法，方便在组件中使用任务管理功能。

### 使用 Tao.use()

```typescript
import { Tao } from "taozen";

function TaskComponent() {
  // 使用 Tao.use() 获取任务状态
  const { taos, states, events } = Tao.use();

  // 获取特定任务的状态
  const taskId = "your-task-id";
  const taskState = taos[taskId];
  const taskEvents = events[taskId] || [];

  // 渲染任务状态
  return (
    <div>
      {taskState && (
        <>
          <h3>{taskState.name}</h3>
          <p>状态: {taskState.status}</p>
          <p>进度: {taskState.progress}%</p>
          <p>执行时间: {taskState.executionTime}ms</p>

          {/* 渲染步骤状态 */}
          <div>
            <h4>步骤列表</h4>
            {taskState.zens.map((zen) => (
              <div key={zen.id}>
                <p>
                  {zen.name}: {zen.status}
                </p>
                {zen.error && <p className="error">{zen.error}</p>}
              </div>
            ))}
          </div>

          {/* 渲染事件历史 */}
          <div>
            <h4>事件历史</h4>
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

### 使用选择器优化性能

```typescript
function TaskProgress() {
  // 只订阅特定任务的进度
  const progress = Tao.use(
    (state) => state.taos["your-task-id"]?.progress ?? 0
  );

  return (
    <div>
      <h3>任务进度</h3>
      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }} />
      </div>
      <p>{progress}%</p>
    </div>
  );
}
```

### 任务控制示例

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
      <button onClick={handlePause}>暂停</button>
      <button onClick={handleResume}>恢复</button>
      <button onClick={handleCancel}>取消</button>
    </div>
  );
}
```

## 高级特性

### 任务持久化

Taozen 使用 Echo 库实现状态管理，支持本地存储：

```typescript
// 任务状态会自动保存到 localStorage
const tao = new Tao({ name: "持久化任务" });
tao.register();
```

### 并发控制

Taozen 内置了并发控制机制，默认最大并发任务数为 10：

```typescript
// 修改最大并发任务数
Tao.maxConcurrentTaos = 5;
```

### 错误处理

Taozen 提供了完善的错误处理机制：

```typescript
try {
  await tao.run();
} catch (error) {
  // 获取所有步骤的错误
  const errors = tao.getErrors();
  console.error("任务执行失败:", errors);
}
```

## 最佳实践

1. **任务设计**

   - 将复杂任务分解为小的、可重用的步骤
   - 合理设置步骤间的依赖关系
   - 避免循环依赖

2. **错误处理**

   - 为关键步骤设置重试机制
   - 设置合理的超时时间
   - 实现优雅的错误恢复策略

3. **状态管理**

   - 及时注册任务以启用状态持久化
   - 合理使用事件监听器
   - 定期清理已完成的任务

4. **性能优化**
   - 控制并发任务数量
   - 避免不必要的状态更新
   - 及时清理资源

## 注意事项

1. 任务只能执行一次，需要重新创建实例才能再次执行
2. 运行中的任务不能被删除
3. 暂停的任务会等待当前步骤完成
4. 取消任务会中断所有运行中的步骤
5. 确保正确处理异步操作和资源清理
