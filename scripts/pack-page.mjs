// Writes the page of one capability Pack, which a person opens to understand its design:
// `node scripts/pack-page.mjs --pack <packId> --out <page>` writes the page, and with `--check` it
// writes nothing and compares the page at --out with what the tree generates, naming the first line
// that differs. It reads the graph in memory through the Protocol package's exported extractor and
// reader, never through validate, view, census or build, and runs recipes 20 and 24 as the pinned
// Protocol ships them in recipes.md. Three inputs join it: the pinned pairs
// (tests/types/pinned-pairs.json), the anchor sites (design/tools/anchor-sites.json) and the question
// sources of the decision register (design/decisions/register.json); a missing input is an error
// that names its path. The members come in the order the Pack file writes them: the reader sorts
// them, so the order is read from the file. The next rung's blocker is the first clause of the Protocol's floor table, cumulative
// up to the rung above the stated one, that fails: the Protocol's evaluator answers only for the
// stated rung, so the page walks the exported table with the same predicates.
// Exit 0: written, or the page is current. 1: --check found the page behind the tree. 2: it cannot
// generate.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  SPEC_KINDS,
  SPEC_READINESS,
  buildGraphIndex,
  createReader,
  extract,
  readinessFloors,
} from "@libar-dev/software-delivery-protocol";
import { format, resolveConfig } from "prettier";

const root = join(import.meta.dirname, "..");
const engine = "@libar-dev/software-delivery-protocol";
const inputs = {
  pairs: "tests/types/pinned-pairs.json",
  sites: "design/tools/anchor-sites.json",
  register: "design/decisions/register.json",
};
// The relations a Spec rests on, as recipe 21 and the floor's typed-dependency clause read them.
const typedRelations = ["refines", "dependsOn", "constrainedBy", "decidedBy"];
const typedClause = "typed-dependency-targets-are-defined";

export class PageError extends Error {}
function cannot(reason) {
  throw new PageError(reason);
}

// ---------------------------------------------------------------------------------------------
// Inputs. One reader per input, each to the shape the rulings fix; a file that is missing or off
// that shape is an error that names the path.

function readJson(base, path) {
  const file = join(base, path);
  if (!existsSync(file)) cannot(`${path} is missing`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return cannot(`${path} is not JSON: ${error.message}`);
  }
}
const isText = (value) => typeof value === "string" && value.length > 0;

