// scripts/pack-page.mjs, the generator of a Pack's page: its pure parts, and one page generated from
// a sample corpus in a temporary directory, whose graph the Protocol's extractor derives. The sample
// shows the members in the Pack's order, the clause that holds a member below its next rung with
// the targets that break it, each open question's address, and the register rows on the members.
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";

type Failure = {
  clauseId: string;
  description: string;
  targets?: { type: string; id: string; statedReadiness?: string }[];
};
type Context = {
  specKind: string;
  statedReadiness: string;
  derivedReadiness?: string;
  nextRungFailures: Failure[];
};
type Question = { blocking: boolean; question: string; key: string | null };
type Source = Record<string, unknown> & { kind: string; file: string };
type Row = {
  id: string;
  title: string | null;
  class: string | null;
  status: string | null;
  advisor: string | null;
  blocks: string | null;
  decidedBy: string | null;
  decidedOn: string | null;
  ruling: string | null;
  sources: Source[];
};
type PackPage = {
  packMembers(context: {
    id: string;
    members: { id: string; resolved: boolean }[];
  }): string[];
  nextRung(
    context: Context,
  ): { rung: string | null; below: boolean; failing: Failure[] } | null;
  joinQuestions(
    spec: string,
    questions: Question[],
    rows: (Row & { address: string })[],
  ): {
    questions: (Question & { address: string | null; rows: Row[] })[];
    left: Row[];
  };
  questionSources(rows: Row[]): (Row & { address: string })[];
  memberRows(rows: Row[], files: Map<string, unknown>): Row[];
  formatDeclaration(
    text: string,
  ): Promise<{ text: string; formatted: boolean }>;
  readPinnedPairs(base: string, pack: string): unknown;
  readRegister(base: string): Row[];
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
  generate(pack: string, out: string, base?: string): Promise<string>;
  main(args: string[], base?: string): Promise<number>;
};
// The generator is a script with no declaration file, so it is loaded by URL and typed here.
const page = (await import(
  new URL("../../scripts/pack-page.mjs", import.meta.url).href
)) as PackPage;

// Entry addresses are built, so that the check of entry addresses outside the Specs, which reads
// this file, finds no address of the sample corpus.
const at = (spec: string, section: string, key: string) =>
  `${spec}#${section}.${key}`;

test("the members come in the order the reader's Pack context gives them, each once", () => {
  const member = (id: string, resolved = true) => ({ id, resolved });
  const members = [
    member("spec:sample.second"),
    member("spec:sample.first"),
    member("spec:other.third"),
  ];
  expect(page.packMembers({ id: "pack:sample", members })).toEqual([
    "spec:sample.second",
    "spec:sample.first",
    "spec:other.third",
  ]);
  expect(() =>
    page.packMembers({
      id: "pack:sample",
      members: [...members, member("spec:sample.first")],
    }),
  ).toThrow("pack:sample lists spec:sample.first twice");
  expect(() =>
    page.packMembers({
      id: "pack:sample",
      members: [member("spec:sample.absent", false)],
    }),
  ).toThrow("spec:sample.absent is not in the graph");
  expect(() => page.packMembers({ id: "pack:empty", members: [] })).toThrow(
    "pack:empty lists no specs",
  );
});

const typed: Failure = {
  clauseId: "typed-dependency-targets-are-defined",
  description: "Every typed target states at least defined.",
  targets: [
    { type: "dependsOn", id: "spec:sample.beta", statedReadiness: "scoped" },
  ],
};
const anchors: Failure = {
  clauseId: "anchors-resolve",
  description: "Any anchors present resolve.",
};
function context(
  statedReadiness: string,
  derivedReadiness: string | undefined,
  nextRungFailures: Failure[] = [],
): Context {
  return {
    specKind: "contract",
    statedReadiness,
    ...(derivedReadiness === undefined ? {} : { derivedReadiness }),
    nextRungFailures,
  };
}

test("at the floor, the next rung is held by the Protocol's next-rung failures, the first one first", () => {
  expect(
    page.nextRung(context("defined", "defined", [typed, anchors])),
  ).toEqual({ rung: "ready", below: false, failing: [typed, anchors] });
});

test("a floor above the stated rung leaves nothing to hold the next rung", () => {
  // The Protocol reports the rung above the floor, ready here; the page's next rung is defined.
  expect(page.nextRung(context("scoped", "defined", [typed]))).toEqual({
    rung: "defined",
    below: false,
    failing: [],
  });
});

