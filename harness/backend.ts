import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { publishOwnership } from "./ownership.js";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createAdminAccess } from "./admin.js";
import type { AdminAccess, AdminState } from "./admin.js";
import { redact, redactedBuffer, runChild } from "./child.js";
import type { Executable } from "./executable.js";
import type { FixtureIssuer } from "./identity.js";
export const fixtureComposition = {
  name: "fixture",
  functions: "fixture/convex",
  installedLayers: [] as readonly string[],
} as const;
export interface BackendFacts {
  composition: "fixture" | null;
  installedLayers: string[];
  executable: Pick<Executable, "release" | "sha256" | "source">;
  identitySource: { kind: "fixture issuer"; issuer: string };
  environment: string[];
  dataset: "empty at start";
}
export interface StartOptions {
  executable: Executable;
  issuer: FixtureIssuer;
  parentDirectory?: string;
  signal?: AbortSignal;
}
export interface Backend {
  readonly url: string;
  readonly adminKey: string;
  readonly issuer: FixtureIssuer;
  readonly admin: AdminAccess;
  stop(): Promise<void>;
  kill(): Promise<void>;
  restart(): Promise<void>;
  dispose(): Promise<void>;
  facts(): BackendFacts;
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  await new Promise<void>((ok) => server.close(() => ok()));
  if (address === null || typeof address === "string")
    throw new Error("The operating system gave no port");
  return address.port;
}
function exitOf(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve(true);
  return new Promise((done) => {
    const timer = setTimeout(() => done(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      done(true);
    });
  });
}
export async function startBackend(options: StartOptions): Promise<Backend> {
  const directory = await mkdtemp(
    join(options.parentDirectory ?? tmpdir(), "backend-"),
  );
  const home = join(directory, "home");
  const instanceName = `libar-${randomUUID()}`;
  const instanceSecret = randomBytes(32).toString("hex");
  const secrets: string[] = [instanceSecret];
  let child: ChildProcess | undefined;
  let output = "";
  let port = 0;
  let sitePort = 0;
  let disposed = false;
  let identityIssuer = options.issuer.issuer;
  const state: AdminState = { deployed: false, environment: new Set() };
  const assertLive = () => {
    if (disposed) throw new Error("The backend is disposed");
  };
  const running = () =>
    child !== undefined && child.exitCode === null && child.signalCode === null;
  async function spawnAndWait(): Promise<"ready" | "port taken"> {
    output = "";
    state.logProcess = {};
    const buffer = redactedBuffer(secrets, 16000);
    const spawned = spawn(
      options.executable.path,
      [
        "--port",
        String(port),
        "--site-proxy-port",
        String(sitePort),
        "--interface",
        "127.0.0.1",
        "--instance-name",
        instanceName,
        "--instance-secret",
        instanceSecret,
        "--local-storage",
        join(directory, "storage"),
        "--disable-beacon",
        join(directory, "backend.sqlite3"),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    child = spawned;
    const keep = (chunk: Buffer, stream: "stdout" | "stderr" | "error") => {
      buffer.append(chunk.toString(), stream);
      output = buffer.text();
    };
    spawned.stdout?.on("data", (chunk: Buffer) => keep(chunk, "stdout"));
    spawned.stderr?.on("data", (chunk: Buffer) => keep(chunk, "stderr"));
    spawned.on("error", (error) => keep(Buffer.from(String(error)), "error"));
    if (spawned.pid !== undefined)
      publishOwnership(directory, spawned.pid, instanceName);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      options.signal?.throwIfAborted();
      if (spawned.exitCode !== null || spawned.signalCode !== null) {
        if (output.includes("Address already in use")) return "port taken";
        throw new Error(
          `The backend exited with code ${spawned.exitCode} before it was ready: ${redact(output, secrets)}`,
        );
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
          signal: AbortSignal.timeout(1000),
        });
        if (
          response.ok &&
          (await response.text()) === instanceName &&
          spawned.exitCode === null &&
          spawned.signalCode === null
        )
          return "ready";
      } catch {
        // Not listening yet.
      }
      await sleep(50);
    }
    throw new Error(
      `The backend was not ready in 30000 ms: ${redact(output, secrets)}`,
    );
  }
  async function end(signal: "SIGINT" | "SIGKILL"): Promise<void> {
    if (child === undefined || !running()) return;
    child.kill(signal);
    if (await exitOf(child, 5000)) return;
    if (signal === "SIGINT") {
      child.kill("SIGKILL");
      if (await exitOf(child, 5000)) return;
    }
    throw new Error(
      `Backend process ${child.pid} did not exit within 5000 ms after SIGKILL`,
    );
  }
  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    state.logProcess = undefined;
    const left: string[] = [];
    await end("SIGKILL").catch((error: Error) => left.push(error.message));
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    }).catch((error: Error) =>
      left.push(`could not remove ${directory}: ${error.message}`),
    );
    if (left.length > 0)
      throw new Error(
        `Backend disposal left something behind: ${left.join("; ")}`,
      );
  }
  try {
    await mkdir(home);
    const adminKey = (
      await runChild(
        "convex-local-backend keygen",
        options.executable.path,
        [
          "keygen",
          "admin-key",
          "--instance-name",
          instanceName,
          "--instance-secret",
          instanceSecret,
        ],
        {
          timeoutMs: 10000,
          secrets,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        },
      )
    ).trim();
    secrets.push(adminKey);
    const usedPorts = new Set<number>();
    async function freshPort(): Promise<number> {
      for (let pick = 0; pick < 100; pick++) {
        const candidate = await freePort();
        if (usedPorts.has(candidate)) continue;
        usedPorts.add(candidate);
        return candidate;
      }
      throw new Error("The operating system gave no fresh port in 100 picks");
    }
    for (let attempt = 1; ; attempt++) {
      port = await freshPort();
      sitePort = await freshPort();
      if ((await spawnAndWait()) === "ready") break;
      if (attempt === 3)
        throw new Error(
          `The backend could not bind its ports in 3 attempts: ${redact(output, secrets)}`,
        );
    }
    const url = `http://127.0.0.1:${port}`;
    const access = createAdminAccess(
      {
        url,
        adminKey,
        home,
        secrets,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      state,
    );
    const admin: AdminAccess = {
      ...access,
      async setEnvironment(variables) {
        await access.setEnvironment(variables);
        identityIssuer = variables.AUTH_ISSUER ?? identityIssuer;
      },
    };
    await admin.setEnvironment({
      AUTH_ISSUER: options.issuer.issuer,
      AUTH_APPLICATION_ID: options.issuer.applicationID,
      AUTH_JWKS: options.issuer.jwks,
    });
    return {
      url,
      adminKey,
      issuer: options.issuer,
      admin,
      async stop() {
        assertLive();
        state.logProcess = undefined;
        await end("SIGINT");
      },
      async kill() {
        assertLive();
        state.logProcess = undefined;
        await end("SIGKILL");
      },
      async restart() {
        assertLive();
        if (running())
          throw new Error(
            "The backend is still running. Stop or kill it before restart.",
          );
        try {
          if ((await spawnAndWait()) === "port taken")
            throw new Error(
              `The backend could not restart on port ${port}: ${redact(output, secrets)}`,
            );
        } catch (error) {
          state.logProcess = undefined;
          await end("SIGKILL");
          throw error;
        }
      },
      dispose,
      facts: () => ({
        composition: state.deployed ? fixtureComposition.name : null,
        installedLayers: state.deployed
          ? [...fixtureComposition.installedLayers]
          : [],
        executable: {
          release: options.executable.release,
          sha256: options.executable.sha256,
          source: options.executable.source,
        },
        identitySource: {
          kind: "fixture issuer",
          issuer: identityIssuer,
        },
        environment: [...state.environment].sort(),
        dataset: "empty at start",
      }),
    };
  } catch (error) {
    await dispose().catch(() => undefined);
    throw error;
  }
}
