// Writes the page of one capability Pack, which a person opens to understand its design:
// `node scripts/pack-page.mjs --pack <packId> --out <page>` writes the page, and with `--check` it
// writes nothing and compares the page at --out with what the tree generates, naming the first line
// that differs. It reads the graph in memory through the Protocol package's exported extractor and
// reader, never through validate, view, census or build, and runs recipes 20 and 24 through q as the
// pinned Protocol ships them in dist/recipes, with --params. Two inputs join it: the pinned pairs
// (tests/types/pinned-pairs.json) and the rows of the decision register
// (design/decisions/register.json); a missing input is an error that names its path. The code a
// member binds comes from the graph alone: each anchor at its own site, with its role and its
// component. The members come in the order the reader's Pack context gives them, which is the order
// the Pack file writes them. The next rung is the rung above the stated one: the reader's
// `nextRungFailures` are the unmet clauses of the rung above the floor, so when the floor sits above
// the stated rung nothing blocks the next rung, and otherwise its first unmet clause is the first of
// them, with the targets that break a typed-dependency clause.
// Exit 0: written, or the page is current. 1: --check found the page behind the tree. 2: it cannot
// generate.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  SPEC_KINDS,
  SPEC_READINESS,
  createReader,
  extract,
} from "@libar-dev/software-delivery-protocol";
import { format, resolveConfig } from "prettier";

const root = join(import.meta.dirname, "..");
const engine = "@libar-dev/software-delivery-protocol";
const inputs = {
  pairs: "tests/types/pinned-pairs.json",
  register: "design/decisions/register.json",
};
// The relations a Spec rests on, as recipe 21 and the floor's typed-dependency clause read them.
const typedRelations = ["refines", "dependsOn", "constrainedBy", "decidedBy"];
const typedClause = "typed-dependency-targets-are-defined";
const blockingClause = "no-blocking-open-questions";
// The module scripts/pinned.mjs emits for a Pack, by default named after the Pack's id.
const pinnedModule = (pack) =>
  `generated/pinned/${pack.replace(/^pack:/, "")}.ts`;

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

// The register: every row with the fields the page shows and its sources as the register writes
// them. An open question source cites its question by address; a closed one keeps its Spec and the
// question's opening text, as design/advisors/register.md rules.
export function readRegister(base) {
  const path = inputs.register;
  const data = readJson(base, path);
  if (!Array.isArray(data?.decisions))
    cannot(`${path} has no list of decisions`);
  return data.decisions.map((decision, at) => {
    if (!isText(decision?.id)) cannot(`${path} decisions[${at}] has no id`);
    const where = `${path} ${decision.id}`;
    if (!Array.isArray(decision.sources))
      cannot(`${where} has no list of sources`);
    for (const source of decision.sources) {
      if (!isText(source?.kind) || !isText(source.file))
        cannot(`${where}: a source needs a kind and a file`);
      if (source.kind !== "specQuestion") continue;
      if (source.open === false) {
        if (![source.spec, source.question].every(isText))
          cannot(
            `${where}: a closed specQuestion source needs spec, question and file`,
          );
      } else if (!isText(source.address))
        cannot(`${where}: an open specQuestion source needs address and file`);
    }
    return {
      id: decision.id,
      title: decision.title ?? null,
      class: decision.class ?? null,
      status: decision.status ?? null,
      advisor: decision.advisor ?? null,
      blocks: decision.blocks ?? null,
      decidedBy: decision.decidedBy ?? null,
      decidedOn: decision.decidedOn ?? null,
      ruling: decision.ruling ?? null,
      sources: decision.sources,
    };
  });
}

// One entry for each open question source: the row it belongs to and the address it cites.
export function questionSources(rows) {
  return rows.flatMap((row) =>
    row.sources
      .filter(
        (source) => source.kind === "specQuestion" && source.open !== false,
      )
      .map((source) => ({ ...row, address: source.address })),
  );
}

// ---------------------------------------------------------------------------------------------
// The pure parts.

