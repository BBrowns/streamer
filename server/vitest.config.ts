import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Disable multi-threading and parallel file execution to prevent
    // database contention on the shared PostgreSQL instance.
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    fileParallelism: false,
    environment: "node",
    // Increase timeout for DB-heavy integration tests
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
