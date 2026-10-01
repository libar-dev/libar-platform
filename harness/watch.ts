// The watch mode behind `npm run dev`: one disposable backend, `convex dev` bound to it in one
// composition's project directory, until an interrupt or until the CLI exits. scripts/dev.mjs
// supplies the real steps; the pure tests supply their own.
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { convexCli } from "./admin.js";
import type { CliCall } from "./admin.js";
import type { Backend, StartOptions } from "./backend.js";
import { redact } from "./child.js";
import type { Composition } from "./composition.js";
import type { Executable } from "./executable.js";
import type { FixtureIssuer } from "./identity.js";

export type StopSignal = "SIGINT" | "SIGTERM";
// The reason an interrupted watch aborts with.
export class Interrupt extends Error {
  readonly signal: StopSignal;
  constructor(signal: StopSignal) {
    super(`Interrupted by ${signal}`);
    this.signal = signal;
  }
}
export const exitCodes: Record<StopSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

// Copies a stream to a destination line by line with the secrets removed. A secret split across
// chunks is whole by the time its line is complete, and the last line is copied when the stream
// ends, with or without a newline.
export function relay(
  stream: Readable,
  destination: Writable,
  secrets: readonly string[],
): Promise<void> {
  return new Promise((done) => {
    createInterface({ input: stream, crlfDelay: Infinity })
      .on("line", (line) => destination.write(`${redact(line, secrets)}\n`))
      .once("close", () => done());
  });
}

// convex dev, given --url and --admin-key, writes CONVEX_URL and CONVEX_SITE_URL lines to
// .env.local. A file is that file only when every non-empty line is one of those two lines naming
// this run's backend. An empty file names no backend and is not that file.
export function writtenForBackend(
  content: string,
  backend: { url: string; siteUrl: string },
): boolean {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        line === `CONVEX_URL=${backend.url}` ||
        line === `CONVEX_SITE_URL=${backend.siteUrl}`,
    )
  );
}

// Removes the env file when the CLI was spawned and the file is the one it wrote for this backend.
// Any other file stays, and so does a file that was there before the CLI was spawned.
export async function settleEnvFile(
  path: string,
  run: { spawned: boolean; url: string; siteUrl: string | undefined },
): Promise<"absent" | "removed" | "kept"> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
  if (
    !run.spawned ||
    run.siteUrl === undefined ||
    !writtenForBackend(content, { url: run.url, siteUrl: run.siteUrl })
  )
    return "kept";
  await rm(path, { force: true });
  return "removed";
}

export interface WatchSteps {
  resolveExecutable(signal: AbortSignal): Promise<Executable>;
  createFixtureIssuer(): Promise<FixtureIssuer>;
  startBackend(
    options: StartOptions,
  ): Promise<Pick<Backend, "url" | "adminKey" | "dispose">>;
  // The site URL the backend reports, which convex dev writes beside its URL.
  siteUrl(
    backend: { url: string; adminKey: string },
    signal: AbortSignal,
  ): Promise<string>;
  makeHome(): Promise<string>;
  removeHome(home: string): Promise<void>;
  spawn(call: CliCall): ChildProcess;
}
export interface WatchOptions {
  // The composition convex dev watches. It runs in that composition's project directory, where it
  // writes envFile.
  composition: Composition;
  envFile: string;
  signal: AbortSignal;
  steps: WatchSteps;
  stdout: Writable;
  stderr: Writable;
  // How long the CLI has to exit after SIGINT before it is killed.
  stopGraceMs?: number;
}

function ended(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}
function exitOf(child: ChildProcess): Promise<void> {
  if (ended(child)) return Promise.resolve();
  return new Promise((done) => {
    child.once("exit", () => done());
    child.once("error", () => done());
  });
}
function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((done) =>
    signal.addEventListener("abort", () => done(), { once: true }),
  );
}
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    work,
    aborted(signal).then(() => {
      throw signal.reason as Error;
    }),
  ]);
}
function within(work: Promise<void>, ms: number): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, ms);
    void work.then(() => {
      clearTimeout(timer);
      done();
    });
  });
}