test("a floor below the stated rung is said, and its first unmet clause holds the next rung", () => {
  const blocking: Failure = {
    clauseId: "no-blocking-open-questions",
    description: "Spec has no blocking open question in intent.openQuestions.",
  };
  expect(page.nextRung(context("defined", "scoped", [blocking]))).toEqual({
    rung: "ready",
    below: true,
    failing: [blocking],
  });
});

test("ready has no next rung, and a kind the Protocol does not ratify is not evaluated", () => {
  expect(page.nextRung(context("ready", "ready"))).toEqual({
    rung: null,
    below: false,
    failing: [],
  });
  expect(
    page.nextRung({ ...context("defined", undefined), specKind: "essay" }),
  ).toBeNull();
});

function row(id: string, changes: Partial<Row> = {}): Row {
  return {
    id,
    title: `The title of ${id}.`,
    class: "owner",
    status: "sorted",
    advisor: "domain",
    blocks: null,
    decidedBy: null,
    decidedOn: null,
    ruling: null,
    sources: [],
    ...changes,
  };
}
const question = (address: string, file = "design/specs/sample/one.sdp.md") =>
  ({ kind: "specQuestion", address, file }) as Source;

test("a register row joins the open question its source cites by address", () => {
  const spec = "spec:sample.rebuild";
  const questions: Question[] = [
    { blocking: false, question: "The fold.", key: "fold" },
    { blocking: true, question: "The verify pass.", key: "verifyPass" },
    { blocking: false, question: "A question with no key.", key: null },
  ];
  const sources = page.questionSources([
    row("OD-157", { sources: [question(at(spec, "question", "verifyPass"))] }),
    row("OD-158", { sources: [question(at(spec, "question", "fold"))] }),
    row("OD-159", {
      sources: [question(at("spec:sample.rebuild.child", "question", "fold"))],
    }),
    row("OD-160", { sources: [question(at(spec, "question", "removed"))] }),
    row("OD-161", {
      sources: [
        {
          kind: "specQuestion",
          spec,
          question: "A closed question.",
          file: "x",
          open: false,
        },
      ],
    }),
  ]);
  expect(sources.map((source) => source.id)).toEqual([
    "OD-157",
    "OD-158",
    "OD-159",
    "OD-160",
  ]);
  const joined = page.joinQuestions(spec, questions, sources);
  expect(joined.questions.map((entry) => entry.rows.map((r) => r.id))).toEqual([
    ["OD-158"],
    ["OD-157"],
    [],
  ]);
  expect(joined.questions.map((entry) => entry.address)).toEqual([
    at(spec, "question", "fold"),
    at(spec, "question", "verifyPass"),
    null,
  ]);
  expect(joined.left.map((r) => r.id)).toEqual(["OD-160"]);
});

