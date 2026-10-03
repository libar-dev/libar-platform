import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, onTestFinished, test } from "vitest";
import { answerAcceptance } from "../../harness/acceptance.js";
import type { ScenarioGraph } from "../../harness/acceptance.js";
import EvidenceReporter, {
  amendRunRecord,
  hostedDeployMeasurement,
  openRunRecord,
} from "../../harness/evidence.js";
import type { NativeRunRecord } from "../../harness/evidence.js";
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
