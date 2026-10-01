import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { expect, onTestFinished, test, vi } from "vitest";
import type { CliCall } from "../../harness/admin.js";
import type { Executable } from "../../harness/executable.js";
import type { FixtureIssuer } from "../../harness/identity.js";
import {
  Interrupt,
  relay,
  settleEnvFile,
  watch,
  writtenForBackend,
} from "../../harness/watch.js";
import type { WatchSteps } from "../../harness/watch.js";

const secret = "SYNTHETIC-ADMIN-KEY-0123456789abcdef";
const url = "http://127.0.0.1:61037";
const siteUrl = "http://127.0.0.1:61038";
const written = `CONVEX_URL=${url}\n\nCONVEX_SITE_URL=${siteUrl}\n`;

async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "libar-watch-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function collector(onText: (text: string) => void = () => undefined) {
  let text = "";
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      text += chunk.toString();
      onText(text);
      done();
    },
  });
  return { stream, text: () => text };
}
async function exists(path: string): Promise<boolean> {
  return readFile(path).then(
    () => true,
    () => false,
  );
}

test("pure: the relay removes a secret split across chunks and on a last line with no newline", async () => {
  const input = new PassThrough();
  const output = collector();
  const relayed = relay(input, output.stream, [secret]);
  input.write(`first ${secret.slice(0, 7)}`);
  input.write(`${secret.slice(7, 20)}`);
  input.write(`${secret.slice(20)} done\nlast ${secret.slice(0, 30)}`);
  input.end(secret.slice(30));
  await relayed;
  expect(output.text()).toBe("first [redacted] done\nlast [redacted]\n");
  expect(output.text()).not.toContain(secret.slice(0, 12));
});

test("pure: .env.local is convex dev's file only when every non-empty line names this run's backend", () => {
  const backend = { url, siteUrl };
  expect(writtenForBackend(written, backend)).toBe(true);
  expect(writtenForBackend(written.replaceAll("\n", "\r\n"), backend)).toBe(
    true,
  );
  expect(writtenForBackend(`CONVEX_URL=${url}\n`, backend)).toBe(true);
  expect(writtenForBackend("", backend)).toBe(false);
  expect(writtenForBackend("\n\n", backend)).toBe(false);
  expect(writtenForBackend(`${written}DEVELOPER_OWNED=1\n`, backend)).toBe(
    false,
  );
  expect(
    writtenForBackend(written.replace(url, "http://127.0.0.1:9"), backend),
  ).toBe(false);
  expect(
    writtenForBackend(written.replace(siteUrl, "http://127.0.0.1:9"), backend),
  ).toBe(false);
  expect(writtenForBackend(`CONVEX_URL=${url} # a note\n`, backend)).toBe(
    false,
  );
});

test("pure: settling .env.local removes only the file the spawned CLI wrote for this backend", async () => {
  const directory = await scratch();
  const path = join(directory, ".env.local");
  const run = { spawned: true, url, siteUrl };
  expect(await settleEnvFile(path, run)).toBe("absent");
  await writeFile(path, written);
  expect(await settleEnvFile(path, { ...run, spawned: false })).toBe("kept");
  expect(await settleEnvFile(path, { ...run, siteUrl: undefined })).toBe(
    "kept",
  );
  expect(await readFile(path, "utf8")).toBe(written);
  await writeFile(path, "DEVELOPER_OWNED=1\n");
  expect(await settleEnvFile(path, run)).toBe("kept");
  expect(await readFile(path, "utf8")).toBe("DEVELOPER_OWNED=1\n");
  await writeFile(path, written);
  expect(await settleEnvFile(path, run)).toBe("removed");
  expect(await exists(path)).toBe(false);
});

