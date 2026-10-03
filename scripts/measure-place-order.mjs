import { spawnSync } from "node:child_process";
const environment = { ...process.env };
for (const key of [
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_DEPLOYMENT",
])
  delete environment[key];
environment.PLACE_ORDER_TIMINGS = "1";
environment.PLACE_ORDER_TIMING_LOAD = process.argv.includes("--quiet")
  ? "quiet"
  : "under load";
const child = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--project",
    "native",
    "--maxWorkers=1",
    "tests/native/place-order-timing.test.ts",
  ],
  { stdio: "inherit", env: environment },
);
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
