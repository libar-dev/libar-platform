// Emits the pinned module of one scope of Specs, a TypeScript module the type tests import:
// `node scripts/pinned.mjs --pack <packId>` or `node scripts/pinned.mjs --specs <id,id,...> --name <name>`
// writes generated/pinned/<name>.ts, where a Pack's name is its id without `pack:`. It reads the body
// of recipe 24, "Pinned declarations", from the pinned Protocol's recipes.md and runs it with the
// pinned CLI, so the list of declarations is the Protocol's own. spec:extraction.contract-declarations
// rules what the module is: a projection, regenerated and never edited, which earns its place when a
// changed pinned signature fails the typecheck against the implementation.
//
// Which entries become declarations is this project's policy, by the prefix of the entry's key:
// - `type*` whose span opens with `type ` or `interface `: `export ` and the span.
// - `validator*` whose span opens with `const `: `export ` and the span.
// - `fn*` whose span is a call signature `name<...>(...): R`: `export declare function ` and the span,
//   where a parameter's default value, which a declaration cannot carry, makes the parameter optional.
// - `table*` whose span is `name: defineTable(...)`: one member of `export const tables = { ... }`.
// Every other entry is skipped and counted by its prefix. The module holds the scope's own entries
// and, marked, every entry of another Spec that pins a name they use, and so on until nothing is
// missing. A name pinned twice is never merged: the second pin is compiled beside the first and held
// identical to it. The summary goes to stderr.
// Exit 0: written. 1: written, but a name a declaration uses is declared nowhere, which the summary
// names. 2: it cannot run.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
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

// The preamble. Convex's own names are imported; a name Convex or a composition's generated code
// provides gets a placeholder over Convex's generic types.
const imports = [
  "import {",
  "  defineTable,",
  "  paginationOptsValidator,",
  "  paginationResultValidator,",
  "  type FunctionReference,",
  "  type GenericDataModel,",
  "  type GenericDatabaseReader,",
  "  type GenericDatabaseWriter,",
  "  type GenericDocument,",
  "  type GenericMutationCtx,",
  "  type GenericQueryCtx,",
  "  type PaginationOptions,",
  "  type PaginationResult,",
  "  type RegisteredMutation,",
  "  type RegisteredQuery,",
  '} from "convex/server";',
  "import {",
  "  v,",
  "  type GenericId,",
  "  type PropertyValidators,",
  "  type Validator,",
  "  type Value,",
  '} from "convex/values";',
];
const importedNames = [
  ...imports.join("\n").matchAll(/^ {2}(?:type )?([A-Za-z]\w*),$/gm),
].map(([, name]) => name);
const placeholders = {
  MutationCtx: [
    "type MutationCtx = GenericMutationCtx<GenericDataModel>;",
    "A composition's _generated/server.js, over its own data model.",
  ],
  QueryCtx: [
    "type QueryCtx = GenericQueryCtx<GenericDataModel>;",
    "A composition's _generated/server.js, over its own data model.",
  ],
  Id: [
    "type Id<TableName extends string> = GenericId<TableName>;",
    "A composition's _generated/dataModel.js.",
  ],
  Doc: [
    "type Doc<TableName extends string> = GenericDocument & { _id: Id<TableName>; _creationTime: number };",
    "A composition's _generated/dataModel.js, over its own tables.",
  ],
};

