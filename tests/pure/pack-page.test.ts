// The pure parts of scripts/pack-page.mjs, the generator of a Pack's page: the members in the order
// the Pack file writes them, the clause that holds a member below its next rung, the join of open
// questions to register rows by their opening text, and Prettier's formatting of a declaration with
// its fallback to the text as written. No graph is derived here.
import {
  SPEC_READINESS,
  readinessFloors,
} from "@libar-dev/software-delivery-protocol";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

type Clause = { id: string; description: string; holds: boolean };
type Floor = { rung: string; clauses: Clause[] };
type Question = { blocking: boolean; question: string };
type Row = {
  id: string;
  class: string | null;
  status: string | null;
  advisor: string | null;
  blocks: string | null;
  spec: string;
  question: string;
};
type PackPage = {
  authoredMembers(packText: string): string[];
  nextRung(
    stated: string,
    floors: Floor[],
  ): { rung: string | null; failing: Clause[] };
  joinQuestions(
    spec: string,
    questions: Question[],
    rows: Row[],
  ): { questions: (Question & { rows: Row[] })[]; left: Row[] };
  formatDeclaration(
    text: string,
  ): Promise<{ text: string; formatted: boolean }>;
  readPinnedPairs(base: string, pack: string): unknown;
  readAnchorSites(base: string): unknown;
  readQuestionSources(base: string): unknown;
  indexTables(
    rows: { spec: string; key: string; declaration: string }[],
  ): Map<string, string>;
  specLines(text: string): { design: Map<string, number>; questions: number[] };
  opening(text: string, limit?: number): string;
  tierOf(openingLine: string): string | null;
  firstDifference(
    committed: string,
    generated: string,
  ): {
    line: number;
    committed: string | null;
    generated: string | null;
  } | null;
};
// The generator is a script with no declaration file, so it is loaded by URL and typed here.
const page = (await import(
  new URL("../../scripts/pack-page.mjs", import.meta.url).href
)) as PackPage;

test("the members come in the order the Pack file writes them, not sorted", () => {
  const pack = [
    "---",
    "id: pack:sample",
    "specs:",
    "  - spec:sample.second",
    "  - spec:sample.first",
    "  - spec:other.third",
    "modelRefs:",
    "  - spec:sample.vocabulary",
    "---",
    "# Sample",
    "",
    "The Specs a sample rests on, in reading order.",
  ].join("\n");
  expect(page.authoredMembers(pack)).toEqual([
    "spec:sample.second",
    "spec:sample.first",
    "spec:other.third",
  ]);
  expect(() => page.authoredMembers("# No front matter\n")).toThrow(
    "the Pack file has no front matter",
  );
  expect(() =>
    page.authoredMembers("---\nid: pack:empty\nspecs: []\n---\n# Empty\n"),
  ).toThrow("the Pack file lists no specs");
});

// The Protocol's floor table, with every clause holding but those named.
function floors(failing: string[]): Floor[] {
  return SPEC_READINESS.map((rung) => ({
    rung,
    clauses: readinessFloors[rung].clauses.map(({ id, description }) => ({
      id,
      description,
      holds: !failing.includes(id),
    })),
  }));
}
const ids = (clauses: Clause[]) => clauses.map((clause) => clause.id);

test("the next rung is held by the clauses that fail at it, the first one first", () => {
  const next = page.nextRung(
    "defined",
    floors(["typed-dependency-targets-are-defined", "anchors-resolve"]),
  );
  expect(next.rung).toBe("ready");
  expect(ids(next.failing)).toEqual([
    "typed-dependency-targets-are-defined",
    "anchors-resolve",
  ]);
});

test("the floors are cumulative: a clause failing below the stated rung comes first", () => {
  const next = page.nextRung(
    "defined",
    floors(["anchors-resolve", "no-blocking-open-questions"]),
  );
  expect(ids(next.failing)).toEqual([
    "no-blocking-open-questions",
    "anchors-resolve",
  ]);
});

test("a clause above the next rung does not hold it, and ready has no next rung", () => {
  expect(
    page.nextRung("scoped", floors(["typed-dependency-targets-are-defined"])),
  ).toEqual({ rung: "defined", failing: [] });
  expect(page.nextRung("ready", floors([]))).toEqual({
    rung: null,
    failing: [],
  });
});

function row(id: string, spec: string, question: string): Row {
  return {
    id,
    class: "owner",
    status: "sorted",
    advisor: "convex",
    blocks: null,
    spec,
    question,
  };
}

