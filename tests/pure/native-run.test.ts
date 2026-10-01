import { spawn } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { sweep } from "../../harness/native-run.js";
test("pure: the sweep kills every process a run directory names and removes the directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-sweep-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  const exited = new Promise<NodeJS.Signals | null>((done) =>
    child.once("exit", (_code, signal) => done(signal)),
  );
  await mkdir(join(directory, "backend-one"));
  await writeFile(join(directory, "backend-one", "pid"), String(child.pid));
  await mkdir(join(directory, "backend-two"));
  sweep(directory);
  expect(await exited).toBe("SIGKILL");
  await expect(stat(directory)).rejects.toThrow();
  // A second sweep of a directory that is gone does nothing.
  sweep(directory);
});
