import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  acceptanceExit,
  answerAcceptance,
  checkAcceptance,
  deriveRequiredScenarios,
  firstExperimentSpec,
  loadGraph,
  requiredRows,
} from "../../harness/acceptance.js";
import type {
  AcceptanceRecord,
  ScenarioGraph,
} from "../../harness/acceptance.js";
const anchor = specTest({
  id: testAnchorId("test:platform.acceptance-contract.acceptance-check"),
  verifies: ref("spec:platform.acceptance-contract"),
});
void anchor;

const root = join(import.meta.dirname, "../..");
const experiment = "spec:sample.experiment";

// A small graph: one Spec that names three rows, and one example of each row with one verifier.
interface SampleExample {
  id: string;
  opening: string;
  files: string[];
}
function sampleGraph(
  examples: SampleExample[] = [
    {
      id: "spec:sample.evaluate",
      opening: "Sc L0-1 · domain tier.",
      files: ["tests/pure/evaluate.test.ts"],
    },
    {
      id: "spec:sample.transition",
      opening: "Sc L1-1 · native tier · fixture composition.",
      files: ["tests/native/transition.test.ts"],
    },
    {
      id: "spec:sample.production",
      opening: "Sc L2-9 · end to end tier · production composition.",
      files: ["tests/native/production.test.ts"],
    },
  ],
  acceptanceRows = "the rows are Sc L0-1, Sc L1-1 and Sc L2-9 (E-17)",
): ScenarioGraph {
  return {
    specs: () => [
      { id: experiment, specKind: "rule" },
      ...examples.map((example) => ({ id: example.id, specKind: "example" })),
    ],
    specContext: (id) => {
      if (id === experiment)
        return { sections: { design: { acceptanceRows } }, verifiers: [] };
      const example = examples.find((candidate) => candidate.id === id);
      if (example === undefined) return undefined;
      return {
        narrative: `${example.opening}\n\nMore of the narrative.`,
        verifiers: example.files.map((file) => ({
          verifierId: `test:${file}`,
          via: "test-anchor",
          enabled: true,
          file,
        })),
      };
    },
  };
}
function sampleRecord(): AcceptanceRecord {
  return {
    commit: "0123456789abcdef0123456789abcdef01234567",
    clean: true,
    result: "passed",
    tests: [
      {
        project: "pure",
        name: "pure: evaluate twice",
        file: "tests/pure/evaluate.test.ts",
        result: "passed",
        backends: [],
      },
      {
        project: "native",
        name: "an invalid transition",
        file: "tests/native/transition.test.ts",
        result: "passed",
        backends: [{ composition: "fixture" }],
      },
      {
        project: "native",
        name: "the end-to-end path",
        file: "tests/native/production.test.ts",
        result: "passed",
        backends: [{ composition: "production" }],
      },
    ],
  };
}
const statusOf = (record: AcceptanceRecord, row: string) =>
  checkAcceptance(
    deriveRequiredScenarios(sampleGraph(), experiment),
    record,
  ).scenarios.find((scenario) => scenario.row === row)?.status;

