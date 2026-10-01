import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Reporter, TestCase } from "vitest/node";
import { backendRelease, root } from "./backend.js";
import { fixtureIssuer } from "./identity.js";
const runID = process.env.NATIVE_RUN_ID ?? randomUUID();
process.env.NATIVE_RUN_ID = runID;
function encode(_key: string, value: unknown) {
  return typeof value === "bigint" ? { bigint: value.toString() } : value;
}
export async function recordMeasurement(
  test: string,
  name: string,
  value: unknown,
): Promise<void> {
  const directory = join(
    root,
    "evidence/runs",
    `${process.env.NATIVE_RUN_ID ?? runID}.measurements`,
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${randomUUID()}.json`),
    JSON.stringify({ test, name, value }, encode),
  );
}
export default class EvidenceReporter implements Reporter {
  private nativeRun = false;
  onTestRunStart(...args: Parameters<NonNullable<Reporter["onTestRunStart"]>>) {
    this.nativeRun = args[0].some(
      (specification) => specification.project.name === "native",
    );
  }
  private tests: { name: string; result: unknown }[] = [];
  onTestCaseResult(test: TestCase) {
    if (test.project.name === "native")
      this.tests.push({ name: test.fullName, result: test.result() });
  }
  async onTestRunEnd(
    ...args: Parameters<NonNullable<Reporter["onTestRunEnd"]>>
  ) {
    if (!this.nativeRun) return;
    const [, unhandledErrors, reason] = args;
    const directory = join(root, "evidence/runs");
    await mkdir(directory, { recursive: true });
    const measurementsDirectory = join(directory, `${runID}.measurements`);
    let measurements: { test: string; name: string; value: unknown }[] = [];
    try {
      measurements = await Promise.all(
        (await readdir(measurementsDirectory)).map(
          async (file) =>
            JSON.parse(
              await readFile(join(measurementsDirectory, file), "utf8"),
            ) as { test: string; name: string; value: unknown },
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const packages = [
      "convex",
      "convex-test",
      "convex-helpers",
      "vitest",
      "@typescript/native",
    ];
    const versions = Object.fromEntries(
      await Promise.all(
        packages.map(async (name) => {
          const metadata = JSON.parse(
            await readFile(
              join(root, "node_modules", name, "package.json"),
              "utf8",
            ),
          ) as { version: string };
          return [
            name === "@typescript/native" ? "TypeScript" : name,
            metadata.version,
          ];
        }),
      ),
    );
    const record = {
      tier: "native backend",
      reason,
      unhandledErrors,
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      dirty: !!execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      installedLayers: [],
      composition: "fixture",
      backend: {
        ...(await backendRelease()),
        binaryOverride: process.env.CONVEX_BACKEND_BINARY ?? null,
      },
      versions: { ...versions, Node: process.version },
      configuration: {
        adjustments: { identitySource: fixtureIssuer },
        description:
          "Fixture composition only; no platform layer or production composition exists yet.",
      },
      dataset: "Fresh empty storage per test; only rows written by that test.",
      identitySource: fixtureIssuer,
      command: process.env.npm_lifecycle_script ?? process.argv.join(" "),
      tests: this.tests.map((test) => ({
        ...test,
        measurements: measurements.filter((measurement) =>
          test.name.includes(measurement.test),
        ),
      })),
    };
    await writeFile(
      join(directory, `${runID}.json`),
      JSON.stringify(record, encode, 2) + "\n",
    );
    await rm(measurementsDirectory, { recursive: true, force: true });
  }
}