// The members of a Pack in the order the reader's Pack context gives them, each once.
export function packMembers(context) {
  const members = context.members.map((member) => member.id);
  if (members.length === 0) cannot(`${context.id} lists no specs`);
  const repeated = members.find((id, at) => members.indexOf(id) !== at);
  if (repeated !== undefined) cannot(`${context.id} lists ${repeated} twice`);
  const unresolved = context.members.find((member) => !member.resolved);
  if (unresolved !== undefined) cannot(`${unresolved.id} is not in the graph`);
  return members;
}

// The rung above the stated one and the clauses that fail at it, from a Spec context of the reader.
// `nextRungFailures` are the unmet clauses of the rung above the floor, cumulative in table order.
// When the floor sits above the stated rung, the next rung holds; otherwise the rung above the floor
// is at or below the next rung, so its first unmet clause is the first that fails at the next rung.
// A kind the Protocol does not ratify has no floor, and null says the next rung is not evaluated.
export function nextRung(context) {
  if (!SPEC_KINDS.includes(context.specKind)) return null;
  const stated = SPEC_READINESS.indexOf(context.statedReadiness);
  const rung = SPEC_READINESS[stated + 1] ?? null;
  if (rung === null) return { rung, below: false, failing: [] };
  const floor =
    context.derivedReadiness === undefined
      ? -1
      : SPEC_READINESS.indexOf(context.derivedReadiness);
  return {
    rung,
    below: floor < stated,
    failing: floor > stated ? [] : context.nextRungFailures,
  };
}

// The address of an open question, or null when its marker carries no key.
export const questionAddress = (spec, question) =>
  question.key === null || question.key === undefined
    ? null
    : `${spec}#question.${question.key}`;

// The register rows of one Spec joined to its open questions by address: a row joins the question
// its source cites. `left` holds the rows whose address names the Spec and none of its questions.
export function joinQuestions(spec, questions, rows) {
  const own = rows.filter((row) => row.address.startsWith(`${spec}#`));
  const joined = questions.map((question) => {
    const address = questionAddress(spec, question);
    return {
      ...question,
      address,
      rows:
        address === null ? [] : own.filter((row) => row.address === address),
    };
  });
  const left = own.filter(
    (row) => !joined.some((question) => question.rows.includes(row)),
  );
  return { questions: joined, left };
}

