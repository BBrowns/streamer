import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.unit.test.ts"],
    exclude: ["tests/**/*.integration.test.ts", "node_modules/**", "dist/**"],
    maxWorkers: 1,
    fileParallelism: false,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
    },
  },
});
