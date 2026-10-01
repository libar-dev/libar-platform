import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { convexCli } from "../../harness/admin.js";
import { fixtureComposition } from "../../harness/backend.js";
import { runChild } from "../../harness/child.js";
const target = {
  url: "http://127.0.0.1:1",
  adminKey: "the-admin-key",
  home: "/the/backend/home",
};
afterEach(() => vi.unstubAllEnvs());
test.each(["deploy", "codegen", "dev"] as const)(
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
test.each(["deploy", "codegen", "dev"] as const)(
  "pure: convex %s runs with the typecheck disabled",
  (command) => {
    const { args } = convexCli(target, command);
    expect(args[args.indexOf("--typecheck") + 1]).toBe("disable");
  },
);
test("pure: convex dev keeps codegen on, so a changed fixture file rewrites the generated files", () => {
  const { args } = convexCli(target, "dev");
  expect(args).not.toContain("--codegen");
  expect(args).not.toContain("--once");
});
test("pure: deploy and codegen are bounded in time and dev is not", () => {
  for (const command of ["deploy", "codegen"] as const) {
    const { timeoutMs } = convexCli(target, command);
    expect(Number.isFinite(timeoutMs) && timeoutMs > 0).toBe(true);
  }
  expect(convexCli(target, "dev").timeoutMs).toBe(Number.POSITIVE_INFINITY);
});
test("pure: runChild refuses the long-lived dev call before it starts a process", async () => {
  const call = convexCli(target, "dev");
  // Without this guard a finite timeout would let runChild start convex dev.
  expect(call.timeoutMs).toBe(Number.POSITIVE_INFINITY);
  await expect(
    runChild("convex dev", call.file, call.args, {
      cwd: call.cwd,
      env: call.env,
      timeoutMs: call.timeoutMs,
    }),
  ).rejects.toThrow(/timeout/);
});
test("pure: the CLI runs in the repository root, where convex.json names the fixture composition's functions", async () => {
  const { cwd } = convexCli(target, "deploy");
  const config = JSON.parse(
    await readFile(join(cwd, "convex.json"), "utf8"),
  ) as { functions: string };
  expect(config.functions).toBe(`${fixtureComposition.functions}/`);
});