test("a register row joins each open question of its Spec that its text opens", () => {
  const questions: Question[] = [
    {
      blocking: false,
      question:
        "Extension E-9, the history fold: D2 orders events only within a stream. The option taken here is a fold.",
    },
    {
      blocking: true,
      question:
        "The verify pass under the write pause: a generation is built while no source changes,\nso  its verify pass repeats the backfill. The pass is kept.",
    },
    { blocking: false, question: "A question no row names." },
  ];
  const rows = [
    row(
      "OD-157",
      "spec:sample.rebuild",
      "The verify pass under the write pause: a generation is built while no source changes, so its verify pass repeats the backfill.",
    ),
    row(
      "OD-158",
      "spec:sample.rebuild",
      "[non-blocking] Extension E-9, the history fold: D2 orders events only within a stream.",
    ),
    row(
      "OD-159",
      "spec:sample.other",
      "The verify pass under the write pause: a generation is built while no source changes, so its verify pass repeats the backfill.",
    ),
    row(
      "OD-160",
      "spec:sample.rebuild",
      "A question the Spec no longer holds.",
    ),
  ];
  const joined = page.joinQuestions("spec:sample.rebuild", questions, rows);
  expect(
    joined.questions.map((question) => question.rows.map((r) => r.id)),
  ).toEqual([["OD-158"], ["OD-157"], []]);
  expect(joined.questions[1]?.blocking).toBe(true);
  expect(joined.left.map((r) => r.id)).toEqual(["OD-160"]);
});

test("a declaration Prettier parses is formatted, as written or in the form its key implies", async () => {
  expect(
    await page.formatDeclaration("type Pair = { left: string; right: number }"),
  ).toEqual({
    text: "type Pair = { left: string; right: number }",
    formatted: true,
  });
  const signature = await page.formatDeclaration(
    "applyHistoryProjection<Row>(ctx: MutationCtx, projection: HistoryProjection<Row>, input: { tenantId: string; events: EventEnvelope[] }): Promise<void>",
  );
  expect(signature.formatted).toBe(true);
  expect(signature.text.split("\n")).toEqual([
    "applyHistoryProjection<Row>(",
    "  ctx: MutationCtx,",
    "  projection: HistoryProjection<Row>,",
    "  input: { tenantId: string; events: EventEnvelope[] },",
    "): Promise<void>",
  ]);
  expect(
    await page.formatDeclaration('.index("by_key", ["tenantId", "key"])'),
  ).toEqual({ text: '.index("by_key", ["tenantId", "key"])', formatted: true });
  expect(
    await page.formatDeclaration('audit?: { kind: "security" | "business" }'),
  ).toEqual({
    text: 'audit?: { kind: "security" | "business" }',
    formatted: true,
  });
});

test("a declaration Prettier does not parse stays as the Spec writes it", async () => {
  for (const text of [
    "limitListPage(budgetBytes) = max(1, min(100, floor(4 MiB / budgetBytes)))",
    "@convex-dev/migrations",
    "[extension] type VersionedResult<T> = { data: T }",
  ])
    expect(await page.formatDeclaration(text)).toEqual({
      text,
      formatted: false,
    });
});

