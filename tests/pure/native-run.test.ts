import { execFileSync, spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, vi } from "vitest";
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: vi.fn(),
}));
import { finalSweep, sweep } from "../../harness/native-run.js";
import EvidenceReporter, {
  failRunRecord,
  openRunRecord,
} from "../../harness/evidence.js";
import type { NativeRunRecord } from "../../harness/evidence.js";
import { publishOwnership } from "../../harness/ownership.js";

test("pure: sweep skips missing and stale ownership and kills multiple owned processes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-sweep-"));
  const children = [];
  const exits = [];
  const commands = new Map<number, string>();
  vi.mocked(execFileSync).mockImplementation((_file, args) => {
    const pid = Number((args as string[])[2]);
    if (!commands.has(pid)) throw new Error("process is gone");
    return commands.get(pid)!;
  });
  try {
    for (const name of ["one", "nested/two"]) {
      const storage = join(directory, name);
      await mkdir(storage, { recursive: true });
      const instance = `libar-${randomUUID()}`;
      const child = spawn(
        process.execPath,
        [
          "-e",
          "setInterval(() => {}, 1000)",
          "--",
          "--instance-name",
          instance,
          "--local-storage",
          join(storage, "storage"),
          join(storage, "backend.sqlite3"),
        ],
        { stdio: "ignore" },
      );
      commands.set(
        child.pid!,
        `node --instance-name ${instance} --local-storage ${join(storage, "storage")} ${join(storage, "backend.sqlite3")}`,
      );
      children.push(child);
      exits.push(
        new Promise((done) =>
          child.once("exit", (_code, signal) => done(signal)),
        ),
      );
      publishOwnership(storage, child.pid!, instance);
    }
    await mkdir(join(directory, "missing"));
    await mkdir(join(directory, "stale"));
    await writeFile(
      join(directory, "stale", "pid"),
      JSON.stringify({
        pid: children[0]!.pid,
        instanceName: `libar-${randomUUID()}`,
        directory: join(directory, "stale"),
      }),
    );
    const kill = vi.spyOn(process, "kill");
    // First signal fails; traversal still reaches the second owned process.
    kill.mockImplementationOnce(() => {
      throw Object.assign(new Error("already gone"), { code: "ESRCH" });
    });
    sweep(directory);
    expect(
      kill.mock.calls.filter((call) => call[1] === "SIGKILL"),
    ).toHaveLength(2);
    const failedPid = kill.mock.calls[0]![0];
    kill.mockRestore();
    children.find((child) => child.pid === failedPid)!.kill("SIGKILL");
    expect(await Promise.all(exits)).toEqual(["SIGKILL", "SIGKILL"]);
    await expect(stat(directory)).rejects.toThrow();
    sweep(directory);
  } finally {
    vi.restoreAllMocks();
    for (const child of children) child.kill("SIGKILL");
    sweep(directory);
  }
});

test("pure: empty, partial, invalid and stale pid files never signal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-invalid-pid-"));
  const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
  try {
    const commands = new Map<number, string>();
    vi.mocked(execFileSync).mockImplementation(
      (_file, args) =>
        commands.get(Number((args as string[])[2])) ?? "unrelated process",
    );
    for (const [index, value] of [
      "",
      "{",
      "0",
      "-1",
      "123",
      0,
      -1,
      1.5,
    ].entries()) {
      const storage = join(directory, String(index));
      await mkdir(storage);
      const instanceName = "libar-00000000-0000-0000-0000-000000000001";
      if (typeof value === "number")
        commands.set(
          value,
          `node --instance-name ${instanceName} --local-storage ${join(storage, "storage")} ${join(storage, "backend.sqlite3")}`,
        );
      await writeFile(
        join(storage, "pid"),
        typeof value === "number"
          ? JSON.stringify({ pid: value, directory: storage, instanceName })
          : value,
      );
    }
    sweep(directory);
    expect(kill).not.toHaveBeenCalled();
    expect(() => publishOwnership(directory, 0, "unused")).toThrow(
      "Invalid backend process id",
    );
  } finally {
    kill.mockRestore();
    sweep(directory);
  }
});

