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
export function signalOwned(directory: string): void {
  try {
    const record = JSON.parse(readFileSync(join(directory, "pid"), "utf8")) as {
      pid: number;
      instanceName: string;
      directory: string;
    };
    if (
      !Number.isSafeInteger(record.pid) ||
      record.pid <= 0 ||
      record.directory !== directory ||
      typeof record.instanceName !== "string" ||
      !/^libar-[0-9a-f-]{36}$/.test(record.instanceName)
    )
      return;
    // The random instance name and storage path survive a wrapper's exec and distinguish PID reuse.
    // Never print this command: it contains the instance secret.
    const command = execFileSync(
      "ps",
      ["-ww", "-p", String(record.pid), "-o", "command="],
      { encoding: "utf8" },
    );
    if (
      !command.includes(`--instance-name ${record.instanceName} `) ||
      !command.includes(`--local-storage ${join(directory, "storage")} `) ||
      !command.trimEnd().endsWith(join(directory, "backend.sqlite3"))
    )
      return;
    process.kill(record.pid, "SIGKILL");
  } catch {
    // Missing, partial or stale ownership, failed inspection, or an already exited process.
  }
}