test("a missing input is an error that names its path", async () => {
  const base = await mkdtemp(join(tmpdir(), "pack-page-"));
  try {
    expect(() => page.readPinnedPairs(base, "pack:history-view")).toThrow(
      "tests/types/pinned-pairs.json is missing",
    );
    expect(() => page.readAnchorSites(base)).toThrow(
      "design/tools/anchor-sites.json is missing",
    );
    expect(() => page.readQuestionSources(base)).toThrow(
      "design/decisions/register.json is missing",
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("an input off its ruled shape is refused", async () => {
  const base = await mkdtemp(join(tmpdir(), "pack-page-"));
  try {
    await mkdir(join(base, "tests/types"), { recursive: true });
    await mkdir(join(base, "design/decisions"), { recursive: true });
    const pair = {
      address: "spec:application.generation-registry#design.typeRegistryReader",
      state: "bound",
      comparison: "type",
      code: "src/sample/index.ts#One",
      reason: null,
    };
    const pairs = (pairs: object[]) =>
      writeFile(
        join(base, "tests/types/pinned-pairs.json"),
        JSON.stringify({
          pack: "pack:sample",
          test: "tests/types/x.test-d.ts",
          pairs,
        }),
      );
    await pairs([pair]);
    expect(() => page.readPinnedPairs(base, "pack:other")).toThrow(
      'names "pack:sample", not pack:other',
    );
    await pairs([{ ...pair, reason: "a bound pair has no reason" }]);
    expect(() => page.readPinnedPairs(base, "pack:sample")).toThrow(
      "pairs[0] has the reason",
    );
    await pairs([pair, pair]);
    expect(() => page.readPinnedPairs(base, "pack:sample")).toThrow(
      "pairs[1] repeats spec:application.generation-registry#design.typeRegistryReader",
    );
    // A question source that cites the question by its position, the form the rulings retire.
    await writeFile(
      join(base, "design/decisions/register.json"),
      JSON.stringify({
        decisions: [
          {
            id: "OD-001",
            sources: [
              {
                kind: "specQuestion",
                ref: "spec:sample.one#2",
                file: "design/specs/sample/one.sdp.md",
                line: 30,
              },
            ],
          },
        ],
      }),
    );
    expect(() => page.readQuestionSources(base)).toThrow(
      "OD-001: a specQuestion source needs spec, question and file",
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("the line of each Design entry and open question is read from the carrier", () => {
  const spec = [
    "---",
    "id: spec:sample.one",
    "---",
    "# One",
    "",
    "## Intent",
    "",
    "- outcome: Pin one shape (E-1)",
    "",
    "### Open questions",
    "",
    "- [non-blocking] Extension E-1: the first question (E-1)",
    "- [blocking] The second question (E-1)",
    "",
    "## Design",
    "",
    "A paragraph that names typeOne: in prose.",
    "",
    "- typeOne: `type One = { a: string }` (E-1)",
    "- limitOne: 4 items (E-1)",
  ].join("\n");
  const lines = page.specLines(spec);
  expect([...lines.design]).toEqual([
    ["typeOne", 19],
    ["limitOne", 20],
  ]);
  expect(lines.questions).toEqual([12, 13]);
});

test("a question opens to the end of its first sentence, cut outside code spans", () => {
  expect(page.opening("The first sentence. The second.")).toBe(
    "The first sentence.",
  );
  expect(page.opening("It reads `a. b` and 0.1.124 here. Then more.")).toBe(
    "It reads `a. b` and 0.1.124 here.",
  );
  expect(page.opening("One two `three four five` six seven.", 15)).toBe(
    "One two …",
  );
});

test("an example's tier is read from its opening line", () => {
  expect(page.tierOf("Sc L2-6 · native backend tier · the resume case.")).toBe(
    "native backend",
  );
  expect(page.tierOf("Sc L1-4 · pure test tier.")).toBe("pure test");
  expect(page.tierOf("Story · Detail: full · Traces: D9.")).toBeNull();
});

test("the check names the first line where the committed page differs", () => {
  expect(page.firstDifference("a\nb\n", "a\nb\n")).toBeNull();
  expect(page.firstDifference("a\nb\nc\n", "a\nB\nc\n")).toEqual({
    line: 2,
    committed: "b",
    generated: "B",
  });
  expect(page.firstDifference("a\n", "a\nb\n")).toEqual({
    line: 2,
    committed: "",
    generated: "b",
  });
});

test("an index belongs to the table its Spec wrote last before it, as the pinned module chains it", () => {
  const rows = [
    {
      spec: "spec:sample.one",
      key: "tableItems",
      declaration: "items: defineTable({ name: v.string() })",
    },
    {
      spec: "spec:sample.one",
      key: "validatorItem",
      declaration: "const itemValidator = v.object({})",
    },
    {
      spec: "spec:sample.one",
      key: "indexItemsByName",
      declaration: '.index("by_name", ["name"])',
    },
    {
      spec: "spec:sample.one",
      key: "indexItemsByNameUse",
      declaration: "by_name serves the list",
    },
    {
      spec: "spec:sample.one",
      key: "tableMarks",
      declaration: "marks: defineTable({ at: v.number() })",
    },
    {
      spec: "spec:sample.one",
      key: "indexMarksByAt",
      declaration: '.index("by_at", ["at"])',
    },
    {
      spec: "spec:sample.two",
      key: "indexOrphan",
      declaration: '.index("by_key", ["key"])',
    },
  ];
  // Addresses are built, so that the check of entry addresses outside the Specs reads no sample one.
  const at = (spec: string, key: string) => `${spec}#design.${key}`;
  expect([...page.indexTables(rows)]).toEqual([
    [
      at("spec:sample.one", "indexItemsByName"),
      at("spec:sample.one", "tableItems"),
    ],
    [
      at("spec:sample.one", "indexMarksByAt"),
      at("spec:sample.one", "tableMarks"),
    ],
  ]);
});
