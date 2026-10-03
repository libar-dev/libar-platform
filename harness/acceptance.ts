import {
  codeAnchor,
  codeAnchorId,
  createReader,
  ref,
} from "@libar-dev/software-delivery-protocol";
import type { GraphSchema } from "@libar-dev/software-delivery-protocol";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BackendFacts } from "./backend.js";
import type { NativeTestEntry, TestProjectName } from "./evidence.js";
const anchor = codeAnchor({
  id: codeAnchorId("impl:platform.acceptance-contract.acceptance-check"),
  label: "the acceptance check",
  satisfies: ref("spec:platform.acceptance-contract"),
});
void anchor;

export type AcceptanceTier =
  "domain" | "simulator" | "native" | "end to end" | "build";
export type AcceptanceComposition = "fixture" | "production";
export interface RequiredScenario {
  row: string;
  example: string | null;
  tier: AcceptanceTier | null;
  composition: AcceptanceComposition | null;
  verifiers: { id: string; file: string }[];
}
export type ScenarioStatus = "passed" | "failed" | "absent" | "missing";
export interface AcceptanceVerdict {
  result: "passed" | "not passed";
  commit: string;
  clean: boolean;
  runResult: "passed" | "failed" | "interrupted";
  scenarios: (RequiredScenario & {
    status: ScenarioStatus;
    reason: string | null;
  })[];
}

// The Spec whose `acceptanceRows` names the rows the first experiment requires.
export const firstExperimentSpec = "spec:application.first-experiment";

// What the check reads of the corpus graph. The Protocol's reader satisfies it, and a test can
// hand it a small graph of its own.
export interface ScenarioGraph {
  specs(): readonly { id: string; specKind: string }[];
  specContext(id: string):
    | {
        narrative?: string;
        sections?: { design?: object };
        verifiers: readonly {
          verifierId: string;
          via: string;
          enabled: boolean;
          file?: string;
        }[];
      }
    | undefined;
}

// What the check reads of a run record: the fields it joins on and the ones its answer names.
export interface AcceptanceRecord {
  commit: string;
  clean: boolean;
  result: "passed" | "failed" | "interrupted";
  tests: (Pick<NativeTestEntry, "name" | "file" | "result"> & {
    project?: string;
    backends: Pick<BackendFacts, "composition">[];
  })[];
}

// The check cannot answer: no record, a graph that does not derive, a Spec that names no
// required row, or an example of a required row whose opening line it cannot read.
export class AcceptanceUnanswerable extends Error {}

const tiers: readonly AcceptanceTier[] = [
  "domain",
  "simulator",
  "native",
  "end to end",
  "build",
];
const compositions: readonly AcceptanceComposition[] = [
  "fixture",
  "production",
];
const projectOfTier: Record<AcceptanceTier, TestProjectName> = {
  domain: "pure",
  simulator: "simulator",
  native: "native",
  "end to end": "native",
  build: "types",
};
const rowPattern = /\bSc [A-Z]+\d*-\d+\b/g;

// The rows a Spec's `acceptanceRows` names, in the order it names them.
export function requiredRows(graph: ScenarioGraph, specId: string): string[] {
  const context = graph.specContext(specId);
  if (context === undefined)
    throw new AcceptanceUnanswerable(`The graph has no ${specId}`);
  const entry = (
    context.sections?.design as Record<string, unknown> | undefined
  )?.["acceptanceRows"];
  const rows =
    typeof entry === "string"
      ? [...new Set(entry.match(rowPattern) ?? [])]
      : [];
  if (rows.length === 0)
    throw new AcceptanceUnanswerable(
      `${specId} names no required row in acceptanceRows`,
    );
  return rows;
}

