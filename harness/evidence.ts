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
export type TestProjectName = "types" | "pure" | "simulator" | "native";
const projectNames: readonly string[] = [
  "types",
  "pure",
  "simulator",
  "native",
];
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
  commit: string;
  clean: boolean;
  command: string;
  startedAt: string;
  finishedAt: string;
  result: "passed" | "failed" | "interrupted";
  versions: Record<string, string>;
  tests: NativeTestEntry[];
  unhandledErrors: string[];
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
  private startedAt = "";
  private commit = "unknown";
  private clean = false;
  private tests: NativeTestEntry[] = [];
  onTestRunStart(
    specifications: Parameters<NonNullable<Reporter["onTestRunStart"]>>[0],
  ) {
    this.native = specifications.some(
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
    const record: NativeRunRecord = {
      tier: "native",
      commit: this.commit,
      clean: this.clean,
      command: invocation(process.argv.slice(2)),
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      result: reason,
      versions,
      tests: this.tests,
      unhandledErrors: unhandledErrors.map((error) => error.message),
    };
    const directory = this.directory;
    await mkdir(directory, { recursive: true });
    const name = await writeRunRecord(directory, record);
    rememberRunRecord(join(directory, name));
    console.log(`Native run record: evidence/runs/${name}`);
  }
}

export function invocation(args: readonly string[]): string {
  const quote = (arg: string) =>
    /^[a-zA-Z0-9_./=:-]+$/.test(arg)
      ? arg
      : "'" + arg.replaceAll("'", "'\\''") + "'";
  return ["vitest", ...args].map(quote).join(" ");
}

export async function writeRunRecord(
  directory: string,
  record: NativeRunRecord,
): Promise<string> {
  const name = `native-${record.startedAt.replace(/[-:]|\.\d+/g, "")}-${record.commit.slice(0, 7)}-${randomUUID()}.json`;
  await writeFile(
    join(directory, name),
    JSON.stringify(record, null, 2) + "\n",
    { flag: "wx" },
  );
  return name;
}

// Vitest ends the run, and the reporter writes its record, before the global teardown sweeps. The
// global setup opens a run, the reporter puts its record's path on the open run, and that run's
// cleanup amends that record only. The open run is kept on the process, not in this module,
// because the reporter and the global setup are loaded as separate module instances.
export interface RunRecordSlot {
  path?: string;
  swept?: boolean;
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
  const path = run.path;
  if (path === undefined) return undefined;
  const record = JSON.parse(readFileSync(path, "utf8")) as NativeRunRecord;
  record.result = "failed";
  if (!record.unhandledErrors.includes(message))
    record.unhandledErrors.push(message);
  writeFileSync(`${path}.next`, JSON.stringify(record, null, 2) + "\n");
  renameSync(`${path}.next`, path);
  return path;
}
