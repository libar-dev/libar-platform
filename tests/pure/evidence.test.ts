import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  randomUUID: vi.fn(),
}));
import { randomUUID } from "node:crypto";
import { writeRunRecord } from "../../harness/evidence.js";
import type { NativeRunRecord } from "../../harness/evidence.js";

test("pure: simultaneous evidence records differ and an existing record cannot be overwritten", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-evidence-"));
  const record: NativeRunRecord = {
    tier: "native",
    commit: "abcdefg",
    clean: false,
    command: "vitest run",
    startedAt: "2026-10-01T16:29:36.247Z",
    finishedAt: "",
    result: "passed",
    versions: {},
    tests: [],
    unhandledErrors: [],
  };
  try {
    vi.mocked(randomUUID)
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000002")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001");
    const first = await writeRunRecord(directory, record);
    const second = await writeRunRecord(directory, record);
    expect(first).not.toBe(second);
    await expect(
      writeRunRecord(directory, { ...record, result: "failed" }),
    ).rejects.toThrow();
    expect(
      JSON.parse(await readFile(join(directory, first), "utf8")).result,
    ).toBe("passed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