// Runs the watch and returns the exit code. Every phase observes the signal. Whatever ends the run,
// each cleanup step is tried, and the run ends with one line saying why it ended.
export async function watch(options: WatchOptions): Promise<number> {
  const { envFile, signal, steps } = options;
  const say = (line: string) => options.stderr.write(`npm run dev: ${line}\n`);
  const refusal = `${envFile} exists. convex dev would write this backend's URL into it. Move it away and run again.`;
  if (existsSync(envFile)) {
    say(refusal);
    return 1;
  }
  let backend: Pick<Backend, "url" | "adminKey" | "dispose"> | undefined;
  let home: string | undefined;
  let homeCreation: Promise<string> | undefined;
  let siteUrl: string | undefined;
  let child: ChildProcess | undefined;
  const relays: Promise<void>[] = [];
  const secrets: string[] = [];
  let failure: string | undefined;
  try {
    const executable = await steps.resolveExecutable(signal);
    const issuer = await untilAborted(steps.createFixtureIssuer(), signal);
    backend = await steps.startBackend({ executable, issuer, signal });
    secrets.push(backend.adminKey);
    homeCreation = steps.makeHome();
    home = await untilAborted(homeCreation, signal);
    siteUrl = await untilAborted(steps.siteUrl(backend, signal), signal);
    signal.throwIfAborted();
    options.stdout.write(
      `npm run dev: backend ready at ${backend.url}. Press Ctrl-C to stop.\n`,
    );
    // A file that appeared while the backend started is the developer's, as at the start.
    if (existsSync(envFile)) throw new Error(refusal);
    signal.throwIfAborted();
    child = steps.spawn(
      convexCli(
        {
          url: backend.url,
          adminKey: backend.adminKey,
          home,
          composition: options.composition,
        },
        "dev",
      ),
    );
    let spawnError: Error | undefined;
    child.once("error", (error) => (spawnError = error));
    if (child.stdout !== null)
      relays.push(relay(child.stdout, options.stdout, secrets));
    if (child.stderr !== null)
      relays.push(relay(child.stderr, options.stderr, secrets));
    await Promise.race([exitOf(child), aborted(signal)]);
    if (!signal.aborted)
      failure =
        spawnError !== undefined
          ? `convex dev could not start: ${spawnError.message}`
          : `convex dev exited with ${child.exitCode === null ? `signal ${child.signalCode}` : `code ${child.exitCode}`}`;
  } catch (error) {
    if (!signal.aborted) failure = (error as Error).message;
  }
  const problems: string[] = [];
  async function step(name: string, action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      problems.push(`${name}: ${(error as Error).message}`);
    }
  }
  const cli = child;
  await step("stopping convex dev", async () => {
    if (cli === undefined || ended(cli)) return;
    cli.kill("SIGINT");
    const timer = setTimeout(
      () => cli.kill("SIGKILL"),
      options.stopGraceMs ?? 5000,
    );
    await exitOf(cli);
    clearTimeout(timer);
  });
  // The relays get a grace period for the CLI's last lines. Then its streams are let go of, so a
  // descendant that keeps the other ends open cannot keep this process alive.
  await within(Promise.all(relays).then(), 1000);
  cli?.stdout?.destroy();
  cli?.stderr?.destroy();
  await step("removing the backend", async () => backend?.dispose());
  const madeHome = home;
  const creation = homeCreation;
  await step("removing the CLI home", async () => {
    // A creation the interrupt cut short still makes its directory, so it is awaited.
    const made = madeHome ?? (await creation?.catch(() => undefined));
    if (made !== undefined) await steps.removeHome(made);
  });
  const url = backend?.url ?? "";
  await step("settling .env.local", async () => {
    const outcome = await settleEnvFile(envFile, {
      spawned: cli !== undefined,
      url,
      siteUrl,
    });
    if (outcome === "kept")
      say(
        `left ${envFile} in place: it is not the file convex dev wrote for this backend.`,
      );
  });
  if (problems.length > 0) {
    say(`cleanup failed: ${redact(problems.join("; "), secrets)}`);
    return 1;
  }
  if (failure !== undefined) {
    say(redact(failure, secrets));
    return 1;
  }
  if (signal.aborted) {
    const reason = signal.reason as unknown;
    const stopSignal = reason instanceof Interrupt ? reason.signal : "SIGINT";
    say(`stopped by ${stopSignal}.`);
    return exitCodes[stopSignal];
  }
  return 0;
}