async function answered(graph: ScenarioGraph, record: AcceptanceRecord) {
  const directory = await mkdtemp(join(tmpdir(), "libar-acceptance-"));
  try {
    const path = join(directory, "record.json");
    await writeFile(path, JSON.stringify(record));
    return answerAcceptance({
      graph,
      runsDirectory: directory,
      recordPath: path,
      specId: experiment,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("pure: every required scenario passed in a passed run on a clean tree, so the check passes and exits 0", async () => {
  const answer = await answered(sampleGraph(), sampleRecord());
  expect(answer.exit).toBe(0);
  expect(answer.lines).toHaveLength(4);
  expect(answer.lines.slice(0, 3).map((line) => line.split(" | ")[5])).toEqual([
    "passed",
    "passed",
    "passed",
  ]);
  expect(answer.lines.at(-1)).toMatch(
    /^acceptance: passed · 3 passed, 0 failed, 0 absent, 0 missing · .* · commit 0123456789abcdef/,
  );
});

test("pure: a required scenario removed from the record is absent and the check fails with exit 1", async () => {
  const record = sampleRecord();
  record.tests = record.tests.filter(
    (entry) => entry.file !== "tests/native/transition.test.ts",
  );
  const answer = await answered(sampleGraph(), record);
  expect(answer.exit).toBe(1);
  expect(answer.lines[1]).toContain("Sc L1-1");
  expect(answer.lines[1]).toContain("| absent |");
  expect(answer.lines.at(-1)).toMatch(/^acceptance: not passed · 2 passed/);
});

test("pure: a required scenario whose verifier is removed from the graph is missing and the check exits 3", async () => {
  const graph = sampleGraph([
    {
      id: "spec:sample.evaluate",
      opening: "Sc L0-1 · domain tier.",
      files: ["tests/pure/evaluate.test.ts"],
    },
    {
      id: "spec:sample.transition",
      opening: "Sc L1-1 · native tier · fixture composition.",
      files: [],
    },
    {
      id: "spec:sample.production",
      opening: "Sc L2-9 · end to end tier · production composition.",
      files: ["tests/native/production.test.ts"],
    },
  ]);
  const answer = await answered(graph, sampleRecord());
  expect(answer.exit).toBe(3);
  expect(answer.lines[1]).toContain("| missing |");
  expect(answer.lines.at(-1)).toMatch(/^acceptance: not passed /);
});

test("pure: a result that failed or was skipped makes its scenario failed and the check exits 1", () => {
  for (const result of ["failed", "skipped"] as const) {
    const record = sampleRecord();
    record.tests[0]!.result = result;
    const verdict = checkAcceptance(
      deriveRequiredScenarios(sampleGraph(), experiment),
      record,
    );
    expect(verdict.scenarios[0]!.status).toBe("failed");
    expect(verdict.result).toBe("not passed");
    expect(acceptanceExit(verdict)).toBe(1);
  }
});

test("pure: a file with two tests passes only when both passed", () => {
  const record = sampleRecord();
  record.tests.push({
    ...record.tests[1]!,
    name: "an invalid transition, second test",
    result: "failed",
  });
  expect(statusOf(record, "Sc L1-1")).toBe("failed");
});

test("pure: a native scenario fails on another composition, on no backend, or when its example names no composition", () => {
  const wrong = sampleRecord();
  wrong.tests[2]!.backends = [{ composition: "fixture" }];
  expect(statusOf(wrong, "Sc L2-9")).toBe("failed");
  const mixed = sampleRecord();
  mixed.tests[2]!.backends = [
    { composition: "production" },
    { composition: "fixture" },
  ];
  expect(statusOf(mixed, "Sc L2-9")).toBe("failed");
  const none = sampleRecord();
  none.tests[2]!.backends = [];
  expect(statusOf(none, "Sc L2-9")).toBe("failed");
  const unnamed = sampleGraph([
    {
      id: "spec:sample.evaluate",
      opening: "Sc L0-1 · domain tier.",
      files: ["tests/pure/evaluate.test.ts"],
    },
    {
      id: "spec:sample.transition",
      opening: "Sc L1-1 · native tier.",
      files: ["tests/native/transition.test.ts"],
    },
    {
      id: "spec:sample.production",
      opening: "Sc L2-9 · end to end tier · production composition.",
      files: ["tests/native/production.test.ts"],
    },
  ]);
  // Its backend names no composition either, so only the example's silence can fail it.
  const silent = sampleRecord();
  silent.tests[1]!.backends = [{ composition: null }];
  const verdict = checkAcceptance(
    deriveRequiredScenarios(unnamed, experiment),
    silent,
  );
  expect(verdict.scenarios[1]).toMatchObject({
    composition: null,
    status: "failed",
    reason: "the example names no composition",
  });
});

test("pure: a native scenario whose only result came from the pure project is failed", () => {
  const record = sampleRecord();
  record.tests[1]!.project = "pure";
  expect(statusOf(record, "Sc L1-1")).toBe("failed");
  const unnamed = sampleRecord();
  delete unnamed.tests[1]!.project;
  expect(statusOf(unnamed, "Sc L1-1")).toBe("failed");
  // A domain scenario does not pass on a native result either.
  const domain = sampleRecord();
  domain.tests[0]!.project = "native";
  expect(statusOf(domain, "Sc L0-1")).toBe("failed");
});

test("pure: every scenario passed, and a run that failed or a tree that was not clean still fails the check with exit 1", async () => {
  const unclean = sampleRecord();
  unclean.clean = false;
  const failed = sampleRecord();
  failed.result = "failed";
  for (const record of [unclean, failed]) {
    const answer = await answered(sampleGraph(), record);
    expect(answer.exit).toBe(1);
    expect(answer.lines.at(-1)).toMatch(
      /^acceptance: not passed · 3 passed, 0 failed, 0 absent, 0 missing/,
    );
  }
});

test("pure: a required row that no example names has one entry with no example, and it is missing", () => {
  const graph = sampleGraph(
    undefined,
    "the rows are Sc L0-1, Sc L1-1, Sc L1-12 and Sc L2-9 (E-17)",
  );
  const scenarios = deriveRequiredScenarios(graph, experiment);
  expect(scenarios.map((scenario) => scenario.row)).toEqual([
    "Sc L0-1",
    "Sc L1-1",
    "Sc L1-12",
    "Sc L2-9",
  ]);
  expect(scenarios[2]).toEqual({
    row: "Sc L1-12",
    example: null,
    tier: null,
    composition: null,
    verifiers: [],
  });
  const verdict = checkAcceptance(scenarios, sampleRecord());
  expect(verdict.scenarios[2]!.status).toBe("missing");
  expect(acceptanceExit(verdict)).toBe(3);
});

test("pure: the check cannot answer, and exits 2, on an unreadable opening line, no record, no required row or no graph", async () => {
  const unreadable = sampleGraph([
    {
      id: "spec:sample.evaluate",
      opening: "Sc L0-1 · a tier it does not know.",
      files: ["tests/pure/evaluate.test.ts"],
    },
  ]);
  expect((await answered(unreadable, sampleRecord())).exit).toBe(2);
  const noRow = sampleGraph(undefined, "no rows at all");
  expect((await answered(noRow, sampleRecord())).exit).toBe(2);
  const directory = await mkdtemp(join(tmpdir(), "libar-acceptance-empty-"));
  try {
    const noRecord = answerAcceptance({
      graph: sampleGraph(),
      runsDirectory: directory,
      specId: experiment,
    });
    expect(noRecord.exit).toBe(2);
    expect(noRecord.lines).toEqual([
      expect.stringMatching(/^acceptance: cannot answer · No run record/),
    ]);
    await writeFile(join(directory, "graph.json"), "not a graph");
    expect(
      answerAcceptance({
        graph: join(directory, "graph.json"),
        runsDirectory: directory,
        specId: experiment,
      }).exit,
    ).toBe(2);
    await writeFile(join(directory, "not-a-record.json"), "{}");
    expect(
      answerAcceptance({
        graph: sampleGraph(),
        runsDirectory: directory,
        recordPath: join(directory, "not-a-record.json"),
        specId: experiment,
      }).exit,
    ).toBe(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pure: with no path the check reads the record of the run that started last", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-acceptance-newest-"));
  try {
    const older = { ...sampleRecord(), startedAt: "2026-01-01T00:00:00.000Z" };
    const newer = {
      ...sampleRecord(),
      clean: false,
      startedAt: "2026-01-02T00:00:00.000Z",
    };
    // The names sort the other way, so only the stated start can choose.
    await writeFile(join(directory, "b.json"), JSON.stringify(older));
    await writeFile(join(directory, "a.json"), JSON.stringify(newer));
    const answer = answerAcceptance({
      graph: sampleGraph(),
      runsDirectory: directory,
      specId: experiment,
    });
    expect(answer.record).toBe(join(directory, "a.json"));
    expect(answer.exit).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pure: acceptanceRows names the rows the doc's table gives Layer 0, 1 or 2, and every native example of them that has a verifier names its composition", async () => {
  const doc = await readFile(
    join(root, "docs/convex-transactional-domain-platform-decisions.md"),
    "utf8",
  );
  const table = doc
    .slice(doc.indexOf("## Acceptance scenarios"), doc.indexOf("Tiers."))
    .split("\n");
  const counts = new Map<string, number>();
  const tableRows: string[] = [];
  for (const line of table) {
    const layer = /^\| (\d) \|/.exec(line)?.[1];
    if (layer === undefined || Number(layer) > 2) continue;
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
    tableRows.push(`Sc L${layer}-${counts.get(layer)}`);
  }
  const graph = loadGraph(join(root, "generated/graph.json"));
  const rows = requiredRows(graph, firstExperimentSpec);
  expect(rows).toHaveLength(23);
  expect(rows).toEqual(tableRows);
  const scenarios = deriveRequiredScenarios(graph, firstExperimentSpec);
  expect(
    scenarios
      .filter(
        (scenario) =>
          (scenario.tier === "native" || scenario.tier === "end to end") &&
          scenario.verifiers.length > 0 &&
          scenario.composition === null,
      )
      .map((scenario) => scenario.example),
  ).toEqual([]);
});
