import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { expect, inject, onTestFinished, test } from "vitest";
import { fixtureBackend } from "../../harness/native.js";
import { sweep } from "../../harness/native-run.js";
import { waitUntil } from "../../harness/wait.js";
// Binds this file to the harness Spec, whose rules it checks directly.
const anchor = specTest({
  id: testAnchorId("test:platform.native-harness.sweep"),
  verifies: ref("spec:platform.native-harness"),
});
void anchor;

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

// From review U, finding F2, with its assertions as written; the cleanup is this file's own.
test("native review: failed inspection must not silently discard ownership", async () => {
  const parent = await mkdtemp(
    join(inject("nativeRun").directory, "review-inspection-"),
  );
  // With ps on the PATH again, this sweep kills the kept backend and removes the directory, in
  // either order with the backend's own disposal.
  onTestFinished(() => sweep(parent));
  await fixtureBackend({ parentDirectory: parent, deploy: false });

  const [entry] = await readdir(parent);
  const { pid } = JSON.parse(
    await readFile(join(parent, entry!, "pid"), "utf8"),
  ) as { pid: number };

  const previousPath = process.env.PATH;
  let failure: unknown;
  try {
    process.env.PATH = join(parent, "no-executables");
    try {
      sweep(parent);
    } catch (error) {
      failure = error;
    }
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }

  expect(process.kill(pid, 0)).toBe(true);
  expect(failure).toBeInstanceOf(Error);
  expect((await stat(parent)).isDirectory()).toBe(true);
  // This file's additions: the record is kept and the error names it without a command line.
  expect((await stat(join(parent, entry!, "pid"))).isFile()).toBe(true);
  expect((failure as Error).message).toContain(join(parent, entry!));
  expect((failure as Error).message).not.toContain("--instance-secret");
});
