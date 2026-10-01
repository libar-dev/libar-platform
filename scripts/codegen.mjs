// Rewrites fixture/convex/_generated and fixture/convex/annex/_generated.
// Convex's codegen analyzes the functions on a deployment, so this starts a disposable backend,
// runs codegen against it and removes it.
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

const backend = await startBackend({
  executable: await resolveExecutable(),
  issuer: await createFixtureIssuer(),
});
try {
  await backend.admin.codegen();
} finally {
  await backend.dispose();
}