test("the rows on the members are every decided row and every other row that cites no open question", () => {
  const file = "design/specs/sample/one.sdp.md";
  const elsewhere = { kind: "ownerQueue", ref: "O1", file: "design/STATE.md" };
  const line = { kind: "specLine", ref: "sample.one#rule", file, line: 9 };
  const rows = [
    row("OD-001", { status: "decided", sources: [elsewhere, line] }),
    row("OD-002", { status: "decided", sources: [question("q", file)] }),
    row("OD-003", { status: "sorted", sources: [question("q", file)] }),
    row("OD-004", { status: "sorted", sources: [line] }),
    row("OD-005", { status: "decided", sources: [elsewhere] }),
  ];
  const chosen = page.memberRows(rows, new Map([[file, {}]]));
  expect(chosen.map((r) => r.id)).toEqual(["OD-001", "OD-002", "OD-004"]);
  expect(chosen[0]?.sources).toEqual([line]);
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
    expect(() => page.readRegister(base)).toThrow(
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
      address: at(
        "spec:application.generation-registry",
        "design",
        "typeRegistryReader",
      ),
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
      `pairs[1] repeats ${pair.address}`,
    );
    const register = (source: object) =>
      writeFile(
        join(base, "design/decisions/register.json"),
        JSON.stringify({ decisions: [{ id: "OD-001", sources: [source] }] }),
      );
    // An open question source that cites its question by opening text, the form the rulings retire.
    await register({
      kind: "specQuestion",
      spec: "spec:sample.one",
      question: "The opening.",
      file: "design/specs/sample/one.sdp.md",
    });
    expect(() => page.readRegister(base)).toThrow(
      "OD-001: an open specQuestion source needs address and file",
    );
    await register({
      kind: "specQuestion",
      spec: "spec:sample.one",
      file: "design/specs/sample/one.sdp.md",
      open: false,
    });
    expect(() => page.readRegister(base)).toThrow(
      "OD-001: a closed specQuestion source needs spec, question and file",
    );
    await register({ kind: "specLine", ref: "sample.one#rule" });
    expect(() => page.readRegister(base)).toThrow(
      "OD-001: a source needs a kind and a file",
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
    "- [non-blocking #first] Extension E-1: the first question (E-1)",
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
  expect([...page.indexTables(rows)]).toEqual([
    [
      at("spec:sample.one", "design", "indexItemsByName"),
      at("spec:sample.one", "design", "tableItems"),
    ],
    [
      at("spec:sample.one", "design", "indexMarksByAt"),
      at("spec:sample.one", "design", "tableMarks"),
    ],
  ]);
});

// A decision Spec of the sample corpus: `relations` are its front-matter lines, `questions` the
// lines of its open questions.
function decision(
  name: string,
  readiness: string,
  relations: string[],
  questions: string[] = [],
) {
  return [
    "---",
    `id: spec:sample.${name}`,
    "kind: decision",
    "altitude: feature",
    `readiness: ${readiness}`,
    "relations:",
    ...relations.map((relation) => `  ${relation}`),
    "---",
    `# The ${name} decision`,
    "",
    "## Intent",
    "",
    `- outcome: Settle ${name}`,
    ...(questions.length === 0
      ? []
      : ["", "### Open questions", "", ...questions]),
    "",
    "## Decision",
    "",
    `- context: A sample needs ${name}`,
    `- decision: Take ${name}`,
    "",
  ].join("\n");
}

test("the page of a sample Pack reads its order, its blockers and its register rows from the graph", async () => {
  const base = await mkdtemp(join(tmpdir(), "pack-page-"));
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), text);
  };
  const file = (name: string) => `design/specs/sample/${name}.sdp.md`;
  try {
    await put(
      "package.json",
      JSON.stringify({
        devDependencies: {
          "@libar-dev/software-delivery-protocol": "file:sample.tgz",
        },
      }),
    );
    await put(
      "tests/types/pinned-pairs.json",
      JSON.stringify({
        pack: "pack:sample",
        test: "tests/types/sample.test-d.ts",
        pairs: [],
      }),
    );
    // The Pack lists its members out of id order.
    await put(
      "design/specs/sample.pack.sdp.md",
      [
        "---",
        "id: pack:sample",
        "specs:",
        "  - spec:sample.gamma",
        "  - spec:sample.alpha",
        "  - spec:sample.beta",
        "---",
        "# Sample",
        "",
        "The Specs of a sample, in reading order.",
        "",
      ].join("\n"),
    );
    // Alpha states defined and rests on two Specs that state scoped, one of them outside the Pack.
    await put(
      file("alpha"),
      decision("alpha", "defined", [
        "dependsOn:",
        "  - spec:sample.delta",
        "  - spec:sample.beta",
      ]),
    );
    await put(
      file("beta"),
      decision(
        "beta",
        "scoped",
        ["refines: spec:sample.gamma"],
        ["- [blocking #betaChoice] Which option does beta take. More text."],
      ),
    );
    await put(
      file("gamma"),
      decision("gamma", "scoped", ["refines: spec:sample.alpha"]),
    );
    await put(
      file("delta"),
      decision("delta", "scoped", ["refines: spec:sample.gamma"]),
    );
    const betaChoice = at("spec:sample.beta", "question", "betaChoice");
    await put(
      "design/decisions/register.json",
      JSON.stringify({
        decisions: [
          row("OD-001", {
            sources: [question(betaChoice, file("beta"))],
            blocks: "S5",
          }),
          row("OD-002", {
            status: "decided",
            decidedBy: "owner",
            decidedOn: "2026-10-04",
            ruling: "Take the first option. Then the reasons.",
            sources: [
              {
                kind: "specLine",
                ref: "sample.alpha#take",
                file: file("alpha"),
                line: 19,
              },
            ],
          }),
          row("OD-003", {
            status: "decided",
            decidedBy: "owner",
            decidedOn: "2026-10-04",
            ruling: "A ruling outside the members.",
            sources: [
              {
                kind: "ownerQueue",
                ref: "O1",
                file: "design/STATE.md",
                line: 1,
              },
            ],
          }),
          row("OD-004", {
            sources: [
              {
                kind: "specLine",
                ref: "sample.gamma#term",
                file: file("gamma"),
                line: 13,
              },
            ],
          }),
        ],
      }),
    );
    const text = await page.generate(
      "pack:sample",
      join(base, "design/pages/sample.md"),
      base,
    );
    const lines = text.split("\n");

    const memberIds = lines
      .filter((line) => /^\| \[\d+\]\(#/.test(line))
      .map((line) => /`(spec:[^`]+)`/.exec(line)?.[1]);
    expect(memberIds).toEqual([
      "spec:sample.gamma",
      "spec:sample.alpha",
      "spec:sample.beta",
    ]);

    const alpha = lines.findIndex((line) =>
      line.startsWith("- [The alpha decision]"),
    );
    expect(lines[alpha]).toContain(
      "states defined and cannot reach ready. The first clause that fails is `typed-dependency-targets-are-defined`",
    );
    expect(lines[alpha + 1]).toBe(
      "  It rests on [`spec:sample.beta`](../specs/sample/beta.sdp.md) by dependsOn, which states scoped and [`spec:sample.delta`](../specs/sample/delta.sdp.md) by dependsOn, which states scoped.",
    );
    const beta = lines.findIndex((line) =>
      line.startsWith("- [The beta decision]"),
    );
    expect(lines[beta]).toContain(
      "The first clause that fails is `no-blocking-open-questions`",
    );
    expect(lines[beta + 1]).toBe(
      `  Its blocking question is \`${betaChoice}\`, under its open questions below.`,
    );
    expect(text).toContain(
      "The floor holds at the next rung for [The gamma decision](#1-the-gamma-decision).",
    );
    expect(text).toContain(
      "| [`spec:sample.delta`](../specs/sample/delta.sdp.md) | scoped | defined | [The alpha decision](#2-the-alpha-decision) | `spec:sample.alpha` dependsOn |",
    );

    expect(text).toContain(
      `- **OD-001** class owner, status sorted, advisor domain, blocks the unit S5. [\`${betaChoice}\`](../specs/sample/beta.sdp.md?plain=1#L17), [blocking]: Which option does beta take.`,
    );
    expect(text).toContain(
      "- **OD-002** class owner, status decided, advisor domain, blocks no unit, from [`sample.alpha#take`](../specs/sample/alpha.sdp.md?plain=1#L19) on [The alpha decision](#2-the-alpha-decision). Decided by owner on 2026-10-04. Ruling: Take the first option.",
    );
    expect(text).not.toContain("Then the reasons.");
    expect(text).not.toContain("OD-003");
    expect(text).toContain("## Register rows whose sources lie in the members");
    expect(text).toContain(
      "- **OD-004** class owner, status sorted, advisor domain, blocks no unit, from [`sample.gamma#term`](../specs/sample/gamma.sdp.md?plain=1#L13) on [The gamma decision](#1-the-gamma-decision). No ruling. Its title: The title of OD-004.",
    );
    expect(text).toContain(
      "[`generated/pinned/sample.ts`](../../generated/pinned/sample.ts)",
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

// A sample tree of two Specs in one Pack, with every input the generator reads, in base.
async function smallSample(base: string) {
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), text);
  };
  await put(
    "package.json",
    JSON.stringify({
      devDependencies: {
        "@libar-dev/software-delivery-protocol": "file:sample.tgz",
      },
    }),
  );
  await put(
    "tests/types/pinned-pairs.json",
    JSON.stringify({
      pack: "pack:sample",
      test: "tests/types/sample.test-d.ts",
      pairs: [],
    }),
  );
  await put(
    "design/decisions/register.json",
    JSON.stringify({ decisions: [] }),
  );
  await put(
    "design/specs/sample.pack.sdp.md",
    [
      "---",
      "id: pack:sample",
      "specs:",
      "  - spec:sample.alpha",
      "  - spec:sample.beta",
      "---",
      "# Sample",
      "",
    ].join("\n"),
  );
  await put(
    "design/specs/sample/alpha.sdp.md",
    decision("alpha", "scoped", ["refines: spec:sample.beta"]),
  );
  await put(
    "design/specs/sample/beta.sdp.md",
    decision("beta", "scoped", []).replace("relations:\n", "relations: {}\n"),
  );
}

