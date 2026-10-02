// The maintenance gate on the native backend, over the fixture composition: a closed tenant refuses a
// public command and leaves another tenant writable, the restore door set through the deployment's
// environment refuses the next write with no deploy, a close races commands in flight, and every
// operator action has its audit record (spec:application.write-pause, spec:operations.baseline-operations).
import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend } from "../../harness/native.js";
async function userIn(backend: Backend, tenantId: string, subject: string) {
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId,
    principalKind: "human",
    principalId: `${backend.issuer.issuer}|${subject}`,
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  return ordinaryClient(backend.url, {
    token: await backend.issuer.token(subject),
  });
}
type Client = Awaited<ReturnType<typeof userIn>>;
const create = (
  client: Client,
  tenantId: string,
  documentId: string,
  requestKey: string,
) =>
  client.mutation(api.depotCommands.createDocument, {
    tenantId,
    requestKey,
    input: { documentId, title: "Report" },
  });
async function thrownData(promise: Promise<unknown>): Promise<Value> {
  const error = await promise.then(
    () => {
      throw new Error("The call did not fail");
    },
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<Value>).data;
}
const paused = (message: string) => ({
  kind: "transient",
  code: "writePaused",
  message,
});
const gateAudit = async (backend: Backend, scopeKey: string) =>
  (
    (await backend.admin.run(getFunctionName(internal.gate.getGateAudit), {
      scopeKey,
      paginationOpts: { numItems: 100, cursor: null },
    })) as { page: Record<string, Value>[] }
  ).page;

test("native: a closed tenant refuses a public command with writePaused and stores nothing, another tenant writes, and the same request key applies after the resume; each change has its audit record", async () => {
  const backend = await fixtureBackend();
  const { admin } = backend;
  const first = await userIn(backend, "t-1", "user-1");
  const second = await userIn(backend, "t-2", "user-2");
  await admin.run(getFunctionName(internal.gate.closeGate), {
    scopeKey: "tenant:t-1",
    reason: "move",
    operator: "ops-close",
  });
  expect(await thrownData(create(first, "t-1", "doc-1", "k-1"))).toEqual(
    paused("write paused for tenant:t-1: move"),
  );
  expect(await admin.readTable("receipts")).toEqual([]);
  expect(await admin.readTable("events", { component: "depot" })).toEqual([]);
  expect(await create(second, "t-2", "doc-1", "k-1")).toMatchObject({
    kind: "applied",
  });
  await admin.run(getFunctionName(internal.gate.resumeGate), {
    scopeKey: "tenant:t-1",
    operator: "ops-resume",
  });
  expect(await create(first, "t-1", "doc-1", "k-1")).toMatchObject({
    kind: "applied",
    replayed: false,
    versions: [expect.objectContaining({ streamId: "doc-1", version: 1 })],
  });
  expect(await gateAudit(backend, "tenant:t-1")).toMatchObject([
    {
      kind: "gate.resume",
      scopeKey: "tenant:t-1",
      reason: "move",
      operator: "ops-resume",
    },
    {
      kind: "gate.close",
      scopeKey: "tenant:t-1",
      reason: "move",
      operator: "ops-close",
    },
  ]);
  expect(await gateAudit(backend, "all")).toEqual([]);
});

