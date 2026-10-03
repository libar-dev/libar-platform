import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdminAccess, AdminTarget } from "./admin.js";
import type { Backend } from "./backend.js";
import { redact, runChild } from "./child.js";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.backup-archive"),
  label: "backup archive export and replacement import through the Convex CLI",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;

export interface CliOutput {
  command: string[];
  stdout: string;
  stderr: string;
}

// Uses the installed CLI and an isolated home, with no inherited deployment selection.
export async function isolatedCli(
  backend: Pick<Backend, "url" | "adminKey">,
  args: string[],
  signal: AbortSignal | undefined,
  directory = join(import.meta.dirname, ".."),
): Promise<CliOutput> {
  const home = await mkdtemp(join(tmpdir(), "convex-cli-"));
  const selection = ["--url", backend.url, "--admin-key", backend.adminKey];
  const file = process.execPath;
  const command = [
    join(import.meta.dirname, "../node_modules/convex/bin/main.js"),
    ...args,
    ...selection,
  ];
  const safe = (value: string) => redact(value, [backend.adminKey]);
  try {
    const output = await runChild(`convex ${args[0]}`, file, command, {
      cwd: directory,
      env: { PATH: process.env.PATH ?? "", HOME: home, TMPDIR: tmpdir() },
      timeoutMs: 60000,
      secrets: [backend.adminKey],
      ...(signal === undefined ? {} : { signal }),
      output: "both",
    });
    return { command: [file, ...command.map(safe)], ...output };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

export function deployTemporaryCopy(
  backend: Pick<Backend, "admin">,
  directory: string,
  signal: AbortSignal,
): Promise<CliOutput> {
  signal.throwIfAborted();
  return backend.admin.deployTemporary(directory, signal);
}

export function createBackupArchiveAccess(
  target: Pick<AdminTarget, "url" | "adminKey" | "signal">,
): Pick<AdminAccess, "exportBackupArchive" | "importBackupArchive"> {
  return {
    async exportBackupArchive(path) {
      await isolatedCli(target, ["export", "--path", path], target.signal);
    },
    async importBackupArchive(path) {
      await isolatedCli(
        target,
        ["import", "--replace", "--yes", path],
        target.signal,
      );
    },
  };
}
