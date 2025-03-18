import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: "examples",
  base: "./",
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: resolve(__dirname, "dist-examples"),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