test("native: MAINTENANCE_MODE set to restore on the running backend refuses the next write of every tenant and entry with no deploy, and any other value lets the same request key apply", async () => {
  const backend = await fixtureBackend();
  const { admin } = backend;
  const first = await userIn(backend, "t-1", "user-1");
  const second = await userIn(backend, "t-2", "user-2");
  expect(await create(first, "t-1", "doc-0", "k-0")).toMatchObject({
    kind: "applied",
  });
  // Authorization, step 4, precedes the gate, step 7: the service actor holds a grant.
  await admin.run(getFunctionName(internal.grants.grant), {
    tenantId: "t-2",
    principalKind: "service",
    principalId: "svc-1",
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  await admin.setEnvironment({ MAINTENANCE_MODE: "restore" });
  const door = paused("write paused for all: restore");
  expect(await thrownData(create(first, "t-1", "doc-1", "k-1"))).toEqual(door);
  expect(await thrownData(create(second, "t-2", "doc-1", "k-1"))).toEqual(door);
  expect(
    await thrownData(
      admin.run(
        getFunctionName(internal.depotCommands.createDocumentInternal),
        {
          tenantId: "t-2",
          namespace: "worker",
          actor: { kind: "service", id: "svc-1" },
          requestKey: "k-2",
          input: { documentId: "doc-2", title: "Report" },
        },
      ),
    ),
  ).toEqual(door);
  expect(await admin.run(getFunctionName(internal.gate.getGate), {})).toEqual({
    restore: true,
    closed: [],
  });
  expect(await admin.readTable("receipts")).toHaveLength(1);
  for (const value of ["Restore", "off"]) {
    await admin.setEnvironment({ MAINTENANCE_MODE: value });
    expect(await admin.run(getFunctionName(internal.gate.getGate), {})).toEqual(
      { restore: false, closed: [] },
    );
  }
  expect(await create(first, "t-1", "doc-1", "k-1")).toMatchObject({
    kind: "applied",
    replayed: false,
  });
  expect(await create(second, "t-2", "doc-1", "k-1")).toMatchObject({
    kind: "applied",
  });
});

// Optimistic concurrency makes the close a consistent cut: a command either commits before the close
// or reads the closed gate and is refused. What a client sees: every command ends applied or refused
// with writePaused, never with a technical failure; an applied command left its receipt and its event
// and a refused one neither; and every command sent after the close returned is refused. Which applied
// command committed before the close in the serial order is not observable from outside the backend.
test("native: a close racing commands in flight leaves each command applied with its receipt and event or refused with writePaused and nothing stored, and every command sent after the close is refused", async () => {
  const backend = await fixtureBackend();
  const { admin } = backend;
  const clients = await Promise.all(
    [1, 2, 3, 4].map((n) => userIn(backend, "t-1", `user-${n}`)),
  );
  let closed = false;
  const outcomes: {
    key: string;
    sentAfterClose: boolean;
    outcome: "applied" | "paused";
  }[] = [];
  const writer = async (client: Client, n: number) => {
    for (let i = 0; i < 12; i += 1) {
      const key = `w${n}-${i}`;
      const sentAfterClose = closed;
      const outcome = await create(client, "t-1", key, key).then(
        () => "applied" as const,
        (error: unknown) => {
          expect(error).toBeInstanceOf(ConvexError);
          expect((error as ConvexError<Value>).data).toEqual(
            paused("write paused for tenant:t-1: cut"),
          );
          return "paused" as const;
        },
      );
      outcomes.push({ key, sentAfterClose, outcome });
    }
  };
  const close = (async () => {
    while (outcomes.length < 6) await new Promise((r) => setTimeout(r, 5));
    await admin.run(getFunctionName(internal.gate.closeGate), {
      scopeKey: "tenant:t-1",
      reason: "cut",
      operator: "ops-1",
    });
    closed = true;
  })();
  await Promise.all([...clients.map(writer), close]);
  expect(outcomes).toHaveLength(48);
  const applied = outcomes
    .filter(({ outcome }) => outcome === "applied")
    .map(({ key }) => key)
    .sort();
  expect(applied.length).toBeGreaterThanOrEqual(6);
  expect(
    outcomes.filter(
      ({ sentAfterClose, outcome }) => sentAfterClose && outcome === "applied",
    ),
  ).toEqual([]);
  expect(outcomes.some(({ outcome }) => outcome === "paused")).toBe(true);
  expect(
    (await admin.readTable("receipts"))
      .map(({ requestKey }) => requestKey)
      .sort(),
  ).toEqual(applied);
  expect(
    (await admin.readTable("events", { component: "depot" }))
      .map(({ streamId }) => streamId)
      .sort(),
  ).toEqual(applied);
  expect(await gateAudit(backend, "tenant:t-1")).toMatchObject([
    { kind: "gate.close", operator: "ops-1", reason: "cut" },
  ]);
});
