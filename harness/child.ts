import { execFile } from "node:child_process";
export interface ChildOptions {
  timeoutMs: number;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  secrets?: readonly string[];
  signal?: AbortSignal;
}
export function redact(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets)
    if (secret !== "") result = result.split(secret).join("[redacted]");
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

// Keep a raw tail only while it could still become a secret split across chunks.
export function redactedBuffer(
  secrets: readonly string[],
  limit: number,
): {
  append(chunk: string): void;
  text(): string;
} {
  let safe = "";
  let pending = "";
  const keys = secrets.filter((secret) => secret !== "");
  return {
    append(chunk) {
      pending += chunk;
      let consumed = 0;
      let complete = "";
      while (consumed < pending.length) {
        const rest = pending.slice(consumed);
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
      safe = (safe + complete).slice(-limit);
    },
    text: () => safe,
  };
}
