// Rewrites the generated files of each composition the arguments name, or of both with no argument:
// `node scripts/codegen.mjs fixture production`. Convex's codegen analyzes the functions on a
// deployment, so for each composition this starts a disposable backend, runs codegen against it in
// the composition's project directory and removes it.
import { registerHooks } from "node:module";

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
const { compositionsNamed } = await import("../harness/composition.ts");

const controller = new AbortController();
const interrupt = (signal) =>
  controller.abort(new Error(`Codegen interrupted by ${signal}`));
const onInt = () => interrupt("SIGINT");
const onTerm = () => interrupt("SIGTERM");
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
try {
  const compositions = compositionsNamed(process.argv.slice(2));
  const executable = await resolveExecutable({ signal: controller.signal });
  for (const composition of compositions) {
    let backend;
    try {
      backend = await startBackend({
        executable,
        issuer: await createFixtureIssuer(),
        composition,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      await backend.admin.codegen();
      console.log(`Codegen wrote the ${composition.name} composition's files.`);
    } finally {
      await backend?.dispose();
    }
  }
} finally {
  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
}
