import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    reporters: ["default", "./harness/evidence.ts"],
    projects: [
      {
        test: {
          name: "types",
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            checker: "tsc",
            include: ["tests/types/**/*.test-d.ts"],
          },
        },
      },
      {
        test: {
          name: "pure",
          environment: "node",
          include: ["tests/pure/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "simulator",
          environment: "edge-runtime",
          include: ["tests/simulator/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "native",
          environment: "node",
          include: ["tests/native/**/*.test.ts"],
          globalSetup: ["./harness/native-run.ts"],
          testTimeout: 120000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