// Names the design uses that no Spec pins and Convex does not provide: each is a design gap. Where
// the implementation exports the name, its declaration stands in, so that a pin using the name can
// still be compared with the code; the module emits the gaps its own declarations use.
const gaps = {
  ReadModelDataModel: [
    'type ReadModelDataModel = import("../../src/read-model/index.js").ReadModelDataModel;',
    "src/read-model/tables.ts",
  ],
  RowDataModel: [
    'type RowDataModel = import("../../src/read-model/index.js").RowDataModel;',
    "src/read-model/tables.ts",
  ],
  GateDataModel: [
    'type GateDataModel = import("../../src/gate/index.js").GateDataModel;',
    "src/gate/tables.ts",
  ],
  ListArgs: [
    'type ListArgs = import("../../src/context/index.js").ListArgs;',
    "src/context/queries.ts",
  ],
  AppendResult: [
    'type AppendResult = import("../../src/context/index.js").AppendResult;',
    "src/context/journal.ts",
  ],
  BatchRef: [
    'type BatchRef = import("../../src/read-model/index.js").BatchRef;',
    "src/read-model/rebuild.ts",
  ],
  FillBatchRef: [
    'type FillBatchRef = import("../../src/read-model/index.js").FillBatchRef;',
    "src/read-model/rebuild.ts",
  ],
  SubjectRef: [
    'type SubjectRef = import("../../src/command/index.js").SubjectRef;',
    "src/command/actor-and-scope.ts",
  ],
  DiagnosticSink: [
    'type DiagnosticSink = import("../../src/operations/index.js").DiagnosticSink;',
    "src/operations/diagnostic.ts",
  ],
  FailedCall: [
    'type FailedCall = import("../../src/command/index.js").FailedCall;',
    "src/command/pipeline.ts",
  ],
  HistoryEvent: [
    'type HistoryEvent = import("../../example/domain/orderAllocationHistory.js").HistoryEvent;',
    "example/domain/orderAllocationHistory.ts",
  ],
  OrderAllocation: [
    'type OrderAllocation = import("../../example/domain/orderAllocationHistory.js").OrderAllocation;',
    "example/domain/orderAllocationHistory.ts",
  ],
  outcomeKindValidator: [
    'declare const outcomeKindValidator: typeof import("../../src/command/index.js").outcomeKindValidator;',
    "src/command/pipeline.ts",
  ],
  actorValidator: [
    'declare const actorValidator: typeof import("../../src/command/index.js").actorValidator;',
    "src/command/actor-and-scope.ts",
  ],
  WriteBaselineArgs: [
    "type WriteBaselineArgs = Record<string, unknown>;",
    null,
  ],
  WriteBaselineResult: ["type WriteBaselineResult = unknown;", null],
};

// The names of TypeScript's own library a declaration may use.
const globals = new Set([
  "Array",
  "Awaited",
  "Date",
  "Error",
  "Exclude",
  "Extract",
  "NonNullable",
  "Omit",
  "Parameters",
  "Partial",
  "Pick",
  "Promise",
  "Readonly",
  "ReadonlyArray",
  "ReadonlyMap",
  "ReadonlySet",
  "Record",
  "Required",
  "ReturnType",
  "Set",
  "crypto",
  "undefined",
]);

function parseArguments(argv) {
  const options = {};
  for (let at = 0; at < argv.length; at += 2) {
    const [flag, value] = [argv[at], argv[at + 1]];
    if (!["--pack", "--specs", "--name"].includes(flag))
      cannot(`unknown argument ${flag}`);
    if (value === undefined || value.startsWith("--"))
      cannot(`${flag} takes a value`);
    options[flag.slice(2)] = value;
  }
  if ((options.pack === undefined) === (options.specs === undefined))
    cannot("name one scope: --pack <packId> or --specs <id,id,...>");
  if (options.specs !== undefined && options.name === undefined)
    cannot("--specs needs --name <name> for the module's file");
  const name = options.name ?? options.pack.replace(/^pack:/, "");
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name))
    cannot(`${name} is not a module name`);
  return { ...options, name };
}

