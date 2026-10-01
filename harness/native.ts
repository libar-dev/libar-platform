import { TestRunner, inject, onTestFinished } from "vitest";
import { startBackend } from "./backend.js";
import type { Backend } from "./backend.js";
import type { JsonValue, NativeTestFacts } from "./evidence.js";
import { createFixtureIssuer } from "./identity.js";
function current() {
  const test = TestRunner.getCurrentTest();
  if (test === undefined)
    throw new Error("fixtureBackend() and measure() must run inside a test");
  const facts: NativeTestFacts = (test.meta.native ??= {
    backends: [],
    measurements: [],
  });
  return { test, facts };
}
export async function fixtureBackend(
  options: { issuer?: string } = {},
): Promise<Backend> {
  const { test, facts } = current();
  const run = inject("nativeRun");
  const issuer = await createFixtureIssuer(options.issuer);
  const starting = startBackend({
    executable: run.executable,
    issuer,
    parentDirectory: run.directory,
    signal: test.context.signal,
  }).then(async (backend) => {
    try {
      await backend.admin.deploy();
      return backend;
    } catch (error) {
      await backend.dispose().catch(() => undefined);
      throw error;
    }
  });
  // Registered before the first await on the start, so a test that times out during the start
  // still has its backend removed.
  onTestFinished(async () => {
    const backend = await starting.catch(() => undefined);
    if (backend === undefined) return;
    facts.backends.push(backend.facts());
    await backend.dispose();
  });
  return starting;
}
export function measure(name: string, value: JsonValue): void {
  current().facts.measurements.push({ name, value });
}
export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined)
    throw new Error(`An earlier step did not set ${what}`);
  return value;
}
