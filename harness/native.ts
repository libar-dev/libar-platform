import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TestRunner, inject, onTestFinished } from "vitest";
import type { AdminState } from "./admin.js";
import { startBackend } from "./backend.js";
import { fixtureComposition, productionComposition } from "./composition.js";
import type { Composition } from "./composition.js";
import type { Executable } from "./executable.js";
import type { Backend } from "./backend.js";
import { hostedDeployMeasurement } from "./evidence.js";
import type { HostedDeploy, JsonValue, NativeTestFacts } from "./evidence.js";
import { createHostedAccess } from "./hosted.js";
import type { HostedAccess, HostedRun } from "./hosted.js";
import { createFixtureIssuer } from "./identity.js";
// Binds this file to its Spec in the corpus graph. Every other file under harness/ carries its own anchor.
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness"),
  label: "the native harness",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
function current() {
  const test = TestRunner.getCurrentTest();
  if (test === undefined)
    throw new Error(
      "fixtureBackend(), productionBackend(), hostedBackend() and measure() must run inside a test",
    );
  const facts: NativeTestFacts = (test.meta.native ??= {
    backends: [],
    measurements: [],
  });
  return { test, facts };
}
export function fixtureBackend(
  options: {
    issuer?: string;
    executable?: Executable;
    parentDirectory?: string;
    deploy?: boolean;
  } = {},
): Promise<Backend> {
  return compositionBackend(fixtureComposition, options);
}
export function productionBackend(
  options: { issuer?: string; deploy?: boolean } = {},
): Promise<Backend> {
  return compositionBackend(productionComposition, options);
}
// Starts a backend for the composition, deploys it unless deploy is false, and removes the backend
// when the test finishes, however it finishes.
async function compositionBackend(
  composition: Composition,
  options: {
    issuer?: string;
    executable?: Executable;
    parentDirectory?: string;
    deploy?: boolean;
  },
): Promise<Backend> {
  const { test, facts } = current();
  if ((inject("hostedRun") as HostedRun | undefined) !== undefined)
    throw new Error(
      "fixtureBackend() and productionBackend() start a local backend, which a native run on a hosted deployment refuses. Use hostedBackend().",
    );
  const run = inject("nativeRun");
  const issuer = await createFixtureIssuer(options.issuer);
  let owned: Backend | undefined;
  const starting = startBackend({
    executable: options.executable ?? run.executable,
    issuer,
    composition,
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
// The hosted deployment as a backend of one test: its admin access holds the deploy key, it starts
// and removes nothing, and its facts say what the test deployed and that the data is kept.
export interface HostedBackend extends Backend {
  readonly admin: HostedAccess;
}
// Sets the fixture issuer's variables on the hosted deployment, deploys the composition unless
// deploy is false, records each deploy's wall time on the running test and, when the test
// finishes, closes its clients. stop, kill and restart refuse, dispose removes nothing on the
// deployment, and reading adminKey throws.
export async function hostedBackend(
  options: {
    composition?: "fixture" | "production";
    issuer?: string;
    deploy?: boolean;
  } = {},
): Promise<HostedBackend> {
  const { test, facts } = current();
  if ((inject("hostedRun") as HostedRun | undefined) === undefined)
    throw new Error(
      "hostedBackend() runs only under npm run test:hosted, whose global setup selects the hosted deployment",
    );
  const composition =
    options.composition === "production"
      ? productionComposition
      : fixtureComposition;
  const issuer = await createFixtureIssuer(options.issuer);
  const home = await mkdtemp(join(tmpdir(), "libar-hosted-"));
  const state: AdminState = {
    deployed: undefined,
    environment: new Set(),
    logProcess: {},
  };
  let identityIssuer = issuer.issuer;
  let disposed = false;
  let access: HostedAccess;
  let url: string;
  try {
    const created = createHostedAccess({
      variables: process.env,
      composition,
      home,
      state,
      signal: test.context.signal,
    });
    access = created.access;
    url = created.target.url;
  } catch (error) {
    await rm(home, { recursive: true, force: true });
    throw error;
  }
  const deployed = (deploy: HostedDeploy) =>
    current().facts.measurements.push({
      name: hostedDeployMeasurement,
      value: { ...deploy },
    });
  const assertLive = () => {
    if (disposed) throw new Error("The hosted backend is disposed");
  };
  const admin: HostedAccess = {
    ...access,
    async deploy() {
      assertLive();
      const start = performance.now();
      await access.deploy();
      deployed({
        composition: composition.name,
        wallMs: performance.now() - start,
      });
    },
    async deployTemporary(directory, signal) {
      assertLive();
      const start = performance.now();
      const result = await access.deployTemporary(directory, signal);
      deployed({ composition: null, wallMs: performance.now() - start });
      return result;
    },
    async setEnvironment(variables) {
      assertLive();
      await access.setEnvironment(variables);
      identityIssuer = variables.AUTH_ISSUER ?? identityIssuer;
    },
  };
  const refuse = (what: string) => async () => {
    throw new Error(
      `The harness does not ${what} a hosted deployment; it started no process there`,
    );
  };
  const backend: HostedBackend = {
    url,
    get adminKey(): string {
      throw new Error(
        "A hosted deployment has no admin key in this harness; its deploy key stays inside the admin access",
      );
    },
    issuer,
    admin,
    stop: refuse("stop"),
    kill: refuse("kill"),
    restart: refuse("restart"),
    async dispose() {
      if (disposed) return;
      disposed = true;
      state.logProcess = undefined;
      await rm(home, { recursive: true, force: true });
    },
    facts: () => ({
      composition: state.deployed?.name ?? null,
      installedLayers: [...(state.deployed?.installedLayers ?? [])],
      target: "hosted deployment",
      executable: null,
      identitySource: { kind: "fixture issuer", issuer: identityIssuer },
      environment: [...state.environment].sort(),
      dataset: "kept from earlier runs",
    }),
  };
  onTestFinished(async () => {
    facts.backends.push(backend.facts());
    await backend.dispose();
  });
  await admin.setEnvironment({
    AUTH_ISSUER: issuer.issuer,
    AUTH_APPLICATION_ID: issuer.applicationID,
    AUTH_JWKS: issuer.jwks,
  });
  if (options.deploy !== false) await admin.deploy();
  return backend;
}
export function measure(name: string, value: JsonValue): void {
  current().facts.measurements.push({ name, value });
}
export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined)
    throw new Error(`An earlier step did not set ${what}`);
  return value;
}
