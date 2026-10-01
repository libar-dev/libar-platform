import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  randomUUID: vi.fn(),
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync) };
});
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  failRunRecord,
  openRunRecord,
  writeRunRecord,
} from "../../harness/evidence.js";
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

test("pure: an amendment that fails leaves the old record whole", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-evidence-amend-"));
  const record: NativeRunRecord = {
    tier: "native",
    commit: "abcdefg",
    clean: true,
    command: "vitest run --project native",
    startedAt: "2026-10-01T16:29:36.247Z",
    finishedAt: "2026-10-01T16:30:36.247Z",
    result: "passed",
    versions: {},
    tests: [],
    unhandledErrors: [],
  };
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  try {
    vi.mocked(randomUUID).mockReturnValueOnce(
      "00000000-0000-0000-0000-000000000003",
    );
    const path = join(directory, await writeRunRecord(directory, record));
    const original = await readFile(path, "utf8");
    const run = openRunRecord();
    run.path = path;
    // The write opens its file with truncation and then fails, as a full disk or a file size
    // limit makes it.
    vi.mocked(writeFileSync).mockImplementationOnce((file) => {
      actual.writeFileSync(file, "");
      throw Object.assign(new Error("EFBIG: file too large"), {
        code: "EFBIG",
      });
    });
    expect(() => failRunRecord(run, "the sweep kept a backend")).toThrow(
      "EFBIG",
    );
    expect(await readFile(path, "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
