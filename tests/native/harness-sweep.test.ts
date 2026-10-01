import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { expect, inject, onTestFinished, test } from "vitest";
import { fixtureBackend } from "../../harness/native.js";
import { sweep } from "../../harness/native-run.js";
import { waitUntil } from "../../harness/wait.js";

test("native: the parent sweep verifies and kills two real owned backend processes", async () => {
  const parent = await mkdtemp(join(inject("nativeRun").directory, "sweep-"));
  onTestFinished(() => rm(parent, { recursive: true, force: true }));
  await fixtureBackend({ parentDirectory: parent, deploy: false });
  await fixtureBackend({ parentDirectory: parent, deploy: false });
  const directories = await readdir(parent);
  expect(directories).toHaveLength(2);
  const pids = await Promise.all(
    directories.map(async (directory) => {
      const record = JSON.parse(
        await readFile(join(parent, directory, "pid"), "utf8"),
      ) as { pid: number };
      expect(Number.isSafeInteger(record.pid) && record.pid > 0).toBe(true);
      return record.pid;
    }),
  );
  sweep(parent);
  await waitUntil("both swept backend processes to exit", () =>
    pids.every((pid) => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    }),
  );
  await expect(stat(parent)).rejects.toThrow();
});
