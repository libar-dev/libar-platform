import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, vi } from "vitest";
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFileSync: vi.fn(),
}));
import { sweep } from "../../harness/native-run.js";
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
      throw new Error("already gone");
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
