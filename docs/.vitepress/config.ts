import { defineConfig } from "vitepress";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

interface SidebarItem {
  text: string;
  link?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
  order?: number;
}

// 生成工作流侧边栏
function generateWorkflowSidebar(): SidebarItem[] {
  const workflowsDir = path.join(__dirname, "../tutorials");

  function processDirectory(dir: string): SidebarItem[] {
    const items: SidebarItem[] = [];
    const files = fs.readdirSync(dir);

    // 首先处理目录
    files
      .filter((file) => {
        const fullPath = path.join(dir, file);
        return fs.statSync(fullPath).isDirectory();
      })
      .forEach((subdir) => {
        const fullPath = path.join(dir, subdir);
        const subItems = processDirectory(fullPath);
        if (subItems.length > 0) {
          items.push({
            text: subdir,
            collapsed: false,
            items: subItems,
            order: 999, // 目录默认排在最后
          });
        }
      });

    // 然后处理文件
    files
      .filter((file) => file.endsWith(".md"))
      .forEach((file) => {
        const fullPath = path.join(dir, file);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const { data } = matter(content);

          const relativePath = path.relative(workflowsDir, fullPath);
          const link = `/tutorials/${relativePath.replace(/\.md$/, "")}`;

          items.push({
            text: data.title || file.replace(".md", ""),
            link,
            collapsed: false,
            order: data.order ?? 100, // 如果没有指定order，默认为100
          });
        } catch (error) {
          console.error(`处理文件 ${file} 时出错:`, error);
        }
      });

    // 根据order和文件名排序
    return items.sort((a, b) => {
      // 首先按order排序
      if (a.order !== b.order) {
        return (a.order ?? 100) - (b.order ?? 100);
      }
      // order相同时按文件名排序
      return a.text.localeCompare(b.text);
    });
  }

  const sidebarItems = processDirectory(workflowsDir);

  return [
    {
      text: "tutorials",
      items: sidebarItems,
    },
  ];
}
function generateApiSidebar(): SidebarItem[] {
  const workflowsDir = path.join(__dirname, "../api");

  function processDirectory(dir: string): SidebarItem[] {
    const items: SidebarItem[] = [];
    const files = fs.readdirSync(dir);

    // 首先处理目录
    files
      .filter((file) => {
        const fullPath = path.join(dir, file);
        return fs.statSync(fullPath).isDirectory();
      })
      .forEach((subdir) => {
        const fullPath = path.join(dir, subdir);
        const subItems = processDirectory(fullPath);
        if (subItems.length > 0) {
          items.push({
            text: subdir,
            collapsed: false,
            items: subItems,
            order: 999, // 目录默认排在最后
          });
        }
      });

    // 然后处理文件
    files
      .filter((file) => file.endsWith(".md"))
      .forEach((file) => {
        const fullPath = path.join(dir, file);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const { data } = matter(content);

          const relativePath = path.relative(workflowsDir, fullPath);
          const link = `/api/${relativePath.replace(/\.md$/, "")}`;

          items.push({
            text: data.title || file.replace(".md", ""),
            link,
            collapsed: false,
            order: data.order ?? 100, // 如果没有指定order，默认为100
          });
        } catch (error) {
          console.error(`处理文件 ${file} 时出错:`, error);
        }
      });

    // 根据order和文件名排序
    return items.sort((a, b) => {
      // 首先按order排序
      if (a.order !== b.order) {
        return (a.order ?? 100) - (b.order ?? 100);
      }
      // order相同时按文件名排序
      return a.text.localeCompare(b.text);
    });
  }

  const sidebarItems = processDirectory(workflowsDir);

  return [
    {
      text: "api",
      items: sidebarItems,
    },
  ];
}

export default defineConfig({
  title: "Taozen",
  description: "Taozen is a lightweight task management library",
  base: "/taozen/",
  head: [["link", { rel: "icon", href: "./icon.png" }]],
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Tutorials", link: "/tutorials/start" },
      { text: "API", link: "/api/tao" },
    ],
    // 根据路径使用不同的侧边栏
    sidebar: {
      "/tutorials/": generateWorkflowSidebar(),
      "/api/": generateApiSidebar(),
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/wangenius/taozen" },
    ],
  },
});
