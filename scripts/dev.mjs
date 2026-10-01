// Watch mode. Starts one disposable backend and runs `convex dev` against it, so that
// fixture/convex/_generated and fixture/convex/annex/_generated follow every change to a fixture
// file. Runs until SIGINT or SIGTERM, or until convex dev exits, then removes what it started.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

// Node 24 runs the harness's TypeScript by stripping its types. The harness imports its own
// modules as ".js", which is what the compiler wants, so those resolve to the ".ts" files here.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      try {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      } catch {
        // A real .js file. Resolve it as written.
      }
    }
    return nextResolve(specifier, context);
  },
});

const { resolveExecutable } = await import("../harness/executable.ts");
const { createFixtureIssuer } = await import("../harness/identity.ts");
const { startBackend } = await import("../harness/backend.ts");
const { convexCli } = await import("../harness/admin.ts");
const { redact } = await import("../harness/child.ts");

// convex dev writes the backend's URL to .env.local in the repository root. It would change a
// developer's own file, so the script runs only when there is none and removes the one it caused.
const envFile = join(import.meta.dirname, "..", ".env.local");
if (existsSync(envFile)) {
  console.error(
    `npm run dev: ${envFile} exists. convex dev would write this backend's URL into it. Move it away and run again.`,
  );
  process.exit(1);
}

const controller = new AbortController();
const exitCodes = { SIGINT: 130, SIGTERM: 143 };
let stoppedBy;
const interrupt = (signal) => {
  stoppedBy ??= signal;
  controller.abort(new Error(`Dev interrupted by ${signal}`));
};
const onInt = () => interrupt("SIGINT");
const onTerm = () => interrupt("SIGTERM");
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);

function exited(child) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((done) => {
    child.once("exit", () => done());
    child.once("error", () => done());
  });
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited(child);
  clearTimeout(timer);
}
// Copy the child's output line by line with the admin key removed.
function relay(stream, destination, secrets) {
  createInterface({ input: stream, crlfDelay: Infinity }).on("line", (line) =>
    destination.write(`${redact(line, secrets)}\n`),
  );
}

let backend;
let home;
let child;
try {
  backend = await startBackend({
    executable: await resolveExecutable(),
    issuer: await createFixtureIssuer(),
    signal: controller.signal,
  });
  // The Backend keeps its own home inside; the CLI gets a home of its own beside it.
  home = await mkdtemp(join(tmpdir(), "libar-dev-home-"));
  const call = convexCli(
    { url: backend.url, adminKey: backend.adminKey, home },
    "dev",
  );
  controller.signal.throwIfAborted();
  console.log(
    `npm run dev: backend ready at ${backend.url}. Press Ctrl-C to stop.`,
  );
  child = spawn(call.file, call.args, {
    cwd: call.cwd,
    env: call.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const secrets = [backend.adminKey];
  relay(child.stdout, process.stdout, secrets);
  relay(child.stderr, process.stderr, secrets);
  let spawnError;
  child.once("error", (error) => (spawnError = error));
  const aborted = new Promise((done) =>
    controller.signal.addEventListener("abort", done, { once: true }),
  );
  await Promise.race([exited(child), aborted]);
  if (stoppedBy !== undefined) {
    process.exitCode = exitCodes[stoppedBy];
  } else {
    console.error(
      spawnError === undefined
        ? `npm run dev: convex dev exited with ${child.exitCode === null ? `signal ${child.signalCode}` : `code ${child.exitCode}`}`
        : `npm run dev: convex dev could not start: ${redact(String(spawnError), secrets)}`,
    );
    process.exitCode = 1;
  }
} finally {
  if (child !== undefined) await stop(child);
  try {
    await backend?.dispose();
  } finally {
    if (home !== undefined) await rm(home, { recursive: true, force: true });
    // There was no .env.local at the start, so one here was written during this run.
    await rm(envFile, { force: true });
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
}
