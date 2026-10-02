import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
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
// The pinned backend binary of the owner's machine, unless the caller exported another path.
environment.CONVEX_BACKEND_BINARY ??= join(
  homedir(),
  "dev-libar/libar-platform/.cache/precompiled-2026-09-28-5c7cb5b/convex-local-backend-x86_64-unknown-linux-gnu.zip/convex-local-backend",
);
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
