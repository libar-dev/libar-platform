import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Backend } from "./backend.js";
import { redact } from "./child.js";
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
async function snapshotCommand(
  backend: Pick<Backend, "url" | "adminKey">,
  args: string[],
  signal: AbortSignal,
  directory = join(import.meta.dirname, ".."),
): Promise<SnapshotCommand> {
  const home = await mkdtemp(join(tmpdir(), "convex-snapshot-"));
  const selection = ["--url", backend.url, "--admin-key", backend.adminKey];
  const command = ["--no-install", "convex", ...args, ...selection];
  const safe = (value: string) => redact(value, [backend.adminKey]);
  try {
    return await new Promise((resolve, reject) => {
      const child = execFile(
        "npx",
        command,
        {
          cwd: directory,
          env: { PATH: process.env.PATH ?? "", HOME: home, TMPDIR: tmpdir() },
          timeout: 60000,
          killSignal: "SIGKILL",
          maxBuffer: 16 * 1024 * 1024,
          signal,
        },
        (error, stdout, stderr) => {
          const result = {
            command: ["npx", ...command.map(safe)],
            stdout: safe(stdout),
            stderr: safe(stderr),
          };
          if (error === null) resolve(result);
          else
            reject(new Error(JSON.stringify({ code: error.code, ...result })));
        },
      );
      const kill = () => child.kill("SIGKILL");
      if (signal.aborted) kill();
      else signal.addEventListener("abort", kill, { once: true });
      child.once("exit", () => signal.removeEventListener("abort", kill));
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

export function deploySnapshotFixture(
  backend: Pick<Backend, "url" | "adminKey">,
  directory: string,
  signal: AbortSignal,
): Promise<SnapshotCommand> {
  return snapshotCommand(
    backend,
    ["deploy", "--yes", "--codegen", "disable", "--typecheck", "disable"],
    signal,
    directory,
  );
}

export function exportSnapshot(
  backend: Pick<Backend, "url" | "adminKey">,
  path: string,
  signal: AbortSignal,
): Promise<SnapshotCommand> {
  return snapshotCommand(backend, ["export", "--path", path], signal);
}

export function replaceSnapshot(
  backend: Pick<Backend, "url" | "adminKey">,
  path: string,
  signal: AbortSignal,
): Promise<SnapshotCommand> {
  return snapshotCommand(
    backend,
    ["import", "--replace", "--yes", path],
    signal,
  );
}
