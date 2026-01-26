import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@libar-dev/platform-bus-integration",
    environment: "node",
    include: ["tests/steps/**/*.integration.steps.ts"],
    testTimeout: 60000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    fileParallelism: false,
    maxWorkers: 1,
  },
});
