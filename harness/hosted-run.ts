import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { refuseDotenv } from "./backup-archive.js";
import {
  compositions,
  fixtureComposition,
  projectDirectory,
} from "./composition.js";
import { amendRunRecord, openRunRecord } from "./evidence.js";
import type { HostedUsage, RunRecordSlot } from "./evidence.js";
import { createHostedAccess, hostedTarget } from "./hosted.js";
import type { HostedAccess } from "./hosted.js";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.native-harness.hosted-run"),
  label: "the hosted run's setup and its amendment of the record",
  satisfies: ref("spec:platform.native-harness"),
});
void anchor;
// Whether a UTC day boundary falls between two times, which leaves a difference of two usage
// readings, each of the current UTC day, unsettled.
export function crossesUtcDay(from: string, to: string): boolean {
  return from.slice(0, 10) !== to.slice(0, 10);
}
// A failed reading is recorded as none, with its message, already redacted by the access, on the
// run's standard error.
async function reading(access: HostedAccess): Promise<HostedUsage | null> {
  try {
    return await access.usage();
  } catch (error) {
    process.stderr.write(
      `The deployment's usage could not be read: ${(error as Error).message}\n`,
    );
    return null;
  }
}
async function cliVersion(): Promise<string> {
  const manifest = join(
    import.meta.dirname,
    "../node_modules/convex/package.json",
  );
  return (JSON.parse(await readFile(manifest, "utf8")) as { version: string })
    .version;
}
// The global setup of npm run test:hosted. It selects the hosted deployment from the four process
// variables, refuses a composition directory with a dotenv file, reads the deployment's version
// and usage before the run, and gives the reporter the secrets and the hosted facts. After the run
// it reads the usage again and amends the record in one step.
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const variables = process.env;
  const target = hostedTarget(variables);
  for (const composition of compositions)
    refuseDotenv(projectDirectory(composition));
  const startedAt = new Date().toISOString();
  const home = await mkdtemp(join(tmpdir(), "libar-hosted-run-"));
  const { access, secrets } = createHostedAccess({
    variables,
    composition: fixtureComposition,
    home,
    state: { deployed: undefined, environment: new Set(), logProcess: {} },
  });
  const run = openRunRecord();
  run.secrets = secrets;
  run.hosted = {
    deployment: target.deployment,
    keyName: target.keyName,
    statedPlan: target.statedPlan,
    ranBy:
      variables.GITHUB_ACTIONS === "true"
        ? "continuous integration"
        : "developer",
    cliVersion: await cliVersion(),
    backendVersion: await access.instanceVersion(),
    usageBefore: await reading(access),
    usageAfter: null,
    windowCrossed: false,
  };
  project.provide("hostedRun", { target, startedAt });
  return () => finishHostedRun(run, access, startedAt, home);
}
export async function finishHostedRun(
  run: RunRecordSlot,
  access: HostedAccess,
  startedAt: string,
  home: string,
): Promise<void> {
  try {
    const usageAfter = await reading(access);
    amendRunRecord(run, (record) => {
      if (record.hosted === null) return;
      record.hosted.usageAfter = usageAfter;
      record.hosted.windowCrossed = crossesUtcDay(
        record.hosted.usageBefore?.readAt ?? startedAt,
        usageAfter?.readAt ?? new Date().toISOString(),
      );
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
