// Emits the pinned module of one Pack, which the type tests import:
// `node scripts/pinned.mjs --pack <packId> [--name <name>]` writes generated/pinned/<name>.ts, by
// default the Pack's id without `pack:`. It runs the body of recipe 24, "Pinned declarations", read
// from the pinned Protocol's recipes.md, with the pinned CLI. spec:extraction.contract-declarations
// rules the module: a projection, regenerated and never edited, which earns its place when a
// changed pin fails the typecheck against the code.
//
// This project's policy, by the prefix of the entry's key: `type*` opening with `type ` or
// `interface ` and `validator*` opening with `const ` are exported as written; `fn*` that is a call
// signature `name<...>(...): R` becomes `export declare function`, where a default value makes its
// parameter optional; `table*` of the form `name: defineTable(...)` is a member of
// `export const tables`, and each `index*` of the form `.index(...)` is chained onto the table
// entry its Spec wrote last before it. Every other entry is skipped and counted by its prefix on
// stderr. Each pin of another Spec that a declaration uses is pulled in, marked. A name pinned in two
// entries, in any form, is refused, as is a preamble name a Spec pins.
// Exit 0: written. 2: it cannot emit.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import ts from "typescript";

const root = join(import.meta.dirname, "..");
const protocol = join(
  root,
  "node_modules/@libar-dev/software-delivery-protocol",
);
function cannot(reason) {
  console.error(`pinned: cannot emit · ${reason}`);
  process.exit(2);
}

const preamble = `import {
  defineTable,
  type FunctionReference,
  type GenericDataModel,
  type GenericDatabaseReader,
  type GenericDatabaseWriter,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type PaginationOptions,
  type PaginationResult,
  type RegisteredMutation,
  type RegisteredQuery,
} from "convex/server";
import { v, type GenericId, type Validator, type Value } from "convex/values";

// Provided by Convex or by a composition's generated code.
type MutationCtx = GenericMutationCtx<GenericDataModel>; // _generated/server.js, over the composition's data model.
type QueryCtx = GenericQueryCtx<GenericDataModel>; // _generated/server.js, over the composition's data model.
type Id<TableName extends string> = GenericId<TableName>; // _generated/dataModel.js.`;

// Names the design uses that no Spec pins as a declaration: the code's module that declares each,
// or the type that stands in when the code declares none.
const gaps = {
  AppendResult: "src/context",
  BatchRef: "src/read-model",
  DiagnosticSink: "src/operations",
  FailedCall: "src/command",
  FillBatchRef: "src/read-model",
  GateDataModel: "src/gate",
  ListArgs: "src/context",
  ReadModelDataModel: "src/read-model",
  RowDataModel: "src/read-model",
  SubjectRef: "src/command",
  WriteBaselineArgs: "Record<string, unknown>",
  WriteBaselineResult: "unknown",
  outcomeKindValidator: "src/command",
};
function gapDeclaration(name) {
  const source = gaps[name];
  const code = `import("../../${source}/index.js").${name}`;
  if (!source.startsWith("src/"))
    return `type ${name} = ${source}; // nothing in the code stands in.`;
  return /^[a-z]/.test(name)
    ? `declare const ${name}: typeof ${code};`
    : `type ${name} = ${code};`;
}

function query(body) {
  const sdp = join(protocol, "dist/cli/sdp.js");
  try {
    const out = execFileSync(
      process.execPath,
      [sdp, "q", body, "--root", root, "--json"],
      { cwd: root, encoding: "utf8", maxBuffer: 1 << 27 },
    );
    return JSON.parse(out);
  } catch (error) {
    cannot(`the query failed: ${error.message.split("\n")[0]}`);
  }
}

