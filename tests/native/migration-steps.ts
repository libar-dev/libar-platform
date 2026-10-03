import { installFixtureReadModel } from "./rebuild-install.js";
import { setTimeout as sleep } from "node:timers/promises";
import { expect } from "vitest";
import type { MigrationStatus } from "@convex-dev/migrations";
import type { Value } from "convex/values";
import { api } from "../../fixture/convex/_generated/api.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure } from "../../harness/native.js";
import type { JsonValue } from "../../harness/evidence.js";
export const record = (name: string, value: unknown) =>
  measure(name, JSON.parse(JSON.stringify(value)) as JsonValue);
export async function setup(rows: number) {
  const backend = await fixtureBackend();
  record("pins", {
    backend: "precompiled-2026-09-28-5c7cb5b",
    convex: "1.46.0",
    "convex-helpers": "0.1.124",
    "@convex-dev/migrations": "0.3.6",
  });
  await installFixtureReadModel(backend, "documentSummary");
  const generation = (await backend.admin.readTable("generations"))[0]!;
  const { _id, _creationTime, switchedAt, ...fields } = generation;
  void _id;
  void _creationTime;
  void switchedAt;
  await backend.admin.writeTable("generations", {
    insert: { ...fields, generation: 2, state: "building" },
  });
  const building = (await backend.admin.readTable("generations")).find(
    (row) => row.generation === 2,
  )!;
  // generation-registry.sdp.md:74: the checkpoint belongs to the progress row.
  await backend.admin.writeTable("generationProgress", {
    insert: {
      generationId: building._id!,
      pass: "backfill",
      batchSize: 2,
      cursor: null,
      batchesDone: 0,
      rowsWritten: 0,
      rowsSkipped: 0,
      misses: 0,
      rowsPurged: 0,
      updatedAt: Date.now(),
    },
  });
  await backend.admin.run("grants:grant", {
    tenantId: "tenant",
    principalKind: "human",
    principalId: `${backend.issuer.issuer}|writer`,
    permission: "depot.documents",
    grantedBy: "native-test",
  });
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("writer"),
  });
  for (let i = 0; i < rows; i++)
    await client.mutation(api.depotCommands.createSummarizedDocument, {
      tenantId: "tenant",
      input: {
        documentId: `doc-${String(i).padStart(2, "0")}`,
        title: "original",
      },
    });
  await backend.admin.run("migrations:configure", {
    failKey: null,
    reads: 0,
    clear: true,
  });
  return { backend, client };
}
export async function status(
  backend: Backend,
  component = "migrations",
  name = "migrations:summaries",
) {
  const result = await backend.admin.run(
    "lib:getStatus",
    { names: [name] },
    { component },
  );
  return (result as unknown as MigrationStatus[])[0]!;
}
export async function untilStatus(
  backend: Backend,
  state: string,
  component = "migrations",
  name = "migrations:summaries",
) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const result = await status(backend, component, name);
    if (result.state === state) return result;
    if (result.state === "failed" && state !== "failed")
      throw new Error(JSON.stringify(result));
    await sleep(20);
  }
  throw new Error(
    `Migration did not reach ${state}: ${JSON.stringify(await status(backend, component, name))}`,
  );
}
export async function completeRows(
  backend: Backend,
  rows: number,
  copies: number,
) {
  const target = (await backend.admin.readTable("documentSummaries")).filter(
    (row) => row.generation === 2,
  );
  const visits = await backend.admin.readTable("migrationVisits");
  expect(target).toHaveLength(rows);
  expect(target.map((row) => row.key).sort()).toEqual(
    Array.from(
      { length: rows },
      (_, index) => `doc-${String(index).padStart(2, "0")}`,
    ),
  );
  expect(visits).toHaveLength(rows * copies);
  for (const row of target)
    expect(visits.filter((visit) => visit.key === row.key)).toHaveLength(
      copies,
    );
  return { target, visits };
}
export async function thrown(promise: Promise<Value>) {
  return promise.then(
    () => {
      throw new Error("The boundary did not refuse the call");
    },
    (error) => String(error),
  );
}