// The code of a member comes from the graph alone: a comment-form anchor in a source file binds at its
// own site, and the page names its role and its component's layer and context.
test("the page names each code unit at its own site, with its role and component, and lists the units that reference a member", async () => {
  const base = await mkdtemp(join(tmpdir(), "pack-page-"));
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(base, path)), { recursive: true });
    await writeFile(join(base, path), text);
  };
  try {
    await smallSample(base);
    await put(
      "src/sample/index.ts",
      [
        "/**",
        " * @sdpAnchor component:sample.core",
        " * @sdpLabel the sample's core",
        " * @sdpLayer domain",
        " * @sdpContext sample",
        " */",
        "export {};",
        "",
      ].join("\n"),
    );
    await put(
      "src/sample/rules.ts",
      [
        "// The sample's rules.",
        "/**",
        " * @sdpAnchor impl:sample.rules",
        " * @sdpLabel the sample's rules",
        " * @sdpReferences spec:sample.alpha",
        " * @sdpComponent component:sample.core",
        " * @sdpRole decider",
        " */",
        "export const rules = 1;",
        "",
      ].join("\n"),
    );
    const text = await page.generate(
      "pack:sample",
      join(base, "design/pages/sample.md"),
      base,
    );
    expect(text).not.toContain("anchor-sites");
    expect(text).toMatch(
      /^\| \[1\]\(#1-the-alpha-decision\) .*\| referenced by 1 unit \|/m,
    );
    expect(text).toContain(
      "**References.** 1 unit references this design. A reference says the code answers to the design without claiming to realize it, and it confers no delivery fact and moves no floor.",
    );
    expect(text).toContain(
      "- `impl:sample.rules` at [`src/sample/rules.ts` line 2](../../src/sample/rules.ts#L2): the sample's rules. Its role is decider. It belongs to `component:sample.core`, in the domain layer and the sample context.",
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("the command's --check exits 1 for a page that is missing or behind the tree, and 0 for a current one", async () => {
  const base = await mkdtemp(join(tmpdir(), "pack-page-"));
  const said: string[] = [];
  const error = vi
    .spyOn(console, "error")
    .mockImplementation((message: string) => void said.push(message));
  try {
    await smallSample(base);
    const out = join(base, "design/pages/sample.md");
    const command = ["--pack", "pack:sample", "--out", out];
    const check = () => page.main([...command, "--check"], base);

    expect(await check()).toBe(1);
    expect(said.at(-1)).toBe(
      "pack-page: design/pages/sample.md is missing; run npm run pages",
    );
    expect(await page.main(command, base)).toBe(0);
    expect(await check()).toBe(0);
    const written = await readFile(out, "utf8");
    await writeFile(out, `${written}A line the tree does not generate.\n`);
    expect(await check()).toBe(1);
    expect(said.at(-1)).toContain(
      "pack-page: design/pages/sample.md is behind the tree from line",
    );
    await writeFile(out, written);
    expect(await check()).toBe(0);
  } finally {
    error.mockRestore();
    await rm(base, { recursive: true, force: true });
  }
});

// The script run as a process, from a copy in a sample tree that links this repository's
// node_modules, so the exit status a caller such as check.py reads is the one asserted.
test("the generator run as a process exits non-zero with --check on a stale page", async () => {
  const base = await mkdtemp(join(tmpdir(), "pack-page-"));
  try {
    await smallSample(base);
    await mkdir(join(base, "scripts"), { recursive: true });
    await copyFile(
      fileURLToPath(new URL("../../scripts/pack-page.mjs", import.meta.url)),
      join(base, "scripts/pack-page.mjs"),
    );
    await symlink(
      fileURLToPath(new URL("../../node_modules", import.meta.url)),
      join(base, "node_modules"),
    );
    const run = (...flags: string[]) =>
      spawnSync(
        process.execPath,
        [
          "scripts/pack-page.mjs",
          "--pack",
          "pack:sample",
          "--out",
          "design/pages/sample.md",
          ...flags,
        ],
        { cwd: base, encoding: "utf8" },
      );
    expect(run().status).toBe(0);
    expect(run("--check").status).toBe(0);
    const out = join(base, "design/pages/sample.md");
    await writeFile(
      out,
      `${await readFile(out, "utf8")}A line the tree does not generate.\n`,
    );
    const stale = run("--check");
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain(
      "pack-page: design/pages/sample.md is behind the tree from line",
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
