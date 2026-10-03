import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { execFile } from "node:child_process";
import { format } from "node:util";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.child"),
  label: "child processes and redaction",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
export interface ChildOptions {
  timeoutMs: number;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  secrets?: readonly string[];
  signal?: AbortSignal;
  output?: "both";
}
export function redact(text: string, secrets: readonly string[]): string {
  const keys = secrets
    .filter((secret) => secret !== "")
    .sort((a, b) => b.length - a.length);
  let result = "";
  let consumed = 0;
  while (consumed < text.length) {
    const match = keys.find((key) => text.startsWith(key, consumed));
    if (match !== undefined) {
      result += "[redacted]";
      consumed += match.length;
    } else {
      result += text[consumed];
      consumed++;
    }
  }
  return result;
}
// Everything of an error that a reporter or a log can print: its name, message and stack, its own
// properties and its causes.
function printable(error: unknown, depth = 0): string {
  const text = (value: unknown) => {
    try {
      return typeof value === "string" ? value : String(value);
    } catch {
      return "";
    }
  };
  const json = (value: unknown) => {
    try {
      return JSON.stringify(value) ?? "";
    } catch {
      return text(value);
    }
  };
  if (!(error instanceof Error)) return `${text(error)}\n${json(error)}`;
  const parts = [error.name, error.message, error.stack ?? ""];
  for (const [key, value] of Object.entries(error))
    parts.push(key, text(value), json(value));
  if (error.cause !== undefined && depth < 3)
    parts.push(printable(error.cause, depth + 1));
  return parts.join("\n");
}
// An error that carries no secret anywhere it can be printed is returned as it is, so that a caller
// can still tell it by identity. One that carries a secret is replaced by an Error of the same name
// whose message and stack have every secret replaced, and which keeps none of its properties.
export function redactError(
  error: unknown,
  secrets: readonly string[],
): unknown {
  const keys = secrets.filter((secret) => secret !== "");
  if (keys.length === 0) return error;
  const printed = printable(error);
  if (!keys.some((key) => printed.includes(key))) return error;
  const original = error instanceof Error ? error : undefined;
  const replaced = new Error(redact(original?.message ?? String(error), keys));
  if (original !== undefined) {
    replaced.name = original.name;
    replaced.stack = redact(
      original.stack ?? `${original.name}: ${original.message}`,
      keys,
    );
  }
  return replaced;
}
// A logger for Convex's clients, which log a function's log lines and their own warnings, with
// every secret replaced before it reaches the console.
export interface ClientLogger {
  logVerbose(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
export function redactingLogger(secrets: readonly string[]): ClientLogger {
  const write =
    (method: "debug" | "log" | "warn" | "error") =>
    (...args: unknown[]) =>
      console[method](redact(format(...args), secrets));
  return {
    // Convex logs its verbose lines only when asked to, and the harness never asks.
    logVerbose: () => undefined,
    log: write("log"),
    warn: write("warn"),
    error: write("error"),
  };
}
export interface ChildOutput {
  stdout: string;
  stderr: string;
}
export function runChild(
  name: string,
  file: string,
  args: readonly string[],
  options: ChildOptions & { output?: undefined },
): Promise<string>;
export function runChild(
  name: string,
  file: string,
  args: readonly string[],
  options: ChildOptions & { output: "both" },
): Promise<ChildOutput>;
export function runChild(
  name: string,
  file: string,
  args: readonly string[],
  options: ChildOptions,
): Promise<string | ChildOutput> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        env: { ...(options.env ?? { PATH: process.env.PATH ?? "" }) },
        timeout: options.timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 16 * 1024 * 1024,
        signal: options.signal,
      },
      (error, stdout, stderr) => {
        if (error === null)
          return resolve(
            options.output === "both"
              ? {
                  stdout: redact(stdout, options.secrets ?? []),
                  stderr: redact(stderr, options.secrets ?? []),
                }
              : redact(stdout, options.secrets ?? []),
          );
        if (options.signal?.aborted)
          return reject(
            redactError(options.signal.reason, options.secrets ?? []),
          );
        if (options.output === "both")
          return reject(
            new Error(
              JSON.stringify({
                command: [file, ...args].map((part) =>
                  redact(part, options.secrets ?? []),
                ),
                code: error.code ?? null,
                stderr: redact(
                  stderr.replace(/\r?\n$/, ""),
                  options.secrets ?? [],
                )
                  .split(/\r?\n/)
                  .slice(-20)
                  .join("\n"),
              }),
            ),
          );
        if (error.killed)
          return reject(
            new Error(`${name} did not finish in ${options.timeoutMs} ms`),
          );
        if (typeof error.code !== "number")
          return reject(
            new Error(`${name} could not start: ${String(error.code)}`),
          );
        const output = redact(
          stderr.trim() === "" ? stdout : stderr,
          options.secrets ?? [],
        ).slice(-4000);
        reject(
          new Error(`${name} failed with exit code ${error.code}: ${output}`),
        );
      },
    );
    // On abort Node sends SIGTERM, not killSignal, which a child can handle and outlive.
    const signal = options.signal;
    if (signal === undefined) return;
    const kill = () => child.kill("SIGKILL");
    if (signal.aborted) kill();
    else {
      signal.addEventListener("abort", kill, { once: true });
      child.once("exit", () => signal.removeEventListener("abort", kill));
    }
  });
}

// Keep each stream's possible secret prefix separate from the other streams.
export function redactedBuffer(
  secrets: readonly string[],
  limit: number,
): {
  append(chunk: string, stream?: "stdout" | "stderr" | "error"): void;
  text(): string;
} {
  let safe = "";
  const tails = new Map<string, string>();
  const keys = secrets
    .filter((secret) => secret !== "")
    .sort((a, b) => b.length - a.length);
  return {
    append(chunk, stream = "stdout") {
      let pending = (tails.get(stream) ?? "") + chunk;
      let consumed = 0;
      let complete = "";
      while (consumed < pending.length) {
        const rest = pending.slice(consumed);
        if (
          keys.some((key) => key.length > rest.length && key.startsWith(rest))
        )
          break;
        const match = keys.find((key) => rest.startsWith(key));
        if (match !== undefined) {
          complete += "[redacted]";
          consumed += match.length;
        } else if (keys.some((key) => key.startsWith(rest))) {
          break;
        } else {
          complete += pending[consumed];
          consumed++;
        }
      }
      pending = pending.slice(consumed);
      tails.set(stream, pending);
      safe = (safe + complete).slice(-limit);
    },
    text: () => safe,
  };
}
