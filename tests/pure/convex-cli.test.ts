import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { convexCli } from "../../harness/admin.js";
import { fixtureComposition } from "../../harness/backend.js";
const target = {
  url: "http://127.0.0.1:1",
  adminKey: "the-admin-key",
  home: "/the/backend/home",
};
afterEach(() => vi.unstubAllEnvs());
test.each(["deploy", "codegen"] as const)(
  "pure: convex %s names the backend by --url and --admin-key and gets an environment of PATH, HOME and TMPDIR only",
  (command) => {
    vi.stubEnv("CONVEX_DEPLOY_KEY", "prod:somewhere|a-key");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:somewhere");
    vi.stubEnv("CONVEX_SELF_HOSTED_URL", "http://127.0.0.1:2");
    const call = convexCli(target, command);
    expect(call.args[1]).toBe(command);
    expect(call.args.slice(-4)).toEqual([
      "--url",
      target.url,
      "--admin-key",
      target.adminKey,
    ]);
    expect(Object.keys(call.env).sort()).toEqual(["HOME", "PATH", "TMPDIR"]);
    expect(call.env.HOME).toBe(target.home);
  },
);
test("pure: the CLI runs in the repository root, where convex.json names the fixture composition's functions", async () => {
  const { cwd } = convexCli(target, "deploy");
  const config = JSON.parse(
    await readFile(join(cwd, "convex.json"), "utf8"),
  ) as { functions: string };
  expect(config.functions).toBe(`${fixtureComposition.functions}/`);
});