// A stand-in for the convex dev child: it writes .env.local as the CLI does, prints the admin key
// split across chunks, and exits on SIGINT unless it is told to ignore it.
class FakeCli extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new PassThrough();
  stderr = new PassThrough();
  signals: string[] = [];
  ignoreSigint = false;
  // A descendant that inherited the CLI's output keeps the streams open after the CLI exits.
  holdStreams = false;
  killError: Error | undefined;
  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    if (this.killError !== undefined) throw this.killError;
    if (signal === "SIGINT" && this.ignoreSigint) return true;
    this.exit(signal === "SIGINT" ? 130 : null, signal);
    return true;
  }
  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = code === null ? signal : null;
    if (!this.holdStreams) {
      this.stdout.end();
      this.stderr.end();
    }
    this.emit("exit", code, this.signalCode);
  }
}
interface Harness {
  hooks: { onStdout: (text: string) => void };
  envFile: string;
  controller: AbortController;
  steps: WatchSteps;
  calls: string[];
  cli: FakeCli;
  spawnedCalls: CliCall[];
  disposed: () => boolean;
  stdout: ReturnType<typeof collector>;
  stderr: ReturnType<typeof collector>;
  run(): Promise<number>;
}
async function harness(
  overrides: Partial<WatchSteps> = {},
  onSpawn: (cli: FakeCli, envFile: string) => Promise<void> | void = (
    _cli,
    envFile,
  ) => writeFile(envFile, written),
): Promise<Harness> {
  const directory = await scratch();
  const envFile = join(directory, ".env.local");
  const controller = new AbortController();
  const calls: string[] = [];
  const cli = new FakeCli();
  const spawnedCalls: CliCall[] = [];
  let disposed = false;
  const hooks: { onStdout: (text: string) => void } = {
    onStdout: () => undefined,
  };
  const steps: WatchSteps = {
    resolveExecutable: async () => {
      calls.push("resolveExecutable");
      return { path: "/fake" } as Executable;
    },
    createFixtureIssuer: async () => {
      calls.push("createFixtureIssuer");
      return {} as FixtureIssuer;
    },
    startBackend: async () => {
      calls.push("startBackend");
      return {
        url,
        adminKey: secret,
        dispose: async () => {
          calls.push("dispose");
          disposed = true;
        },
      };
    },
    siteUrl: async () => {
      calls.push("siteUrl");
      return siteUrl;
    },
    makeHome: async () => {
      calls.push("makeHome");
      return join(directory, "home");
    },
    removeHome: async () => {
      calls.push("removeHome");
    },
    spawn: (call) => {
      calls.push("spawn");
      spawnedCalls.push(call);
      void onSpawn(cli, envFile);
      setImmediate(() => {
        cli.stdout.write(`pushed with ${secret.slice(0, 10)}`);
        cli.stdout.write(`${secret.slice(10)}\n`);
      });
      return cli as unknown as ChildProcess;
    },
    ...overrides,
  };
  const stdout = collector((text) => hooks.onStdout(text));
  const stderr = collector();
  return {
    hooks,
    envFile,
    controller,
    steps,
    calls,
    cli,
    spawnedCalls,
    disposed: () => disposed,
    stdout,
    stderr,
    run: () =>
      watch({
        envFile,
        signal: controller.signal,
        steps,
        stdout: stdout.stream,
        stderr: stderr.stream,
        stopGraceMs: 50,
      }),
  };
}
// One line of our own, no stack trace and no secret.
function expectOneLine(text: string, line: string) {
  expect(text).toBe(`npm run dev: ${line}\n`);
}
function waitFor(condition: () => boolean): Promise<void> {
  return vi.waitFor(() => expect(condition()).toBe(true), { timeout: 2000 });
}

