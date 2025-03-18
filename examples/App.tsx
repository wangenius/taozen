import React from "react";

// 主应用组件
export function App() {
  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem" }}>
      <h1
        style={{
          textAlign: "center",
          color: "#1e40af",
          fontSize: "2rem",
          marginBottom: "2rem",
        }}
      >
        Taozen 任务管理库测试
      </h1>

      {/* 标签切换 */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "2rem",
          borderBottom: "1px solid #e2e8f0",
          padding: "0 1rem",
        }}
      ></div>

      {/* 内容区域 */}
      <div></div>

      {/* 页脚 */}
      <footer
        style={{
          marginTop: "3rem",
          textAlign: "center",
          color: "#94a3b8",
          fontSize: "0.875rem",
          padding: "1rem",
          borderTop: "1px solid #e2e8f0",
        }}
      ></footer>
    </div>
  );
}
