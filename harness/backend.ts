import { spawn, execFile as execFileCallback } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createIdentity } from "./identity.js";
import type { FixtureIdentity } from "./identity.js";

const execFile = promisify(execFileCallback);
export const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "node_modules/convex/bin/main.js");
export interface BackendRelease {
  release: string;
  assets: Record<string, string | null>;
}
export async function backendRelease(): Promise<BackendRelease> {
  return JSON.parse(
    await readFile(join(root, "harness/backend-release.json"), "utf8"),
  ) as BackendRelease;
}
export async function backendBinary(): Promise<string> {
  if (process.env.CONVEX_BACKEND_BINARY)
    return resolve(process.env.CONVEX_BACKEND_BINARY);
  const asset =
    process.platform === "darwin" && process.arch === "arm64"
      ? "convex-local-backend-aarch64-apple-darwin.zip"
      : process.platform === "linux" && process.arch === "x64"
        ? "convex-local-backend-x86_64-unknown-linux-gnu.zip"
        : undefined;
  if (!asset)
    throw new Error(
      `Unsupported backend platform: ${process.platform}/${process.arch}`,
    );
  const release = await backendRelease();
  const hash = release.assets[asset];
  if (!hash)
    throw new Error(
      `Missing SHA-256 for backend asset ${asset}; the orchestrator must supply it in harness/backend-release.json`,
    );
  const cache = join(root, ".cache", release.release, asset);
  const binary = join(cache, "convex-local-backend");
  try {
    await access(binary);
    return binary;
  } catch {
    /* download below */
  }
  await mkdir(cache, { recursive: true });
  // Each downloader extracts in its own directory. Parallel tests never see a partial binary.
  const work = await mkdtemp(join(cache, "download-"));
  try {
    const response = await fetch(
      `https://github.com/get-convex/convex-backend/releases/download/${release.release}/${asset}`,
    );
    if (!response.ok)
      throw new Error(`Backend download failed: ${response.status} ${asset}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== hash)
      throw new Error(`SHA-256 mismatch for ${asset}`);
    const zip = join(work, "backend.zip");
    await writeFile(zip, bytes);
    await execFile("unzip", ["-q", zip, "-d", work]);
    const extracted = join(work, "convex-local-backend");
    await chmod(extracted, 0o755);
    const { copyFile, rename } = await import("node:fs/promises");
    const staging = join(cache, `binary-${randomUUID()}`);
    await copyFile(extracted, staging);
    await chmod(staging, 0o755);
    await rename(staging, binary);
    return binary;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No allocated TCP port");
  await new Promise<void>((ok, fail) =>
    server.close((error) => (error ? fail(error) : ok())),
  );
  return address.port;
}
function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((ok, fail) => {
    child.once("exit", () => ok());
    child.once("error", fail);
  });
}
export interface FunctionLogRecord {
  identifier?: string;
  componentPath?: string;
  executionTime?: number;
  usageStats?: unknown;
  [key: string]: unknown;
}
export class Backend {
  private child?: ChildProcess;
  private output = "";
  private logProcesses = new Set<ChildProcess>();
  private constructor(
    readonly binary: string,
    readonly directory: string,
    readonly port: number,
    readonly sitePort: number,
    readonly instanceName: string,
    private readonly secret: string,
    readonly adminKey: string,
    readonly identity: FixtureIdentity,
  ) {}
  get url() {
    return `http://127.0.0.1:${this.port}`;
  }
  get environment() {
    return {
      ...process.env,
      CONVEX_SELF_HOSTED_URL: this.url,
      CONVEX_SELF_HOSTED_ADMIN_KEY: this.adminKey,
    };
  }
  static async start(issuer?: string): Promise<Backend> {
    const binary = await backendBinary();
    const directory = await mkdtemp(join(tmpdir(), "libar-backend-"));
    try {
      const port = await freePort();
      let sitePort = await freePort();
      while (sitePort === port) sitePort = await freePort();
      const name = `fixture-${randomUUID()}`;
      const secret = randomBytes(32).toString("hex");
      const { stdout } = await execFile(binary, [
        "keygen",
        "admin-key",
        "--instance-name",
        name,
        "--instance-secret",
        secret,
      ]);
      const backend = new Backend(
        binary,
        directory,
        port,
        sitePort,
        name,
        secret,
        stdout.trim(),
        await createIdentity(issuer),
      );
      try {
        await backend.restart();
        return backend;
      } catch (error) {
        await backend.stop();
        throw error;
      }
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
  async restart(): Promise<void> {
    if (
      this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    )
      throw new Error("Backend is already running");
    this.output = "";
    const child = spawn(
      this.binary,
      [
        "--port",
        String(this.port),
        "--site-proxy-port",
        String(this.sitePort),
        "--interface",
        "127.0.0.1",
        "--instance-name",
        this.instanceName,
        "--instance-secret",
        this.secret,
        "--local-storage",
        join(this.directory, "storage"),
        join(this.directory, "backend.sqlite3"),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    this.child = child;
    let spawnError: Error | undefined;
    child.on("error", (error) => {
      spawnError = error;
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      this.output = (this.output + chunk.toString()).slice(-16000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      this.output = (this.output + chunk.toString()).slice(-16000);
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Backend exited before /version: ${this.output}`);
      try {
        if (
          (
            await fetch(`${this.url}/version`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          return;
      } catch {
        /* not ready */
      }
      await delay(50);
    }
    throw new Error(`Backend /version timed out: ${this.output}`);
  }
  async command(args: string[]): Promise<string> {
    const { stdout } = await execFile(process.execPath, [cli, ...args], {
      cwd: join(root, "fixture"),
      env: this.environment,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  }
  async deploy(): Promise<void> {
    const envFile = join(this.directory, "auth.env");
    await writeFile(
      envFile,
      `AUTH_ISSUER=${this.identity.issuer}\nAUTH_APPLICATION_ID=${this.identity.applicationID}\nAUTH_JWKS=${this.identity.jwks}\n`,
      { mode: 0o600 },
    );
    await this.command(["env", "set", "--from-file", envFile]);
    await this.command([
      "deploy",
      "-y",
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
    ]);
  }
  async readTable(table: string, componentPath?: string): Promise<unknown[]> {
    const component = componentPath ? ["--component", componentPath] : [];
    const output = await this.command([
      "data",
      table,
      "--format",
      "json",
      ...component,
    ]);
    if (output.trim()) return JSON.parse(output) as unknown[];
    // The CLI prints nothing for an empty table and nothing for a table that does not exist.
    const tables = (await this.command(["data", ...component])).split("\n");
    if (!tables.includes(table))
      throw new Error(
        `No table ${table} in ${componentPath ?? "the app"}: ${tables.join(" ")}`,
      );
    return [];
  }
  logs() {
    const records: FunctionLogRecord[] = [];
    const errors: string[] = [];
    const child = spawn(
      process.execPath,
      [cli, "logs", "--success", "--jsonl"],
      {
        cwd: join(root, "fixture"),
        env: this.environment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.logProcesses.add(child);
    let pending = "";
    child.on("error", (error) => errors.push(String(error)));
    child.stderr?.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
    child.stdout?.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          records.push(JSON.parse(line) as FunctionLogRecord);
        } catch {
          errors.push(`Invalid function log JSON: ${line}`);
        }
      }
    });
    return {
      records,
      errors,
      async waitFor(
        predicate: (record: FunctionLogRecord) => boolean,
        timeout = 10000,
      ) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          const record = records.find(predicate);
          if (record) return record;
          if (child.exitCode !== null || child.signalCode !== null)
            throw new Error(`Function log stream exited: ${errors.join("\n")}`);
          await delay(25);
        }
        throw new Error(`Function log record timed out: ${errors.join("\n")}`);
      },
      stop: async () => {
        child.kill("SIGINT");
        await exited(child);
        this.logProcesses.delete(child);
      },
    };
  }
  async kill(): Promise<void> {
    if (this.child) {
      this.child.kill("SIGKILL");
      await exited(this.child);
    }
  }
  async stop(): Promise<void> {
    for (const child of this.logProcesses) {
      child.kill("SIGINT");
      await exited(child);
    }
    this.logProcesses.clear();
    if (this.child) {
      const child = this.child;
      child.kill("SIGINT");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      try {
        await exited(child);
      } finally {
        clearTimeout(timer);
      }
    }
    await rm(this.directory, { recursive: true, force: true });
  }
}
export async function startFixture(issuer?: string): Promise<Backend> {
  const backend = await Backend.start(issuer);
  try {
    await backend.deploy();
    return backend;
  } catch (error) {
    await backend.stop();
    throw error;
  }
}
export async function withBackend<T>(
  run: (backend: Backend) => Promise<T>,
  issuer?: string,
): Promise<T> {
  const backend = await startFixture(issuer);
  try {
    return await run(backend);
  } finally {
    await backend.stop();
  }
}
