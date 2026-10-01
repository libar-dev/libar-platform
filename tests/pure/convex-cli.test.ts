import { ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { convexCli } from "../../harness/admin.js";
import { compositions, fixtureComposition } from "../../harness/composition.js";
import { runChild } from "../../harness/child.js";
const target = {
  url: "http://127.0.0.1:1",
  adminKey: "the-admin-key",
  home: "/the/backend/home",
  composition: fixtureComposition,
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
});
test("pure: convex dev keeps watching: it carries neither --once nor --until-success", () => {
  const { args } = convexCli(target, "dev");
  expect(args).not.toContain("--once");
  expect(args).not.toContain("--until-success");
});
test("pure: deploy is limited to 60000 ms, codegen to 120000 ms, and dev runs until it is stopped", () => {
  expect(convexCli(target, "deploy").timeoutMs).toBe(60000);
  expect(convexCli(target, "codegen").timeoutMs).toBe(120000);
  expect(convexCli(target, "dev").timeoutMs).toBe(Number.POSITIVE_INFINITY);
});
test("pure: runChild refuses the long-lived dev call before it starts a process", async () => {
  // Every child_process function starts its process through ChildProcess.prototype.spawn.
  const spawned = vi.spyOn(
    // Node's declarations leave this internal method out.
    ChildProcess.prototype as unknown as { spawn(options: object): void },
    "spawn",
  );
  try {
    // The spy sees a process that runChild starts.
    await runChild("node", process.execPath, ["-e", ""], { timeoutMs: 10000 });
    expect(spawned).toHaveBeenCalledTimes(1);
    spawned.mockClear();
    const call = convexCli(target, "dev");
    // Without this guard a finite limit would let runChild start convex dev.
    expect(call.timeoutMs).toBe(Number.POSITIVE_INFINITY);
    await expect(
      runChild("convex dev", call.file, call.args, {
        cwd: call.cwd,
        env: call.env,
        timeoutMs: call.timeoutMs,
      }),
    ).rejects.toMatchObject({ code: "ERR_OUT_OF_RANGE" });
    expect(spawned).not.toHaveBeenCalled();
  } finally {
    spawned.mockRestore();
  }
});
test.each(compositions)(
  "pure: every CLI call for the $name composition runs in its project directory, where convex.json names its functions",
  async (composition) => {
    const root = join(import.meta.dirname, "../..");
    for (const command of ["deploy", "codegen", "dev"] as const) {
      const { cwd } = convexCli({ ...target, composition }, command);
      expect(cwd).toBe(join(root, composition.project));
      const config = JSON.parse(
        await readFile(join(cwd, "convex.json"), "utf8"),
      ) as { functions: string };
      expect(join(composition.project, config.functions)).toBe(
        `${composition.functions}/`,
      );
    }
  },
);
