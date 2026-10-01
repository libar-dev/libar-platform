import { expect, test, vi } from "vitest";
import type { Backend } from "../../harness/backend.js";
const context = vi.hoisted(() => ({
  current: {
    meta: {} as { native?: { backends: unknown[]; measurements: unknown[] } },
    context: { signal: new AbortController().signal },
  },
  finished: [] as (() => Promise<void>)[],
}));
vi.mock("vitest", async (original) => ({
  ...(await original<typeof import("vitest")>()),
  TestRunner: { getCurrentTest: () => context.current },
  inject: () => ({ directory: "unused", executable: {} }),
  onTestFinished: (finish: () => Promise<void>) =>
    context.finished.push(finish),
}));
vi.mock("../../harness/identity.js", () => ({
  createFixtureIssuer: async () => ({}),
}));
vi.mock("../../harness/backend.js", () => ({ startBackend: vi.fn() }));
import { startBackend } from "../../harness/backend.js";
import { fixtureBackend } from "../../harness/native.js";

test("pure: a backend whose deploy fails is disposed and still contributes its facts to its test", async () => {
  context.current.meta = {};
  context.finished = [];
  const dispose = vi.fn(async () => {});
  const facts = {
    composition: null,
    identitySource: { issuer: "actual-issuer" },
  };
  const backend = {
    admin: {
      deploy: vi.fn(async () => {
        throw new Error("deployment failed");
      }),
    },
    dispose,
    facts: () => facts,
  } as unknown as Backend;
  vi.mocked(startBackend).mockImplementation(async () => {
    await Promise.resolve();
    expect(context.finished).toHaveLength(1);
    return backend;
  });
  await expect(fixtureBackend()).rejects.toThrow("deployment failed");
  expect(dispose).toHaveBeenCalledOnce();
  expect(vi.mocked(startBackend).mock.calls[0]?.[0].signal).toBe(
    context.current.context.signal,
  );
  await context.finished[0]!();
  expect(context.current.meta.native?.backends).toEqual([facts]);
  expect(dispose).toHaveBeenCalledTimes(2);
});

test("pure: fixtureBackend owns an overridden executable and can skip deploy", async () => {
  context.current.meta = {};
  context.finished = [];
  const deploy = vi.fn(async () => {});
  const dispose = vi.fn(async () => {});
  const backend = {
    admin: { deploy },
    dispose,
    facts: () => ({ composition: null }),
  } as unknown as Backend;
  vi.mocked(startBackend).mockResolvedValue(backend);
  const executable = {
    path: "synthetic",
    sha256: "hash",
    release: null,
    source: "CONVEX_BACKEND_BINARY" as const,
  };
  expect(
    await fixtureBackend({
      executable,
      parentDirectory: "owned-directory",
      deploy: false,
    }),
  ).toBe(backend);
  expect(startBackend).toHaveBeenLastCalledWith(
    expect.objectContaining({
      executable,
      parentDirectory: "owned-directory",
      signal: context.current.context.signal,
    }),
  );
  expect(deploy).not.toHaveBeenCalled();
  expect(context.finished).toHaveLength(1);
  await context.finished[0]!();
  expect(dispose).toHaveBeenCalledOnce();
  expect(context.current.meta.native?.backends).toEqual([
    { composition: null },
  ]);
});
