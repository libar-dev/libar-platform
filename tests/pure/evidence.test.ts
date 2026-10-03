import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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
import EvidenceReporter, {
  failRunRecord,
  openRunRecord,
  writeRunRecord,
} from "../../harness/evidence.js";
import type { NativeRunRecord } from "../../harness/evidence.js";

test("pure: simultaneous evidence records differ and an existing record cannot be overwritten", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-evidence-"));
  const record: NativeRunRecord = {
    tier: "native",
    target: "local backend",
    commit: "abcdefg",
    clean: false,
    command: "vitest run",
    startedAt: "2026-10-01T16:29:36.247Z",
    finishedAt: "",
    result: "passed",
    versions: {},
    tests: [],
    unhandledErrors: [],
    hosted: null,
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
    target: "local backend",
    commit: "abcdefg",
    clean: true,
    command: "vitest run --project native",
    startedAt: "2026-10-01T16:29:36.247Z",
    finishedAt: "2026-10-01T16:30:36.247Z",
    result: "passed",
    versions: {},
    tests: [],
    unhandledErrors: [],
    hosted: null,
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

// A finished test as the reporter sees it.
function finished(project: string, file: string, name: string) {
  return {
    project: { name: project },
    fullName: name,
    module: { relativeModuleId: file },
    result: () => ({ state: "passed", errors: [] }),
    diagnostic: () => ({ duration: 1 }),
    meta: () => ({}),
  } as never;
}

test("pure: a run that includes the native project records the tests of every project, each under its project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-evidence-projects-"));
  try {
    vi.mocked(randomUUID).mockReturnValueOnce(
      "00000000-0000-0000-0000-000000000004",
    );
    const reporter = new EvidenceReporter({ directory });
    reporter.onTestRunStart([
      { project: { name: "native" } },
      { project: { name: "pure" } },
    ] as never);
    reporter.onTestCaseResult(
      finished("native", "tests/native/a.test.ts", "a native test"),
    );
    reporter.onTestCaseResult(
      finished("pure", "tests/pure/b.test.ts", "pure: a pure test"),
    );
    await reporter.onTestRunEnd([] as never, [] as never, "passed" as never);
    const [name] = await readdir(directory);
    const record = JSON.parse(
      await readFile(join(directory, name!), "utf8"),
    ) as NativeRunRecord;
    expect(
      record.tests.map(({ project, file, result }) => ({
        project,
        file,
        result,
      })),
    ).toEqual([
      { project: "native", file: "tests/native/a.test.ts", result: "passed" },
      { project: "pure", file: "tests/pure/b.test.ts", result: "passed" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("pure: a run without the native project writes no record", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-evidence-no-native-"));
  try {
    const reporter = new EvidenceReporter({ directory });
    reporter.onTestRunStart([{ project: { name: "pure" } }] as never);
    reporter.onTestCaseResult(
      finished("pure", "tests/pure/b.test.ts", "pure: a pure test"),
    );
    await reporter.onTestRunEnd([] as never, [] as never, "passed" as never);
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
