import { expect } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import type { BlobRead, ReadThenCall } from "../../fixture/convex/limits.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import { paceAfterWrite } from "../../harness/wait.js";
export interface LimitsWorld {
  backend?: Backend;
  through?: "nested" | "annex";
  size?: number;
  parentCount?: number;
  childCount?: number;
  together?: string;
}
function bytes(size: string) {
  const match = /^(\d+) KiB$/.exec(size);
  if (match === null) throw new Error(`Unsupported document size: ${size}`);
  return Number(match[1]) * 1024;
}
async function outcome(
  call: Promise<unknown>,
  success: string,
  name: string,
  limit?: "read" | "written",
) {
  try {
    await call;
    measure(name, { outcome: success, error: null });
    return success;
  } catch (error) {
    const text = String(error);
    measure(name, { outcome: "failed", error: text });
    return limit !== undefined &&
      text.includes(`Too many bytes ${limit} in a single function execution`)
      ? `fails on the bytes-${limit} limit`
      : `fails with: ${text}`;
  }
}
export async function seedLimits(
  world: LimitsWorld,
  size: string,
  parentCount: number,
  childCount: number,
  through: "nested" | "annex",
) {
  const backend = await fixtureBackend();
  const payloadSize = bytes(size);
  Object.assign(world, {
    backend,
    through,
    size: payloadSize,
    parentCount,
    childCount,
  });
  const client = ordinaryClient(backend.url);
  await client.mutation(api.limits.insertBlobs, {
    group: "parent",
    count: parentCount,
    size: payloadSize,
  });
  await paceAfterWrite(parentCount * (payloadSize + 256));
  await client.mutation(
    through === "nested" ? api.limits.insertBlobs : api.limits.insertAnnexBlobs,
    { group: "child", count: childCount, size: payloadSize },
  );
  await paceAfterWrite(childCount * (payloadSize + 256));
  measure("seededPayloads", { size: payloadSize, parentCount, childCount });
}
export async function readTogether(world: LimitsWorld) {
  const client = ordinaryClient(required(world.backend, "the backend").url);
  world.together = await outcome(
    client.mutation(api.limits.readThenCall, {
      through: required(world.through, "the boundary"),
      parentCount: required(world.parentCount, "the parent count"),
      childCount: required(world.childCount, "the child count"),
    }),
    "commits",
    "combinedReadOutcome",
    "read",
  );
  measure("readTogether", world.together);
}
export function assertTogether(world: LimitsWorld, expected: string) {
  expect(world.together, world.together).toBe(expected);
}
export async function readAlone(
  world: LimitsWorld,
  parentAlone: string,
  childAlone: string,
) {
  const client = ordinaryClient(required(world.backend, "the backend").url);
  const through = required(world.through, "the boundary");
  const parentCount = required(world.parentCount, "the parent count");
  const childCount = required(world.childCount, "the child count");
  let parent: ReadThenCall | undefined;
  let child: BlobRead | undefined;
  const ownOutcome = await outcome(
    client
      .mutation(api.limits.readThenCall, {
        through,
        parentCount,
        childCount: 0,
      })
      .then((value) => {
        parent = value;
      }),
    "commits",
    "parentReadOutcome",
  );
  const childOutcome = await outcome(
    client
      .query(api.limits.childAlone, { through, count: childCount })
      .then((value) => {
        child = value;
      }),
    "returns",
    "childReadOutcome",
  );
  measure("readsAlone", {
    parent: ownOutcome,
    child: childOutcome,
    parentDocuments: parent?.parentDocuments ?? null,
    childDocuments: child?.documents ?? null,
    childPayloadBytes: child?.payloadBytes ?? null,
  });
  expect(ownOutcome, ownOutcome).toBe(parentAlone);
  expect(childOutcome, childOutcome).toBe(childAlone);
  expect(required(parent, "the parent read").parentDocuments).toBe(parentCount);
  expect(required(child, "the child read").documents).toBe(childCount);
  expect(required(child, "the child read").payloadBytes).toBe(
    childCount * required(world.size, "the size"),
  );
  const fitting: ReadThenCall = await client.mutation(api.limits.readThenCall, {
    through,
    parentCount: 1,
    childCount: 1,
  });
  const byteGrowth =
    fitting.after.bytesRead.used - fitting.before.bytesRead.used;
  const documentGrowth =
    fitting.after.documentsRead.used - fitting.before.documentsRead.used;
  const childBytes =
    fitting.child.after.bytesRead.used - fitting.child.before.bytesRead.used;
  const childDocuments =
    fitting.child.after.documentsRead.used -
    fitting.child.before.documentsRead.used;
  measure("sharedReadMetrics", {
    byteGrowth,
    documentGrowth,
    childBytes,
    childDocuments,
    payloadBytes: fitting.child.payloadBytes,
  });
  expect(fitting.parentDocuments).toBe(1);
  expect(fitting.child.documents).toBe(1);
  expect(fitting.child.payloadBytes).toBe(required(world.size, "the size"));
  expect(childBytes).toBeGreaterThanOrEqual(fitting.child.payloadBytes);
  expect(childDocuments).toBe(1);
  expect(byteGrowth).toBe(childBytes);
  expect(documentGrowth).toBe(childDocuments);
}
async function writtenRows(world: LimitsWorld, group: string) {
  const backend = required(world.backend, "the backend");
  // Each admin page reads at most ten payloads, safely below the read limit.
  const own = await backend.admin.readTable("blobs", { pageSize: 10 });
  const child =
    world.through === "annex"
      ? await backend.admin.readTable("blobs", {
          component: "annex",
          pageSize: 10,
        })
      : [];
  return [...own, ...child].filter((row) => row.group === group).length;
}
export async function writeLimits(world: LimitsWorld, expected: string) {
  const client = ordinaryClient(required(world.backend, "the backend").url);
  const through = required(world.through, "the boundary");
  const parentCount = required(world.parentCount, "the parent count");
  const childCount = required(world.childCount, "the child count");
  const size = required(world.size, "the size");
  const together = await outcome(
    client.mutation(api.limits.writeThenCall, {
      through,
      group: "failed-write",
      parentCount,
      childCount,
      size,
    }),
    "commits",
    "combinedWriteOutcome",
    "written",
  );
  measure("writesTogether", together);
  // Pace even a failed attempt before testing the two committing halves.
  await paceAfterWrite((parentCount + childCount) * (size + 256));
  const failedRows = await writtenRows(world, "failed-write");
  measure("failedWriteRows", failedRows);
  expect(together, together).toBe(expected);
  expect(failedRows).toBe(0);
  for (const half of ["parent", "child"] as const) {
    const committed = await outcome(
      client.mutation(api.limits.writeThenCall, {
        through,
        group: "halves",
        parentCount: half === "parent" ? parentCount : 0,
        childCount: half === "child" ? childCount : 0,
        size,
      }),
      "commits",
      `${half}WriteOutcome`,
    );
    await paceAfterWrite(
      (half === "parent" ? parentCount : childCount) * (size + 256),
    );
    const rows = await writtenRows(world, "halves");
    measure(`${half}WriteRows`, rows);
    expect(committed, committed).toBe("commits");
    expect(rows).toBe(
      half === "parent" ? parentCount : parentCount + childCount,
    );
  }
  measure("limitSummary", {
    boundary: through,
    combinedRead: world.together ?? null,
    combinedWrite: together,
    failedWriteRows: failedRows,
    committedRows: await writtenRows(world, "halves"),
  });
}
