import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "editor-core",
              test: /node_modules\/@codemirror\/(state|view)\//,
              priority: 20,
            },
            {
              name: "editor-language",
              test: /node_modules\/(@codemirror|@lezer)\//,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
