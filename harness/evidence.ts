import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Reporter, TestCase } from "vitest/node";
import type { BackendFacts } from "./backend.js";
import { redact } from "./child.js";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.evidence"),
  label: "the run record",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface Measurement {
  name: string;
  value: JsonValue;
}
export interface NativeTestFacts {
  backends: BackendFacts[];
  measurements: Measurement[];
}
// The Vitest project that ran a test. The acceptance check reads it to confirm a scenario's tier.
// `hosted` is the project of a test that ran on a hosted deployment.
export type TestProjectName =
  "types" | "pure" | "simulator" | "native" | "hosted";
const projectNames: readonly string[] = [
  "types",
  "pure",
  "simulator",
  "native",
  "hosted",
];
// Where a native run ran, recorded apart from the tier: a hosted deployment is a target of the
// native backend tier, not a tier of its own.
export type Target = "local backend" | "hosted deployment";
// The deployment's answer to GET /api/v1/get_current_usage, with the time it was read.
// A type and not an interface, so that a reading is itself a JSON value a measurement can hold.
export type HostedUsage = {
  readAt: string;
  seedStatus: string | null;
  response: JsonValue;
};
export interface HostedDeploy {
  composition: "fixture" | "production" | null;
  wallMs: number;
}
export interface HostedRunFacts {
  deployment: string;
  keyName: string;
  statedPlan: string;
  ranBy: "continuous integration" | "developer";
  cliVersion: string;
  backendVersion: string | null;
  usageBefore: HostedUsage | null;
  usageAfter: HostedUsage | null;
  windowCrossed: boolean;
  deploys: HostedDeploy[];
}
// The measurement a test on a hosted deployment stores for each deploy, which the record gathers
// into its hosted facts.
export const hostedDeployMeasurement = "hosted deploy";
export interface NativeTestEntry extends NativeTestFacts {
  project: TestProjectName;
  name: string;
  file: string;
  result: "passed" | "failed" | "skipped";
  durationMs: number | null;
  errors: string[];
}
export interface NativeRunRecord {
  tier: "native";
  target: Target;
  commit: string;
  clean: boolean;
  command: string;
  startedAt: string;
  finishedAt: string;
  result: "passed" | "failed" | "interrupted";
  versions: Record<string, string>;
  tests: NativeTestEntry[];
  unhandledErrors: string[];
  hosted: HostedRunFacts | null;
}
declare module "vitest" {
  interface TaskMeta {
    native?: NativeTestFacts;
  }
}
const repositoryRoot = join(import.meta.dirname, "..");
const versioned: Record<string, string> = {
  convex: "convex",
  "convex-helpers": "convex-helpers",
  "convex-test": "convex-test",
  vitest: "vitest",
  typescript: "@typescript/native",
  react: "react",
  "happy-dom": "happy-dom",
};
function git(...args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}
export default class EvidenceReporter implements Reporter {
  private readonly directory: string;
  // Vitest passes the reporter's options, an empty object unless the configuration names some.
  constructor(options: { directory?: string } = {}) {
    this.directory = options.directory ?? join(repositoryRoot, "evidence/runs");
  }
  private native = false;
  private hostedRun = false;
  private startedAt = "";
  private commit = "unknown";
  private clean = false;
  private tests: NativeTestEntry[] = [];
  onTestRunStart(
    specifications: Parameters<NonNullable<Reporter["onTestRunStart"]>>[0],
  ) {
    this.hostedRun = specifications.some(
      (specification) => specification.project.name === "hosted",
    );
    this.native =
      this.hostedRun ||
      specifications.some(
        (specification) => specification.project.name === "native",
      );
    this.startedAt = new Date().toISOString();
    this.commit = git("rev-parse", "HEAD") ?? "unknown";
    this.clean = git("status", "--porcelain") === "";
    this.tests = [];
  }
  // A run that includes the native project records every test it ran, of every project, so that
  // one record holds the results of every tier the run covered.
  onTestCaseResult(test: TestCase) {
    const project = test.project.name;
    if (!projectNames.includes(project))
      throw new Error(`The run record has no project named ${project}`);
    const result = test.result();
    if (result.state === "pending") return;
    this.tests.push({
      project: project as TestProjectName,
      name: test.fullName,
      file: test.module.relativeModuleId,
      result: result.state,
      durationMs: test.diagnostic()?.duration ?? null,
      errors: (result.errors ?? []).map((error) => error.message),
      backends: test.meta().native?.backends ?? [],
      measurements: test.meta().native?.measurements ?? [],
    });
  }
  async onTestRunEnd(
    ...[, unhandledErrors, reason]: Parameters<
      NonNullable<Reporter["onTestRunEnd"]>
    >
  ) {
    if (!this.native) return;
    const versions: Record<string, string> = { node: process.version };
    for (const [name, packageName] of Object.entries(versioned))
      versions[name] = (
        JSON.parse(
          await readFile(
            join(repositoryRoot, "node_modules", packageName, "package.json"),
            "utf8",
          ),
        ) as { version: string }
      ).version;
    const run = onProcess[runRecordKey];
    const record: NativeRunRecord = {
      tier: "native",
      target: this.hostedRun ? "hosted deployment" : "local backend",
      commit: this.commit,
      clean: this.clean,
      command: invocation(process.argv.slice(2)),
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      result: reason,
      versions,
      tests: this.tests,
      unhandledErrors: unhandledErrors.map((error) => error.message),
      hosted:
        this.hostedRun && run?.hosted !== undefined
          ? { ...run.hosted, deploys: deploysOf(this.tests) }
          : null,
    };
    const directory = this.directory;
    await mkdir(directory, { recursive: true });
    const name = await writeRunRecord(directory, record, run?.secrets ?? []);
    rememberRunRecord(join(directory, name));
    console.log(`Native run record (${record.target}): evidence/runs/${name}`);
  }
}