test.each([
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const)(
  "pure: %s during executable resolution ends with exit code %i, one line, and the resolution told to stop",
  async (signal, code) => {
    let seen: AbortSignal | undefined;
    const run = await harness({
      resolveExecutable: (stop) => {
        seen = stop;
        return new Promise((_done, fail) =>
          stop.addEventListener("abort", () => fail(stop.reason as Error)),
        );
      },
    });
    const running = run.run();
    await waitFor(() => seen !== undefined);
    run.controller.abort(new Interrupt(signal));
    expect(await running).toBe(code);
    expect(seen?.aborted).toBe(true);
    expectOneLine(run.stderr.text(), `stopped by ${signal}.`);
    expect(run.calls).not.toContain("startBackend");
  },
);

test("pure: SIGTERM while the backend starts ends with exit code 143 after cleanup", async () => {
  const run = await harness({
    startBackend: (options) =>
      new Promise((_done, fail) =>
        options.signal?.addEventListener("abort", () =>
          fail(options.signal?.reason as Error),
        ),
      ),
  });
  const running = run.run();
  await waitFor(() => run.calls.includes("createFixtureIssuer"));
  run.controller.abort(new Interrupt("SIGTERM"));
  expect(await running).toBe(143);
  expectOneLine(run.stderr.text(), "stopped by SIGTERM.");
});

test("pure: SIGINT just before ready ends with exit code 130, no CLI, the backend and home removed", async () => {
  const controller = { abort: () => undefined as void };
  const run = await harness({
    siteUrl: async () => {
      controller.abort();
      return siteUrl;
    },
  });
  controller.abort = () => run.controller.abort(new Interrupt("SIGINT"));
  expect(await run.run()).toBe(130);
  expect(run.calls).not.toContain("spawn");
  expect(run.disposed()).toBe(true);
  expect(run.calls).toContain("removeHome");
  expectOneLine(run.stderr.text(), "stopped by SIGINT.");
});

test("pure: SIGINT between the ready line and the spawn ends with exit code 130 and no CLI", async () => {
  const run = await harness();
  run.hooks.onStdout = (text) => {
    if (text.includes("backend ready"))
      run.controller.abort(new Interrupt("SIGINT"));
  };
  expect(await run.run()).toBe(130);
  expect(run.calls).not.toContain("spawn");
  expect(run.disposed()).toBe(true);
  expectOneLine(run.stderr.text(), "stopped by SIGINT.");
});

test("pure: SIGINT while the CLI runs stops it, removes the .env.local it wrote, and prints the ready line once and no secret", async () => {
  const run = await harness();
  const running = run.run();
  await waitFor(() => run.stdout.text().includes("pushed with"));
  expect(await exists(run.envFile)).toBe(true);
  run.controller.abort(new Interrupt("SIGINT"));
  expect(await running).toBe(130);
  expect(run.cli.signals).toEqual(["SIGINT"]);
  expect(await exists(run.envFile)).toBe(false);
  expect(run.disposed()).toBe(true);
  expect(run.stdout.text()).toBe(
    `npm run dev: backend ready at ${url}. Press Ctrl-C to stop.\npushed with [redacted]\n`,
  );
  expect(run.spawnedCalls[0]?.args.slice(-4)).toEqual([
    "--url",
    url,
    "--admin-key",
    secret,
  ]);
  expectOneLine(run.stderr.text(), "stopped by SIGINT.");
});

test("pure: a CLI that ignores SIGINT is killed after the grace period", async () => {
  const run = await harness();
  run.cli.ignoreSigint = true;
  const running = run.run();
  await waitFor(() => run.calls.includes("spawn"));
  run.controller.abort(new Interrupt("SIGINT"));
  expect(await running).toBe(130);
  expect(run.cli.signals).toEqual(["SIGINT", "SIGKILL"]);
});

test("pure: a .env.local the developer edited during the run stays, with one line saying so", async () => {
  const run = await harness();
  const running = run.run();
  await waitFor(() => run.stdout.text().includes("pushed with"));
  await writeFile(run.envFile, "DEVELOPER_OWNED=1\n");
  run.controller.abort(new Interrupt("SIGINT"));
  expect(await running).toBe(130);
  expect(await readFile(run.envFile, "utf8")).toBe("DEVELOPER_OWNED=1\n");
  expect(run.stderr.text()).toBe(
    `npm run dev: left ${run.envFile} in place: it is not the file convex dev wrote for this backend.\nnpm run dev: stopped by SIGINT.\n`,
  );
});

test("pure: a .env.local that appears before the CLI is spawned is never removed, and no CLI starts", async () => {
  let envFile = "";
  const run = await harness({
    startBackend: async () => {
      // Exactly what convex dev would write, so only the timing makes it the developer's.
      await writeFile(envFile, written);
      return { url, adminKey: secret, dispose: async () => undefined };
    },
  });
  envFile = run.envFile;
  expect(await run.run()).toBe(1);
  expect(run.calls).not.toContain("spawn");
  expect(await readFile(run.envFile, "utf8")).toBe(written);
  expect(run.stderr.text()).toContain("left");
  expect(run.stderr.text()).toContain("exists. convex dev would write");
});

test("pure: a .env.local present at the start refuses the run before anything starts", async () => {
  const run = await harness();
  await writeFile(run.envFile, "MINE=1\n");
  expect(await run.run()).toBe(1);
  expect(run.calls).toEqual([]);
  expect(await readFile(run.envFile, "utf8")).toBe("MINE=1\n");
});

test("pure: every cleanup step runs when earlier ones fail, and the failures are reported together with exit code 1", async () => {
  const run = await harness({
    startBackend: async () => ({
      url,
      adminKey: secret,
      dispose: async () => {
        throw new Error(`dispose failed near ${secret}`);
      },
    }),
    removeHome: async () => {
      throw new Error("home is busy");
    },
  });
  const running = run.run();
  await waitFor(() => run.stdout.text().includes("pushed with"));
  run.controller.abort(new Interrupt("SIGINT"));
  expect(await running).toBe(1);
  expect(run.cli.signals).toEqual(["SIGINT"]);
  // The step after both failures still ran.
  expect(await exists(run.envFile)).toBe(false);
  expectOneLine(
    run.stderr.text(),
    "cleanup failed: removing the backend: dispose failed near [redacted]; removing the CLI home: home is busy",
  );
});

test("pure: a CLI that exits by itself ends the run with exit code 1 and one line", async () => {
  const run = await harness({}, (cli, envFile) => {
    void writeFile(envFile, written).then(() => cli.exit(1));
  });
  expect(await run.run()).toBe(1);
  expect(run.disposed()).toBe(true);
  expect(await exists(run.envFile)).toBe(false);
  expectOneLine(run.stderr.text(), "convex dev exited with code 1");
});

test("pure: a startup failure that is not an interrupt ends with exit code 1 and its message, without the secret", async () => {
  const run = await harness({
    siteUrl: async () => {
      throw new Error(`site URL read failed for ${secret}`);
    },
  });
  expect(await run.run()).toBe(1);
  expect(run.disposed()).toBe(true);
  expectOneLine(run.stderr.text(), "site URL read failed for [redacted]");
});

test("pure: a .env.local with a comment line beside the CLI's lines is the developer's and stays", async () => {
  const commented = `# my notes\n${written}`;
  expect(writtenForBackend(commented, { url, siteUrl })).toBe(false);
  const directory = await scratch();
  const path = join(directory, ".env.local");
  await writeFile(path, commented);
  expect(await settleEnvFile(path, { spawned: true, url, siteUrl })).toBe(
    "kept",
  );
  expect(await readFile(path, "utf8")).toBe(commented);
});

test("pure: an interrupt while the CLI home is being made still removes the home", async () => {
  const parent = await scratch();
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  let made: string | undefined;
  const run = await harness({
    makeHome: async () => {
      run.controller.abort(new Interrupt("SIGINT"));
      // The directory appears after the interrupt.
      await new Promise((done) => setTimeout(done, 100));
      made = await actual.mkdtemp(join(parent, "libar-dev-home-"));
      return made;
    },
    removeHome: (home) => actual.rm(home, { recursive: true, force: true }),
  });
  expect(await run.run()).toBe(130);
  expect(made).toBeDefined();
  await expect(actual.stat(made!)).rejects.toThrow();
  expect(await actual.readdir(parent)).toEqual([]);
  expectOneLine(run.stderr.text(), "stopped by SIGINT.");
});

test("pure: after the grace period the CLI's streams are let go of, so a descendant holding them cannot keep the run alive", async () => {
  const run = await harness();
  run.cli.holdStreams = true;
  const running = run.run();
  await waitFor(() => run.stdout.text().includes("pushed with"));
  run.controller.abort(new Interrupt("SIGINT"));
  expect(await running).toBe(130);
  expect(run.cli.stdout.destroyed).toBe(true);
  expect(run.cli.stderr.destroyed).toBe(true);
});

test("pure: a failure of the first cleanup step, stopping the CLI, does not skip the later steps", async () => {
  let removedHome = false;
  const run = await harness({
    removeHome: async () => {
      removedHome = true;
    },
  });
  const running = run.run();
  await waitFor(() => run.stdout.text().includes("pushed with"));
  run.cli.killError = new Error("kill refused");
  run.controller.abort(new Interrupt("SIGINT"));
  expect(await running).toBe(1);
  expect(run.disposed()).toBe(true);
  expect(removedHome).toBe(true);
  expect(await exists(run.envFile)).toBe(false);
  expectOneLine(
    run.stderr.text(),
    "cleanup failed: stopping convex dev: kill refused",
  );
});
