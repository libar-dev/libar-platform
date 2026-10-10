import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdminAccess, AdminTarget, Selection } from "./admin.js";
import type { Backend } from "./backend.js";
import { projectDirectory } from "./composition.js";
import { redact, runChild } from "./child.js";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.backup-archive"),
  label: "backup archive export and replacement import through the Convex CLI",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;

export const convexCliScript = join(
  import.meta.dirname,
  "../node_modules/convex/bin/main.js",
);
// The Convex CLI loads a .env or a .env.local from its working directory, and either can select
// another deployment, so a CLI call on a hosted deployment refuses a directory that holds one. The
// refusal names the file and never what it holds.
export function refuseDotenv(directory: string): void {
  for (const name of [".env", ".env.local"]) {
    const file = join(directory, name);
    if (existsSync(file))
      throw new Error(
        `${file} exists, and the Convex CLI would load it. A native run on a hosted deployment refuses a composition directory that holds .env or .env.local.`,
      );
  }
}
// The CLI's selection of the backend: arguments for the local backend, one environment variable
// for a hosted deployment.
export function cliSelection(selection: Selection): {
  args: string[];
  env: Record<string, string>;
} {
  return selection.kind === "local"
    ? {
        args: ["--url", selection.url, "--admin-key", selection.adminKey],
        env: {},
      }
    : { args: [], env: { CONVEX_DEPLOY_KEY: selection.key } };
}
export interface CliOutput {
  command: string[];
  stdout: string;
  stderr: string;
}

// Uses the installed CLI and an isolated home, with no inherited deployment selection: the local
// backend by its arguments, a hosted deployment by CONVEX_DEPLOY_KEY in the child's environment.
export async function isolatedCli(
  target: Pick<AdminTarget, "selection" | "secrets">,
  args: string[],
  signal: AbortSignal | undefined,
  directory = join(import.meta.dirname, ".."),
  script = convexCliScript,
): Promise<CliOutput> {
  if (target.selection.kind === "hosted") refuseDotenv(directory);
  const home = await mkdtemp(join(tmpdir(), "convex-cli-"));
  const selection = cliSelection(target.selection);
  const file = process.execPath;
  const command = [script, ...args, ...selection.args];
  const safe = (value: string) => redact(value, target.secrets);
  try {
    const output = await runChild(`convex ${args[0]}`, file, command, {
      cwd: directory,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: home,
        TMPDIR: tmpdir(),
        ...selection.env,
      },
      timeoutMs: 60000,
      secrets: target.secrets,
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

// On the local backend the export and the import run at the repository root; on a hosted
// deployment they run in the composition's project directory, the one its refusal of a dotenv file
// covers.
export function createBackupArchiveAccess(
  target: Pick<AdminTarget, "selection" | "secrets" | "signal" | "composition">,
  script?: string,
): Pick<AdminAccess, "exportBackupArchive" | "importBackupArchive"> {
  const repository =
    target.selection.kind === "hosted"
      ? projectDirectory(target.composition)
      : join(import.meta.dirname, "..");
  return {
    async exportBackupArchive(path) {
      await isolatedCli(
        target,
        ["export", "--path", path],
        target.signal,
        repository,
        script,
      );
    },
    async importBackupArchive(path) {
      await isolatedCli(
        target,
        ["import", "--replace", "--yes", path],
        target.signal,
        repository,
        script,
      );
    },
  };
}
