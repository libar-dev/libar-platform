import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { spawn } from "node:child_process";
import { waitUntil } from "../../harness/wait.js";
import { sweep } from "../../harness/native-run.js";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { expect, inject, onTestFinished, test, TestRunner } from "vitest";
import { sha256OfFile } from "../../harness/executable.js";
import { fixtureBackend, measure } from "../../harness/native.js";
// Binds this file to the harness Spec, whose rules it checks directly.
const anchor = specTest({
  id: testAnchorId("test:platform.native-harness.backend-lifecycle"),
  verifies: ref("spec:platform.native-harness"),
});
void anchor;

async function scratch() {
  // The run directory comes from os.tmpdir(); keep these under it so the parent can sweep them.
  const directory = await mkdtemp(
    join(inject("nativeRun").directory, "libar-harness-"),
  );
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function storageDirectory(parent: string) {
  const directories = await readdir(parent);
  expect(directories).toHaveLength(1);
  return join(parent, directories[0]!);
}

test("native: stop and kill keep stored rows across restart, and dispose removes storage twice", async () => {
  const parent = await scratch();
  const backend = await fixtureBackend({ parentDirectory: parent });
  await backend.admin.run("notes:addInternal");
  const directory = await storageDirectory(parent);
  for (const end of [() => backend.stop(), () => backend.kill()]) {
    await end();
    expect((await stat(join(directory, "backend.sqlite3"))).isFile()).toBe(
      true,
    );
    // A successful stop must mean the owned process has exited.
    const pid = (
      JSON.parse(await readFile(join(directory, "pid"), "utf8")) as {
        pid: number;
      }
    ).pid;
    expect(() => process.kill(pid, 0)).toThrow();
    await backend.restart();
    expect(await backend.admin.readTable("notes")).toMatchObject([
      { source: "internal" },
    ]);
  }
  await backend.admin.setEnvironment({
    AUTH_ISSUER: "https://changed-issuer.test",
  });
  expect(await backend.admin.environment()).toMatchObject({
    AUTH_ISSUER: "https://changed-issuer.test",
  });
  expect(backend.facts().identitySource.issuer).toBe(
    "https://changed-issuer.test",
  );
  await backend.dispose();
  expect(await readdir(parent)).toEqual([]);
  await backend.dispose();
  expect(await readdir(parent)).toEqual([]);
  for (const action of [
    () => backend.restart(),
    () => backend.stop(),
    () => backend.kill(),
  ])
    await expect(action()).rejects.toThrow("The backend is disposed");
  expect(await readdir(parent)).toEqual([]);
});

// The wrapper occupies a selected port before starting the real binary. The successful attempt
// replaces the wrapper process, so the harness owns the real backend PID even after SIGKILL.
async function contendedExecutable(
  directory: string,
  failures: number,
  flag: string,
) {
  const binary = inject("nativeRun").executable.path;
  const hash = await sha256OfFile(binary);
  measure("realBackendExecutableSha256", hash);
  expect(TestRunner.getCurrentTest()?.meta.native?.measurements).toContainEqual(
    { name: "realBackendExecutableSha256", value: hash },
  );
  const attempts = join(directory, "attempts.json");
  const path = join(directory, "contended.mjs");
  await writeFile(
    path,
    `#!/usr/bin/env node
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
const binary = ${JSON.stringify(binary)};
const args = process.argv.slice(2);
if (args[0] === 'keygen') {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
const file = ${JSON.stringify(attempts)};
let seen = [];
try { seen = JSON.parse(readFileSync(file, 'utf8')); } catch {}
seen.push(args);
writeFileSync(file, JSON.stringify(seen));
if (seen.length > ${failures}) {
  process.execve(binary, [binary, ...args], process.env);
} else {
  const port = Number(args[args.indexOf(${JSON.stringify(flag)}) + 1]);
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(port, '127.0.0.1', resolve);
  });
  const child = spawn(binary, args, { stdio: 'inherit' });
  child.once('exit', (code) => listener.close(() => process.exit(code ?? 1)));
}
`,
  );
  await chmod(path, 0o755);
  return {
    executable: {
      path,
      sha256: await sha256OfFile(path),
      release: null,
      source: "CONVEX_BACKEND_BINARY" as const,
    },
    attempts,
  };
}
interface AttemptPorts {
  main: string;
  site: string;
}
async function portsOf(attempts: string): Promise<AttemptPorts[]> {
  const rows = JSON.parse(await readFile(attempts, "utf8")) as string[][];
  return rows.map((args) => ({
    main: args[args.indexOf("--port") + 1]!,
    site: args[args.indexOf("--site-proxy-port") + 1]!,
  }));
}
test.each(["--port", "--site-proxy-port"])(
  "native: a taken %s causes fresh port pairs and the third start succeeds",
  async (flag) => {
    const directory = await scratch();
    const parent = await scratch();
    const { executable, attempts } = await contendedExecutable(
      directory,
      2,
      flag,
    );
    const backend = await fixtureBackend({
      parentDirectory: parent,
      executable,
      deploy: false,
    });
    const ports = await portsOf(attempts);
    expect(ports).toHaveLength(3);
    expect(new Set(ports.map((pair) => pair.main)).size).toBe(3);
    expect(new Set(ports.map((pair) => pair.site)).size).toBe(3);
    expect(ports.every((pair) => pair.main !== pair.site)).toBe(true);
    expect(backend.url).toBe(`http://127.0.0.1:${ports[2]!.main}`);
    expect(await backend.admin.environment()).toHaveProperty("AUTH_ISSUER");
  },
);
test("native: three taken ports fail clearly and remove the failed start's storage", async () => {
  const directory = await scratch();
  const parent = await scratch();
  const { executable, attempts } = await contendedExecutable(
    directory,
    3,
    "--port",
  );
  await expect(
    fixtureBackend({ parentDirectory: parent, executable, deploy: false }),
  ).rejects.toThrow("The backend could not bind its ports in 3 attempts");
  expect(await portsOf(attempts)).toHaveLength(3);
  expect(await readdir(parent)).toEqual([]);
});

test("native: stop escalates to SIGKILL when the owned process ignores SIGINT and keeps its storage", async () => {
  const directory = await scratch();
  const parent = await scratch();
  const path = join(directory, "ignores-interrupt.mjs");
  const interrupted = join(directory, "interrupted");
  await writeFile(
    path,
    `#!/usr/bin/env node
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'keygen') {
  console.log('synthetic-admin-key');
  process.exit(0);
}
const option = (name) => args[args.indexOf(name) + 1];
writeFileSync(args.at(-1), 'storage retained');
process.on('SIGINT', () => writeFileSync(${JSON.stringify(interrupted)}, 'SIGINT'));
createServer((request, response) => {
  response.end(request.url === '/instance_name' ? option('--instance-name') : '{}');
}).listen(Number(option('--port')), '127.0.0.1');
`,
  );
  await chmod(path, 0o755);
  const backend = await fixtureBackend({
    parentDirectory: parent,
    deploy: false,
    executable: {
      path,
      sha256: await sha256OfFile(path),
      release: null,
      source: "CONVEX_BACKEND_BINARY",
    },
  });
  const storage = await storageDirectory(parent);
  const started = Date.now();
  await backend.stop();
  expect(Date.now() - started).toBeGreaterThanOrEqual(5000);
  expect(Date.now() - started).toBeLessThan(15000);
  expect(await readFile(interrupted, "utf8")).toBe("SIGINT");
  const pid = (
    JSON.parse(await readFile(join(storage, "pid"), "utf8")) as { pid: number }
  ).pid;
  expect(() => process.kill(pid, 0)).toThrow();
  expect(await readFile(join(storage, "backend.sqlite3"), "utf8")).toBe(
    "storage retained",
  );
  await backend.dispose();
  expect(await readdir(parent)).toEqual([]);
});

test("native: a log mark from before a kill cannot be read after restart", async () => {
  const backend = await fixtureBackend();
  const mark = await backend.admin.logMark();
  await backend.admin.run("notes:addInternal");
  await backend.kill();
  await backend.restart();
  await backend.admin.run("notes:addInternal");
  await expect(
    backend.admin.completionsSince(mark, (records) => records.length > 0),
  ).rejects.toThrow("another backend process");
});

// The second process stays alive but never reports this run's instance name.
// A failed restart must reap it before rejecting.
test("native: a restart that stalls after spawning reaps its process", async () => {
  const directory = await scratch();
  const parent = await scratch();
  const path = join(directory, "stalled-restart.mjs");
  const starts = join(directory, "starts");
  await writeFile(
    path,
    `#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'keygen') { console.log('synthetic-admin-key'); process.exit(0); }
const option = (name) => args[args.indexOf(name) + 1];
const restarted = existsSync(${JSON.stringify(starts)});
writeFileSync(${JSON.stringify(starts)}, 'started');
createServer((request, response) => response.end(request.url === '/instance_name' ? (restarted ? 'wrong-instance' : option('--instance-name')) : '{}')).listen(Number(option('--port')), '127.0.0.1');
`,
  );
  await chmod(path, 0o755);
  const backend = await fixtureBackend({
    parentDirectory: parent,
    deploy: false,
    executable: {
      path,
      sha256: await sha256OfFile(path),
      release: null,
      source: "CONVEX_BACKEND_BINARY",
    },
  });
  await backend.kill();
  await expect(backend.restart()).rejects.toThrow(
    "The backend was not ready in 30000 ms",
  );
  const storage = await storageDirectory(parent);
  const pid = (
    JSON.parse(await readFile(join(storage, "pid"), "utf8")) as { pid: number }
  ).pid;
  expect(() => process.kill(pid, 0)).toThrow();
  await backend.dispose();
  expect(await readdir(parent)).toEqual([]);
});

test.each(["SIGINT", "SIGTERM"] as const)(
  "native: codegen interrupted by %s removes its starting backend and storage",
  async (signal) => {
    const directory = await scratch();
    // TMPDIR is explicit so this test can inspect only its own codegen storage.
    const storageRoot = await mkdtemp(
      join(inject("nativeRun").directory, "libar-codegen-interrupt-"),
    );
    onTestFinished(() => sweep(storageRoot));
    const path = join(directory, "not-ready.mjs");
    await writeFile(
      path,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'keygen') { console.log('synthetic-admin-key'); process.exit(0); }
setInterval(() => {}, 1000);
`,
    );
    await chmod(path, 0o755);
    const child = spawn(process.execPath, ["scripts/codegen.mjs"], {
      cwd: join(import.meta.dirname, "../.."),
      env: { ...process.env, TMPDIR: storageRoot, CONVEX_BACKEND_BINARY: path },
      stdio: "ignore",
    });
    const exited = new Promise<number | null>((done) =>
      child.once("exit", (code) => done(code)),
    );
    onTestFinished(() => {
      child.kill("SIGKILL");
    });
    let pid = 0;
    await waitUntil(
      "codegen's published backend ownership",
      async () => {
        for (const entry of await readdir(storageRoot)) {
          try {
            pid = (
              JSON.parse(
                await readFile(join(storageRoot, entry, "pid"), "utf8"),
              ) as { pid: number }
            ).pid;
            return pid > 0;
          } catch {
            /* Not yet published. */
          }
        }
        return false;
      },
      10000,
    );
    child.kill(signal);
    expect(await exited).not.toBe(0);
    // This backend is a descendant spawned by this test's codegen process.
    expect(() => process.kill(pid, 0)).toThrow();
    expect(await readdir(storageRoot)).toEqual([]);
  },
);

test("native: backend output split across chunks is redacted before the rolling buffer clips it", async () => {
  const directory = await scratch();
  const parent = await scratch();
  const path = join(directory, "secret-output.mjs");
  const secretFile = join(directory, "secret");
  await writeFile(
    path,
    `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'keygen') { console.log('synthetic-admin-key'); process.exit(0); }
const secret = args[args.indexOf('--instance-secret') + 1];
writeFileSync(${JSON.stringify(secretFile)}, secret);
process.stderr.write(secret.slice(0, 20));
setTimeout(() => { process.stderr.write(secret.slice(20) + 'x'.repeat(15990)); process.exit(1); }, 100);
`,
  );
  await chmod(path, 0o755);
  const error = await fixtureBackend({
    parentDirectory: parent,
    deploy: false,
    executable: {
      path,
      sha256: await sha256OfFile(path),
      release: null,
      source: "CONVEX_BACKEND_BINARY",
    },
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(Error);
  const secret = await readFile(secretFile, "utf8");
  expect((error as Error).message).not.toContain(secret.slice(-10));
  expect((error as Error).message).toContain("redacted]");
  expect(await readdir(parent)).toEqual([]);
});
