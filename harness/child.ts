import { execFile } from "node:child_process";
export interface ChildOptions {
  timeoutMs: number;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  secrets?: readonly string[];
  signal?: AbortSignal;
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
export function runChild(
  name: string,
  file: string,
  args: readonly string[],
  options: ChildOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
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
        if (error === null) return resolve(stdout);
        if (options.signal?.aborted) return reject(options.signal.reason);
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