// The register rows whose sources lie in a member's file, beside what the open questions show: every
// decided row, and every other row none of whose sources is an open question. `files` is keyed by
// the members' files; each row keeps only its sources in a member, in the register's order.
export function memberRows(rows, files) {
  return rows.flatMap((row) => {
    const inside = row.sources.filter((source) => files.has(source.file));
    if (inside.length === 0) return [];
    const asks = row.sources.some(
      (source) => source.kind === "specQuestion" && source.open !== false,
    );
    if (row.status !== "decided" && asks) return [];
    return [{ ...row, sources: inside }];
  });
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

// The table entry each index entry is chained on, by entry address, as the pinned module chains it:
// an `index*` entry of the form `.index(...)` belongs to the `table*` entry of the form
// `name: defineTable(...)` that its Spec wrote last before it. `rows` are recipe 24's rows in order.
export function indexTables(rows) {
  const tables = new Map();
  let table = null;
  for (const row of rows) {
    const prefix = /^[a-z]+/.exec(row.key)?.[0];
    const declaration = row.declaration.trim();
    if (prefix === "table" && /^[\w$]+:\s*defineTable\(/.test(declaration))
      table = row;
    else if (
      prefix === "index" &&
      declaration.startsWith(".index(") &&
      table?.spec === row.spec
    )
      tables.set(
        `${row.spec}#design.${row.key}`,
        `${table.spec}#design.${table.key}`,
      );
  }
  return tables;
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
      /^- \[(?:non-)?blocking(?: #[a-z][A-Za-z0-9]*)?\] /.test(line)
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

function recipes(base, params = {}) {
  const dist = join(root, "node_modules", engine, "dist");
  const body = (file) => readFileSync(join(dist, "recipes", file), "utf8");
  // Both bodies share one query's graph, as they shared the in-memory reader before.
  const query = `return {
    questions: await (async () => { ${body("20-open-question-register.js")} })(),
    declarations: await (async () => { ${body("24-pinned-declarations.js")} })(),
  };`;
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        join(dist, "cli/sdp.js"),
        "q",
        query,
        "--root",
        base,
        "--params",
        JSON.stringify(params),
        "--json",
      ],
      { cwd: base, encoding: "utf8", maxBuffer: 1 << 27 },
    ),
  );
}

async function readGraph(pack, base) {
  const extracted = extract({ root: base });
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
  const entries = recipes(base);
  return {
    graph,
    reader,
    summary,
    members: packMembers(reader.packContext(pack)),
    questions: entries.questions,
    declarations: entries.declarations,
  };
}

// `base` is the repository the page describes: its graph, its inputs and its links. The recipes
// come from the Protocol this script's repository pins.
export async function generate(pack, out, base = root) {
  const pin = JSON.parse(readFileSync(join(base, "package.json"), "utf8"));
  const enginePin =
    pin.devDependencies?.[engine] ??
    pin.dependencies?.[engine] ??
    cannot(`package.json does not depend on ${engine}`);
  const { graph, reader, summary, members, questions, declarations } =
    await readGraph(pack, base);
  const chained = indexTables(declarations.rows);
  const pairs = readPinnedPairs(base, pack);
  const register = readRegister(base);
  const sources = questionSources(register);
  const prettierOptions =
    (await resolveConfig(join(base, "package.json"))) ?? {};

  const pageDirectory = dirname(out);
  const link = (path, line) => {
    const target = relative(pageDirectory, join(base, path))
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
      const next = nextRung(context);
      const lines = specLines(readFileSync(join(base, context.file), "utf8"));
      const typed = context.relationsOut.filter((relation) =>
        typedRelations.includes(relation.type),
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
          .map(async (row) => {
            const address = `${id}#design.${row.key}`;
            const own = pairs.pairs.get(address) ?? null;
            // An index has no pair of its own: its table's pair compares the table's indexes.
            const table = own === null ? (chained.get(address) ?? null) : null;
            return {
              key: row.key,
              address,
              line: lines.design.get(row.key) ?? null,
              pair: own ?? pairs.pairs.get(table) ?? null,
              table:
                table !== null && pairs.pairs.has(table)
                  ? table.slice(table.indexOf("#design.") + "#design.".length)
                  : null,
              declaration: await formatDeclaration(
                row.declaration,
                prettierOptions,
              ),
            };
          }),
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
          next?.failing.find((clause) => clause.clauseId === typedClause)
            ?.targets ?? [],
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
    return `${member.next.rung}, held by ${span(member.next.failing[0].clauseId)}`;
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
  // The code a member binds, from the graph alone: the units that satisfy it and the units that
  // reference it, each at its own site.
  const codeText = (context) => {
    const parts = [];
    if (context.implementations.length > 0)
      parts.push(plural(context.implementations.length, "anchor"));
    if (context.references.length > 0)
      parts.push(`referenced by ${plural(context.references.length, "unit")}`);
    return parts.length === 0 ? "none" : parts.join(", ");
  };
  const codeNodes = new Map(
    graph.nodes
      .filter((node) => node.nodeType === "CodeNode")
      .map((node) => [node.id, node]),
  );
  const componentOf = new Map(
    graph.edges
      .filter((edge) => edge.type === "memberOf")
      .map((edge) => [edge.from, edge.to]),
  );
  // One code unit: its id, its site and its label, then what the anchors declare of its structure:
  // its role, and the layer and bounded context of the component it is or belongs to.
  const placement = (node) =>
    list(
      [
        node?.layer === undefined ? null : `the ${node.layer} layer`,
        node?.context === undefined ? null : `the ${node.context} context`,
      ].filter((part) => part !== null),
    );
  const unitLine = (binding) => {
    const facts = [];
    if (binding.role !== undefined) facts.push(`Its role is ${binding.role}.`);
    const own = placement(binding);
    if (own !== "") facts.push(`It is a component in ${own}.`);
    const component = componentOf.get(binding.codeId);
    if (component !== undefined) {
      const where = placement(codeNodes.get(component));
      facts.push(
        `It belongs to ${span(component)}${where === "" ? "" : `, in ${where}`}.`,
      );
    }
    return `- ${span(binding.codeId)} at ${site(binding.file, binding.line)}${binding.label === undefined ? "" : `: ${binding.label}`}.${facts.length === 0 ? "" : ` ${facts.join(" ")}`}`;
  };

  // Head.
  write(
    `# ${summary.title ?? pack}`,
    "",
    "<!-- Generated by scripts/pack-page.mjs. Do not edit: change a Spec or an input, then run npm run pages. -->",
    "",
  );
  if (summary.framing !== undefined) write(summary.framing, "", "");
  const pinned = pinnedModule(pack);
  write(
    `This page is generated from the Specs of ${span(pack)} by ${span("scripts/pack-page.mjs")}, with two inputs: the pinned pairs in [${span(inputs.pairs)}](${link(inputs.pairs)}) and the register rows in [${span(inputs.register)}](${link(inputs.register)}). Do not edit it by hand. Change a Spec or an input, then run ${span("npm run pages")}; ${span("npm run pages -- --check")} fails while the page is behind the tree. The Protocol is pinned at ${span(`${engine}@${enginePin}`)}.${summary.modelRefs.length > 0 ? ` The members speak the vocabulary of ${list(summary.modelRefs.map(specLink))}.` : ""}`,
    "",
    "## How to read it",
    "",
    "Start with the members and with what holds a member below its next rung: together they say where the design stands and what keeps it there. Then come the Specs outside the Pack that the members rest on, the open questions with their register rows, the register rows whose sources lie in the members with their status and rulings, and each member in full with its code, its examples and verifiers, and its pinned declarations. Long lists are folded; open them where you need them.",
    "",
    "- The stated rung is the readiness a Spec's author states: idea, scoped, defined or ready.",
    "- A register row blocks the first unit of work that needs its decision, a build slice such as S5 named in `design/STATE.md`. That is apart from a question marked blocking, which holds its Spec at scoped, and apart from the floor.",
    "- The floor is the highest rung whose clauses all hold in the graph. It can sit above the stated rung.",
    "- The next rung is the one above the stated rung, with the first floor clause that fails at it. A rung whose clauses all hold still waits for its author to state it.",
    "- An open question is cited by its address, the Spec's id, `#question.` and the key its marker carries.",
    "- An implementation anchor binds code to a Spec at its site, the file and line it is written at. Code that satisfies a Spec realizes it, and the graph derives implemented from it. Code that references a Spec answers to its design without claiming to realize it: the unit follows the design or realizes part of it, so a change to the design asks the code to follow. A design that builds on existing code says so by its own relation to the Spec that code satisfies. A reference confers nothing. Each unit gives its role and its component, with the component's layer and bounded context, where the anchor declares them.",
    `- A pair is a pinned declaration and the code a type test compares it with: bound when the two are equal, ahead when the design leads the code, not compared when the test compares nothing. The test imports every pinned declaration of the Pack from [${span(pinned)}](${link(pinned)}), which ${span("npm run sdp:build")} emits and git does not keep.`,
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
        codeText(member.context),
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
    const floor = member.context.derivedReadiness;
    write(
      `- ${memberLink(member.id)} states ${member.context.statedReadiness} and cannot reach ${member.next.rung}.${member.next.below ? ` Its floor, ${floor ?? "none"}, is below its stated rung.` : ""} The first clause that fails is ${span(first.clauseId)}, which the Protocol states as "${first.description}"${rest.length > 0 ? ` After it, ${list(rest.map((clause) => span(clause.clauseId)))} ${rest.length === 1 ? "fails" : "fail"} too.` : ""}`,
    );
    if (member.blockers.length > 0)
      write(
        `  It rests on ${list(member.blockers.map((target) => `${specLink(target.id)} by ${target.type}, which ${target.statedReadiness === undefined ? "is not a Spec" : `states ${target.statedReadiness}`}`))}.`,
      );
    const blocking = member.questions.filter((question) => question.blocking);
    if (
      member.next.failing.some(
        (clause) => clause.clauseId === blockingClause,
      ) &&
      blocking.length > 0
    )
      write(
        `  Its blocking ${blocking.length === 1 ? "question is" : "questions are"} ${list(blocking.map((question) => (question.address === null ? `question ${question.position}` : span(question.address))))}, under its open questions below.`,
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
        member.blockers.some((blocker) => blocker.id === relation.otherId) &&
        !target.blocks.includes(member)
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
        members: [],
      };
      source.to.push(`${relation.type} ${span(member.id)}`);
      source.members.push(member.id);
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
  const designedOnly = dependents.filter(
    (source) => rank(specs.get(source.id)?.statedReadiness) < rank("defined"),
  );
  if (designedOnly.length > 0)
    write(
      `${designedOnly.length === 1 ? "One of them states" : `${designedOnly.length} of them state`} less than defined:`,
      "",
      ...designedOnly.map(
        (source) =>
          `- ${specLink(source.id)} states ${rungOf(source.id)} and rests on ${list(
            [...new Set(source.members)].map((id) => memberLink(id)),
          )}.`,
      ),
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
    `${plural(allQuestions.length, "open question")} on ${plural(model.filter((member) => member.questions.length > 0).length, "member")}, ${blockingCount(allQuestions)}. ${allQuestions.length - unjoined.length} join a register row by their address; ${unjoined.length} join none. A row gives its OD id, its class, its status, the advisor whose lens it falls under and what it blocks. Each question shows its address, which ends in its key, and its opening, at most its first sentence, and links to its line in the Spec for the rest.`,
    "",
  );
  const rowText = (row) =>
    `**${row.id}** class ${row.class ?? "none"}, status ${row.status ?? "none"}, advisor ${row.advisor ?? "none"}, ${row.blocks ? `blocks the unit ${row.blocks}` : "blocks no unit"}`;
  for (const member of model) {
    if (member.questions.length === 0 && member.leftRows.length === 0) continue;
    write(`**${memberLink(member.id)}**, ${span(member.id)}`, "");
    for (const question of member.questions) {
      const name =
        question.address === null
          ? `question ${question.position}, which carries no key`
          : span(question.address);
      const where =
        question.line === null
          ? name
          : `[${name}](${link(member.context.file, question.line)})`;
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
        `- ${rowText(row)}. Its source cites ${span(row.address)}, which names none of this Spec's open questions.`,
      );
    write("");
  }

  // The register rows whose sources lie in the members, beside those the open questions show.
  const memberFiles = new Map(
    model.map((member) => [member.context.file, member]),
  );
  const onMembers = memberRows(register, memberFiles);
  const decided = onMembers.filter((row) => row.status === "decided");
  const questionLines = new Map(
    model.flatMap((member) =>
      member.questions
        .filter((question) => question.address !== null)
        .map((question) => [
          question.address,
          { file: member.context.file, line: question.line },
        ]),
    ),
  );
  const sourceText = (source) => {
    const member = memberFiles.get(source.file);
    const on = `on ${memberLink(member.id)}`;
    if (source.kind === "specQuestion" && source.open === false)
      return `a question ${on} that the Spec no longer holds`;
    if (source.kind === "specQuestion") {
      const at = questionLines.get(source.address);
      return `${at === undefined || at.line === null ? span(source.address) : `[${span(source.address)}](${link(at.file, at.line)})`} ${on}`;
    }
    const name = span(source.ref ?? source.kind);
    return `${source.line === undefined ? `[${name}](${link(source.file)})` : `[${name}](${link(source.file, source.line)})`} ${on}`;
  };
  write(
    "## Register rows whose sources lie in the members",
    "",
    `${plural(onMembers.length, "register row")} ${onMembers.length === 1 ? "has" : "have"} a source in a member's file: every decided row, and every row not decided whose sources cite no open question; a row not decided that cites one is under the open questions above. ${decided.length} ${decided.length === 1 ? "is" : "are"} decided and ${onMembers.length - decided.length} ${onMembers.length - decided.length === 1 ? "is" : "are"} not. Each row gives its status and its sources in the members; a decided row gives the first sentence of its ruling, and a row not decided gives its title. A source other than a question links to the line where it stood when the row was loaded. ${span("python3 design/tools/decisions.py --id <id>")} prints a row in full.`,
    "",
  );
  for (const row of onMembers)
    write(
      `- ${rowText(row)}, from ${list(row.sources.map(sourceText))}. ${
        row.status === "decided"
          ? `Decided by ${row.decidedBy ?? "no one named"} on ${row.decidedOn ?? "no date"}. Ruling: ${opening(row.ruling ?? "none recorded.")}`
          : `No ruling. Its title: ${opening(row.title ?? "none.")}`
      }`,
    );
  if (onMembers.length > 0) write("");

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
      for (const binding of context.implementations) write(unitLine(binding));
      write("");
    } else if (!isExample)
      write("**Code.** No implementation anchor binds it.", "");
    if (context.references.length > 0) {
      write(
        `**References.** ${plural(context.references.length, "unit references", "units reference")} this design. A reference says the code answers to the design without claiming to realize it, and it confers no delivery fact and moves no floor.`,
        "",
      );
      for (const binding of context.references) write(unitLine(binding));
      write("");
    }

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
    const tableLink = (key) => {
      const line = member.entries.find((entry) => entry.key === key)?.line;
      return line === null || line === undefined
        ? span(key)
        : `[${span(key)}](${link(context.file, line)})`;
    };
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
            const comparedText =
              entry.table === null
                ? compared[entry.pair.comparison]
                : entry.pair.comparison === "table"
                  ? `the indexes, through its table ${tableLink(entry.table)}`
                  : `${compared[entry.pair.comparison]}, through its table ${tableLink(entry.table)}`;
            return [
              entryLink(entry),
              states[entry.pair.state],
              comparedText,
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
  const addressLink = (address) => {
    const [id, key] = address.split("#design.");
    const spec = specs.get(id);
    if (spec === undefined) return span(address);
    const line = specLines(
      readFileSync(join(base, spec.file), "utf8"),
    ).design.get(key);
    return line === undefined
      ? `[${span(address)}](${link(spec.file)})`
      : `[${span(address)}](${link(spec.file, line)})`;
  };
  if (strays.length > 0)
    write(
      "## Pairs without a member's declaration",
      "",
      `${plural(strays.length, "pair")} in ${span(inputs.pairs)} ${strays.length === 1 ? "names" : "name"} no pinned declaration of a member.`,
      "",
      ...table(
        ["Address", "Pair", "Compared", "Code", "Why"],
        strays.map((pair) => [
          addressLink(pair.address),
          states[pair.state],
          compared[pair.comparison],
          pair.code === null ? "none" : span(pair.code),
          pair.reason ?? "",
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
// The command. It takes the arguments after the script's path and the repository it reads, so a
// test runs it over a sample tree; it answers the exit status.

export async function main(args = process.argv.slice(2), base = root) {
  const { values } = parseArgs({
    args,
    options: {
      pack: { type: "string" },
      out: { type: "string" },
      check: { type: "boolean", default: false },
    },
  });
  if (values.pack === undefined || values.out === undefined)
    cannot("name the Pack and the page: --pack <packId> --out <page>");
  const out = resolve(values.out);
  const path = relative(base, out).split(sep).join("/");
  if (path.startsWith("..") || !path.endsWith(".md"))
    cannot(
      `the page must be a .md file inside the repository, not ${values.out}`,
    );
  const generated = await generate(values.pack, out, base);
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
