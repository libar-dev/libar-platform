import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { expect, test } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import type { CompletionRecord } from "../../harness/admin.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
// The observation the documents and bytes of a command rest on: the usageStats of a top-level
// mutation's completion record count what a component call inside it read and wrote.
const anchor = specTest({
  id: testAnchorId("test:platform.native-harness.usage-stats"),
  verifies: ref("spec:platform.native-harness"),
});
void anchor;
const identifier = "usage:throughAnnex";
type Counts = {
  parentWrites: number;
  annexWrites: number;
  annexReads: number;
};
// Runs the mutation and returns the completion records its request left.
async function run(
  backend: Backend,
  annexSample: string,
  counts: Counts,
): Promise<CompletionRecord[]> {
  const mark = await backend.admin.logMark();
  await ordinaryClient(backend.url).mutation(api.usage.throughAnnex, {
    ...counts,
    annexSample,
  });
  const top = (entry: CompletionRecord) =>
    entry.identifier === identifier && entry.componentPath === null;
  const records = await backend.admin.completionsSince(mark, (entries) =>
    entries.some(top),
  );
  const own = required(records.find(top), "the mutation's completion record");
  return records.filter((entry) => entry.requestId === own.requestId);
}
const stats = [
  "databaseReadDocuments",
  "databaseWriteDocuments",
  "databaseReadBytes",
  "databaseWriteBytes",
  "databaseWriteIndexRows",
] as const;

test("native: a top-level mutation's usageStats count the documents a component call inside it read and wrote", async () => {
  const backend = await fixtureBackend();
  const client = ordinaryClient(backend.url);
  const { annex } = await client.mutation(api.readCost.seed, {});
  // The same parent writes alone, then with five writes and three reads through the annex.
  const alone = await run(backend, annex, {
    parentWrites: 2,
    annexWrites: 0,
    annexReads: 0,
  });
  const through = await run(backend, annex, {
    parentWrites: 2,
    annexWrites: 5,
    annexReads: 3,
  });
  measure("usageStats", {
    alone: alone.map(({ componentPath, usageStats }) => ({
      componentPath,
      usageStats,
    })),
    through: through.map(({ componentPath, usageStats }) => ({
      componentPath,
      usageStats,
    })),
  });
  // Each request left one record, its own: the component calls inside it left none of their own.
  expect(alone).toHaveLength(1);
  expect(through).toHaveLength(1);
  const [parent, both] = [alone[0], through[0]].map((record) =>
    required(record, "the completion record"),
  ) as [CompletionRecord, CompletionRecord];
  expect(parent).toMatchObject({ udfType: "Mutation", error: null });
  expect(both).toMatchObject({ udfType: "Mutation", error: null });
  for (const name of stats) {
    expect(parent.usageStats[name], name).toBeTypeOf("number");
    expect(both.usageStats[name], name).toBeTypeOf("number");
  }
  expect(parent.usageStats["databaseWriteDocuments"]).toBe(2);
  expect(parent.usageStats["databaseReadDocuments"]).toBe(0);
  // The annex's five rows and three reads are counted in the parent's record.
  expect(both.usageStats["databaseWriteDocuments"]).toBe(7);
  expect(both.usageStats["databaseReadDocuments"]).toBe(3);
  // A row of either table writes three index rows: by_id, by_creation_time and by_position.
  expect(parent.usageStats["databaseWriteIndexRows"]).toBe(6);
  expect(both.usageStats["databaseWriteIndexRows"]).toBe(21);
  for (const name of ["databaseReadBytes", "databaseWriteBytes"] as const)
    expect(
      required(both.usageStats[name], name),
      `${name} of the call through the annex`,
    ).toBeGreaterThan(required(parent.usageStats[name], name));
  // The stored documents agree: four parent rows and five annex rows.
  expect(await backend.admin.readTable("parentRows")).toHaveLength(4);
  expect(
    await backend.admin.readTable("rows", { component: "annex" }),
  ).toHaveLength(5);
});