// The body of recipe 24 as the Protocol ships it: the first js fence under its heading.
function recipe24() {
  const recipes = readFileSync(
    join(protocol, "docs/agent-surface/recipes.md"),
    "utf8",
  );
  const section = recipes.split(/^## /m).find((part) => /^24\. /.test(part));
  const fence = /^```js\n([\s\S]*?)^```$/m.exec(section ?? "");
  if (fence === null) cannot("recipes.md has no recipe 24 with a js fence");
  return fence[1];
}

const parse = (text) =>
  ts.createSourceFile("pin.ts", text, ts.ScriptTarget.Latest, true);

// A call signature parses alone as one bodiless function declaration with a return type.
function callSignature(span) {
  if (!/^[\w$]+\s*[<(]/.test(span)) return null;
  const file = parse(`export declare function ${span}`);
  const [statement] = file.statements;
  if (
    file.parseDiagnostics.length > 0 ||
    file.statements.length !== 1 ||
    !ts.isFunctionDeclaration(statement) ||
    statement.body !== undefined ||
    statement.type === undefined
  )
    return null;
  let text = file.text;
  for (const { name, type, initializer } of [...statement.parameters].reverse())
    if (initializer !== undefined)
      text = `${text.slice(0, name.end)}?${text.slice(name.end, (type ?? name).end)} /* = ${initializer.getText(file)} */${text.slice(initializer.end)}`;
  return { name: statement.name.text, text };
}

// What one entry declares under the policy, or kind null.
const exported = {
  type: [/^(?:type|interface)\s+([\w$]+)/, "type"],
  validator: [/^const\s+([\w$]+)/, "value"],
};
function declarationOf(row) {
  const prefix = /^[a-z]+/.exec(row.key)[0];
  const span = row.declaration.trim();
  const base = { ...row, prefix, address: `${row.spec}#design.${row.key}` };
  const named = exported[prefix]?.[0].exec(span)?.[1];
  if (named !== undefined)
    return {
      ...base,
      kind: exported[prefix][1],
      name: named,
      text: `export ${span}`,
    };
  const signature = prefix === "fn" ? callSignature(span) : null;
  if (signature !== null) return { ...base, kind: "type", ...signature };
  if (prefix === "table" && /^[\w$]+:\s*defineTable\(/.test(span))
    return { ...base, kind: "table", name: "", text: span, indexes: [] };
  if (prefix === "index" && /^\.index\(/.test(span))
    return { ...base, kind: "index", name: "", text: span };
  return { ...base, kind: null };
}

// The names a declaration uses: identifiers that are not a property, a member, what is declared, or
// one of its parameters or type parameters.
function namesUsedBy(declaration) {
  const own = new Set([declaration.name]);
  const used = new Set();
  const visit = (node) => {
    const parent = node.parent;
    if (
      (ts.isTypeParameterDeclaration(node) || ts.isParameter(node)) &&
      ts.isIdentifier(node.name)
    )
      own.add(node.name.text);
    else if (
      ts.isIdentifier(node) &&
      (ts.isShorthandPropertyAssignment(parent) ||
        (ts.isPropertyAccessExpression(parent)
          ? parent.expression === node
          : ts.isQualifiedName(parent)
            ? parent.left === node
            : parent.name !== node))
    )
      used.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(
    parse(
      declaration.kind === "table"
        ? `const tables = { ${declaration.text} };`
        : declaration.text,
    ),
  );
  return [...used].filter((name) => !own.has(name));
}

const { values: options } = parseArgs({
  options: { pack: { type: "string" }, name: { type: "string" } },
});
if (options.pack === undefined) cannot("name the Pack: --pack <packId>");
const name = options.name ?? options.pack.replace(/^pack:/, "");
const scope = query(
  `return g.packContext(${JSON.stringify(options.pack)})?.members.map((member) => member.id) ?? null;`,
);
if (scope === null) cannot(`the graph has no ${options.pack}`);

const all = query(recipe24()).rows.map(declarationOf);
let table;
for (const row of all)
  if (row.kind === "table") table = row;
  else if (row.kind === "index" && table?.spec === row.spec)
    table.indexes.push(row);
  else if (row.kind === "index") row.kind = null;
const pinnedBy = Map.groupBy(
  all.filter((row) => row.kind === "type" || row.kind === "value"),
  (row) => row.name,
);
const addresses = (pins) => pins.map((pin) => pin.address).join(" and ");
for (const [twice, pins] of pinnedBy)
  if (pins.length > 1)
    cannot(`${twice} is pinned in two entries, ${addresses(pins)}`);
for (const provided of ["MutationCtx", "QueryCtx", "Id", ...Object.keys(gaps)])
  if (pinnedBy.has(provided))
    cannot(
      `the preamble declares ${provided}, which ${addresses(pinnedBy.get(provided))} pins: take it out of the preamble`,
    );

// The scope's own entries, then the pin of each name they use that another Spec pins.
const own = all.filter((row) => scope.includes(row.spec));
const emitted = own.filter((row) => row.kind !== null && row.kind !== "index");
const gapUses = new Map();
for (let at = 0; at < emitted.length; at++) {
  const { address } = emitted[at];
  for (const used of namesUsedBy(emitted[at])) {
    if (used in gaps)
      gapUses.set(used, [...(gapUses.get(used) ?? []), address]);
    const [pin] = pinnedBy.get(used) ?? [];
    if (pin !== undefined && !emitted.includes(pin))
      emitted.push(Object.assign(pin, { why: `${address} uses ${used}` }));
  }
}

// A value is declared after the values it uses.
const values = [];
const place = (declaration, path = new Set()) => {
  if (values.includes(declaration) || path.has(declaration)) return;
  path.add(declaration);
  for (const used of namesUsedBy(declaration))
    for (const pin of pinnedBy.get(used) ?? [])
      if (pin.kind === "value") place(pin, path);
  values.push(declaration);
};
emitted.filter((row) => row.kind === "value").forEach((row) => place(row));

const comment = (row) =>
  `// ${row.address}${row.why === undefined ? "" : ` (pulled in: ${row.why})`}`;
const block = (rows) => rows.flatMap((row) => [comment(row), row.text]);
const member = (table) =>
  [...block([table]), ...block(table.indexes).map((line) => `  ${line}`)].map(
    (line, at, lines) => `  ${line}${at === lines.length - 1 ? "," : ""}`,
  );
const lines = [
  `// The pinned declarations of ${options.pack}, emitted by scripts/pinned.mjs from recipe 24 of the`,
  "// pinned Protocol. Never edit it: change the Spec, then run `npm run sdp:build`. Each declaration",
  "// follows the address of its Design entry.",
  preamble,
  "",
  "// Used by the design and pinned by no Spec. Where the code declares one, its declaration stands in.",
  ...[...gapUses.keys()].sort().flatMap((gap) => {
    const skippedPin = all.find(
      (row) => row.kind === null && row.declaration.startsWith(`${gap} =`),
    );
    return [
      `// ${gap}: used by ${[...new Set(gapUses.get(gap))].join(", ")}.${skippedPin === undefined ? "" : ` ${skippedPin.address} opens with it, without const.`}`,
      gapDeclaration(gap),
    ];
  }),
  "",
  ...block(emitted.filter((row) => row.kind === "type")),
  ...block(values),
  "export const tables = {",
  ...emitted.filter((row) => row.kind === "table").flatMap(member),
  "};",
];
mkdirSync(join(root, "generated/pinned"), { recursive: true });
writeFileSync(
  join(root, "generated/pinned", `${name}.ts`),
  `${lines.join("\n")}\n`,
);

const counted = (rows) =>
  [...Map.groupBy(rows, (row) => row.prefix)]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([prefix, group]) => `${prefix} ${group.length}`)
    .join(", ");
const ownEmitted = own.filter((row) => row.kind !== null);
const skipped = own.filter((row) => row.kind === null);
console.error(
  `pinned: generated/pinned/${name}.ts · ${scope.length} Specs · emitted ${ownEmitted.length} (${counted(ownEmitted)}) and ${emitted.length - emitted.filter((row) => row.why === undefined).length} pulled in · skipped ${skipped.length} (${counted(skipped)}) · ${gapUses.size} names pinned by no Spec`,
);