test("pure: a backend whose process cannot be inspected is kept with its record, the rest is swept, and the sweep fails naming it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-sweep-kept-"));
  const secret = "ab".repeat(32);
  const instanceName = "libar-00000000-0000-0000-0000-000000000001";
  const command = (storage: string) =>
    `convex-local-backend --instance-name ${instanceName} --instance-secret ${secret} --local-storage ${join(storage, "storage")} ${join(storage, "backend.sqlite3")}`;
  // pid -> what ps does for it, and whether the process table still has it.
  const cases: Record<
    string,
    { pid: number; ps: () => string; alive: boolean }
  > = {
    "ps-missing": {
      pid: 101,
      ps: () => {
        throw Object.assign(new Error("spawnSync ps ENOENT"), {
          code: "ENOENT",
        });
      },
      alive: true,
    },
    "ps-failed": {
      pid: 102,
      ps: () => {
        throw Object.assign(new Error("Command failed"), {
          status: 2,
          stdout: "",
          stderr: `ps: ${secret}`,
        });
      },
      alive: true,
    },
    "ps-silent-but-alive": {
      pid: 103,
      ps: () => {
        throw Object.assign(new Error("Command failed"), {
          status: 1,
          stdout: "",
          stderr: "",
        });
      },
      alive: true,
    },
    "nested/ps-missing": {
      pid: 104,
      ps: () => {
        throw Object.assign(new Error("spawnSync ps ENOENT"), {
          code: "ENOENT",
        });
      },
      alive: true,
    },
    gone: {
      pid: 105,
      ps: () => {
        throw Object.assign(new Error("Command failed"), {
          status: 1,
          stdout: "",
          stderr: "",
        });
      },
      alive: false,
    },
    "another-program": { pid: 106, ps: () => "vim notes.txt", alive: true },
    owned: {
      pid: 107,
      ps: () => command(join(directory, "owned")),
      alive: true,
    },
  };
  const byPid = new Map(
    Object.values(cases).map((entry) => [entry.pid, entry]),
  );
  vi.mocked(execFileSync).mockImplementation(
    (_file, args) => byPid.get(Number((args as string[])[2]))!.ps() as never,
  );
  const kill = vi.spyOn(process, "kill").mockImplementation((pid) => {
    if (byPid.get(pid)?.alive === false)
      throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    return true;
  });
  try {
    for (const [name, { pid }] of Object.entries(cases)) {
      const storage = join(directory, name);
      await mkdir(join(storage, "storage"), { recursive: true });
      publishOwnership(storage, pid, instanceName);
    }
    await writeFile(join(directory, "nested", "loose"), "");
    await mkdir(join(directory, "no-record"));
    let failure: Error | undefined;
    try {
      sweep(directory);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure).toBeInstanceOf(Error);
    for (const name of [
      "ps-missing",
      "ps-failed",
      "ps-silent-but-alive",
      "nested/ps-missing",
    ]) {
      expect(failure!.message).toContain(join(directory, name));
      expect((await stat(join(directory, name, "pid"))).isFile()).toBe(true);
      expect((await stat(join(directory, name, "storage"))).isDirectory()).toBe(
        true,
      );
    }
    expect(failure!.message).not.toContain(secret);
    expect(failure!.message).not.toContain("--instance-name");
    for (const name of [
      "gone",
      "another-program",
      "owned",
      "no-record",
      "nested/loose",
    ])
      await expect(stat(join(directory, name))).rejects.toThrow();
    expect(kill.mock.calls.filter((call) => call[1] === "SIGKILL")).toEqual([
      [107, "SIGKILL"],
    ]);
  } finally {
    kill.mockRestore();
    vi.mocked(execFileSync).mockReset();
    await rm(directory, { recursive: true, force: true });
  }
});

// What ps does for a process id no process has: status 1 and no output.
function noSuchProcess(): string {
  throw Object.assign(new Error("Command failed"), {
    status: 1,
    stdout: "",
    stderr: "",
  });
}
test("pure: a name-only ps answer and a failed signal keep the backend; a zombie and a readable other command are absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-sweep-answers-"));
  const instanceName = "libar-00000000-0000-0000-0000-000000000001";
  const owned = (name: string) =>
    `convex-local-backend --instance-name ${instanceName} --local-storage ${join(directory, name, "storage")} ${join(directory, name, "backend.sqlite3")}\n`;
  // pid -> ps's command answer, its state answer, and how SIGKILL fails, if it does.
  const cases: Record<
    string,
    {
      pid: number;
      command: string;
      state: string | (() => string);
      killCode?: string;
    }
  > = {
    "empty-answer": { pid: 209, command: "\n", state: "S" },
    // The process is reaped between the two inspections: the state query finds no process.
    "name-only-gone-before-state": {
      pid: 210,
      command: "(convex-local-ba)\n",
      state: noSuchProcess,
      killCode: "ESRCH",
    },
    // The state query fails the same way, but the process table still has the process.
    "name-only-state-unproven": {
      pid: 211,
      command: "(convex-local-ba)\n",
      state: noSuchProcess,
    },
    "linux-name-only": { pid: 201, command: "[MainThread]\n", state: "S" },
    "macos-name-only": { pid: 202, command: "(convex-local-ba)\n", state: "S" },
    "linux-zombie": {
      pid: 203,
      command: "[convex-local-ba] <defunct>\n",
      state: "Z",
    },
    "macos-zombie": { pid: 204, command: "<defunct>\n", state: "Z" },
    "name-only-zombie": {
      pid: 205,
      command: "(convex-local-ba)\n",
      state: "Z",
    },
    "another-program": { pid: 206, command: "node server.js\n", state: "S" },
    "signal-refused": {
      pid: 207,
      command: owned("signal-refused"),
      state: "S",
      killCode: "EPERM",
    },
    "exited-before-signal": {
      pid: 208,
      command: owned("exited-before-signal"),
      state: "S",
      killCode: "ESRCH",
    },
  };
  const byPid = new Map(
    Object.values(cases).map((entry) => [entry.pid, entry]),
  );
  vi.mocked(execFileSync).mockImplementation((_file, args) => {
    const list = args as string[];
    const entry = byPid.get(Number(list[list.indexOf("-p") + 1]))!;
    if (!list.includes("state=")) return entry.command as never;
    return (
      typeof entry.state === "string" ? entry.state : entry.state()
    ) as never;
  });
  const kill = vi.spyOn(process, "kill").mockImplementation((pid) => {
    const code = byPid.get(pid)?.killCode;
    if (code !== undefined)
      throw Object.assign(new Error(`kill ${code}`), { code });
    return true;
  });
  try {
    for (const [name, { pid }] of Object.entries(cases)) {
      const storage = join(directory, name);
      await mkdir(join(storage, "storage"), { recursive: true });
      publishOwnership(storage, pid, instanceName);
    }
    let failure: Error | undefined;
    try {
      sweep(directory);
    } catch (error) {
      failure = error as Error;
    }
    const kept = [
      "linux-name-only",
      "macos-name-only",
      "signal-refused",
      "empty-answer",
      "name-only-state-unproven",
    ];
    expect(failure).toBeInstanceOf(Error);
    for (const name of kept) {
      expect(failure!.message).toContain(join(directory, name));
      expect((await stat(join(directory, name, "pid"))).isFile()).toBe(true);
    }
    expect(failure!.message).not.toContain("--instance-name");
    for (const name of Object.keys(cases).filter(
      (name) => !kept.includes(name),
    ))
      await expect(stat(join(directory, name))).rejects.toThrow();
  } finally {
    kill.mockRestore();
    vi.mocked(execFileSync).mockReset();
    await rm(directory, { recursive: true, force: true });
  }
});

