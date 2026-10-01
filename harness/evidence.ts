import { execFileSync } from "node:child_process";
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
    // npm sets both for `npm run <script>`. Under npx the event is "npx" and names no script.
    const script =
      process.env.npm_command === "run-script"
        ? process.env.npm_lifecycle_event
        : undefined;
    const record: NativeRunRecord = {
      tier: "native",
      commit: this.commit,
      clean: this.clean,
      command:
        script === undefined
          ? `vitest ${process.argv.slice(2).join(" ")}`
          : `npm run ${script}`,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      result: reason,
      versions,
      tests: this.tests,
      unhandledErrors: unhandledErrors.map((error) => error.message),
    };
    const directory = join(repositoryRoot, "evidence/runs");
    await mkdir(directory, { recursive: true });
    const name = `native-${this.startedAt.replace(/[-:]|\.\d+/g, "")}-${this.commit.slice(0, 7)}.json`;
    await writeFile(
      join(directory, name),
      JSON.stringify(record, null, 2) + "\n",
    );
    console.log(`Native run record: evidence/runs/${name}`);
  }
}
