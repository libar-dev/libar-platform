import { readdirSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
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
export function sweep(directory: string): void {
  function killOwned(root: string): void {
    try {
      process.kill(Number(readFileSync(join(root, "pid"), "utf8")), "SIGKILL");
    } catch {
      // No pid file, or the process is gone.
    }
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries)
      if (entry.isDirectory()) killOwned(join(root, entry.name));
  }
  killOwned(directory);
  rmSync(directory, { recursive: true, force: true });
}
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const executable = await resolveExecutable();
  const directory = await mkdtemp(join(tmpdir(), "libar-native-"));
  project.provide("nativeRun", { directory, executable });
  process.once("exit", () => sweep(directory));
  return async () => sweep(directory);
}
