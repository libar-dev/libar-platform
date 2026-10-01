// Watch mode. Starts one disposable backend and runs `convex dev` against it in the project
// directory of the composition the argument names, the fixture composition with none, so that its
// generated files follow every change to one of its files: `npm run dev -- production`. Runs until
// SIGINT or SIGTERM, or until convex dev exits, then removes what it started. The lifecycle is
// harness/watch.ts; this file supplies the real steps.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const { Interrupt, watch } = await import("../harness/watch.ts");
const { compositionNamed, projectDirectory } =
  await import("../harness/composition.ts");
const composition = compositionNamed(process.argv.slice(2));

const controller = new AbortController();
const onInt = () => controller.abort(new Interrupt("SIGINT"));
const onTerm = () => controller.abort(new Interrupt("SIGTERM"));
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
try {
  process.exitCode = await watch({
    composition,
    // convex dev writes .env.local in its working directory.
    envFile: join(projectDirectory(composition), ".env.local"),
    signal: controller.signal,
    stdout: process.stdout,
    stderr: process.stderr,
    steps: {
      resolveExecutable: (signal) => resolveExecutable({ signal }),
      createFixtureIssuer,
      startBackend,
      // The same read convex dev makes before it writes the site URL to .env.local.
      async siteUrl(backend, signal) {
        const response = await fetch(
          `${backend.url}/api/v1/get_canonical_urls`,
          {
            headers: { Authorization: `Convex ${backend.adminKey}` },
            signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          },
        );
        if (!response.ok)
          throw new Error(
            `Reading the backend's site URL failed with status ${response.status}`,
          );
        return (await response.json()).convexSiteUrl;
      },
      // The Backend keeps its own home inside; the CLI gets a home of its own beside it.
      makeHome: () => mkdtemp(join(tmpdir(), "libar-dev-home-")),
      removeHome: (home) => rm(home, { recursive: true, force: true }),
      spawn: (call) =>
        spawn(call.file, call.args, {
          cwd: call.cwd,
          env: call.env,
          stdio: ["ignore", "pipe", "pipe"],
        }),
    },
  });
} finally {
  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
}
