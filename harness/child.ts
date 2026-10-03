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
// How deep the walk of causes, nested errors and object values goes.
const limitRedactionDepth = 3;
// Everything of an error that a reporter or a log can print: its name, message and stack, its own
// properties, and, walked to a bounded depth, its cause, the errors an AggregateError holds, the
// values of its own properties and the values of a plain object among them. cut is true when the walk
// reached its bound with something left to read, which a cycle always does.
function printable(value: unknown, depth = 0): { text: string; cut: boolean } {
  const text = (one: unknown) => {
    try {
      return typeof one === "string" ? one : String(one);
    } catch {
      return "";
    }
  };
  const json = (one: unknown) => {
    try {
      return JSON.stringify(one) ?? "";
    } catch {
      return text(one);
    }
  };
  const parts: string[] = [];
  const inner: unknown[] = [];
  if (value instanceof Error) {
    parts.push(value.name, value.message, value.stack ?? "");
    for (const [key, one] of Object.entries(value)) {
      parts.push(key, text(one), json(one));
      inner.push(one);
    }
    inner.push(value.cause);
    const errors: unknown = (value as { errors?: unknown }).errors;
    if (Array.isArray(errors)) inner.push(...(errors as unknown[]));
  } else {
    parts.push(text(value), json(value));
    if (typeof value === "object" && value !== null)
      inner.push(...Object.values(value));
  }
  // A value that is not an object is printed as it is; an object is walked.
  const objects: object[] = [];
  for (const one of inner)
    if (typeof one === "object" && one !== null) objects.push(one);
    else if (one !== undefined) parts.push(text(one));
  if (objects.length === 0) return { text: parts.join("\n"), cut: false };
  if (depth >= limitRedactionDepth)
    return { text: parts.join("\n"), cut: true };
  let cut = false;
  for (const one of objects) {
    const walked = printable(one, depth + 1);
    parts.push(walked.text);
    cut ||= walked.cut;
  }
  return { text: parts.join("\n"), cut };
}
// An error that carries no secret anywhere it can be printed is returned as it is, so that a caller
// can still tell it by identity. One that carries a secret, or whose walk reached its bound with
// something left to read, fails closed: it is replaced by an Error whose name, message and stack
// have every secret replaced, and which keeps none of its properties, its cause and its nested
// errors included.
export function redactError(
  error: unknown,
  secrets: readonly string[],
): unknown {
  const keys = secrets.filter((secret) => secret !== "");
  if (keys.length === 0) return error;
  const printed = printable(error);
  if (!printed.cut && !keys.some((key) => printed.text.includes(key)))
    return error;
  const original = error instanceof Error ? error : undefined;
  const replaced = new Error(redact(original?.message ?? String(error), keys));
  if (original !== undefined) {
    replaced.name = redact(original.name, keys);
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
