import { ESLint } from "eslint";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  compositionNamed,
  compositions,
  compositionsNamed,
  fixtureComposition,
  productionComposition,
  projectDirectory,
} from "../../harness/composition.js";
const root = join(import.meta.dirname, "../..");

test("pure: no argument names every composition, and named ones come each once in the order given", () => {
  expect(compositionsNamed([])).toEqual([
    fixtureComposition,
    productionComposition,
  ]);
  expect(compositionsNamed(["production"])).toEqual([productionComposition]);
  expect(compositionsNamed(["production", "fixture", "production"])).toEqual([
    productionComposition,
    fixtureComposition,
  ]);
});

test("pure: an argument that names no composition fails with the names there are", () => {
  expect(() => compositionsNamed(["fixture", "example"])).toThrow(
    'No composition is named "example". The compositions are fixture and production.',
  );
  expect(() => compositionNamed(["prod"])).toThrow(
    'No composition is named "prod".',
  );
});

test("pure: the watch takes one composition, the fixture composition when none is named", () => {
  expect(compositionNamed([])).toBe(fixtureComposition);
  expect(compositionNamed(["production"])).toBe(productionComposition);
  expect(() => compositionNamed(["fixture", "production"])).toThrow(
    "Name one composition, not 2: fixture, production.",
  );
});

test("pure: the fixture composition's project is the repository root and the production composition's is example/", () => {
  expect(projectDirectory(fixtureComposition)).toBe(root);
  expect(projectDirectory(productionComposition)).toBe(join(root, "example"));
  expect(compositions.map((composition) => composition.name)).toEqual([
    "fixture",
    "production",
  ]);
});

test("pure: example/package.json is a symbolic link to the repository's one package.json", async () => {
  const link = join(root, "example/package.json");
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
  expect(await readlink(link)).toBe("../package.json");
  expect(await realpath(link)).toBe(await realpath(join(root, "package.json")));
  const { type } = JSON.parse(await readFile(link, "utf8")) as {
    type: string;
  };
  expect(type).toBe("module");
});

// The lint configuration keeps test code out of the production composition and keeps ctx.auth and
// the environment out of its contexts. These cases show both rules bite.
const eslint = new ESLint({ cwd: root });
async function messages(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, file) });
  return (result?.messages ?? [])
    .filter(
      (message) =>
        message.ruleId === "production/no-test-code" ||
        message.ruleId === "no-restricted-syntax",
    )
    .map((message) => message.message);
}
const testCode =
  "The production composition imports nothing from fixture/, harness/ or tests/.";

test.each([
  ["example/convex/probe.ts", 'import "../../fixture/convex/schema.js";\n'],
  [
    "example/convex/orders/probe.ts",
    'export { fixtureBackend } from "../../../harness/native.js";\n',
  ],
  ["example/domain/probe.ts", 'export * from "../../tests/pure/x.js";\n'],
  [
    "example/convex/probe.ts",
    'export const f = () => import("../../harness/composition.js");\n',
  ],
  ["example/convex/probe.ts", 'import "../.././fixture";\n'],
])("pure: lint refuses %s importing test code: %s", async (file, code) => {
  expect(await messages(file, code)).toContain(testCode);
});

test.each([
  ["example/convex/probe.ts", 'import "../../src/command/index.js";\n'],
  ["example/convex/probe.ts", 'import "./fixtureish.js";\n'],
  ["example/convex/probe.ts", 'import "../fixture/x.js";\n'],
  ["fixture/convex/probe.ts", 'import "../../harness/composition.js";\n'],
])(
  "pure: lint lets %s import what is not test code: %s",
  async (file, code) => {
    expect(await messages(file, code)).not.toContain(testCode);
  },
);

test("pure: lint refuses ctx.auth and the environment in a production context and allows ctx.auth in the parent", async () => {
  const read = "export const f = (ctx: { auth: unknown }) => ctx.auth;\n";
  const refusal =
    "Code that runs inside a context component reads neither ctx.auth nor the environment.";
  for (const context of ["orders", "inventory"]) {
    expect(await messages(`example/convex/${context}/probe.ts`, read)).toEqual([
      refusal,
    ]);
    expect(
      await messages(
        `example/convex/${context}/probe.ts`,
        "export const f = () => process.env.SECRET;\n",
      ),
    ).toEqual([refusal]);
  }
  expect(await messages("example/convex/probe.ts", read)).toEqual([]);
});