const rowExact = /^Sc [A-Z]+\d*-\d+$/;
// The parts of an example's opening line, the first line of its narrative, separated by " · ", with
// the stop that ends the line taken off its last part.
function openingParts(narrative: string | undefined): string[] {
  const line = (narrative ?? "").split("\n")[0]!.trim();
  const parts = line.split(" · ").map((part) => part.trim());
  parts[parts.length - 1] = parts.at(-1)!.replace(/\.$/, "");
  return parts;
}
const opensWithRow = (narrative: string | undefined) =>
  (narrative ?? "").trimStart().startsWith("Sc ");

// What an opening line that begins with "Sc " states, read whole: the first part is exactly a row,
// the second exactly a tier's name and the word tier, and a third part that begins with a
// composition's name is exactly that name and the word composition. Any other third part, and any
// part after it, describes the case. A line that does not read so makes the check unable to answer.
function readOpening(
  id: string,
  narrative: string | undefined,
): Pick<RequiredScenario, "row" | "tier" | "composition"> {
  const parts = openingParts(narrative);
  const [row = "", tierPart, third] = parts;
  const unreadable = (what: string) =>
    new AcceptanceUnanswerable(
      `The opening line of ${id} ${what}: ${parts.join(" · ")}`,
    );
  if (!rowExact.test(row)) throw unreadable("names no row");
  const tier = tiers.find((name) => tierPart === `${name} tier`);
  if (tier === undefined) throw unreadable("names no tier");
  const named = compositions.find((name) => third?.startsWith(name));
  const composition =
    compositions.find((name) => third === `${name} composition`) ?? null;
  if (named !== undefined && composition === null)
    throw unreadable("names no composition it can read");
  return { row, tier, composition };
}

// One entry per example whose opening line names a required row, and one entry with no example
// for a required row that no example names. Every example whose opening line begins with "Sc " is
// read whole first, so a malformed one never drops out of its row unseen.
export function deriveRequiredScenarios(
  graph: ScenarioGraph,
  specId: string,
): RequiredScenario[] {
  const rows = requiredRows(graph, specId);
  const examples = graph
    .specs()
    .filter((spec) => spec.specKind === "example")
    .map((spec) => ({ id: spec.id, context: graph.specContext(spec.id) }))
    .filter(({ context }) => opensWithRow(context?.narrative))
    .map(({ id, context }) => ({
      id,
      context,
      opening: readOpening(id, context?.narrative),
    }));
  const scenarios: RequiredScenario[] = [];
  for (const row of rows) {
    const named = examples.filter(({ opening }) => opening.row === row);
    if (named.length === 0)
      scenarios.push({
        row,
        example: null,
        tier: null,
        composition: null,
        verifiers: [],
      });
    for (const { id, context, opening } of named)
      scenarios.push({
        ...opening,
        example: id,
        verifiers: (context?.verifiers ?? [])
          .filter(
            (verifier) =>
              verifier.via === "test-anchor" &&
              verifier.enabled &&
              verifier.file !== undefined,
          )
          .map((verifier) => ({
            id: verifier.verifierId,
            file: verifier.file!,
          })),
      });
  }
  return scenarios;
}

function judge(
  scenario: RequiredScenario,
  record: AcceptanceRecord,
): { status: ScenarioStatus; reason: string | null } {
  if (scenario.example === null)
    return { status: "missing", reason: "no example names the row" };
  if (scenario.verifiers.length === 0)
    return { status: "missing", reason: "the example has no enabled verifier" };
  const project = projectOfTier[scenario.tier!];
  const absent: string[] = [];
  const failures: string[] = [];
  const results: AcceptanceRecord["tests"] = [];
  for (const verifier of scenario.verifiers) {
    const own = record.tests.filter((test) => test.file === verifier.file);
    if (own.length === 0) absent.push(verifier.file);
    results.push(...own);
  }
  for (const test of results) {
    if (test.result !== "passed")
      failures.push(`${test.file} ${test.result}: ${test.name}`);
    else if (test.project !== project)
      failures.push(
        `${test.file} ran in the ${test.project ?? "unnamed"} project, not ${project}`,
      );
  }
  if (
    results.length > 0 &&
    (scenario.tier === "native" || scenario.tier === "end to end")
  ) {
    const backends = results.flatMap((test) => test.backends);
    if (scenario.composition === null)
      failures.push("the example names no composition");
    else if (backends.length === 0)
      failures.push("its results name no backend");
    else
      for (const composition of new Set(
        backends
          .map((backend) => backend.composition)
          .filter((composition) => composition !== scenario.composition),
      ))
        failures.push(
          `a backend of its results has the ${composition ?? "unnamed"} composition, not ${scenario.composition}`,
        );
  }
  if (failures.length > 0)
    return { status: "failed", reason: failures.join("; ") };
  if (absent.length > 0)
    return {
      status: "absent",
      reason: `the record has no result of ${absent.join(", ")}`,
    };
  return { status: "passed", reason: null };
}

