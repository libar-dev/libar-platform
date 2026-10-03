import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { format } from "node:util";
import { expect, onTestFinished, test, vi } from "vitest";
import { answerAcceptance } from "../../harness/acceptance.js";
import { convexCli } from "../../harness/admin.js";
import type { AdminSocketClient, SocketFactory } from "../../harness/admin.js";
import { refuseDotenv } from "../../harness/backup-archive.js";
import * as child from "../../harness/child.js";
import type { Composition } from "../../harness/composition.js";
import type { ScenarioGraph } from "../../harness/acceptance.js";
import EvidenceReporter, {
  amendRunRecord,
  hostedDeployMeasurement,
  openRunRecord,
} from "../../harness/evidence.js";
import type { NativeRunRecord } from "../../harness/evidence.js";
import {
  createHostedAccess,
  deployKeyForms,
  hostedTarget,
} from "../../harness/hosted.js";
import setupHostedRun, { crossesUtcDay } from "../../harness/hosted-run.js";
// Binds this file to the harness Spec, whose rules for a native run on a hosted deployment it
// checks with no network and no deploy key.
const anchor = specTest({
  id: testAnchorId("test:platform.native-harness.hosted"),
  verifies: ref("spec:platform.native-harness"),
});
void anchor;

async function temporary(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const hostedFacts = {
  deployment: "happy-animal-123",
  keyName: "hosted-ci-scoped",
  statedPlan: "Professional",
  ranBy: "developer" as const,
  cliVersion: "1.46.0",
  backendVersion: null,
  usageBefore: null,
  usageAfter: null,
  windowCrossed: false,
};
// A finished test as the reporter sees it.
function finished(
  project: string,
  options: { errors?: string[]; measurements?: unknown[] } = {},
) {
  return {
    project: { name: project },
    fullName: `${project} test`,
    module: { relativeModuleId: `tests/${project}/a.test.ts` },
    result: () => ({
      state: options.errors === undefined ? "passed" : "failed",
      errors: (options.errors ?? []).map((message) => ({ message })),
    }),
    diagnostic: () => ({ duration: 1 }),
    meta: () => ({
      native: { backends: [], measurements: options.measurements ?? [] },
    }),
  } as never;
}
async function reported(
  project: "native" | "hosted",
  slot: (run: ReturnType<typeof openRunRecord>) => void,
  options: Parameters<typeof finished>[1] = {},
) {
  const directory = await temporary("libar-hosted-record-");
  const reporter = new EvidenceReporter({ directory });
  const run = openRunRecord();
  slot(run);
  reporter.onTestRunStart([{ project: { name: project } }] as never);
  reporter.onTestCaseResult(finished(project, options));
  await reporter.onTestRunEnd([] as never, [] as never, "passed" as never);
  const [name] = await readdir(directory);
  const text = await readFile(join(directory, name!), "utf8");
  return {
    name: name!,
    text,
    record: JSON.parse(text) as NativeRunRecord,
    run,
  };
}

test("pure: a record names its target apart from its tier, and a run on a hosted deployment writes hosted- and its hosted facts", async () => {
  const local = await reported("native", () => {});
  expect(local.name).toMatch(/^native-/);
  expect(local.record).toMatchObject({
    tier: "native",
    target: "local backend",
    hosted: null,
  });
  const deploy = { composition: "fixture", wallMs: 1234 };
  const hosted = await reported("hosted", (run) => (run.hosted = hostedFacts), {
    measurements: [{ name: hostedDeployMeasurement, value: deploy }],
  });
  expect(hosted.name).toMatch(/^hosted-/);
  expect(hosted.record).toMatchObject({
    tier: "native",
    target: "hosted deployment",
    hosted: { ...hostedFacts, deploys: [deploy] },
  });
  expect(hosted.record.tests[0]!.project).toBe("hosted");
});

test("pure: the reporter and an amendment redact the serialized record by the run's secrets", async () => {
  const secret = "dev:happy-animal-123|REVIEW_DUMMY_SECRET";
  const hosted = await reported(
    "hosted",
    (run) => {
      run.hosted = hostedFacts;
      run.secrets = [secret];
    },
    { errors: [`failed with ${secret}`] },
  );
  expect(hosted.text).toContain("failed with [redacted]");
  expect(hosted.text).not.toContain(secret);
  amendRunRecord(hosted.run, (record) => {
    record.unhandledErrors.push(`amended with ${secret}`);
  });
  const amended = await readFile(hosted.run.path!, "utf8");
  expect(amended).toContain("amended with [redacted]");
  expect(amended).not.toContain(secret);
});

test("pure: the acceptance check reads no record of a native run on a hosted deployment, as the newest or by its path", async () => {
  const experiment = "spec:sample.experiment";
  // One required row with no example: the check answers missing, and reads no tier word.
  const graph: ScenarioGraph = {
    specs: () => [{ id: experiment, specKind: "rule" }],
    specContext: (id) =>
      id === experiment
        ? {
            sections: { design: { acceptanceRows: "the row is Sc L0-1" } },
            verifiers: [],
          }
        : undefined,
  };
  const directory = await temporary("libar-hosted-acceptance-");
  const record = (startedAt: string, target?: string) => ({
    commit: "0123456789abcdef0123456789abcdef01234567",
    clean: true,
    result: "passed",
    tests: [],
    startedAt,
    ...(target === undefined ? {} : { target }),
  });
  await writeFile(
    join(directory, "local.json"),
    JSON.stringify(record("2026-01-01T00:00:00.000Z", "local backend")),
  );
  await writeFile(
    join(directory, "older.json"),
    JSON.stringify(record("2025-01-01T00:00:00.000Z")),
  );
  await writeFile(
    join(directory, "hosted.json"),
    JSON.stringify(record("2027-01-01T00:00:00.000Z", "hosted deployment")),
  );
  const newest = answerAcceptance({
    graph,
    runsDirectory: directory,
    specId: experiment,
  });
  expect(newest.record).toBe(join(directory, "local.json"));
  expect(newest.exit).toBe(3);
  const named = answerAcceptance({
    graph,
    runsDirectory: directory,
    recordPath: join(directory, "hosted.json"),
    specId: experiment,
  });
  expect(named.exit).toBe(2);
  expect(named.lines).toEqual([
    `acceptance: cannot answer · The record ${join(directory, "hosted.json")} is not a run on the local backend, and a native run on a hosted deployment passes no scenario`,
  ]);
});

// A key in the form of a development deploy key, whose secret changes when it is URL-encoded, so
// that its four forms differ.
const plantedKey = () =>
  `dev:happy-animal-123|pl+an/ted=${randomUUID().replaceAll("-", "")}`;
const variables = (key: string) => ({
  HOSTED_DEPLOYMENT_URL: "https://happy-animal-123.eu-west-1.convex.cloud",
  HOSTED_DEPLOY_KEY: key,
  HOSTED_DEPLOY_KEY_NAME: "hosted-ci-scoped",
  HOSTED_PLAN: "Professional",
});

test("pure: hostedTarget refuses each wrong variable by its name and never prints a value", () => {
  const key = plantedKey();
  const good = variables(key);
  expect(hostedTarget(good)).toEqual({
    url: "https://happy-animal-123.eu-west-1.convex.cloud",
    deployment: "happy-animal-123",
    keyName: "hosted-ci-scoped",
    statedPlan: "Professional",
  });
  expect(
    hostedTarget({
      ...good,
      HOSTED_DEPLOYMENT_URL: "https://happy-animal-123.convex.cloud",
    }).url,
  ).toBe("https://happy-animal-123.convex.cloud");
  const cases: [Record<string, string | undefined>, string][] = [
    [{ HOSTED_DEPLOYMENT_URL: undefined }, "HOSTED_DEPLOYMENT_URL is not set"],
    [{ HOSTED_DEPLOY_KEY: "" }, "HOSTED_DEPLOY_KEY is not set"],
    [{ HOSTED_DEPLOY_KEY_NAME: " " }, "HOSTED_DEPLOY_KEY_NAME is not set"],
    [{ HOSTED_PLAN: undefined }, "HOSTED_PLAN is not set"],
    [
      { HOSTED_DEPLOY_KEY: key.replace("dev:", "prod:") },
      "HOSTED_DEPLOY_KEY does not begin dev:",
    ],
    [
      { HOSTED_DEPLOY_KEY: key.replace("dev:", "preview:team:") },
      "HOSTED_DEPLOY_KEY does not begin dev:",
    ],
    [
      { HOSTED_DEPLOY_KEY: "dev:happy-animal-123" },
      "HOSTED_DEPLOY_KEY is not dev:, a deployment name, | and a secret",
    ],
    [
      { HOSTED_DEPLOY_KEY: "dev:happy-animal-123|" },
      "HOSTED_DEPLOY_KEY is not dev:, a deployment name, | and a secret",
    ],
    ...[
      "http://happy-animal-123.convex.cloud",
      "https://other-animal-456.convex.cloud",
      "https://happy-animal-123.eu-west-1.convex.cloud/",
      "https://happy-animal-123.convex.site",
      "https://happy-animal-1234.convex.cloud",
      "https://xhappy-animal-123.convex.cloud",
      "https://happy-animal-123.a.b.convex.cloud",
    ].map((url): [Record<string, string>, string] => [
      { HOSTED_DEPLOYMENT_URL: url },
      "HOSTED_DEPLOYMENT_URL does not name the deployment HOSTED_DEPLOY_KEY carries",
    ]),
  ];
  for (const [change, refusal] of cases) {
    const given = { ...good, ...change };
    let message = "";
    try {
      hostedTarget(given);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(refusal);
    for (const value of Object.values(given))
      if (value !== undefined && value.trim() !== "")
        expect(message).not.toContain(value);
    for (const form of deployKeyForms(key)) expect(message).not.toContain(form);
  }
});

test("pure: the secrets of a hosted run are the key, its part after the |, and both URL-encoded", () => {
  const key = plantedKey();
  const secret = key.slice(key.indexOf("|") + 1);
  expect(deployKeyForms(key)).toEqual([
    key,
    secret,
    encodeURIComponent(key),
    encodeURIComponent(secret),
  ]);
});

test("pure: a CLI call on a hosted deployment refuses a directory with .env or .env.local, naming the file and not its content", async () => {
  const directory = await temporary("libar-hosted-dotenv-");
  expect(() => refuseDotenv(directory)).not.toThrow();
  for (const name of [".env", ".env.local"]) {
    await writeFile(join(directory, name), "CONVEX_DEPLOYMENT=dev:elsewhere\n");
    let message = "";
    try {
      refuseDotenv(directory);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(join(directory, name));
    expect(message).not.toContain("elsewhere");
    await rm(join(directory, name));
  }
});

// A composition whose project directory is a temporary one, so no file of the repository's root
// takes part.
async function temporaryComposition(): Promise<Composition> {
  const directory = await temporary("libar-hosted-composition-");
  return {
    name: "fixture",
    project: relative(join(import.meta.dirname, "../.."), directory),
    functions: "convex",
    installedLayers: [],
  };
}

test("pure: no CLI call of the hosted path names the backend by an argument, and each gets the key only in its environment", async () => {
  const key = plantedKey();
  const composition = await temporaryComposition();
  for (const command of ["deploy", "codegen", "dev"] as const) {
    const call = convexCli(
      {
        selection: { kind: "hosted", url: "unused", key },
        home: "/h",
        composition,
      },
      command,
    );
    expect(call.args).not.toContain("--admin-key");
    expect(call.args).not.toContain("--url");
    expect(Object.keys(call.env).sort()).toEqual([
      "CONVEX_DEPLOY_KEY",
      "HOME",
      "PATH",
      "TMPDIR",
    ]);
    expect(call.env.CONVEX_DEPLOY_KEY).toBe(key);
  }
  const runner = vi
    .spyOn(child, "runChild")
    .mockResolvedValue({ stdout: "", stderr: "" });
  try {
    const { access } = createHostedAccess({
      variables: variables(key),
      composition,
      home: await temporary("libar-hosted-home-"),
      state: { deployed: undefined, environment: new Set() },
    });
    await access.deploy();
    await access.codegen();
    await access.deployTemporary(await temporary("libar-hosted-copy-"));
    await access.exportBackupArchive("archive.zip");
    await access.importBackupArchive("archive.zip");
    expect(runner).toHaveBeenCalledTimes(5);
    for (const [, , args, options] of runner.mock.calls) {
      expect(args).not.toContain("--admin-key");
      expect(args).not.toContain("--url");
      for (const form of deployKeyForms(key))
        expect(args.join(" ")).not.toContain(form);
      expect(Object.keys(options.env!).sort()).toEqual([
        "CONVEX_DEPLOY_KEY",
        "HOME",
        "PATH",
        "TMPDIR",
      ]);
      expect(options.env!.CONVEX_DEPLOY_KEY).toBe(key);
      expect(options.secrets).toEqual(deployKeyForms(key));
    }
  } finally {
    runner.mockRestore();
  }
  const root = join(import.meta.dirname, "../..");
  const hostedFiles = [
    "harness/hosted.ts",
    "harness/hosted-run.ts",
    ...(await readdir(join(root, "tests/hosted"))).map(
      (name) => `tests/hosted/${name}`,
    ),
  ];
  expect(hostedFiles.length).toBeGreaterThan(2);
  for (const file of hostedFiles)
    expect(await readFile(join(root, file), "utf8")).not.toContain(
      "--admin-key",
    );
});

test("pure: a planted deploy key appears in no error, output, log line or record of a native run on a hosted deployment", async () => {
  const key = plantedKey();
  const forms = deployKeyForms(key);
  expect(forms).toHaveLength(4);
  const echo = forms.join(" ");
  const directory = await temporary("libar-hosted-planted-");
  // The stub CLI echoes every form of the key it was given, on both streams, and fails unless its
  // working directory holds a file named succeed.
  const script = join(directory, "stub-cli.mjs");
  await writeFile(
    script,
    [
      'import { existsSync } from "node:fs";',
      'const key = process.env.CONVEX_DEPLOY_KEY ?? "";',
      'const secret = key.slice(key.indexOf("|") + 1);',
      "const forms = [key, secret, encodeURIComponent(key), encodeURIComponent(secret)];",
      'console.log("stub ran: " + forms.join(" "));',
      'console.error("stub ran: " + forms.join(" "));',
      'process.exit(existsSync("succeed") ? 0 : 1);',
    ].join("\n"),
  );
  let functionCalls = 0;
  const fetchStub: typeof globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/api/function")) {
      functionCalls++;
      if (functionCalls === 1)
        return new Response(
          JSON.stringify({
            status: "success",
            value: null,
            logLines: [`[LOG] ${echo}`],
          }),
        );
      if (functionCalls === 2) return new Response(echo, { status: 500 });
      return new Response(JSON.stringify({ status: "unexpected", echo }));
    }
    if (
      url.includes("/api/stream_function_logs") ||
      url.includes("/instance_version")
    )
      throw new TypeError(`fetch failed: ${echo}`);
    return new Response(echo, { status: 500 });
  };
  const socket: SocketFactory = (_url, onTransition): AdminSocketClient => ({
    setAdminAuth() {},
    subscribe() {
      queueMicrotask(() => onTransition(["token"]));
      return undefined;
    },
    localQueryResultByToken() {
      throw new Error(`the socket answered: ${echo}`);
    },
    async close() {},
  });
  const composition = await temporaryComposition();
  const make = (signal?: AbortSignal) =>
    createHostedAccess({
      variables: variables(key),
      composition,
      home: directory,
      state: { deployed: undefined, environment: new Set(), logProcess: {} },
      ...(signal === undefined ? {} : { signal }),
      dependencies: { fetch: fetchStub, socket, cliScript: script },
    }).access;
  const printed: string[] = [];
  const capture = (...args: unknown[]) => {
    printed.push(format(...args));
  };
  const spies = [
    ...(["log", "warn", "error", "debug", "info"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(capture),
    ),
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      printed.push(String(chunk));
      return true;
    }),
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      printed.push(String(chunk));
      return true;
    }),
  ];
  const failures: unknown[] = [];
  const outputs: unknown[] = [];
  let recordText = "";
  try {
    const access = make();
    const failing = await temporary("libar-hosted-copy-");
    const succeeding = await temporary("libar-hosted-copy-");
    await writeFile(join(succeeding, "succeed"), "");
    const calls: (() => Promise<unknown>)[] = [
      () => access.deploy(),
      () => access.deployTemporary(failing),
      () => access.codegen(),
      () => access.setEnvironment({ NAME: "value" }),
      () => access.environment(),
      () => access.run("notes:add"),
      () => access.run("notes:add"),
      () => access.readTable("notes"),
      () => access.writeTable("notes", { insert: { source: "x" } }),
      () =>
        access.writeTable(
          "streams",
          { delete: "an-id" },
          { component: "depot" },
        ),
      () => access.exportBackupArchive(join(directory, "archive.zip")),
      () => access.importBackupArchive(join(directory, "archive.zip")),
      async () => access.completionsSince(await access.logMark(), () => false),
      () => access.usage(),
    ];
    // The first function call succeeds and logs its log line through the client's logger.
    outputs.push(await access.run("notes:add"));
    outputs.push(await access.deployTemporary(succeeding));
    outputs.push(await access.instanceVersion());
    for (const call of calls)
      await call().then(
        (value) => outputs.push({ unexpected: value }),
        (error: unknown) => failures.push(error),
      );
    // A call that aborts rejects with its abort reason, redacted.
    const controller = new AbortController();
    controller.abort(new Error(`aborted with ${echo}`));
    const aborted = make(controller.signal);
    for (const call of [
      () => aborted.exportBackupArchive(join(directory, "archive.zip")),
      () => aborted.deploy(),
    ])
      await call().then(
        (value) => outputs.push({ unexpected: value }),
        (error: unknown) => failures.push(error),
      );
    // The reporter writes the record of such a run, with an error that escaped redaction.
    const runs = join(directory, "runs");
    await mkdir(runs);
    const reporter = new EvidenceReporter({ directory: runs });
    const run = openRunRecord();
    run.secrets = forms;
    run.hosted = {
      ...hostedFacts,
      usageBefore: { readAt: "now", seedStatus: null, response: { echo } },
    };
    reporter.onTestRunStart([{ project: { name: "hosted" } }] as never);
    reporter.onTestCaseResult(
      finished("hosted", { errors: forms.map((form) => `raw ${form}`) }),
    );
    await reporter.onTestRunEnd([] as never, [] as never, "failed" as never);
    amendRunRecord(run, (record) => record.unhandledErrors.push(echo));
    recordText = await readFile(run.path!, "utf8");
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  expect(
    outputs.filter(
      (output) =>
        typeof output === "object" && output !== null && "unexpected" in output,
    ),
  ).toEqual([]);
  expect(failures).toHaveLength(16);
  for (const failure of failures)
    expect(String((failure as Error).message)).toContain("[redacted]");
  expect(JSON.stringify(outputs[1])).toContain("[redacted]");
  expect(printed.join("\n")).toContain("[redacted]");
  expect(recordText).toContain("[redacted]");
  const json = (value: unknown) => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const seen = [
    ...failures.flatMap((failure) => [
      String(failure),
      (failure as Error).stack ?? "",
      json(failure),
    ]),
    ...outputs.map(json),
    ...printed,
    recordText,
  ];
  for (const form of forms)
    expect(
      seen.filter((text) => text.includes(form)),
      "a form of the planted key appeared",
    ).toEqual([]);
});

