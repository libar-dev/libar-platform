import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Publish without an await after spawn. A parent sweep sees the whole record or no record.
export function publishOwnership(
  directory: string,
  pid: number,
  instanceName: string,
): void {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error("Invalid backend process id");
  const staged = join(directory, "pid.next");
  writeFileSync(staged, JSON.stringify({ pid, instanceName, directory }), {
    flag: "wx",
  });
  renameSync(staged, join(directory, "pid"));
}
interface OwnershipRecord {
  pid: number;
  instanceName: string;
  directory: string;
}
function readRecord(directory: string): OwnershipRecord | undefined {
  try {
    const record = JSON.parse(
      readFileSync(join(directory, "pid"), "utf8"),
    ) as Partial<OwnershipRecord> | null;
    if (
      typeof record !== "object" ||
      record === null ||
      typeof record.pid !== "number" ||
      !Number.isSafeInteger(record.pid) ||
      record.pid <= 0 ||
      record.directory !== directory ||
      typeof record.instanceName !== "string" ||
      !/^libar-[0-9a-f-]{36}$/.test(record.instanceName)
    )
      return undefined;
    return record as OwnershipRecord;
  } catch {
    return undefined;
  }
}
// ps -p exits with status 1 and prints nothing when no process has the id, on macOS and on Linux
// procps. The process table confirms it, so a ps that fails in that same way for another reason
// is not taken as absence.
function gone(pid: number, error: unknown): boolean {
  const failure = error as {
    status?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  };
  if (failure.status !== 1 || failure.stdout !== "" || failure.stderr !== "")
    return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (probe) {
    return (probe as NodeJS.ErrnoException).code === "ESRCH";
  }
}
// ps answers for a process whose command line it could not read with the name alone, in brackets
// on Linux procps and in parentheses on macOS. A zombie answers `<defunct>` on macOS and
// `[name] <defunct>` on Linux procps, which is no backend's command line, so it counts as absent
// below. A zombie that answers with its name alone is told apart by its state, Z.
function zombie(pid: number): boolean {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "state="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .trim()
      .startsWith("Z");
  } catch {
    return false;
  }
}
function unreadable(answer: string): boolean {
  return answer === "" || /^\[.*\]$/s.test(answer) || /^\(.*\)$/s.test(answer);
}
// Kills the backend a directory's ownership record names, when that process is still the backend.
// A missing or invalid record, a process that is gone and a process that is another program are
// left alone. Throws when it cannot tell, so the caller keeps the record. The message names the
// process id and the directory, never the command line, which holds the instance secret.
export function signalOwned(directory: string): void {
  const record = readRecord(directory);
  if (record === undefined) return;
  let command: string;
  try {
    command = execFileSync(
      "ps",
      ["-ww", "-p", String(record.pid), "-o", "command="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    if (gone(record.pid, error)) return;
    const { code, status } = error as { code?: unknown; status?: unknown };
    throw new Error(
      `Could not tell whether backend process ${record.pid} recorded in ${directory} is running: ${
        typeof status === "number"
          ? `ps exited with status ${status}`
          : `ps could not run (${String(code)})`
      }`,
    );
  }
  const answer = command.trim();
  if (unreadable(answer)) {
    if (zombie(record.pid)) return;
    throw new Error(
      `Could not tell whether backend process ${record.pid} recorded in ${directory} is running: ps could not read its command line`,
    );
  }
  // The random instance name and storage path survive a wrapper's exec and distinguish PID reuse.
  // Never print this command: it contains the instance secret.
  if (
    !command.includes(`--instance-name ${record.instanceName} `) ||
    !command.includes(`--local-storage ${join(directory, "storage")} `) ||
    !command.trimEnd().endsWith(join(directory, "backend.sqlite3"))
  )
    return;
  try {
    process.kill(record.pid, "SIGKILL");
  } catch (error) {
    // ESRCH: it exited after the inspection. Any other failure leaves it running, so the caller
    // keeps the record.
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH")
      throw new Error(
        `Could not stop backend process ${record.pid} recorded in ${directory}: ${String(code)}`,
      );
  }
}
