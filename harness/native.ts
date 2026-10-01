import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { TestRunner, inject, onTestFinished } from "vitest";
import { startBackend } from "./backend.js";
import type { Executable } from "./executable.js";
import type { Backend } from "./backend.js";
import type { JsonValue, NativeTestFacts } from "./evidence.js";
import { createFixtureIssuer } from "./identity.js";
// Binds the code under harness/ to its Spec in the corpus graph.
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness"),
  label: "the native harness",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
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
  options: {
    issuer?: string;
    executable?: Executable;
    parentDirectory?: string;
    deploy?: boolean;
  } = {},
): Promise<Backend> {
  const { test, facts } = current();
  const run = inject("nativeRun");
  const issuer = await createFixtureIssuer(options.issuer);
  let owned: Backend | undefined;
  const starting = startBackend({
    executable: options.executable ?? run.executable,
    issuer,
    parentDirectory: options.parentDirectory ?? run.directory,
    signal: test.context.signal,
  }).then(async (backend) => {
    owned = backend;
    try {
      if (options.deploy !== false) await backend.admin.deploy();
      return backend;
    } catch (error) {
      await backend.dispose().catch(() => undefined);
      throw error;
    }
  });
  // Registered before the first await on the start, so a test that times out during the start
  // still has its backend removed.
  onTestFinished(async () => {
    await starting.catch(() => undefined);
    if (owned === undefined) return;
    facts.backends.push(owned.facts());
    await owned.dispose();
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