test("pure: the run setup reads the version and the usage before the run, and after it amends the record in one step", async () => {
  const key = plantedKey();
  const echo = deployKeyForms(key).join(" ");
  for (const [name, value] of Object.entries(variables(key)))
    vi.stubEnv(name, value);
  vi.stubEnv("GITHUB_ACTIONS", "true");
  let readings = 0;
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/instance_version")) return new Response("1.29.0\n");
    if (url.endsWith("/api/v1/get_current_usage"))
      return new Response(
        JSON.stringify({ seedStatus: "complete", reading: ++readings, echo }),
      );
    return new Response("unexpected", { status: 500 });
  });
  const provided: [string, unknown][] = [];
  const directory = await temporary("libar-hosted-run-record-");
  try {
    const teardown = await setupHostedRun({
      provide: (name: string, value: unknown) => provided.push([name, value]),
    } as never);
    expect(provided).toEqual([
      [
        "hostedRun",
        { target: hostedTarget(variables(key)), startedAt: expect.any(String) },
      ],
    ]);
    const reporter = new EvidenceReporter({ directory });
    reporter.onTestRunStart([{ project: { name: "hosted" } }] as never);
    reporter.onTestCaseResult(finished("hosted"));
    await reporter.onTestRunEnd([] as never, [] as never, "passed" as never);
    const [name] = await readdir(directory);
    await teardown();
    const text = await readFile(join(directory, name!), "utf8");
    const record = JSON.parse(text) as NativeRunRecord;
    expect(record.hosted).toMatchObject({
      deployment: "happy-animal-123",
      keyName: "hosted-ci-scoped",
      statedPlan: "Professional",
      ranBy: "continuous integration",
      cliVersion: "1.46.0",
      backendVersion: "1.29.0",
      usageBefore: { seedStatus: "complete", response: { reading: 1 } },
      usageAfter: { seedStatus: "complete", response: { reading: 2 } },
      windowCrossed: crossesUtcDay(
        record.hosted!.usageBefore!.readAt,
        record.hosted!.usageAfter!.readAt,
      ),
      deploys: [],
    });
    for (const form of deployKeyForms(key)) expect(text).not.toContain(form);
    expect(await readdir(directory)).toEqual([name]);
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
  expect(
    crossesUtcDay("2026-10-05T23:59:59.000Z", "2026-10-06T00:00:01.000Z"),
  ).toBe(true);
  expect(
    crossesUtcDay("2026-10-05T00:00:00.000Z", "2026-10-05T23:59:59.000Z"),
  ).toBe(false);
});

