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
