import { ESLint } from "eslint";
import { join } from "node:path";
import { expect, test } from "vitest";
// The repository's lint configuration keeps ctx.auth and the environment out of the context
// library and out of every component of the fixture composition. These cases show it bites.
const root = join(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: root });
async function restricted(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: join(root, file),
  });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}
const reads = {
  "ctx.auth": "export const f = (ctx: { auth: unknown }) => ctx.auth;\n",
  "ctx['auth']": 'export const f = (ctx: { auth: unknown }) => ctx["auth"];\n',
  "a destructured auth":
    "export const f = ({ auth }: { auth: unknown }) => auth;\n",
  "process.env": "export const f = () => process.env.SECRET;\n",
  "globalThis.process.env":
    "export const f = () => globalThis.process.env.SECRET;\n",
  "the generated server's env":
    'import { env } from "./_generated/server.js";\nexport const f = () => env;\n',
};
test.each(["src/context/probe.ts", "fixture/convex/depot/probe.ts"])(
  "pure: lint refuses every read of ctx.auth or the environment in %s",
  async (file) => {
    for (const [what, code] of Object.entries(reads))
      expect(await restricted(file, code), what).toEqual([
        "Code that runs inside a context component reads neither ctx.auth nor the environment.",
      ]);
  },
);
test("pure: the same reads pass lint in the parent's own functions", async () => {
  expect(
    await restricted("fixture/convex/probe.ts", reads["ctx.auth"]),
  ).toEqual([]);
});
