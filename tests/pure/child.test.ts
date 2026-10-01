import { ChildProcess } from "node:child_process";
import { getEventListeners } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, onTestFinished, test, vi } from "vitest";
import { redact, redactedBuffer, runChild } from "../../harness/child.js";
const secret = "0123456789abcdef-instance-secret";
test("pure: a failed child's error holds its exit code and its output, and neither its arguments nor a secret", async () => {
  const error: unknown = await runChild(
    "the child",
    process.execPath,
    [
      "-e",
      "console.error('refused ' + process.argv[1]); process.exit(3)",
      secret,
    ],
    { timeoutMs: 10000, secrets: [secret] },
  ).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Error);
  const seen = JSON.stringify(
    Object.getOwnPropertyNames(error).map((name) => [
      name,
      String((error as Record<string, unknown>)[name]),
    ]),
  );
  expect(seen).toContain("the child failed with exit code 3");
  expect(seen).toContain("refused [redacted]");
  expect(seen).not.toContain(secret);
  expect(seen).not.toContain("process.exit");
});
test("pure: a child that outlives its deadline is killed and reported", async () => {
  await expect(
    runChild(
      "the slow child",
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { timeoutMs: 300 },
    ),
  ).rejects.toThrow("the slow child did not finish in 300 ms");
});
test("pure: a child that cannot start is reported without its arguments", async () => {
  await expect(
    runChild("the missing child", "/no/such/executable", [secret], {
      timeoutMs: 1000,
    }),
  ).rejects.toThrow("the missing child could not start: ENOENT");
});
test("pure: redact replaces every occurrence of every secret", () => {
  expect(redact("a KEY b KEY c OTHER", ["KEY", "OTHER"])).toBe(
    "a [redacted] b [redacted] c [redacted]",
  );
});

test("pure: redaction precedes the child error's truncation", async () => {
  const key = "REVIEW_DUMMY_SECRET_0123456789abcdef";
  const error = await runChild(
    "synthetic child",
    process.execPath,
    [
      "-e",
      "process.stderr.write(process.argv[1] + 'x'.repeat(3990)); process.exit(1)",
      key,
    ],
    { timeoutMs: 10000, secrets: [key] },
  ).catch((error: Error) => error);
  expect(String(error)).not.toContain("6789abcdef");
  expect(String(error)).toContain("redacted]");
});

test("pure: a failed child redacts a split stderr secret with stdout between its halves", async () => {
  const key = "DUMMYSECRET0123456789abcdef";
  const error = await runChild(
    "interleaved child",
    process.execPath,
    [
      "-e",
      "process.stderr.write(process.argv[1].slice(0, 13), () => process.stdout.write('status ok\\n', () => process.stderr.write(process.argv[1].slice(13), () => process.exit(1))))",
      key,
    ],
    { timeoutMs: 10000, secrets: [key] },
  ).catch((error: Error) => error);
  expect(String(error)).toBe(
    "Error: interleaved child failed with exit code 1: [redacted]",
  );
});

const overlappingSecrets = ["DUMMY", "DUMMYSECRET0123456789abcdef"];
for (const secrets of [overlappingSecrets, [...overlappingSecrets].reverse()]) {
  test(`pure: redaction chooses the longest secret with ${secrets[0]} configured first`, () => {
    const text = `${overlappingSecrets[1]} DUMMY ${overlappingSecrets[1]}`;
    expect(redact(text, [...secrets, ""])).toBe(
      "[redacted] [redacted] [redacted]",
    );
    const whole = redactedBuffer([...secrets, ""], 1000);
    whole.append(text);
    // A trailing delimiter resolves any prefix still held by the buffer.
    whole.append("!");
    expect(whole.text()).toBe("[redacted] [redacted] [redacted]!");
    for (let split = 1; split < overlappingSecrets[1]!.length; split++) {
      const buffer = redactedBuffer(secrets, 1000);
      buffer.append(overlappingSecrets[1]!.slice(0, split));
      expect(buffer.text()).toBe("");
      buffer.append(overlappingSecrets[1]!.slice(split) + "!");
      expect(buffer.text()).toBe("[redacted]!");
    }
    const shorter = redactedBuffer(secrets, 1000);
    shorter.append("DUMMY");
    expect(shorter.text()).toBe("");
    shorter.append("!");
    expect(shorter.text()).toBe("[redacted]!");
  });
}

