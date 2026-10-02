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
  id: codeAnchorId("impl:platform.native-harness.snapshot"),
  label: "snapshot export and replacement import through the Convex CLI",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;

export interface SnapshotCommand {
  command: string[];
  stdout: string;
  stderr: string;
}

// Uses the installed CLI and an isolated home, with no inherited deployment selection.
export async function snapshotCommand(
  backend: Pick<Backend, "url" | "adminKey">,
  args: string[],
  signal: AbortSignal | undefined,
  directory = join(import.meta.dirname, ".."),
): Promise<SnapshotCommand> {
  const home = await mkdtemp(join(tmpdir(), "convex-snapshot-"));
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

export function deploySnapshotFixture(
  backend: Pick<Backend, "admin">,
  directory: string,
  signal: AbortSignal,
): Promise<SnapshotCommand> {
  signal.throwIfAborted();
  return backend.admin.deployTemporary(directory);
}

export function createSnapshotAccess(
  target: Pick<AdminTarget, "url" | "adminKey" | "signal">,
): Pick<AdminAccess, "exportSnapshot" | "replaceSnapshot"> {
  return {
    async exportSnapshot(path) {
      await snapshotCommand(target, ["export", "--path", path], target.signal);
    },
    async replaceSnapshot(path) {
      await snapshotCommand(
        target,
        ["import", "--replace", "--yes", path],
        target.signal,
      );
    },
  };
}