export function checkAcceptance(
  scenarios: readonly RequiredScenario[],
  record: AcceptanceRecord,
): AcceptanceVerdict {
  const judged = scenarios.map((scenario) => ({
    ...scenario,
    ...judge(scenario, record),
  }));
  const passed =
    record.result === "passed" &&
    record.clean === true &&
    judged.every((scenario) => scenario.status === "passed");
  return {
    result: passed ? "passed" : "not passed",
    commit: record.commit,
    clean: record.clean,
    runResult: record.result,
    scenarios: judged,
  };
}

// 0 when the check passes; 1 when a required scenario is failed or absent, the run did not pass
// or its tree was not clean; 3 when none of those holds and a required scenario is missing.
export function acceptanceExit(verdict: AcceptanceVerdict): 0 | 1 | 3 {
  if (verdict.result === "passed") return 0;
  if (
    verdict.runResult !== "passed" ||
    !verdict.clean ||
    verdict.scenarios.some(
      (scenario) =>
        scenario.status === "failed" || scenario.status === "absent",
    )
  )
    return 1;
  return 3;
}

export function renderAcceptance(verdict: AcceptanceVerdict): string[] {
  const lines = verdict.scenarios.map((scenario) =>
    [
      scenario.row,
      scenario.example ?? "-",
      scenario.tier ?? "-",
      scenario.composition ?? "-",
      scenario.verifiers.map((verifier) => verifier.file).join(", ") || "-",
      scenario.status,
      scenario.reason ?? "-",
    ].join(" | "),
  );
  const count = (status: ScenarioStatus) =>
    verdict.scenarios.filter((scenario) => scenario.status === status).length;
  lines.push(
    `acceptance: ${verdict.result} · ${count("passed")} passed, ${count("failed")} failed, ${count("absent")} absent, ${count("missing")} missing · run ${verdict.runResult} · tree ${verdict.clean ? "clean" : "not clean"} · commit ${verdict.commit}`,
  );
  return lines;
}

const runResults: readonly unknown[] = ["passed", "failed", "interrupted"];
const testResults: readonly unknown[] = ["passed", "failed", "skipped"];
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
// The fields that make a file a run record at all: its commit, tree state, result and a list of
// tests. Only a file of this shape that states its start is a candidate for the newest record.
function hasRunRecordShape(value: unknown): value is Record<string, unknown> {
  return (
    isObject(value) &&
    typeof value.commit === "string" &&
    typeof value.clean === "boolean" &&
    runResults.includes(value.result) &&
    Array.isArray(value.tests)
  );
}
// A native run on a hosted deployment passes no scenario, so the check reads only a record whose
// target is absent or the local backend.
const targetsLocalBackend = (value: Record<string, unknown>) =>
  value.target === undefined || value.target === "local backend";
