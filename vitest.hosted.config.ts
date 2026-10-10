import { defineConfig } from "vitest/config";
// npm run test:hosted alone runs this configuration: the native backend tier on the one hosted
// deployment, selected by the four process variables its global setup reads. The root
// configuration does not include it, so npm test and npm run test:all never select a hosted target.
export default defineConfig({
  test: {
    reporters: ["default", "./harness/evidence.ts"],
    projects: [
      {
        test: {
          name: "hosted",
          environment: "node",
          include: ["tests/hosted/**/*.test.ts"],
          globalSetup: ["./harness/hosted-run.ts"],
          fileParallelism: false,
          testTimeout: 900000,
          hookTimeout: 120000,
        },
      },
    ],
  },
});
