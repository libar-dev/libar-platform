// scripts/pinned.mjs, the emitter of a Pack's pinned module: its pure parts. A call signature with
// a default before a required parameter emits a required parameter whose type admits undefined,
// since TypeScript refuses a required parameter after an optional one (TS1016). A parameter or
// type parameter is in scope inside the node that declares it and nowhere else, a name resolves
// in its own space, so a value parameter hides no type, and a name a conditional type infers is
// in scope in its true branch only; so a name a declaration uses outside that scope is used, and
// the pin of another Spec is pulled in. Each emitted text is compiled with the TypeScript API.
import ts from "typescript";
import { expect, test } from "vitest";

type Row = { spec: string; key: string; declaration: string };
type Declaration = Row & {
  prefix: string;
  address: string;
  kind: "type" | "value" | "table" | "index" | null;
  name: string;
  text: string;
  why?: string;
};
type Pinned = {
  callSignature(span: string): { name: string; text: string } | null;
  declarationOf(row: Row): Declaration;
  namesUsedBy(declaration: Declaration): string[];
  pulledIn(
    own: Declaration[],
    pinnedBy: Map<string, Declaration[]>,
  ): { emitted: Declaration[]; gapUses: Map<string, string[]> };
};
// The emitter is a script with no declaration file, so it is loaded by URL and typed here.
const pinned = (await import(
  new URL("../../scripts/pinned.mjs", import.meta.url).href
)) as Pinned;

// The diagnostics of one module compiled alone under this repository's strictness, each as
// `TS<code>: <message>`. The library files are read once.
const options: ts.CompilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: [],
  skipLibCheck: true,
  noEmit: true,
};
const libraries = new Map<string, ts.SourceFile | undefined>();
function diagnostics(text: string): string[] {
  const fileName = "/pinned.ts";
  const host = ts.createCompilerHost(options, true);
  const { fileExists, readFile, getSourceFile } = host;
  host.fileExists = (path) => path === fileName || fileExists.call(host, path);
  host.readFile = (path) =>
    path === fileName ? text : readFile.call(host, path);
  host.getSourceFile = (path, language, onError) => {
    if (path === fileName)
      return ts.createSourceFile(path, text, language, true);
    if (!libraries.has(path))
      libraries.set(path, getSourceFile.call(host, path, language, onError));
    return libraries.get(path);
  };
  const program = ts.createProgram([fileName], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    );
}

test("a default before a required parameter stays required and admits undefined; a trailing default is optional", () => {
  const read = pinned.callSignature(
    "read(limit: number = 100, tenantId: string, after: string | null = null): number",
  );
  expect(read).toEqual({
    name: "read",
    text: "export declare function read(limit: number | undefined /* = 100 */, tenantId: string, after?: string | null /* = null */): number",
  });
  expect(diagnostics(read!.text)).toEqual([]);
  // The emission before the fix: TypeScript refuses it.
  expect(
    diagnostics(
      "export declare function read(limit?: number /* = 100 */, tenantId: string): number",
    ),
  ).toEqual([
    "TS1016: A required parameter cannot follow an optional parameter.",
  ]);
  // A function type is grouped before `| undefined`, which would otherwise bind inside it.
  const run = pinned.callSignature(
    "run(onDone: () => void = noop, name: string): void",
  );
  expect(run?.text).toBe(
    "export declare function run(onDone: (() => void) | undefined /* = noop */, name: string): void",
  );
  expect(diagnostics(run!.text)).toEqual([]);
});

const row = (
  key: string,
  declaration: string,
  spec = "spec:sample.handler",
): Row => ({ spec, key, declaration });
// Entry addresses are built, so that the check of entry addresses outside the Specs, which reads
// this file, finds no address of the sample corpus.
const at = (spec: string, key: string) => `${spec}#design.${key}`;