// The pinned pairs: what the type test compares for each pinned declaration, by entry address.
export function readPinnedPairs(base, pack) {
  const path = inputs.pairs;
  const data = readJson(base, path);
  if (data?.pack !== pack)
    cannot(`${path} names ${JSON.stringify(data?.pack)}, not ${pack}`);
  if (!isText(data.test) || !Array.isArray(data.pairs))
    cannot(`${path} needs a test path and a list of pairs`);
  const pairs = new Map();
  data.pairs.forEach((pair, at) => {
    const where = `${path} pairs[${at}]`;
    if (!isText(pair?.address)) cannot(`${where} has no address`);
    if (!["bound", "ahead", "notCompared"].includes(pair.state))
      cannot(`${where} has the state ${JSON.stringify(pair.state)}`);
    if (!["type", "typeWithoutCtx", "table", "none"].includes(pair.comparison))
      cannot(`${where} has the comparison ${JSON.stringify(pair.comparison)}`);
    if (pair.code !== null && !/^[^#\s]+#[\w$]+$/.test(pair.code ?? ""))
      cannot(`${where} has the code ${JSON.stringify(pair.code)}`);
    if (pair.state === "bound" ? pair.reason !== null : !isText(pair.reason))
      cannot(`${where} has the reason ${JSON.stringify(pair.reason)}`);
    if (pairs.has(pair.address)) cannot(`${where} repeats ${pair.address}`);
    pairs.set(pair.address, pair);
  });
  return { test: data.test, pairs };
}

// The anchor sites: the source files each implementation anchor written in a test file stands for.
export function readAnchorSites(base) {
  const path = inputs.sites;
  const data = readJson(base, path);
  if (!Array.isArray(data?.anchors)) cannot(`${path} has no list of anchors`);
  const sites = new Map();
  data.anchors.forEach((entry, at) => {
    const where = `${path} anchors[${at}]`;
    if (
      !isText(entry?.anchor) ||
      !Array.isArray(entry.sources) ||
      !entry.sources.every(isText)
    )
      cannot(`${where} needs an anchor and a list of source paths`);
    if (sites.has(entry.anchor)) cannot(`${where} repeats ${entry.anchor}`);
    sites.set(entry.anchor, entry.sources);
  });
  return sites;
}

// The question sources: every register row that names a Spec question, with the fields the page shows.
export function readQuestionSources(base) {
  const path = inputs.register;
  const data = readJson(base, path);
  if (!Array.isArray(data?.decisions))
    cannot(`${path} has no list of decisions`);
  const rows = [];
  for (const decision of data.decisions)
    for (const source of decision.sources ?? []) {
      if (source?.kind !== "specQuestion") continue;
      if (![source.spec, source.question, source.file].every(isText))
        cannot(
          `${path} ${decision.id}: a specQuestion source needs spec, question and file`,
        );
      rows.push({
        id: decision.id,
        class: decision.class ?? null,
        status: decision.status ?? null,
        advisor: decision.advisor ?? null,
        blocks: decision.blocks ?? null,
        spec: source.spec,
        question: source.question,
      });
    }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// The pure parts.

// The members of a Pack in the order its file writes them: the `specs` list of its front matter.
export function authoredMembers(packText) {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(packText);
  if (front === null) cannot("the Pack file has no front matter");
  const members = [];
  let inSpecs = false;
  for (const line of front[1].split("\n")) {
    if (/^\S/.test(line)) inSpecs = /^specs:\s*$/.test(line);
    else if (inSpecs) {
      const item = /^\s+-\s+(\S+)\s*$/.exec(line);
      if (item !== null) members.push(item[1]);
    }
  }
  if (members.length === 0) cannot("the Pack file lists no specs");
  return members;
}

// The rung above the stated one and the clauses that fail at it, the floors being cumulative: every
// clause of that rung and of each rung below it, in table order. `floors` is the floor table with
// each clause's verdict, lowest rung first.
export function nextRung(stated, floors) {
  const at = floors.findIndex((floor) => floor.rung === stated);
  if (at === -1) cannot(`the floor table has no rung ${stated}`);
  const next = floors[at + 1];
  if (next === undefined) return { rung: null, failing: [] };
  const failing = floors
    .slice(0, at + 2)
    .flatMap((floor) => floor.clauses.filter((clause) => !clause.holds));
  return { rung: next.rung, failing };
}

// A question's text without its flag and with its spaces folded, so that a source's opening text
// joins it however the two were wrapped.
const flagged = /^\[(?:non-)?blocking\]\s*/;
const folded = (text) => text.replace(flagged, "").replace(/\s+/g, " ").trim();

// The register rows of one Spec joined to its open questions by text: a row joins each question its
// `question` opens. `left` holds the rows of the Spec that join none.
export function joinQuestions(spec, questions, rows) {
  const own = rows.filter((row) => row.spec === spec);
  const joined = questions.map((question) => ({
    ...question,
    rows: own.filter((row) =>
      folded(question.question).startsWith(folded(row.question)),
    ),
  }));
  const left = own.filter(
    (row) => !joined.some((question) => question.rows.includes(row)),
  );
  return { questions: joined, left };
}

// Prettier formats a declaration where it parses as TypeScript, as written or as the form its key
// implies: a call signature as a function, an index as a call chained on a name, a property as an
// interface member. Otherwise the declaration stays as the Spec writes it.
const wrappers = [
  { applies: () => true, wrap: (text) => text, unwrap: (text) => text },
  {
    applies: (text) => /^[\w$]+\s*[<(]/.test(text),
    wrap: (text) => `function ${text} {}`,
    unwrap: (text) =>
      text.startsWith("function ") && text.endsWith(" {}")
        ? text.slice("function ".length, -" {}".length)
        : null,
  },
  {
    applies: (text) => text.startsWith("."),
    wrap: (text) => `x${text}`,
    unwrap: (text) => (text.startsWith("x.") ? text.slice(1) : null),
  },
  {
    applies: (text) => /^[\w$]+\??:/.test(text),
    wrap: (text) => `interface Pinned {\n${text}\n}`,
    unwrap: (text) => {
      const lines = text.split("\n");
      const inner = lines.slice(1, -1);
      if (
        lines[0] !== "interface Pinned {" ||
        lines.at(-1) !== "}" ||
        !inner.every((line) => line === "" || line.startsWith("  "))
      )
        return null;
      return inner.map((line) => line.slice(2)).join("\n");
    },
  },
];
export async function formatDeclaration(text, options = {}) {
  for (const { applies, wrap, unwrap } of wrappers) {
    if (!applies(text)) continue;
    let formatted;
    try {
      formatted = await format(wrap(text), {
        ...options,
        parser: "typescript",
      });
    } catch {
      continue;
    }
    const body = unwrap(formatted.trimEnd());
    if (body !== null) return { text: body.replace(/;$/, ""), formatted: true };
  }
  return { text, formatted: false };
}

// The line of each Design entry and of each open question in a Spec's Markdown carrier.
export function specLines(text) {
  const design = new Map();
  const questions = [];
  let section = null;
  text.split("\n").forEach((line, at) => {
    const heading = /^#{2,3} (.+)$/.exec(line);
    if (heading !== null) section = heading[1];
    else if (section === "Design") {
      const key = /^- ([a-z][A-Za-z0-9]*): /.exec(line);
      if (key !== null) design.set(key[1], at + 1);
    } else if (
      section === "Open questions" &&
      /^- \[(?:non-)?blocking\] /.test(line)
    )
      questions.push(at + 1);
  });
  return { design, questions };
}

// A question's opening, to the end of its first sentence and at most `limit` characters, cut at a
// space outside any code span.
export function opening(text, limit = 220) {
  let code = 0;
  let sentence = text.length;
  let cut = -1;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === "`") {
      let run = 1;
      while (text[at + run] === "`") run++;
      code = code === 0 ? run : code === run ? 0 : code;
      at += run - 1;
    } else if (
      code === 0 &&
      text[at] === "." &&
      /\s/.test(text[at + 1] ?? " ")
    ) {
      sentence = at + 1;
      break;
    } else if (code === 0 && text[at] === " " && at <= limit) cut = at;
  }
  if (sentence <= limit || cut === -1) return text.slice(0, sentence);
  return `${text.slice(0, cut)} …`;
}

// The first line at which two texts differ, or null when they are equal.
export function firstDifference(committed, generated) {
  if (committed === generated) return null;
  const left = committed.split("\n");
  const right = generated.split("\n");
  let at = 0;
  while (at < left.length && at < right.length && left[at] === right[at]) at++;
  return {
    line: at + 1,
    committed: left[at] ?? null,
    generated: right[at] ?? null,
  };
}

// The tier an example's opening line names, as in "Sc L2-6 · native backend tier · the resume case.".
export function tierOf(openingLine) {
  for (const part of openingLine.split("·")) {
    const tier = /^\s*(.+?) tier\.?\s*$/.exec(part);
    if (tier !== null) return tier[1];
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Markdown.

function span(text) {
  const runs = text.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}
const cell = (text) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const table = (head, rows) => [
  `| ${head.join(" | ")} |`,
  `|${head.map(() => "---").join("|")}|`,
  ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
];
function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replaceAll(" ", "-");
}
const plural = (count, one, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;
const list = (items) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const compared = {
  type: "the type",
  typeWithoutCtx: "the type, its ctx parameter erased",
  table: "the table's document and indexes",
  none: "nothing",
};
const states = { bound: "bound", ahead: "ahead", notCompared: "not compared" };

// ---------------------------------------------------------------------------------------------
// The page.

const AsyncFunction = (async () => {}).constructor;
function recipe(number) {
  const recipes = readFileSync(
    join(root, "node_modules", engine, "docs/agent-surface/recipes.md"),
    "utf8",
  );
  const section = recipes
    .split(/^## /m)
    .find((part) => part.startsWith(`${number}. `));
  const fence = /^```js\n([\s\S]*?)^```$/m.exec(section ?? "");
  if (fence === null)
    cannot(`recipes.md has no recipe ${number} with a js fence`);
  return fence[1];
}

function floorTable(node, index) {
  if (!SPEC_KINDS.includes(node.specKind)) return null;
  return SPEC_READINESS.map((rung) => ({
    rung,
    clauses: readinessFloors[rung].clauses.map((clause) => ({
      id: clause.id,
      description: clause.description,
      holds: clause.predicate(node, index),
    })),
  }));
}

async function readGraph(pack) {
  const extracted = extract({ root });
  const error = extracted.report.findings.find(
    (finding) => finding.severity === "error",
  );
  if (error !== undefined)
    cannot(`the graph does not derive: ${error.message.split("\n")[0]}`);
  const { graph } = extracted;
  const reader = createReader(graph);
  const summary =
    reader.packs().find((candidate) => candidate.id === pack) ??
    cannot(`the graph has no ${pack}`);
  const context = reader.packContext(pack);
  const members = authoredMembers(
    readFileSync(join(root, summary.file), "utf8"),
  );
  const listed = context.members.map((member) => member.id);
  if (
    members.length !== listed.length ||
    !members.every((id) => listed.includes(id))
  )
    cannot(`${summary.file} and the graph list different members`);
  const unresolved = context.members.find((member) => !member.resolved);
  if (unresolved !== undefined) cannot(`${unresolved.id} is not in the graph`);
  return {
    graph,
    reader,
    index: buildGraphIndex(graph),
    summary,
    members,
    questions: await new AsyncFunction("g", "graph", "report", recipe(20))(
      reader,
      graph,
      undefined,
    ),
    declarations: await new AsyncFunction("g", "graph", "report", recipe(24))(
      reader,
      graph,
      undefined,
    ),
  };
}

export async function generate(pack, out) {
  const pin = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const enginePin =
    pin.devDependencies?.[engine] ??
    pin.dependencies?.[engine] ??
    cannot(`package.json does not depend on ${engine}`);
  const { reader, index, summary, members, questions, declarations } =
    await readGraph(pack);
  const pairs = readPinnedPairs(root, pack);
  const sites = readAnchorSites(root);
  const sources = readQuestionSources(root);
  const prettierOptions =
    (await resolveConfig(join(root, "package.json"))) ?? {};

  const pageDirectory = dirname(out);
  const link = (path, line) => {
    const target = relative(pageDirectory, join(root, path))
      .split(sep)
      .join("/");
    if (line === undefined || line === null) return target;
    return `${target}${path.endsWith(".md") ? "?plain=1" : ""}#L${line}`;
  };
  const specs = new Map(reader.specs().map((spec) => [spec.id, spec]));
  const rank = (rung) => SPEC_READINESS.indexOf(rung);
  const memberSet = new Set(members);
  const openingLine = (id) => (specs.get(id)?.narrative ?? "").split("\n")[0];
  const specLink = (id) => {
    const spec = specs.get(id);
    return spec === undefined ? span(id) : `[${span(id)}](${link(spec.file)})`;
  };

  // Everything the page says about one member.
  const model = await Promise.all(
    members.map(async (id, at) => {
      const context = reader.specContext(id);
      const node = index.primitivesById.get(id);
      const floors = floorTable(node, index);
      const next =
        floors === null ? null : nextRung(context.statedReadiness, floors);
      const lines = specLines(readFileSync(join(root, context.file), "utf8"));
      const typed = context.relationsOut.filter((relation) =>
        typedRelations.includes(relation.type),
      );
      const belowDefined = typed.filter(
        (relation) =>
          !relation.resolved ||
          rank(specs.get(relation.otherId)?.statedReadiness) < rank("defined"),
      );
      const own = (
        questions.specs.find((row) => row.id === id)?.questions ?? []
      ).map((question, position) => ({
        ...question,
        position: position + 1,
        line: lines.questions[position] ?? null,
      }));
      const joined = joinQuestions(id, own, sources);
      const entries = await Promise.all(
        declarations.rows
          .filter((row) => row.spec === id)
          .map(async (row) => ({
            key: row.key,
            address: `${id}#design.${row.key}`,
            line: lines.design.get(row.key) ?? null,
            pair: pairs.pairs.get(`${id}#design.${row.key}`) ?? null,
            declaration: await formatDeclaration(
              row.declaration,
              prettierOptions,
            ),
          })),
      );
      const declared = new Set(entries.map((entry) => entry.key));
      return {
        id,
        number: at + 1,
        context,
        heading: `${at + 1}. ${context.title ?? id}`,
        next,
        typed,
        blockers:
          next !== null &&
          next.failing.some((clause) => clause.id === typedClause)
            ? belowDefined
            : [],
        entries,
        otherEntries: [...lines.design]
          .filter(([key]) => !declared.has(key))
          .map(([key, line]) => ({ key, line })),
        questions: joined.questions,
        leftRows: joined.left,
      };
    }),
  );
  const byId = new Map(model.map((member) => [member.id, member]));
  const memberLink = (id) => {
    const member = byId.get(id);
    return `[${member.context.title ?? id}](#${slug(member.heading)})`;
  };
  const nextText = (member) => {
    if (member.next === null) return "not evaluated: the kind is not ratified";
    if (member.next.rung === null) return "none above ready";
    if (member.next.failing.length === 0)
      return `${member.next.rung}, which its floor holds`;
    return `${member.next.rung}, held by ${span(member.next.failing[0].id)}`;
  };
  const pairCounts = (member) => {
    const count = (state) =>
      member.entries.filter((entry) => entry.pair?.state === state).length;
    const parts = [
      [count("bound"), "bound"],
      [count("ahead"), "ahead"],
      [count("notCompared"), "not compared"],
      [
        member.entries.filter((entry) => entry.pair === null).length,
        "without a pair",
      ],
    ].filter(([n]) => n > 0);
    return parts.length === 0
      ? "no pinned declaration"
      : parts.map(([n, word]) => `${n} ${word}`).join(", ");
  };
  const examplesOf = (member) =>
    member.context.verifiers.filter((verifier) => verifier.via === "example");
  const testsOf = (member) =>
    member.context.verifiers.filter(
      (verifier) => verifier.via === "test-anchor",
    );
  const evidenceText = (member) => {
    if (member.context.specKind === "example") {
      const tier = tierOf(openingLine(member.id));
      const bound = testsOf(member).length > 0;
      return `${tier === null ? "no tier named" : `${tier} tier`}, ${bound ? "a verifier is bound" : "no verifier bound"}`;
    }
    const examples = examplesOf(member);
    const parts = [];
    if (examples.length > 0)
      parts.push(
        `${examples.filter((example) => example.enabled).length} of ${plural(examples.length, "example")} with a verifier`,
      );
    if (testsOf(member).length > 0)
      parts.push(plural(testsOf(member).length, "test"));
    return parts.length === 0 ? "none" : parts.join(", ");
  };

  const page = [];
  const write = (...lines) => page.push(...lines);
  const blockingCount = (questions) => {
    const count = questions.filter((question) => question.blocking).length;
    return count === 0 ? "none blocking" : `${count} blocking`;
  };
  const site = (file, line) =>
    file === undefined
      ? "no site"
      : `[${span(file)}${line === undefined ? "" : ` line ${line}`}](${link(file, line)})`;

  // Head.
  write(
    `# ${summary.title ?? pack}`,
    "",
    "<!-- Generated by scripts/pack-page.mjs. Do not edit: change a Spec or an input, then run npm run pages. -->",
    "",
  );
  if (summary.framing !== undefined) write(summary.framing, "", "");
  write(
    `This page is generated from the Specs of ${span(pack)} by ${span("scripts/pack-page.mjs")}, with three inputs: the pinned pairs in [${span(inputs.pairs)}](${link(inputs.pairs)}), the anchor sites in [${span(inputs.sites)}](${link(inputs.sites)}) and the register rows in [${span(inputs.register)}](${link(inputs.register)}). Do not edit it by hand. Change a Spec or an input, then run ${span("npm run pages")}; ${span("npm run pages -- --check")} fails while the page is behind the tree. The Protocol is pinned at ${span(`${engine}@${enginePin}`)}.${summary.modelRefs.length > 0 ? ` The members speak the vocabulary of ${list(summary.modelRefs.map(specLink))}.` : ""}`,
    "",
    "## How to read it",
    "",
    "Start with the members and with what holds a member below its next rung: together they say where the design stands and what keeps it there. Then come the Specs outside the Pack that the members rest on, the open questions with their register rows, and each member in full with its code, its examples and verifiers, and its pinned declarations. Long lists are folded; open them where you need them.",
    "",
    "- The stated rung is the readiness a Spec's author states: idea, scoped, defined or ready.",
    "- The floor is the highest rung whose clauses all hold in the graph. It can sit above the stated rung.",
    "- The next rung is the one above the stated rung, with the first floor clause that fails at it. A rung whose clauses all hold still waits for its author to state it.",
    "- An implementation anchor binds code to a Spec. Its site is the file it is written in; a site under `tests/` stands for the source files listed with it.",
    "- A pair is a pinned declaration and the code a type test compares it with: bound when the two are equal, ahead when the design leads the code, not compared when the test compares nothing.",
    "",
  );

  // Members.
  write(
    "## Members",
    "",
    `${plural(members.length, "Spec")}, in the order the Pack reads them.`,
    "",
    ...table(
      [
        "#",
        "Spec",
        "Kind",
        "Stated",
        "Floor",
        "Next rung",
        "Code",
        "Examples and verifiers",
        "Pairs",
        "Open questions",
      ],
      model.map((member) => [
        `[${member.number}](#${slug(member.heading)})`,
        specLink(member.id),
        member.context.specKind,
        member.context.statedReadiness,
        member.context.derivedReadiness ?? "none",
        nextText(member),
        member.context.implementations.length === 0
          ? "none"
          : plural(member.context.implementations.length, "anchor"),
        evidenceText(member),
        pairCounts(member),
        member.questions.length === 0
          ? "none"
          : `${member.questions.length}, ${blockingCount(member.questions)}`,
      ]),
    ),
    "",
  );

  // What holds a member below its next rung.
  write("## What holds a member below its next rung", "");
  const held = model.filter((member) => member.next?.failing.length > 0);
  const clear = model.filter(
    (member) => member.next?.rung !== null && member.next?.failing.length === 0,
  );
  if (held.length === 0) write("No member is held below its next rung.", "");
  for (const member of held) {
    const [first, ...rest] = member.next.failing;
    write(
      `- ${memberLink(member.id)} states ${member.context.statedReadiness} and cannot reach ${member.next.rung}. The first clause that fails is ${span(first.id)}, which the Protocol states as "${first.description}"${rest.length > 0 ? ` After it, ${list(rest.map((clause) => span(clause.id)))} fail too.` : ""}`,
    );
    if (member.blockers.length > 0)
      write(
        `  It rests on ${list(member.blockers.map((relation) => `${specLink(relation.otherId)} by ${relation.type}, which ${relation.resolved ? `states ${specs.get(relation.otherId)?.statedReadiness}` : "is not in the graph"}`))}.`,
      );
    const blocking = member.questions.filter((question) => question.blocking);
    if (
      member.next.failing.some(
        (clause) => clause.id === "no-blocking-open-questions",
      ) &&
      blocking.length > 0
    )
      write(
        `  Its blocking ${blocking.length === 1 ? "question is" : "questions are"} ${list(blocking.map((question) => `question ${question.position}`))}, under its open questions below.`,
      );
  }
  if (held.length > 0) write("");
  if (clear.length > 0)
    write(
      `The floor holds at the next rung for ${list(clear.map((member) => memberLink(member.id)))}. Each waits for its author to state that rung.`,
      "",
    );
  const top = model.filter((member) => member.next?.rung === null);
  if (top.length > 0)
    write(
      `${list(top.map((member) => memberLink(member.id)))} state ready, the top rung.`,
      "",
    );

  // Outside the Pack.
  const outside = new Map();
  for (const member of model)
    for (const relation of member.typed) {
      if (memberSet.has(relation.otherId)) continue;
      const target = outside.get(relation.otherId) ?? {
        id: relation.otherId,
        from: [],
        blocks: [],
      };
      target.from.push(`${span(member.id)} ${relation.type}`);
      if (
        member.blockers.some((blocker) => blocker.otherId === relation.otherId)
      )
        target.blocks.push(member);
      outside.set(relation.otherId, target);
    }
  const targets = [...outside.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const rungOf = (id) => specs.get(id)?.statedReadiness ?? "not in the graph";
  const floorOf = (id) =>
    specs.has(id)
      ? (specs.get(id).derivedReadiness ?? "none")
      : "not in the graph";
  const blocking = targets.filter((target) => target.blocks.length > 0);
  write(
    "## Outside the Pack",
    "",
    "### What the members rest on",
    "",
    `The members rest on ${plural(targets.length, "Spec")} outside the Pack through refines, dependsOn, constrainedBy or decidedBy. A Spec states ready only when every such target states at least defined, so a target below defined holds each member that rests on it below ready.`,
    "",
  );
  if (blocking.length === 0)
    write("No target outside the Pack holds a member below its next rung.", "");
  else
    write(
      ...table(
        ["Spec", "Stated", "Floor", "Holds below ready", "Rested on by"],
        blocking.map((target) => [
          specLink(target.id),
          rungOf(target.id),
          floorOf(target.id),
          list(target.blocks.map((member) => memberLink(member.id))),
          target.from.join(", "),
        ]),
      ),
      "",
    );
  write(
    `<details><summary>All ${plural(targets.length, "Spec")} outside the Pack that the members rest on</summary>`,
    "",
    ...table(
      ["Spec", "Stated", "Floor", "Rested on by"],
      targets.map((target) => [
        specLink(target.id),
        rungOf(target.id),
        floorOf(target.id),
        target.from.join(", "),
      ]),
    ),
    "",
    "</details>",
    "",
  );
  const restingOn = new Map();
  for (const member of model)
    for (const relation of member.context.relationsIn) {
      if (
        memberSet.has(relation.otherId) ||
        !typedRelations.includes(relation.type)
      )
        continue;
      if (
        member.context.verifiers.some(
          (verifier) => verifier.verifierId === relation.otherId,
        )
      )
        continue;
      const source = restingOn.get(relation.otherId) ?? {
        id: relation.otherId,
        to: [],
      };
      source.to.push(`${relation.type} ${span(member.id)}`);
      restingOn.set(relation.otherId, source);
    }
  const dependents = [...restingOn.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  write(
    "### What rests on the members",
    "",
    `${plural(dependents.length, "Spec")} outside the Pack ${dependents.length === 1 ? "rests" : "rest"} on a member. An example that verifies a member is listed with that member instead.`,
    "",
  );
  if (dependents.length > 0)
    write(
      `<details><summary>The ${plural(dependents.length, "Spec")} that rest on a member</summary>`,
      "",
      ...table(
        ["Spec", "Stated", "Floor", "Rests on"],
        dependents.map((source) => [
          specLink(source.id),
          rungOf(source.id),
          floorOf(source.id),
          source.to.join(", "),
        ]),
      ),
      "",
      "</details>",
      "",
    );

  // Open questions.
  const allQuestions = model.flatMap((member) => member.questions);
  const unjoined = allQuestions.filter(
    (question) => question.rows.length === 0,
  );
  write(
    "## Open questions",
    "",
    `${plural(allQuestions.length, "open question")} on ${plural(model.filter((member) => member.questions.length > 0).length, "member")}, ${blockingCount(allQuestions)}. ${allQuestions.length - unjoined.length} join a register row by their opening text; ${unjoined.length} join none. A row gives its OD id, its class, its status, the advisor whose lens it falls under and what it blocks. Each question shows its opening, at most its first sentence, and links to its line in the Spec for the rest.`,
    "",
  );
  const rowText = (row) =>
    `**${row.id}** class ${row.class ?? "none"}, status ${row.status ?? "none"}, advisor ${row.advisor ?? "none"}, blocks ${row.blocks ?? "nothing"}`;
  for (const member of model) {
    if (member.questions.length === 0 && member.leftRows.length === 0) continue;
    write(`**${memberLink(member.id)}**, ${span(member.id)}`, "");
    for (const question of member.questions) {
      const where =
        question.line === null
          ? `question ${question.position}`
          : `[question ${question.position}](${link(member.context.file, question.line)})`;
      const rows =
        question.rows.length === 0
          ? "No register row"
          : question.rows.map(rowText).join("; ");
      write(
        `- ${rows}. ${where}, ${question.blocking ? "[blocking]" : "[non-blocking]"}: ${opening(question.question)}`,
      );
    }
    for (const row of member.leftRows)
      write(
        `- ${rowText(row)}. Its source names a question this Spec no longer holds: ${opening(row.question)}`,
      );
    write("");
  }

  // Each member.
  write("## Each member", "");
  for (const member of model) {
    const { context } = member;
    write(
      `### ${member.heading}`,
      "",
      `${specLink(member.id)} · ${context.specKind} · stated ${context.statedReadiness} · floor ${context.derivedReadiness ?? "none"} · next rung ${nextText(member)}.`,
      "",
    );
    const inside = member.typed
      .filter((relation) => memberSet.has(relation.otherId))
      .sort(
        (left, right) =>
          typedRelations.indexOf(left.type) -
            typedRelations.indexOf(right.type) ||
          members.indexOf(left.otherId) - members.indexOf(right.otherId),
      );
    if (inside.length > 0)
      write(
        `Inside the Pack it rests on ${list(inside.map((relation) => `${memberLink(relation.otherId)} by ${relation.type}`))}.`,
        "",
      );

    const isExample = context.specKind === "example";
    const tests = testsOf(member);
    if (isExample) {
      const line = openingLine(member.id);
      const tier = tierOf(line);
      write(
        `**Tier and verifier.** Its opening line is ${span(line)}, which ${tier === null ? "names no tier" : `names the ${tier} tier`}. ${tests.length === 0 ? "No verifier is bound to it." : `${plural(tests.length, "verifier is", "verifiers are")} bound to it.`}`,
        "",
      );
    }

    if (context.implementations.length > 0) {
      write("**Code.**", "");
      for (const binding of context.implementations) {
        let line = `- ${span(binding.codeId)} at ${site(binding.file, binding.line)}${binding.label === undefined ? "" : `: ${binding.label}`}.`;
        if (binding.file?.startsWith("tests/")) {
          const listed = sites.get(binding.codeId);
          line +=
            listed === undefined
              ? ` Its site is a test file, and ${span(inputs.sites)} lists no source for it.`
              : ` It stands for ${list(listed.map((path) => `[${span(path)}](${link(path)})`))}.`;
        }
        write(line);
      }
      write("");
    } else if (!isExample)
      write("**Code.** No implementation anchor binds it.", "");

    const examples = examplesOf(member);
    if (examples.length > 0)
      write(
        "**Examples.**",
        "",
        ...table(
          ["Example", "Tier", "Verifier", "Title"],
          examples.map((example) => [
            specLink(example.verifierId),
            tierOf(openingLine(example.verifierId)) ?? "not named",
            example.enabled ? "bound" : "none bound",
            example.label ?? "",
          ]),
        ),
        "",
      );
    if (tests.length > 0) {
      write("**Verifiers.**", "");
      for (const test of tests)
        write(
          `- ${span(test.verifierId)} at ${site(test.file, test.line)}${test.label === undefined ? "" : `: ${test.label}`}.`,
        );
      write("");
    }
    if (!isExample && examples.length === 0 && tests.length === 0)
      write("**Examples and verifiers.** None is bound to it.", "");

    const entryLink = (entry) =>
      entry.line === null
        ? span(entry.address)
        : `[${span(entry.address)}](${link(context.file, entry.line)})`;
    if (member.entries.length > 0) {
      write(
        `**Pinned declarations.** ${plural(member.entries.length, "Design entry", "Design entries")} open with a code span. Each pair comes from [${span(inputs.pairs)}](${link(inputs.pairs)}) and is the test named by its address in [${span(pairs.test)}](${link(pairs.test)}).`,
        "",
        ...table(
          ["Design entry", "Pair", "Compared", "Code", "Why"],
          member.entries.map((entry) => {
            if (entry.pair === null)
              return [
                entryLink(entry),
                "no pair",
                "",
                "",
                `${span(inputs.pairs)} lists no pair for it`,
              ];
            const [file, name] = entry.pair.code?.split("#") ?? [];
            return [
              entryLink(entry),
              states[entry.pair.state],
              compared[entry.pair.comparison],
              file === undefined
                ? "none"
                : `${span(name)} in [${span(file)}](${link(file)})`,
              entry.pair.reason ?? "",
            ];
          }),
        ),
        "",
        `<details><summary>The ${plural(member.entries.length, "declaration")} as the Spec pins them</summary>`,
        "",
      );
      for (const entry of member.entries)
        write(
          `${entryLink(entry)}${entry.declaration.formatted ? "" : ", as the Spec writes it, which Prettier does not parse"}`,
          "",
          "```ts",
          entry.declaration.text,
          "```",
          "",
        );
      write("</details>", "");
    } else if (!isExample) write("**Pinned declarations.** It pins none.", "");
    if (member.otherEntries.length > 0)
      write(
        `**Other Design entries.** ${plural(member.otherEntries.length, "entry pins", "entries pin")} no declaration: ${member.otherEntries
          .map(({ key, line }) => `[${span(key)}](${link(context.file, line)})`)
          .join(", ")}.`,
        "",
      );
  }

  // Pairs that name no pinned declaration of a member.
  const shown = new Set(
    model.flatMap((member) => member.entries.map((entry) => entry.address)),
  );
  const strays = [...pairs.pairs.values()].filter(
    (pair) => !shown.has(pair.address),
  );
  if (strays.length > 0)
    write(
      "## Pairs without a member's declaration",
      "",
      `${plural(strays.length, "pair")} in ${span(inputs.pairs)} ${strays.length === 1 ? "names" : "name"} no pinned declaration of a member.`,
      "",
      ...table(
        ["Address", "Pair", "Compared", "Code"],
        strays.map((pair) => [
          span(pair.address),
          states[pair.state],
          compared[pair.comparison],
          pair.code === null ? "none" : span(pair.code),
        ]),
      ),
      "",
    );

  return `${page
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

// ---------------------------------------------------------------------------------------------
// The command.

async function main() {
  const { values } = parseArgs({
    options: {
      pack: { type: "string" },
      out: { type: "string" },
      check: { type: "boolean", default: false },
    },
  });
  if (values.pack === undefined || values.out === undefined)
    cannot("name the Pack and the page: --pack <packId> --out <page>");
  const out = resolve(values.out);
  const path = relative(root, out).split(sep).join("/");
  if (path.startsWith("..") || !path.endsWith(".md"))
    cannot(
      `the page must be a .md file inside the repository, not ${values.out}`,
    );
  const generated = await generate(values.pack, out);
  if (!values.check) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, generated);
    console.error(`pack-page: wrote ${path}`);
    return 0;
  }
  if (!existsSync(out)) {
    console.error(`pack-page: ${path} is missing; run npm run pages`);
    return 1;
  }
  const difference = firstDifference(readFileSync(out, "utf8"), generated);
  if (difference === null) return 0;
  console.error(
    `pack-page: ${path} is behind the tree from line ${difference.line}: the page has ${JSON.stringify(difference.committed)}, the tree generates ${JSON.stringify(difference.generated)}; run npm run pages`,
  );
  return 1;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(
        `pack-page: cannot generate · ${error instanceof PageError ? error.message : (error?.stack ?? error)}`,
      );
      process.exit(2);
    },
  );
