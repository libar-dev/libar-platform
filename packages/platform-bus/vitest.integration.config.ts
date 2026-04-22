import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@libar-dev/platform-bus-integration",
    environment: "node",
    include: ["tests/steps/**/*.integration.steps.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
    isolate: true,
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
