import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Reporter, TestCase } from "vitest/node";
import type { BackendFacts } from "./backend.js";
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
export interface NativeTestEntry extends NativeTestFacts {
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
  onTestCaseResult(test: TestCase) {
    if (test.project.name !== "native") return;
    const result = test.result();
    if (result.state === "pending") return;
    this.tests.push({
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
    const directory = join(repositoryRoot, "evidence/runs");
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
// path is kept on the process, not in this module, because the reporter and the global setup are
// loaded as separate module instances.
const runRecordKey = Symbol.for("libar-platform.native-run-record");
export function rememberRunRecord(path: string): void {
  (globalThis as Record<symbol, unknown>)[runRecordKey] = path;
}
// A failure after the record was written, a failed final sweep, makes the run's record a failed
// one with the failure among its unhandled errors. Returns the record's path, if there is one.
export function failRunRecord(message: string): string | undefined {
  const path = (globalThis as Record<symbol, unknown>)[runRecordKey];
  if (typeof path !== "string") return undefined;
  const record = JSON.parse(readFileSync(path, "utf8")) as NativeRunRecord;
  record.result = "failed";
  if (!record.unhandledErrors.includes(message))
    record.unhandledErrors.push(message);
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
  return path;
}
