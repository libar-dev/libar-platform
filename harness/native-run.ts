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
  let entries: string[] = [];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    try {
      process.kill(
        Number(readFileSync(join(directory, entry, "pid"), "utf8")),
        "SIGKILL",
      );
    } catch {
      // No pid file, or the process is gone.
    }
  }
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
