import { renameSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };
});
import { publishOwnership } from "../../harness/ownership.js";

test("pure: a failed ownership publication leaves the previous complete pid record intact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libar-ownership-"));
  try {
    publishOwnership(
      directory,
      123,
      "libar-00000000-0000-0000-0000-000000000001",
    );
    const original = await readFile(join(directory, "pid"), "utf8");
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw new Error("publication failed");
    });
    expect(() =>
      publishOwnership(
        directory,
        456,
        "libar-00000000-0000-0000-0000-000000000002",
      ),
    ).toThrow("publication failed");
    expect(await readFile(join(directory, "pid"), "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
