import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const testFile = "tests/types/pinned.test-d.ts";
const source = ts.createSourceFile(
  testFile,
  readFileSync(process.env.PINNED_TEST_FILE ?? resolve(root, testFile), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const titles = new Map([
  ["bound:", "bound"],
  ["ahead:", "ahead"],
  ["not compared:", "notCompared"],
]);

type Pair = {
  address: string;
  state: string;
  comparison: string;
  code: string | null;
  reason: string | null;
};

const imports = new Map<string, string>();
for (const statement of source.statements) {
  if (
    !ts.isImportDeclaration(statement) ||
    !ts.isStringLiteral(statement.moduleSpecifier)
  )
    continue;
  const clause = statement.importClause;
  const bindings = clause?.namedBindings;
  const alias =
    clause?.name?.text ??
    (bindings && ts.isNamespaceImport(bindings)
      ? bindings.name.text
      : undefined);
  if (alias && alias !== "pinned")
    imports.set(
      alias,
      resolve(root, dirname(testFile), statement.moduleSpecifier.text)
        .slice(root.length + 1)
        .replace(/\.js$/, ".ts"),
    );
}

function readTests(): Pair[] {
  const pairs: Pair[] = [];
  const found = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isCallExpression(statement.expression) ||
      statement.expression.expression.getText(source) !== "describe"
    )
      continue;
    const [title, callback] = statement.expression.arguments;
    if (!title || !ts.isStringLiteral(title)) continue;
    const match = [...titles].find(([prefix]) => title.text.startsWith(prefix));
    if (!match) throw new Error(`Unknown pinned pair block: ${title.text}`);
    const [prefix, state] = match;
    if (found.has(prefix))
      throw new Error(`Duplicate pinned pair block: ${prefix}`);
    found.add(prefix);
    if (
      !callback ||
      !ts.isArrowFunction(callback) ||
      !ts.isBlock(callback.body)
    )
      throw new Error(`No test block: ${title.text}`);
    for (const entry of callback.body.statements) {
      if (
        !ts.isExpressionStatement(entry) ||
        !ts.isCallExpression(entry.expression)
      )
        continue;
      const call = entry.expression;
      if (!["test", "test.skip"].includes(call.expression.getText(source)))
        continue;
      const [name, body] = call.arguments;
      if (!name || !ts.isStringLiteral(name))
        throw new Error(`No test name in ${title.text}`);
      const address = name.text.split(": ")[0]!;
      const reason = name.text.split(": ").slice(1).join(": ");
      const text = body?.getText(source) ?? "";
      let code: string | null = null;
      for (const [alias, file] of imports) {
        const member = text.match(
          new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)`),
        );
        if (member) {
          code = `${file}#${member[1]}`;
          break;
        }
        if (new RegExp(`\\b${alias}\\b`).test(text)) {
          code = `${file}#default`;
          break;
        }
      }
      pairs.push({
        address,
        state,
        comparison:
          state === "notCompared"
            ? "none"
            : text.includes("WithoutCtx<")
              ? "typeWithoutCtx"
              : text.includes("TableShape<")
                ? "table"
                : "type",
        code,
        reason:
          state === "bound"
            ? null
            : reason.includes("outside the Pack")
              ? `The pin is outside pack:history-view and is not emitted; ${reason}`
              : reason,
      });
    }
  }
  for (const prefix of titles.keys())
    if (!found.has(prefix))
      throw new Error(`Missing pinned pair block: ${prefix}`);
  return pairs;
}

test("pure: pinned pairs match the compiled tier's test names, states and order", () => {
  // A scratch JSON path lets the pure test tier check drift without editing the repository.
  const pairsFile =
    process.env.PINNED_PAIRS_FILE ??
    resolve(root, "tests/types/pinned-pairs.json");
  const listing = JSON.parse(readFileSync(pairsFile, "utf8")) as {
    pack: string;
    test: string;
    pairs: Pair[];
  };
  expect(listing.pack).toBe("pack:history-view");
  expect(listing.test).toBe(testFile);
  const tests = readTests();
  const addresses = new Set<string>();
  for (const pair of listing.pairs) {
    expect(addresses.has(pair.address), `${pair.address}: duplicate pair`).toBe(
      false,
    );
    addresses.add(pair.address);
    expect(
      tests.some((entry) => entry.address === pair.address),
      `${pair.address}: pair absent from test`,
    ).toBe(true);
    expect(
      pair.reason === null ||
        (pair.reason.length > 0 && !/[\r\n]/.test(pair.reason)),
      `${pair.address}: reason must be one line or null`,
    ).toBe(true);
    expect(
      pair.state === "bound" ? pair.reason === null : pair.reason !== null,
      `${pair.address}: reason follows state`,
    ).toBe(true);
  }
  for (const [index, entry] of tests.entries()) {
    const pair = listing.pairs.find((pair) => pair.address === entry.address);
    expect(pair, `${entry.address}: test absent from JSON`).toBeDefined();
    expect(pair?.state, `${entry.address}: wrong state`).toBe(entry.state);
    expect(listing.pairs[index]?.address, `${entry.address}: wrong order`).toBe(
      entry.address,
    );
    expect(pair?.comparison, `${entry.address}: wrong comparison`).toBe(
      entry.comparison,
    );
    expect(pair?.code, `${entry.address}: wrong code export`).toBe(entry.code);
    expect(pair?.reason, `${entry.address}: wrong reason`).toBe(entry.reason);
  }
});