test("a parameter or type parameter is in scope inside the node that declares it and nowhere else", () => {
  const usedBy = (key: string, declaration: string) =>
    pinned.namesUsedBy(pinned.declarationOf(row(key, declaration)));
  // The method's own <Outcome> hides nothing outside the method.
  expect(
    usedBy(
      "typeHandler",
      "type Handler = { run<Outcome>(outcome: Outcome): Outcome; fallback: Outcome }",
    ),
  ).toEqual(["Outcome"]);
  // Every use is inside the node that declares the name.
  expect(
    usedBy(
      "typeLocal",
      "type Local = { run<Outcome>(outcome: Outcome, next: (outcome: Outcome) => Outcome): Outcome }",
    ),
  ).toEqual([]);
  expect(
    usedBy("fnHandle", "handle<Outcome>(outcome: Outcome): Promise<Outcome>"),
  ).toEqual(["Promise"]);
  expect(usedBy("typeKeys", "type Keys<T> = { [K in keyof T]: K }")).toEqual(
    [],
  );
  expect(
    usedBy(
      "typeUnwrap",
      "type Unwrap<T> = T extends Promise<infer U> ? U : Outcome",
    ),
  ).toEqual(["Promise", "Outcome"]);
  // A name a conditional type infers is in scope in its true branch and nowhere else.
  expect(
    usedBy(
      "typeUnwrapOutcome",
      "type Unwrap<T> = T extends Promise<infer Outcome> ? Outcome : Outcome",
    ),
  ).toEqual(["Promise", "Outcome"]);
  // A value parameter hides no type of its name, and a type parameter hides no value.
  expect(usedBy("fnRun", "run(Outcome: Outcome): Outcome")).toEqual([
    "Outcome",
  ]);
  expect(
    usedBy(
      "typeChecked",
      "type Checked = { check(outcomeValidator: unknown): typeof outcomeValidator }",
    ),
  ).toEqual([]);
  expect(
    usedBy(
      "typeOf",
      "type Of<outcomeValidator> = outcomeValidator | typeof outcomeValidator",
    ),
  ).toEqual(["outcomeValidator"]);
  expect(
    usedBy(
      "validatorOutcome",
      "const outcomeValidator = v.union(outcomeKindValidator, v.null())",
    ),
  ).toEqual(["v", "outcomeKindValidator"]);
});

test("an outer dependency pinned by another Spec is pulled in, and the module compiles", () => {
  const handler = pinned.declarationOf(
    row(
      "typeHandler",
      "type Handler = { run<Outcome>(outcome: Outcome): Outcome; fallback: Outcome }",
    ),
  );
  const local = pinned.declarationOf(
    row(
      "typeLocal",
      "type Local = { run<Outcome>(outcome: Outcome): Outcome }",
    ),
  );
  const outcome = pinned.declarationOf(
    row(
      "typeOutcome",
      'type Outcome = { kind: "committed" | "rejected" }',
      "spec:sample.outcome",
    ),
  );
  const pinnedBy = new Map(
    [handler, local, outcome].map((pin) => [pin.name, [pin]]),
  );
  const { emitted, gapUses } = pinned.pulledIn([handler], pinnedBy);
  const handlerAt = at("spec:sample.handler", "typeHandler");
  expect(emitted.map(({ address, why }) => ({ address, why }))).toEqual([
    { address: handlerAt, why: undefined },
    {
      address: at("spec:sample.outcome", "typeOutcome"),
      why: `${handlerAt} uses Outcome`,
    },
  ]);
  expect(gapUses.size).toBe(0);
  expect(diagnostics(emitted.map((pin) => pin.text).join("\n"))).toEqual([]);
  // Without the pull-in the module names a type it never declares.
  expect(diagnostics(handler.text)).toEqual([
    "TS2304: Cannot find name 'Outcome'.",
  ]);
  // A nested type parameter that covers every use pulls nothing in.
  expect(pinned.pulledIn([local], pinnedBy).emitted).toEqual([local]);
  expect(diagnostics(local.text)).toEqual([]);
});

test("an inferred name and a value parameter hide no outer type, and the module compiles", () => {
  const outcome = () =>
    pinned.declarationOf(
      row(
        "typeOutcome",
        'type Outcome = { kind: "committed" | "rejected" }',
        "spec:sample.outcome",
      ),
    );
  const valueAsType =
    "TS2749: 'Outcome' refers to a value, but is being used as a type here. Did you mean 'typeof Outcome'?";
  const cases: [Row, string[]][] = [
    [
      row(
        "typeUnwrap",
        "type Unwrap<T> = T extends Promise<infer Outcome> ? Outcome : Outcome",
      ),
      ["TS2304: Cannot find name 'Outcome'."],
    ],
    [
      row("fnRun", "run(Outcome: Outcome): Outcome"),
      [valueAsType, valueAsType],
    ],
  ];
  for (const [sample, alone] of cases) {
    const own = pinned.declarationOf(sample);
    const pin = outcome();
    const { emitted } = pinned.pulledIn(
      [own],
      new Map([
        [own.name, [own]],
        [pin.name, [pin]],
      ]),
    );
    expect(emitted.map(({ address, why }) => ({ address, why }))).toEqual([
      { address: own.address, why: undefined },
      {
        address: at("spec:sample.outcome", "typeOutcome"),
        why: `${own.address} uses Outcome`,
      },
    ]);
    expect(diagnostics(emitted.map((pin) => pin.text).join("\n"))).toEqual([]);
    // Alone, the module names a type it never declares, or uses a value where a type is needed.
    expect(diagnostics(own.text)).toEqual(alone);
  }
});