function recordCheck(files: string[], key?: string) {
  return new Promise<{ code: number; output: string }>((resolve) =>
    execFile(
      process.execPath,
      [
        join(import.meta.dirname, "../../scripts/hosted-record-check.mjs"),
        ...files,
      ],
      {
        env: {
          PATH: process.env.PATH ?? "",
          ...(key === undefined ? {} : { HOSTED_DEPLOY_KEY: key }),
        },
      },
      (error, stdout) =>
        resolve({
          code: error === null ? 0 : Number(error.code),
          output: stdout,
        }),
    ),
  );
}

test("pure: the record check finds each form of the deploy key in a file, names the file and the form's kind, and prints no form", async () => {
  const key = plantedKey();
  const directory = await temporary("libar-hosted-check-");
  const clean = join(directory, "clean.log");
  await writeFile(clean, "a run that printed no key\n[redacted]\n");
  expect(await recordCheck([clean], key)).toEqual({
    code: 0,
    output: "hosted record check: no form of the deploy key in 1 file\n",
  });
  for (const [index, form] of deployKeyForms(key).entries()) {
    const file = join(directory, `form-${index}.json`);
    await writeFile(file, `{"error": "x${form}x"}`);
    const answer = await recordCheck([clean, file], key);
    expect(answer.code).toBe(1);
    expect(answer.output).toContain(`hosted record check: ${file} holds `);
    expect(answer.output).not.toContain(clean + " holds");
    for (const any of deployKeyForms(key))
      expect(answer.output).not.toContain(any);
  }
  expect((await recordCheck([clean])).code).toBe(2);
  expect((await recordCheck([], key)).code).toBe(2);
  expect((await recordCheck([join(directory, "missing.json")], key)).code).toBe(
    2,
  );
});