test("pure: aborting the caller's signal rejects with its reason and kills the child", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-child-abort-"));
  const pidFile = join(directory, "pid");
  const controller = new AbortController();
  let pid: number | undefined;
  onTestFinished(async () => {
    controller.abort();
    if (pid !== undefined) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  const result = runChild(
    "the aborted child",
    process.execPath,
    [
      "-e",
      "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)",
      pidFile,
    ],
    { timeoutMs: 10000, signal: controller.signal },
  ).then(
    () => undefined,
    (error: unknown) => error,
  );
  const readyDeadline = Date.now() + 2000;
  while (pid === undefined && Date.now() < readyDeadline) {
    const contents = await readFile(pidFile, "utf8").catch(() => "");
    if (/^\d+$/.test(contents)) pid = Number(contents);
    else await delay(10);
  }
  expect(pid).toBeDefined();
  const reason = new Error("caller stopped the child");
  controller.abort(reason);
  const deadline = Symbol("abort deadline");
  expect(await Promise.race([result, delay(2000, deadline)])).toBe(reason);
  // The abort callback can precede the operating system reaping the child.
  let gone = false;
  const exitDeadline = Date.now() + 2000;
  while (!gone && Date.now() < exitDeadline) {
    try {
      process.kill(pid!, 0);
      await delay(10);
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ESRCH");
      gone = true;
    }
  }
  expect(gone).toBe(true);
});

test("pure: aborting the caller's signal ends a child that handles SIGTERM, by SIGKILL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-child-abort-term-"));
  const pidFile = join(directory, "pid");
  const controller = new AbortController();
  let pid: number | undefined;
  onTestFinished(async () => {
    if (pid !== undefined) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  const result = runChild(
    "the child that handles SIGTERM",
    process.execPath,
    [
      "-e",
      // Only SIGKILL ends it: it handles SIGTERM and SIGINT and keeps running.
      "process.on('SIGTERM', () => {}); process.on('SIGINT', () => {}); require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)",
      pidFile,
    ],
    { timeoutMs: 10000, signal: controller.signal },
  ).then(
    () => undefined,
    (error: unknown) => error,
  );
  const readyDeadline = Date.now() + 2000;
  while (pid === undefined && Date.now() < readyDeadline) {
    const contents = await readFile(pidFile, "utf8").catch(() => "");
    if (/^\d+$/.test(contents)) pid = Number(contents);
    else await delay(10);
  }
  expect(pid).toBeDefined();
  const reason = new Error("caller stopped the child");
  controller.abort(reason);
  expect(await result).toBe(reason);
  let gone = false;
  const exitDeadline = Date.now() + 2000;
  while (!gone && Date.now() < exitDeadline) {
    try {
      process.kill(pid!, 0);
      await delay(10);
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ESRCH");
      gone = true;
    }
  }
  expect(gone).toBe(true);
});

test("pure: three configured secrets, one a prefix of another, are all removed", () => {
  const secrets = ["SECRET-A", "SECRET-A-LONGER", "OTHER-SECRET-B"];
  const text =
    "one SECRET-A-LONGER two SECRET-A three OTHER-SECRET-B four SECRET-A-LONGERx";
  const expected =
    "one [redacted] two [redacted] three [redacted] four [redacted]x";
  for (const order of [secrets, [...secrets].reverse()]) {
    expect(redact(text, order)).toBe(expected);
    const buffer = redactedBuffer(order, 1000);
    for (const character of text) buffer.append(character);
    buffer.append("\n");
    expect(buffer.text()).toBe(`${expected}\n`);
  }
});

test("pure: a signal already aborted at the call ends a child that would survive SIGTERM, by SIGKILL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-child-pre-abort-"));
  const readyFile = join(directory, "ready");
  const spawned = vi.spyOn(
    // Node's declarations leave this internal method out.
    ChildProcess.prototype as unknown as { spawn(options: object): void },
    "spawn",
  );
  const started: { pid: number | undefined } = { pid: undefined };
  onTestFinished(async () => {
    spawned.mockRestore();
    if (started.pid !== undefined)
      try {
        process.kill(started.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    await rm(directory, { recursive: true, force: true });
  });
  const controller = new AbortController();
  const reason = new Error("stopped before the call");
  controller.abort(reason);
  const result = runChild(
    "the child that handles SIGTERM",
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.argv[1], ''); setInterval(() => {}, 1000)",
      readyFile,
    ],
    { timeoutMs: 10000, signal: controller.signal },
  ).then(
    () => undefined,
    (error: unknown) => error,
  );
  const pid = (spawned.mock.contexts[0] as ChildProcess | undefined)?.pid;
  started.pid = pid;
  expect(pid).toBeDefined();
  // Node sends its SIGTERM on the next tick. Hold this thread until the child handles SIGTERM, so
  // only an immediate SIGKILL can end it; a child killed at once never gets ready.
  const wait = new Int32Array(new SharedArrayBuffer(4));
  const readyDeadline = Date.now() + 1500;
  while (!existsSync(readyFile) && Date.now() < readyDeadline)
    Atomics.wait(wait, 0, 0, 10);
  expect(await result).toBe(reason);
  let gone = false;
  const exitDeadline = Date.now() + 2000;
  while (!gone && Date.now() < exitDeadline) {
    try {
      process.kill(pid!, 0);
      await delay(10);
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ESRCH");
      gone = true;
    }
  }
  expect(gone).toBe(true);
});

test("pure: runChild removes its abort listener when the child exits", async () => {
  const controller = new AbortController();
  await runChild("the quick child", process.execPath, ["-e", ""], {
    timeoutMs: 10000,
    signal: controller.signal,
  });
  expect(getEventListeners(controller.signal, "abort")).toEqual([]);
});
