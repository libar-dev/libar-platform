import { cp, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convexToJson } from "convex/values";
import { expect, onTestFinished, test } from "vitest";
import type { Backend } from "../../harness/backend.js";
import { archiveEntries } from "./backup-archive-entries.js";
import { fixtureBackend, measure } from "../../harness/native.js";
import { deployTemporaryCopy } from "../../harness/backup-archive.js";

const root = join(import.meta.dirname, "../..");

async function schedulingComposition(directory: string) {
  for (const path of ["fixture", "src", "package.json", "convex.json"])
    await cp(join(root, path), join(directory, path), { recursive: true });
  await symlink(join(root, "node_modules"), join(directory, "node_modules"));
  await mkdir(join(directory, "tests/native"), { recursive: true });
  await cp(
    join(import.meta.dirname, "backup-archive-scheduler.ts"),
    join(directory, "tests/native/backup-archive-scheduler.ts"),
  );
  await writeFile(
    join(directory, "fixture/convex/archiveSchedule.ts"),
    'export { schedule } from "../../tests/native/backup-archive-scheduler.js";\n',
  );
}

async function createDocuments(backend: Backend, prefix: string) {
  await backend.admin.run("depotRelay:createDocuments", {
    tenantId: "t-1",
    actor: { kind: "operator", id: "backup-archive-test" },
    operation: {
      operationId: prefix,
      causedBy: { kind: "command", commandType: "fixture" },
    },
    input: {
      documents: [1, 2, 3].map((n) => ({
        documentId: `${prefix}-${n}`,
        title: `${prefix} ${n}`,
      })),
    },
  });
  for (const n of [1, 2, 3])
    await backend.admin.run("markers:insert", { trial: `${prefix}-${n}` });
}

async function observe(backend: Backend) {
  return {
    markers: await backend.admin.readTable("markers"),
    notes: await backend.admin.readTable("notes"),
    streams: await backend.admin.readTable("streams", { component: "depot" }),
    events: await backend.admin.readTable("events", { component: "depot" }),
    environment: await backend.admin.environment(),
    scheduled: await backend.admin.readTable("_scheduled_functions"),
  };
}

test("native: a backup archive imported with replacement restores parent and context data and preserves destination configuration and schedules", async ({
  signal,
}) => {
  const directory = await mkdtemp(join(tmpdir(), "backup-archive-test-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await schedulingComposition(directory);
  const source = await fixtureBackend();
  const deployed = await deployTemporaryCopy(source, directory, signal);
  measure("fixture scheduling deployment command", {
    baseComposition: "fixture",
    addedModule: "archiveSchedule:schedule",
    ...deployed,
  });
  expect(source.facts().composition).toBeNull();
  await createDocuments(source, "exported");
  await source.admin.setEnvironment({ ARCHIVE_VALUE: "exported" });
  await source.admin.run("archiveSchedule:schedule");
  await expect
    .poll(
      async () => {
        const rows = await source.admin.readTable("_scheduled_functions");
        return rows.map((row) => (row.state as { kind: string }).kind).sort();
      },
      { timeout: 10000 },
    )
    .toEqual(["failed", "pending", "success"]);
  const before = await observe(source);
  measure("backup archive source", convexToJson(before));
  const path = join(directory, "backup-archive.zip");
  await source.admin.exportBackupArchive(path);
  const entries = await archiveEntries(path);
  measure("backup archive entries", entries);
  for (const entry of [
    "markers/documents.jsonl",
    "notes/documents.jsonl",
    "_components/depot/streams/documents.jsonl",
    "_components/depot/events/documents.jsonl",
  ])
    expect(entries).toContain(entry);
  expect(entries.some((entry) => entry.includes("_scheduled_functions"))).toBe(
    false,
  );
  expect(await observe(source)).toEqual(before);

  const fresh = await fixtureBackend();
  // A table the backend holds but does not list among the tables reads as empty, not as missing.
  expect(await fresh.admin.readTable("_scheduled_functions")).toEqual([]);
  await fresh.admin.setEnvironment({ ARCHIVE_VALUE: "destination" });
  const freshEnvironment = await fresh.admin.environment();
  await fresh.admin.importBackupArchive(path);
  const freshAfter = await observe(fresh);
  measure("fresh replacement contents", convexToJson(freshAfter));
  expect(freshAfter).toEqual({
    ...before,
    environment: freshEnvironment,
    scheduled: [],
  });

  await createDocuments(source, "after-export");
  await source.admin.run("archiveSchedule:schedule");
  await expect
    .poll(
      async () => {
        const rows = await source.admin.readTable("_scheduled_functions");
        return rows.map((row) => (row.state as { kind: string }).kind).sort();
      },
      { timeout: 10000 },
    )
    .toEqual(["failed", "failed", "pending", "pending", "success", "success"]);
  await source.admin.setEnvironment({ ARCHIVE_VALUE: "after-export" });
  const sameBefore = await observe(source);
  measure("same backend before replacement", convexToJson(sameBefore));
  await source.admin.importBackupArchive(path);
  const sameAfter = await observe(source);
  measure("same backend replacement contents", convexToJson(sameAfter));
  expect(sameAfter).toEqual({
    ...before,
    environment: sameBefore.environment,
    scheduled: sameBefore.scheduled,
  });
});