export function invocation(args: readonly string[]): string {
  const quote = (arg: string) =>
    /^[a-zA-Z0-9_./=:-]+$/.test(arg)
      ? arg
      : "'" + arg.replaceAll("'", "'\\''") + "'";
  return ["vitest", ...args].map(quote).join(" ");
}

// The deploys that the tests of a run on a hosted deployment stored, in the order they ran.
function deploysOf(tests: readonly NativeTestEntry[]): HostedDeploy[] {
  return tests.flatMap((test) =>
    test.measurements
      .filter((measurement) => measurement.name === hostedDeployMeasurement)
      .map((measurement) => measurement.value as unknown as HostedDeploy),
  );
}

// The record serialized with every secret replaced, a second net behind the redaction where each
// response is first seen.
export function serializeRunRecord(
  record: NativeRunRecord,
  secrets: readonly string[] = [],
): string {
  return redact(JSON.stringify(record, null, 2), secrets) + "\n";
}

// A run on a hosted deployment writes its record as hosted- and its start time.
export async function writeRunRecord(
  directory: string,
  record: NativeRunRecord,
  secrets: readonly string[] = [],
): Promise<string> {
  const prefix = record.target === "hosted deployment" ? "hosted" : "native";
  const name = `${prefix}-${record.startedAt.replace(/[-:]|\.\d+/g, "")}-${record.commit.slice(0, 7)}-${randomUUID()}.json`;
  await writeFile(join(directory, name), serializeRunRecord(record, secrets), {
    flag: "wx",
  });
  return name;
}

// Vitest ends the run, and the reporter writes its record, before the global teardown sweeps. The
// global setup opens a run, the reporter puts its record's path on the open run, and that run's
// cleanup amends that record only. The open run is kept on the process, not in this module,
// because the reporter and the global setup are loaded as separate module instances.
export interface RunRecordSlot {
  path?: string;
  swept?: boolean;
  // What a run on a hosted deployment knows before its tests: the secrets the record is redacted
  // by and its hosted facts, without the deploys its tests store.
  secrets?: readonly string[];
  hosted?: Omit<HostedRunFacts, "deploys">;
}
const runRecordKey = Symbol.for("libar-platform.native-run-record");
const onProcess = globalThis as Record<symbol, RunRecordSlot | undefined>;
export function openRunRecord(): RunRecordSlot {
  return (onProcess[runRecordKey] = {});
}
export function rememberRunRecord(path: string): void {
  const run = onProcess[runRecordKey];
  if (run !== undefined) run.path = path;
}
// A failure after the record was written, a failed final sweep, makes the run's record a failed
// one with the failure among its unhandled errors, replacing the old record in one step. Returns
// the record's path, if the run has one.
export function failRunRecord(
  run: RunRecordSlot,
  message: string,
): string | undefined {
  return amendRunRecord(run, (record) => {
    record.result = "failed";
    if (!record.unhandledErrors.includes(message))
      record.unhandledErrors.push(message);
  });
}
// Changes the run's record and replaces the old record in one step, redacted as it was written.
// Returns the record's path, if the run has one.
export function amendRunRecord(
  run: RunRecordSlot,
  change: (record: NativeRunRecord) => void,
): string | undefined {
  const path = run.path;
  if (path === undefined) return undefined;
  const record = JSON.parse(readFileSync(path, "utf8")) as NativeRunRecord;
  change(record);
  writeFileSync(`${path}.next`, serializeRunRecord(record, run.secrets));
  renameSync(`${path}.next`, path);
  return path;
}
