import React, { useState } from "react";
import { TaosDemo } from "./TaskDemo";
import { RetryDemo } from "./components/RetryDemo";

// 导航标签组件
const NavTab = ({ activeTab, onChange }) => {
  const tabs = [
    { id: "retry", label: "重试演示" },
    { id: "taos", label: "任务演示" },
  ];

  return (
    <div className="flex space-x-1 rounded-lg bg-secondary p-1 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === tab.id
              ? "bg-white text-primary shadow-sm"
              : "text-foreground/60 hover:text-foreground/80"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export const App = () => {
  const [tab, setTab] = useState("retry");

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Taozen 演示</h1>

      <NavTab activeTab={tab} onChange={setTab} />

      {tab === "retry" && <RetryDemo />}
      {tab === "taos" && <TaosDemo />}
    </div>
  );
};