function query(body) {
  try {
    const out = execFileSync(
      process.execPath,
      [join(protocol, "dist/cli/sdp.js"), "q", body, "--root", root, "--json"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 1 << 27,
        stdio: ["ignore", "pipe", "inherit"],
      },
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
  const heading = /^## 24\. .*$/m.exec(recipes);
  if (heading === null) cannot("recipes.md has no heading 24");
  const section = recipes
    .slice(heading.index + heading[0].length)
    .split(/^## /m)[0];
  const fence = /^```js\n([\s\S]*?)^```$/m.exec(section);
  if (fence === null) cannot("recipe 24 has no js fence");
  return fence[1];
}

function scopeOf(options) {
  if (options.pack !== undefined) {
    const members = query(
      `const context = g.packContext(${JSON.stringify(options.pack)});\nreturn context === undefined ? null : context.members.map((member) => member.id);`,
    );
    if (members === null) cannot(`the graph has no ${options.pack}`);
    return members;
  }
  const specs = options.specs.split(",").filter((id) => id !== "");
  const unknown = query(
    `const known = new Set(g.specs().map((spec) => spec.id));\nreturn ${JSON.stringify(specs)}.filter((id) => !known.has(id));`,
  );
  if (unknown.length > 0) cannot(`the graph has no ${unknown.join(", ")}`);
  return specs;
}

const parse = (text) =>
  ts.createSourceFile("pin.ts", text, ts.ScriptTarget.Latest, true);
// The parser's own diagnostics: a span that does not parse alone is no call signature.
const parsedCleanly = (file) => {
  if (!Array.isArray(file.parseDiagnostics))
    cannot("this TypeScript parser keeps no parseDiagnostics");
  return file.parseDiagnostics.length === 0;
};

// A call signature: one bodiless function declaration with a return type. A default value becomes
// an optional parameter, with the value kept in a comment.
function callSignature(span) {
  if (!/^[A-Za-z_$][\w$]*\s*[<(]/.test(span)) return null;
  const prefix = "export declare function ";
  const file = parse(`${prefix}${span};`);
  const [statement] = file.statements;
  if (
    !parsedCleanly(file) ||
    file.statements.length !== 1 ||
    !ts.isFunctionDeclaration(statement) ||
    statement.body !== undefined ||
    statement.type === undefined
  )
    return null;
  let text = file.text;
  const defaults = statement.parameters
    .filter((parameter) => parameter.initializer !== undefined)
    .reverse();
  for (const parameter of defaults) {
    const value = parameter.initializer.getText(file);
    const end = parameter.initializer.getEnd();
    const typeEnd = (parameter.type ?? parameter.name).getEnd();
    const nameEnd = parameter.name.getEnd();
    text = `${text.slice(0, typeEnd)} /* = ${value} */${text.slice(end)}`;
    text = `${text.slice(0, nameEnd)}?${text.slice(nameEnd)}`;
  }
  return { name: statement.name.text, text: text.replace(/;$/, "") };
}

// What one entry declares, or null when the policy skips it.
function declarationOf(row) {
  const prefix = /^[a-z]+/.exec(row.key)?.[0] ?? row.key;
  const span = row.declaration.trim();
  const base = { ...row, prefix, address: `${row.spec}#design.${row.key}` };
  if (prefix === "type") {
    const named = /^(?:type|interface)\s+([A-Za-z_$][\w$]*)/.exec(span);
    if (named !== null)
      return { ...base, kind: "type", name: named[1], text: `export ${span}` };
  }
  if (prefix === "validator") {
    const named = /^const\s+([A-Za-z_$][\w$]*)/.exec(span);
    if (named !== null)
      return { ...base, kind: "value", name: named[1], text: `export ${span}` };
  }
  if (prefix === "fn") {
    const signature = callSignature(span);
    if (signature !== null) return { ...base, kind: "function", ...signature };
  }
  if (prefix === "table") {
    const named = /^([A-Za-z_$][\w$]*):\s*defineTable\(/.exec(span);
    if (named !== null)
      return { ...base, kind: "table", name: named[1], text: span };
  }
  return { ...base, kind: null };
}

// An identifier refers to a declaration unless it names a property, a member or what it declares.
function refersToADeclaration(node) {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  if (ts.isPropertyAccessExpression(parent)) return parent.expression === node;
  if (ts.isQualifiedName(parent)) return parent.left === node;
  return parent.name !== node && parent.propertyName !== node;
}

// The names a declaration uses, less its own name and those of its parameters and type parameters.
function namesUsedBy(declaration) {
  const text =
    declaration.kind === "table"
      ? `const tables = { ${declaration.text} };`
      : declaration.text;
  const own = new Set();
  const used = new Set();
  const visit = (node) => {
    if (
      (ts.isTypeParameterDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name)
    )
      own.add(node.name.text);
    if (ts.isIdentifier(node) && refersToADeclaration(node))
      used.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parse(text));
  for (const name of own) used.delete(name);
  used.delete(declaration.name);
  return used;
}

function emit(options) {
  const scope = scopeOf(options);
  const { totals, rows } = query(recipe24());
  const all = rows.map(declarationOf);
  const pinnedBy = new Map();
  for (const declaration of all) {
    if (declaration.kind === null || declaration.kind === "table") continue;
    pinnedBy.set(declaration.name, [
      ...(pinnedBy.get(declaration.name) ?? []),
      declaration,
    ]);
  }
  for (const name of [...Object.keys(gaps), ...Object.keys(placeholders)]) {
    const pins = pinnedBy.get(name);
    if (pins !== undefined)
      cannot(
        `the preamble declares ${name}, which ${pins.map((pin) => pin.address).join(" and ")} pins: take it out of the preamble`,
      );
  }
  const inScope = new Set(scope);
  const own = all.filter((row) => inScope.has(row.spec));
  const emitted = own.filter((row) => row.kind !== null);
  const skipped = own.filter((row) => row.kind === null);

  // The closure: a name an emitted declaration uses is declared by the module, pinned by another
  // Spec, which is then pulled in, or provided by the preamble or TypeScript.
  const declared = new Set(emitted.map((row) => row.name));
  const pulled = [];
  const gapUses = new Map();
  const missing = new Map();
  const queue = [...emitted];
  while (queue.length > 0) {
    const declaration = queue.shift();
    for (const name of namesUsedBy(declaration)) {
      if (declared.has(name)) continue;
      if (pinnedBy.has(name)) {
        declared.add(name);
        for (const pin of pinnedBy.get(name)) {
          pulled.push({ ...pin, pulledFor: declaration.address });
          queue.push(pin);
        }
      } else if (name in gaps) {
        gapUses.set(name, [...(gapUses.get(name) ?? []), declaration.address]);
      } else if (
        !(name in placeholders) &&
        !importedNames.includes(name) &&
        !globals.has(name)
      ) {
        missing.set(name, [...(missing.get(name) ?? []), declaration.address]);
      }
    }
  }

  const everything = [...emitted, ...pulled];
  const comment = (declaration) =>
    declaration.pulledFor === undefined
      ? `// ${declaration.address}`
      : `// ${declaration.address} (pulled in: ${declaration.pulledFor} uses ${declaration.name})`;

  // A name pinned twice: the first pin declares it, each later one is compiled apart and held
  // identical to the first.
  const firstPin = new Map();
  const twice = [];
  for (const declaration of everything) {
    if (declaration.kind === "table") continue;
    if (!firstPin.has(declaration.name))
      firstPin.set(declaration.name, declaration);
    else twice.push(declaration);
  }
  const pinnedAgain = (declaration, index) => {
    const first = firstPin.get(declaration.name);
    const label = `PinnedAgain${index + 1}`;
    const body =
      declaration.kind === "value"
        ? `const ${label} = (() => {\n  ${declaration.text.replace(/^export /, "")};\n  return ${declaration.name};\n})();`
        : `declare namespace ${label} {\n  ${declaration.text.replace(/^export (declare )?/, "export ")}${declaration.kind === "function" ? ";" : ""}\n}`;
    const second =
      declaration.kind === "value"
        ? `typeof ${label}`
        : declaration.kind === "function"
          ? `typeof ${label}.${declaration.name}`
          : `${label}.${declaration.name}`;
    const firstType =
      declaration.kind === "type"
        ? declaration.name
        : `typeof ${declaration.name}`;
    return [
      `${comment(declaration)}`,
      `// ${declaration.name} is pinned again here, and first at ${first.address}.`,
      body,
      `type ${label}HoldsTheFirstPin = Holds<Same<${firstType}, ${second}>>;`,
    ];
  };

  // Values are declared after the values they use.
  const values = [];
  const placed = new Set();
  const valueNames = new Set(
    everything
      .filter((row) => row.kind === "value" && !twice.includes(row))
      .map((row) => row.name),
  );
  const place = (declaration, path) => {
    if (placed.has(declaration) || path.has(declaration)) return;
    path.add(declaration);
    for (const name of namesUsedBy(declaration))
      if (valueNames.has(name)) place(firstPin.get(name), path);
    placed.add(declaration);
    values.push(declaration);
  };
  for (const declaration of everything)
    if (declaration.kind === "value" && !twice.includes(declaration))
      place(declaration, new Set());

  // A gap's name may open an entry the policy skips, such as an assignment without const.
  const skippedPinOf = (name) =>
    all
      .filter(
        (row) =>
          row.kind === null &&
          new RegExp(`^(?:export\\s+)?(?:const\\s+)?${name}\\s*=`).test(
            row.declaration.trim(),
          ),
      )
      .map((row) => row.address);
  const lines = [
    `// The pinned declarations of ${options.pack ?? `${scope.length} Specs`}, emitted by scripts/pinned.mjs from recipe 24 of`,
    "// the pinned Protocol. Never edit it: change the Spec, then run `npm run sdp:build`. Each",
    "// declaration follows the address of its Design entry.",
    ...(options.pack === undefined ? scope.map((id) => `// - ${id}`) : []),
    ...imports,
    "",
    "// Provided by Convex or by a composition's generated code.",
    ...Object.values(placeholders).map(
      ([declaration, source]) => `${declaration} // ${source}`,
    ),
    "",
    "// Used by the design and pinned by no Spec: each is a design gap. Where the implementation",
    "// exports the name, its declaration stands in.",
    ...[...gapUses.keys()].sort().flatMap((name) => {
      const [declaration, source] = gaps[name];
      const skippedPin = skippedPinOf(name);
      return [
        `// ${name}: used by ${[...new Set(gapUses.get(name))].join(", ")}.`,
        ...(skippedPin.length === 0
          ? []
          : [
              `// Opens ${skippedPin.join(", ")}, as an assignment and not a declaration.`,
            ]),
        source === null
          ? "// Nothing in the code stands in."
          : `// From ${source}.`,
        declaration,
      ];
    }),
    "",
    "type Same<A, B> =",
    "  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2",
    "    ? true",
    "    : false;",
    "type Holds<Check extends true> = Check;",
  ];
  const section = (title, declarations) => {
    if (declarations.length === 0) return;
    lines.push("", `// ${title}`);
    for (const declaration of declarations)
      lines.push(comment(declaration), declaration.text);
  };
  section(
    "Types and functions.",
    everything.filter(
      (row) =>
        (row.kind === "type" || row.kind === "function") &&
        !twice.includes(row),
    ),
  );
  section("Validators.", values);
  const tables = everything.filter((row) => row.kind === "table");
  if (tables.length > 0) {
    lines.push("", "// Tables.", "export const tables = {");
    for (const table of tables)
      lines.push(`  ${comment(table)}`, `  ${table.text},`);
    lines.push("};");
  }
  if (twice.length > 0) {
    lines.push("", "// Names pinned more than once.");
    twice.forEach((declaration, index) =>
      lines.push(...pinnedAgain(declaration, index)),
    );
  }

  const file = join(root, "generated/pinned", `${options.name}.ts`);
  mkdirSync(join(root, "generated/pinned"), { recursive: true });
  writeFileSync(file, `${lines.join("\n")}\n`);

  const byPrefix = (list) => {
    const counts = new Map();
    for (const row of list)
      counts.set(row.prefix, (counts.get(row.prefix) ?? 0) + 1);
    return [...counts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([prefix, count]) => `${prefix} ${count}`)
      .join(", ");
  };
  const notes = [
    ...[...missing].map(
      ([name, uses]) =>
        `${name}, used by ${[...new Set(uses)].join(", ")}, is declared nowhere`,
    ),
    ...twice.map(
      (declaration) =>
        `${declaration.name} is pinned at ${firstPin.get(declaration.name).address} and at ${declaration.address}`,
    ),
  ];
  console.error(
    `pinned: ${relative(root, file)} · ${scope.length} Specs in scope; recipe 24 lists ${totals.entries} entries in ${totals.specs} Specs · emitted ${emitted.length} (${byPrefix(emitted)}) and ${pulled.length} pulled in · skipped ${skipped.length} (${byPrefix(skipped)}) · ${gapUses.size} names pinned by no Spec · ${twice.length} pinned twice`,
  );
  for (const note of notes) console.error(`pinned: ${note}`);
  return missing.size === 0 ? 0 : 1;
}

process.exit(emit(parseArguments(process.argv.slice(2))));
