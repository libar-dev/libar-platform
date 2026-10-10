import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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
  // Files of verifiers that are present and disabled.
  disabled?: string[];
}
function sampleGraph(
  examples: SampleExample[] = [
    {
      id: "spec:sample.evaluate",
      opening: "Sc L0-1 · pure test tier.",
      files: ["tests/pure/evaluate.test.ts"],
    },
    {
      id: "spec:sample.transition",
      opening: "Sc L1-1 · native backend tier · fixture composition.",
      files: ["tests/native/transition.test.ts"],
    },
    {
      id: "spec:sample.production",
      opening: "Sc L2-9 · native backend tier · production composition.",
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
        verifiers: [
          ...example.files.map((file) => ({ file, enabled: true })),
          ...(example.disabled ?? []).map((file) => ({ file, enabled: false })),
        ].map(({ file, enabled }) => ({
          verifierId: `test:${file}`,
          via: "test-anchor",
          enabled,
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
      opening: "Sc L0-1 · pure test tier.",
      files: ["tests/pure/evaluate.test.ts"],
    },
    {
      id: "spec:sample.transition",
      opening: "Sc L1-1 · native backend tier · fixture composition.",
      files: [],
    },
    {
      id: "spec:sample.production",
      opening: "Sc L2-9 · native backend tier · production composition.",
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

test("pure: a native backend scenario fails on another composition, on no backend, or when its example names no composition", () => {
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
      opening: "Sc L0-1 · pure test tier.",
      files: ["tests/pure/evaluate.test.ts"],
    },
    {
      id: "spec:sample.transition",
      opening: "Sc L1-1 · native backend tier.",
      files: ["tests/native/transition.test.ts"],
    },
    {
      id: "spec:sample.production",
      opening: "Sc L2-9 · native backend tier · production composition.",
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

test("pure: a native backend scenario whose only result came from the pure project is failed", () => {
  const record = sampleRecord();
  record.tests[1]!.project = "pure";
  expect(statusOf(record, "Sc L1-1")).toBe("failed");
  const unnamed = sampleRecord();
  delete unnamed.tests[1]!.project;
  expect(statusOf(unnamed, "Sc L1-1")).toBe("failed");
  // A pure test scenario does not pass on a result of the native project either.
  const pure = sampleRecord();
  pure.tests[0]!.project = "native";
  expect(statusOf(pure, "Sc L0-1")).toBe("failed");
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

test("pure: a scenario with one verifier failed and another absent is failed", () => {
  const graph = sampleGraph([
    {
      id: "spec:sample.evaluate",
      opening: "Sc L0-1 · pure test tier.",
      files: [
        "tests/pure/evaluate.test.ts",
        "tests/pure/evaluate-again.test.ts",
      ],
    },
  ]);
  const record = sampleRecord();
  record.tests[0]!.result = "failed";
  const verdict = checkAcceptance(
    deriveRequiredScenarios(graph, experiment),
    record,
  );
  expect(verdict.scenarios[0]).toMatchObject({
    row: "Sc L0-1",
    status: "failed",
  });
});

test("pure: a failed scenario beside a missing one makes the check exit 1", () => {
  const graph = sampleGraph(
    undefined,
    "the rows are Sc L0-1, Sc L1-1, Sc L1-12 and Sc L2-9 (E-17)",
  );
  const record = sampleRecord();
  record.tests[0]!.result = "failed";
  const verdict = checkAcceptance(
    deriveRequiredScenarios(graph, experiment),
    record,
  );
  expect(verdict.scenarios.map((scenario) => scenario.status)).toEqual([
    "failed",
    "passed",
    "missing",
    "passed",
  ]);
  expect(acceptanceExit(verdict)).toBe(1);
});

test("pure: a file with two passing results passes", () => {
  const record = sampleRecord();
  record.tests.push({
    ...record.tests[1]!,
    name: "an invalid transition, second test",
  });
  expect(statusOf(record, "Sc L1-1")).toBe("passed");
});

test("pure: a record whose test entries are malformed is no record, so the check cannot answer and exits 2", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-acceptance-nested-"));
  try {
    const path = join(directory, "record.json");
    const malformed = {
      ...sampleRecord(),
      startedAt: "2026-01-01T00:00:00.000Z",
      tests: [null],
    };
    await writeFile(path, JSON.stringify(malformed));
    for (const options of [{ recordPath: path }, {}]) {
      const answer = answerAcceptance({
        graph: sampleGraph(),
        runsDirectory: directory,
        specId: experiment,
        ...options,
      });
      expect(answer.exit).toBe(2);
      expect(answer.lines).toEqual([
        `acceptance: cannot answer · The record ${path} is not a run record: its test entry 0 is not an object`,
      ]);
    }
    const noBackends = sampleRecord();
    delete (noBackends.tests[1] as Partial<AcceptanceRecord["tests"][number]>)
      .backends;
    await writeFile(path, JSON.stringify(noBackends));
    expect(
      answerAcceptance({
        graph: sampleGraph(),
        runsDirectory: directory,
        recordPath: path,
        specId: experiment,
      }).lines,
    ).toEqual([
      `acceptance: cannot answer · The record ${path} is not a run record: its test entry 1 has no list of backends`,
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pure: a newer JSON file that is not a run record does not hide an older record", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "libar-acceptance-unrelated-"),
  );
  try {
    await writeFile(
      join(directory, "record.json"),
      JSON.stringify({
        ...sampleRecord(),
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await writeFile(
      join(directory, "other.json"),
      JSON.stringify({ startedAt: "2026-02-01T00:00:00.000Z", notes: [] }),
    );
    const answer = answerAcceptance({
      graph: sampleGraph(),
      runsDirectory: directory,
      specId: experiment,
    });
    expect(answer.record).toBe(join(directory, "record.json"));
    expect(answer.exit).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pure: a graph that throws while it is read leaves the check unable to answer, and it exits 2", () => {
  const broken: ScenarioGraph = {
    specs: () => {
      throw new TypeError("the reader broke");
    },
    specContext: (id) => sampleGraph().specContext(id),
  };
  expect(
    answerAcceptance({
      graph: broken,
      runsDirectory: tmpdir(),
      recordPath: join(tmpdir(), "no-such-record.json"),
      specId: experiment,
    }),
  ).toEqual({
    record: null,
    lines: ["acceptance: cannot answer · the reader broke"],
    exit: 2,
  });
});

const evaluate: SampleExample = {
  id: "spec:sample.evaluate",
  opening: "Sc L0-1 · pure test tier.",
  files: ["tests/pure/evaluate.test.ts"],
};
const transition: SampleExample = {
  id: "spec:sample.transition",
  opening: "Sc L1-1 · native backend tier · fixture composition.",
  files: ["tests/native/transition.test.ts"],
};
const production: SampleExample = {
  id: "spec:sample.production",
  opening: "Sc L2-9 · native backend tier · production composition.",
  files: ["tests/native/production.test.ts"],
};
const cannotAnswer = (graph: ScenarioGraph) =>
  answered(graph, sampleRecord()).then((answer) => {
    expect(answer.exit).toBe(2);
    expect(answer.lines).toHaveLength(1);
    expect(answer.lines[0]).toMatch(/^acceptance: cannot answer · /);
    return answer.lines[0]!;
  });

test("pure: a tier part with anything after the word tier is unreadable, and the check exits 2", async () => {
  const line = await cannotAnswer(
    sampleGraph([
      evaluate,
      {
        ...transition,
        opening: "Sc L1-1 · native backend tierBROKEN · fixture composition.",
      },
      production,
    ]),
  );
  expect(line).toContain("spec:sample.transition names no tier");
});

test("pure: an opening line that names a tier by an old name names no tier, and the check exits 2", async () => {
  for (const tier of ["domain", "simulator", "native", "build", "end to end"]) {
    const line = await cannotAnswer(
      sampleGraph([
        evaluate,
        { ...transition, opening: `Sc L1-1 · ${tier} tier.` },
        production,
      ]),
    );
    expect(line).toContain("spec:sample.transition names no tier");
  }
});

test("pure: a malformed sibling of a required row's example makes the check exit 2, and never drops out", async () => {
  const line = await cannotAnswer(
    sampleGraph([
      evaluate,
      transition,
      {
        id: "spec:sample.transition-sibling",
        opening: "Sc L1-1: native backend tier · fixture composition.",
        files: ["tests/native/transition.test.ts"],
      },
      production,
    ]),
  );
  expect(line).toContain("spec:sample.transition-sibling names no row");
});

test("pure: every opening line that begins with Sc reads whole, of a required row or not, composition included", async () => {
  for (const opening of [
    "Sc L3-1 · native backend tier · fixture compositionBROKEN.",
    "Sc L3-1 · natve backend tier.",
    "Sc L3-1x · native backend tier.",
  ])
    await cannotAnswer(
      sampleGraph([
        evaluate,
        transition,
        production,
        { id: "spec:sample.later", opening, files: [] },
      ]),
    );
  // A part after the tier that names no composition describes the case, and an opening line that does
  // not begin with Sc is no scenario's.
  const answer = await answered(
    sampleGraph([
      { ...evaluate, opening: "Sc L0-1 · pure test tier · the only case." },
      {
        ...transition,
        opening:
          "Sc L1-1 · native backend tier · fixture composition · first of two cases.",
      },
      production,
      {
        id: "spec:sample.probe",
        opening: "Probe 1 · native backend tierX.",
        files: [],
      },
    ]),
    sampleRecord(),
  );
  expect(answer.exit).toBe(0);
});

test("pure: of two records that state the same start, the one whose file name sorts last is the newest", async () => {
  const startedAt = "2026-01-01T00:00:00.000Z";
  const passed = { ...sampleRecord(), startedAt };
  const failed = { ...sampleRecord(), result: "failed", startedAt };
  for (const [last, first, exit] of [
    [passed, failed, 0],
    [failed, passed, 1],
  ] as const)
    for (const order of ["last written first", "last written last"]) {
      const directory = await mkdtemp(join(tmpdir(), "libar-acceptance-tie-"));
      try {
        const writes = [
          () => writeFile(join(directory, "b.json"), JSON.stringify(last)),
          () => writeFile(join(directory, "a.json"), JSON.stringify(first)),
        ];
        for (const write of order === "last written first"
          ? writes
          : writes.reverse())
          await write();
        const answer = answerAcceptance({
          graph: sampleGraph(),
          runsDirectory: directory,
          specId: experiment,
        });
        expect(answer.record).toBe(join(directory, "b.json"));
        expect(answer.exit).toBe(exit);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
});

test("pure: the newest record is chosen by the time of day as well as the date", async () => {
  // In both namings, so neither the order of the directory nor the order of the names can choose.
  for (const [morning, evening] of [
    ["a.json", "b.json"],
    ["b.json", "a.json"],
  ]) {
    const directory = await mkdtemp(join(tmpdir(), "libar-acceptance-time-"));
    try {
      await writeFile(
        join(directory, morning!),
        JSON.stringify({
          ...sampleRecord(),
          startedAt: "2026-01-01T09:00:00.000Z",
        }),
      );
      await writeFile(
        join(directory, evening!),
        JSON.stringify({
          ...sampleRecord(),
          clean: false,
          startedAt: "2026-01-01T17:00:00.000Z",
        }),
      );
      const answer = answerAcceptance({
        graph: sampleGraph(),
        runsDirectory: directory,
        specId: experiment,
      });
      expect(answer.record).toBe(join(directory, evening!));
      expect(answer.exit).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("pure: every example of a required row is judged, not only the first", () => {
  const second: SampleExample = {
    id: "spec:sample.transition-second",
    opening:
      "Sc L1-1 · native backend tier · fixture composition · the second case.",
    files: ["tests/native/transition-second.test.ts"],
  };
  const record = sampleRecord();
  record.tests.push({
    ...record.tests[1]!,
    file: "tests/native/transition-second.test.ts",
    result: "failed",
  });
  const verdict = checkAcceptance(
    deriveRequiredScenarios(
      sampleGraph([evaluate, transition, second, production]),
      experiment,
    ),
    record,
  );
  expect(
    verdict.scenarios.map(({ row, example, status }) => [row, example, status]),
  ).toEqual([
    ["Sc L0-1", "spec:sample.evaluate", "passed"],
    ["Sc L1-1", "spec:sample.transition", "passed"],
    ["Sc L1-1", "spec:sample.transition-second", "failed"],
    ["Sc L2-9", "spec:sample.production", "passed"],
  ]);
});

test("pure: a disabled verifier is not counted as enabled, so its example is missing", () => {
  const verdict = checkAcceptance(
    deriveRequiredScenarios(
      sampleGraph([
        evaluate,
        {
          ...transition,
          files: [],
          disabled: ["tests/native/transition.test.ts"],
        },
        production,
      ]),
      experiment,
    ),
    sampleRecord(),
  );
  expect(verdict.scenarios[1]).toMatchObject({
    verifiers: [],
    status: "missing",
    reason: "the example has no enabled verifier",
  });
  expect(acceptanceExit(verdict)).toBe(3);
});

test("pure: the second verifier of an example is inspected as well as the first", () => {
  const twoFiles: SampleExample = {
    ...transition,
    files: [
      "tests/native/transition.test.ts",
      "tests/native/transition-again.test.ts",
    ],
  };
  const graph = sampleGraph([evaluate, twoFiles, production]);
  const failed = sampleRecord();
  failed.tests.push({
    ...failed.tests[1]!,
    file: "tests/native/transition-again.test.ts",
    result: "failed",
  });
  expect(
    checkAcceptance(deriveRequiredScenarios(graph, experiment), failed)
      .scenarios[1]!.status,
  ).toBe("failed");
  expect(
    checkAcceptance(deriveRequiredScenarios(graph, experiment), sampleRecord())
      .scenarios[1]!.status,
  ).toBe("absent");
});

test("pure: a compiled scenario passes only on a result of the types project, and a convex-test scenario only on one of the simulator project", () => {
  const graph = sampleGraph(
    [
      {
        id: "spec:sample.build",
        opening: "Sc L2-4 · compiled tier.",
        files: ["tests/types/broken.test-d.ts"],
      },
      {
        id: "spec:sample.simulated",
        opening: "Sc L1-9 · convex-test tier.",
        files: ["tests/simulator/simulated.test.ts"],
      },
    ],
    "the rows are Sc L2-4 and Sc L1-9",
  );
  const record = (types: string, simulator: string): AcceptanceRecord => ({
    ...sampleRecord(),
    tests: [
      {
        project: types,
        name: "a broken caller fails the build",
        file: "tests/types/broken.test-d.ts",
        result: "passed",
        backends: [],
      },
      {
        project: simulator,
        name: "simulated",
        file: "tests/simulator/simulated.test.ts",
        result: "passed",
        backends: [],
      },
    ],
  });
  const statuses = (types: string, simulator: string) =>
    checkAcceptance(
      deriveRequiredScenarios(graph, experiment),
      record(types, simulator),
    ).scenarios.map(({ status }) => status);
  expect(statuses("types", "simulator")).toEqual(["passed", "passed"]);
  expect(statuses("native", "pure")).toEqual(["failed", "failed"]);
});

test("pure: acceptanceRows names the rows the doc's table gives Layer 0, 1 or 2, and every native backend example of them that has a verifier names its composition", async () => {
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
  tableRows.push("Sc ALL-1");
  expect(rows).toHaveLength(24);
  expect(rows).toEqual(tableRows);
  const scenarios = deriveRequiredScenarios(graph, firstExperimentSpec);
  expect(
    scenarios
      .filter(
        (scenario) =>
          scenario.tier === "native backend" &&
          scenario.verifiers.length > 0 &&
          scenario.composition === null,
      )
      .map((scenario) => scenario.example),
  ).toEqual([]);
});

// scripts/acceptance.mjs derives the graph of the repository it sits in. Run through a link with the
// link's path kept, it sits in a temporary repository of one required row and one example, so its
// build writes nothing in this tree; the corpus walk skips the links to the harness and node_modules.
test("pure: the acceptance script exits 1 on a record that fails a scenario and 0 on one that fails none", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-acceptance-script-"));
  try {
    for (const path of ["scripts", "design/specs", "tests"])
      await mkdir(join(directory, path), { recursive: true });
    await symlink(
      join(root, "scripts/acceptance.mjs"),
      join(directory, "scripts/acceptance.mjs"),
    );
    for (const path of ["harness", "node_modules"])
      await symlink(join(root, path), join(directory, path));
    await writeFile(
      join(directory, "design/specs/first-experiment.sdp.md"),
      [
        "---",
        `id: ${firstExperimentSpec}`,
        "kind: workflow",
        "altitude: feature",
        "readiness: idea",
        "relations: {}",
        "---",
        "# First experiment",
        "",
        "## Intent",
        "",
        "- outcome: The rows the acceptance check requires.",
        "",
        "## Design",
        "",
        "- acceptanceRows: the one required row is Sc L0-1",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(directory, "design/specs/first-experiment.sample.sdp.md"),
      [
        "---",
        `id: ${firstExperimentSpec}.sample`,
        "kind: example",
        "altitude: story",
        "readiness: idea",
        "relations:",
        `  refines: ${firstExperimentSpec}`,
        `  verifies: ${firstExperimentSpec}`,
        "---",
        "# A sample scenario",
        "",
        "Sc L0-1 · pure test tier.",
        "",
        "## Intent",
        "",
        "- outcome: The sample passes.",
        "",
        "```gwt",
        "Given a sample",
        "When it runs",
        "Then it passes {passed: true}",
        "```",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(directory, "tests/sample.test.ts"),
      [
        'import { ref, specTest, testAnchorId } from "@libar-dev/software-delivery-protocol";',
        "const anchor = specTest({",
        '  id: testAnchorId("test:application.first-experiment.sample"),',
        `  verifies: ref("${firstExperimentSpec}.sample"),`,
        "});",
        "void anchor;",
        "",
      ].join("\n"),
    );
    const run = async (result: "passed" | "failed") => {
      const record = join(directory, `${result}.json`);
      await writeFile(
        record,
        JSON.stringify({
          commit: "abc",
          clean: true,
          result: "passed",
          startedAt: "2026-01-01T00:00:00.000Z",
          tests: [
            {
              project: "pure",
              name: "sample",
              file: "tests/sample.test.ts",
              result,
              backends: [],
            },
          ],
        }),
      );
      return new Promise<{ code: number; last: string }>((resolve) =>
        execFile(
          process.execPath,
          [
            "--preserve-symlinks",
            "--preserve-symlinks-main",
            join(directory, "scripts/acceptance.mjs"),
            record,
          ],
          { cwd: directory, env: { PATH: process.env.PATH ?? "" } },
          (error, stdout) =>
            resolve({
              code: error === null ? 0 : Number(error.code),
              last: stdout.trim().split("\n").at(-1) ?? "",
            }),
        ),
      );
    };
    const failed = await run("failed");
    expect(failed.last).toMatch(/^acceptance: not passed · 0 passed, 1 failed/);
    expect(failed.code).toBe(1);
    const passed = await run("passed");
    expect(passed.last).toMatch(/^acceptance: passed · 1 passed, 0 failed/);
    expect(passed.code).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  // Two children that each derive a graph: more than the default 5 s on a loaded machine.
}, 60000);
