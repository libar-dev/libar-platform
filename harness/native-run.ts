import { readdirSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { failRunRecord, openRunRecord } from "./evidence.js";
import type { RunRecordSlot } from "./evidence.js";
import { signalOwned } from "./ownership.js";
import { resolveExecutable } from "./executable.js";
import type { Executable } from "./executable.js";
export interface NativeRun {
  directory: string;
  executable: Executable;
}
declare module "vitest" {
  interface ProvidedContext {
    nativeRun: NativeRun;
  }
}
// Kills every owned backend under a directory and removes the directory. A backend directory
// whose process cannot be inspected is kept with its ownership record, the rest is removed, and
// the sweep then fails naming what it kept.
export function sweep(directory: string): void {
  const reasons: string[] = [];
  // Returns whether root or anything under it is kept.
  function killOwned(root: string): boolean {
    try {
      signalOwned(root);
    } catch (error) {
      reasons.push((error as Error).message);
      return true;
    }
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      return false;
    }
    const keeping = new Set<string>();
    for (const entry of entries)
      if (entry.isDirectory() && killOwned(join(root, entry.name)))
        keeping.add(entry.name);
    if (keeping.size === 0) return false;
    for (const entry of entries)
      if (!keeping.has(entry.name))
        rmSync(join(root, entry.name), { recursive: true, force: true });
    return true;
  }
  if (!killOwned(directory)) {
    rmSync(directory, { recursive: true, force: true });
    return;
  }
  throw new Error(
    `The sweep kept ${reasons.length === 1 ? "a backend directory" : `${reasons.length} backend directories`} with the ownership record, because it could not tell whether the backend is running. ${reasons.join(". ")}.`,
  );
}
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const executable = await resolveExecutable();
  const directory = await mkdtemp(join(tmpdir(), "libar-native-"));
  const run = openRunRecord();
  project.provide("nativeRun", { directory, executable });
  process.once("exit", () => {
    try {
      finalSweep(directory, run);
    } catch (error) {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exitCode = 1;
    }
  });
  return async () => finalSweep(directory, run);
}
// The run's last sweep, once: the teardown or, without one, the exit. Its failure also fails the
// run's record, which is written before it.
export function finalSweep(directory: string, run: RunRecordSlot): void {
  if (run.swept === true) return;
  run.swept = true;
  try {
    sweep(directory);
  } catch (error) {
    const message = (error as Error).message;
    try {
      failRunRecord(run, message);
    } catch (amend) {
      throw new Error(
        `${message} The run record could not be marked failed: ${(amend as Error).message}`,
      );
    }
    throw error;
  }
}