// What the global setup and the reporter do for one native run: the setup opens the run, the
// reporter writes its record and hands the path over.
async function reportedRun(records: string) {
  const run = openRunRecord();
  const reporter = new EvidenceReporter({ directory: records });
  reporter.onTestRunStart([{ project: { name: "native" } }] as never);
  const before = new Set(await readdir(records));
  await reporter.onTestRunEnd([] as never, [] as never, "passed" as never);
  const [name] = (await readdir(records)).filter((entry) => !before.has(entry));
  return { run, path: join(records, name!) };
}
async function readRecord(path: string): Promise<NativeRunRecord> {
  return JSON.parse(await readFile(path, "utf8")) as NativeRunRecord;
}

test("pure: a failed final sweep fails its own run's record, through the reporter's hand-over, and no other run's", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-final-sweep-"));
  const records = await mkdtemp(join(tmpdir(), "libar-final-sweep-records-"));
  vi.mocked(execFileSync).mockImplementation(() => {
    throw Object.assign(new Error("spawnSync ps ENOENT"), { code: "ENOENT" });
  });
  async function uninspectable(name: string): Promise<string> {
    const root = join(directory, name);
    await mkdir(join(root, "backend", "storage"), { recursive: true });
    publishOwnership(
      join(root, "backend"),
      301,
      "libar-00000000-0000-0000-0000-000000000001",
    );
    return root;
  }
  function failureOf(action: () => void): Error | undefined {
    try {
      action();
    } catch (error) {
      return error as Error;
    }
    return undefined;
  }
  try {
    // Run A: its sweep fails after its record was written.
    const a = await reportedRun(records);
    const passed = await readRecord(a.path);
    expect(passed.result).toBe("passed");
    const rootA = await uninspectable("a");
    const failureA = failureOf(() => finalSweep(rootA, a.run));
    expect(failureA).toBeInstanceOf(Error);
    expect(await readRecord(a.path)).toEqual({
      ...passed,
      result: "failed",
      unhandledErrors: [failureA!.message],
    });
    // A's exit handler finds A's cleanup done.
    expect(failureOf(() => finalSweep(rootA, a.run))).toBeUndefined();
    // Run B in the same process passes, and A's cleanup does not act again.
    const b = await reportedRun(records);
    const clean = join(directory, "b");
    await mkdir(clean);
    finalSweep(clean, b.run);
    expect(failureOf(() => finalSweep(rootA, a.run))).toBeUndefined();
    expect((await readRecord(b.path)).result).toBe("passed");
    // Run C's sweep fails before its record was written: it amends nothing.
    const c = openRunRecord();
    const rootC = await uninspectable("c");
    expect(failureOf(() => finalSweep(rootC, c))).toBeInstanceOf(Error);
    expect((await readRecord(b.path)).result).toBe("passed");
    expect((await readRecord(a.path)).unhandledErrors).toEqual([
      failureA!.message,
    ]);
    // Amending twice with the same error stores it once.
    failRunRecord(a.run, failureA!.message);
    expect((await readRecord(a.path)).unhandledErrors).toEqual([
      failureA!.message,
    ]);
  } finally {
    vi.mocked(execFileSync).mockReset();
    await rm(directory, { recursive: true, force: true });
    await rm(records, { recursive: true, force: true });
  }
});