// Why a test entry cannot be read, or null when it can.
function entryProblem(entry: unknown): string | null {
  if (!isObject(entry)) return "is not an object";
  if (typeof entry.name !== "string") return "has no name";
  if (typeof entry.file !== "string") return "has no file";
  if (!testResults.includes(entry.result))
    return "has a result other than passed, failed or skipped";
  if (entry.project !== undefined && typeof entry.project !== "string")
    return "names its project with something other than text";
  if (!Array.isArray(entry.backends)) return "has no list of backends";
  for (const backend of entry.backends as unknown[]) {
    if (!isObject(backend)) return "has a backend that is not an object";
    const { composition } = backend;
    if (
      composition !== undefined &&
      composition !== null &&
      typeof composition !== "string"
    )
      return "has a backend whose composition is not text";
  }
  return null;
}
function readRecord(path: string): AcceptanceRecord {
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new AcceptanceUnanswerable(
      `The record ${path} cannot be read: ${(error as Error).message}`,
    );
  }
  if (!hasRunRecordShape(record))
    throw new AcceptanceUnanswerable(`The file ${path} is not a run record`);
  if (!targetsLocalBackend(record))
    throw new AcceptanceUnanswerable(
      `The record ${path} is not a run on the local backend, and a native run on a hosted deployment passes no scenario`,
    );
  for (const [index, entry] of (record.tests as unknown[]).entries()) {
    const problem = entryProblem(entry);
    if (problem !== null)
      throw new AcceptanceUnanswerable(
        `The record ${path} is not a run record: its test entry ${index} ${problem}`,
      );
  }
  return record as unknown as AcceptanceRecord;
}

// The record of the run that started last, by the `startedAt` it states, and of equal starts the one
// whose file name sorts last. Only a file with the
// shape of a run record is a candidate, so an unrelated JSON file hides no record.
export function newestRecord(directory: string): string {
  let names: string[];
  try {
    names = readdirSync(directory).filter((name) => name.endsWith(".json"));
  } catch {
    names = [];
  }
  // Equal start times are broken by the file name: the one that sorts last is the newest.
  let newest: { path: string; name: string; startedAt: string } | undefined;
  for (const name of names) {
    const path = join(directory, name);
    let candidate: unknown;
    try {
      candidate = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    if (!hasRunRecordShape(candidate) || !targetsLocalBackend(candidate))
      continue;
    const { startedAt } = candidate;
    if (typeof startedAt !== "string") continue;
    if (
      newest === undefined ||
      startedAt > newest.startedAt ||
      (startedAt === newest.startedAt && name > newest.name)
    )
      newest = { path, name, startedAt };
  }
  if (newest === undefined)
    throw new AcceptanceUnanswerable(`No run record under ${directory}`);
  return newest.path;
}

// The corpus graph that `sdp build` wrote, read through the Protocol's reader.
export function loadGraph(path: string): ScenarioGraph {
  try {
    return createReader(JSON.parse(readFileSync(path, "utf8")) as GraphSchema);
  } catch (error) {
    throw new AcceptanceUnanswerable(
      `The graph ${path} does not derive: ${(error as Error).message}`,
    );
  }
}

// What `npm run acceptance` prints and how it exits, from the graph, or the path of the derived
// graph, and a record: the record a path names, or else the newest under the runs directory.
export function answerAcceptance(options: {
  graph: ScenarioGraph | string;
  runsDirectory: string;
  recordPath?: string;
  specId?: string;
}): { record: string | null; lines: string[]; exit: 0 | 1 | 2 | 3 } {
  let record: string | null = null;
  try {
    const graph =
      typeof options.graph === "string"
        ? loadGraph(options.graph)
        : options.graph;
    const scenarios = deriveRequiredScenarios(
      graph,
      options.specId ?? firstExperimentSpec,
    );
    record = options.recordPath ?? newestRecord(options.runsDirectory);
    const verdict = checkAcceptance(scenarios, readRecord(record));
    return {
      record,
      lines: renderAcceptance(verdict),
      exit: acceptanceExit(verdict),
    };
  } catch (error) {
    // Anything else that breaks the check is no answer either: the check never ends in a throw.
    const reason =
      error instanceof Error ? error.message : `it threw ${String(error)}`;
    return {
      record,
      lines: [`acceptance: cannot answer · ${reason}`],
      exit: 2,
    };
  }
}
