import {
  getFunctionName,
  makeFunctionReference,
  type PaginationResult,
} from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure } from "../../harness/native.js";
import type { Backend } from "../../harness/backend.js";
import type { CompletionRecord } from "../../harness/admin.js";

const close = (backend: Backend, scopeKey = "tenant:t") =>
  backend.admin.run(getFunctionName(internal.gate.closeGate), {
    scopeKey,
    reason: "repair",
    operator: "closer",
  });
const resume = (backend: Backend, scopeKey = "tenant:t") =>
  backend.admin.run(getFunctionName(internal.gate.resumeGate), {
    scopeKey,
    operator: "resumer",
  });
async function clientFor(backend: Backend, tenantId = "t") {
  const subject = `caller-${tenantId}`;
  for (const permission of ["depot.documents", "depot.stock", "depot.orders"])
    await backend.admin.run(getFunctionName(internal.grants.grant), {
      tenantId,
      principalKind: "human",
      principalId: `${backend.issuer.issuer}|${subject}`,
      permission,
      grantedBy: "setup",
    });
  return ordinaryClient(backend.url, {
    token: await backend.issuer.token(subject),
  });
}
async function expectPaused(
  promise: Promise<unknown>,
  scopeKey: string,
  reason: string,
) {
  const error: unknown = await promise.then(
    () => {
      throw new Error("Expected a write pause");
    },
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<Value>).data).toStrictEqual({
    kind: "transient",
    code: "writePaused",
    message: `write paused for ${scopeKey}: ${reason}`,
  });
}
const document = (tenantId = "t", documentId = "d") => ({
  tenantId,
  requestKey: `key-${documentId}`,
  input: { documentId, title: "Document" },
});
async function stored(backend: Backend) {
  return {
    receipts: await backend.admin.readTable("receipts"),
    events: await backend.admin.readTable("events", { component: "depot" }),
    streams: await backend.admin.readTable("streams", { component: "depot" }),
    rows: await backend.admin.readTable("documentSummaries"),
    audits: await backend.admin.readTable("auditRecords"),
  };
}

// spec:application.write-pause errorCodeWritePaused, fnCloseGate, fnResumeGate, fnGetGateAudit; spec:operations.baseline-operations tableOperatorAudit.
test("native: a closed tenant refuses a public command, another tenant writes, and each operator change is readable through getGateAudit", async () => {
  const backend = await fixtureBackend();
  const first = await clientFor(backend);
  const other = await clientFor(backend, "other");
  await close(backend);
  const before = await stored(backend);
  await expectPaused(
    first.mutation(api.depotCommands.createDocument, document()),
    "tenant:t",
    "repair",
  );
  expect(await stored(backend)).toEqual(before);
  expect(
    await other.mutation(api.depotCommands.createDocument, document("other")),
  ).toMatchObject({ kind: "applied", replayed: false });
  await resume(backend);
  expect(
    await first.mutation(api.depotCommands.createDocument, document()),
  ).toMatchObject({ kind: "applied", replayed: false });
  const audit = (await backend.admin.run(
    getFunctionName(internal.gate.getGateAudit),
    { scopeKey: "tenant:t", paginationOpts: { numItems: 100, cursor: null } },
  )) as unknown as PaginationResult<Record<string, Value>>;
  expect(audit.isDone).toBe(true);
  expect(audit.page).toEqual([
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "gate.resume",
      scopeKey: "tenant:t",
      reason: "repair",
      operator: "resumer",
      recordedAt: expect.any(Number),
    },
    {
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      kind: "gate.close",
      scopeKey: "tenant:t",
      reason: "repair",
      operator: "closer",
      recordedAt: expect.any(Number),
    },
  ]);
});

// spec:application.write-pause restoreDoor, errorCodeWritePaused, Contract "The restore door is read before the gate document"; spec:command.command-pipeline gateRead.
test("native: setting restore on the running backend refuses every declared command route without a deploy and clearing it admits the same keys", async () => {
  const backend = await fixtureBackend();
  const client = await clientFor(backend);
  await backend.admin.run(getFunctionName(internal.readModels.activate), {
    readModel: "documentSummary",
    startedBy: { kind: "operator", id: "setup" },
  });
  type Write = {
    name: string;
    input: Record<string, Value>;
    internal: boolean;
    requestKey: string;
  };
  const writes: Write[] = [];
  for (const internalRoute of [false, true]) {
    const suffix = internalRoute ? "internal" : "public";
    for (const id of [`submit-${suffix}`, `ship-${suffix}`, `amend-${suffix}`])
      await client.mutation(
        api.depotCommands.createDocument,
        document("t", id),
      );
    await client.mutation(api.depotCommands.submitDocument, {
      tenantId: "t",
      input: { documentId: `ship-${suffix}`, expectedVersion: 1 },
    });
    await client.mutation(api.depotCommands.addStock, {
      tenantId: "t",
      input: { lines: [{ productId: `stock-${suffix}`, quantity: 10 }] },
    });
    const cases: [string, Record<string, Value>][] = [
      [
        "depotCommands:createDocument",
        { documentId: `create-${suffix}`, title: "Document" },
      ],
      [
        "depotCommands:createSummarizedDocument",
        { documentId: `summary-${suffix}`, title: "Document" },
      ],
      [
        "depotCommands:submitDocument",
        { documentId: `submit-${suffix}`, expectedVersion: 1 },
      ],
      [
        "depotCommands:shipDocument",
        { documentId: `ship-${suffix}`, expectedVersion: 2 },
      ],
      [
        "depotCommands:amendDocument",
        { documentId: `amend-${suffix}`, title: "Changed", expectedVersion: 1 },
      ],
      [
        "depotCommands:registerDocument",
        {
          documentId: `register-${suffix}`,
          reference: `reference-${suffix}`,
          title: "Document",
        },
      ],
      [
        "depotCommands:addStock",
        { lines: [{ productId: `added-${suffix}`, quantity: 1 }] },
      ],
      [
        "depotCommands:claimStock",
        { lines: [{ productId: `stock-${suffix}`, quantity: 1 }] },
      ],
      [
        "orders:placeOrder",
        {
          orderId: `order-${suffix}`,
          title: "Order",
          lines: [{ productId: `stock-${suffix}`, quantity: 1 }],
        },
      ],
    ];
    for (const [name, input] of cases)
      writes.push({
        name: name + (internalRoute ? "Internal" : ""),
        input,
        internal: internalRoute,
        requestKey: `${suffix}-${name}`,
      });
  }
  function send(write: Write) {
    const args = {
      tenantId: "t",
      input: write.input,
      requestKey: write.requestKey,
    };
    return write.internal
      ? backend.admin.run(write.name, {
          ...args,
          namespace: "worker",
          actor: { kind: "human", id: `${backend.issuer.issuer}|caller-t` },
        })
      : client.mutation(makeFunctionReference<"mutation">(write.name), args);
  }
  await backend.admin.setEnvironment({ MAINTENANCE_MODE: "restore" });
  const before = await stored(backend);
  for (const write of writes) await expectPaused(send(write), "all", "restore");
  expect(
    await backend.admin.run(getFunctionName(internal.gate.getGate), {}),
  ).toEqual({ restore: true, closed: [] });
  // Even the command whose decider always fails must be stopped before it executes.
  await expectPaused(
    client.mutation(api.depotCommands.failIfDecided, {
      tenantId: "t",
      input: { documentId: "amend-public", expectedVersion: 1 },
    }),
    "all",
    "restore",
  );
  expect(await stored(backend)).toEqual(before);
  await backend.admin.setEnvironment({ MAINTENANCE_MODE: "" });
  expect(
    await backend.admin.run(getFunctionName(internal.gate.getGate), {}),
  ).toEqual({ restore: false, closed: [] });
  for (const write of writes)
    expect(await send(write)).toMatchObject({
      kind: "applied",
      replayed: false,
    });
});

// spec:application.write-pause occSerialization, Contract "Background writers are fenced, not drained".
test("native: two independent writers race a close and no successful command completes beyond the close", async () => {
  const backend = await fixtureBackend();
  const one = await clientFor(backend);
  const two = ordinaryClient(backend.url, {
    token: await backend.issuer.token("caller-t"),
  });
  const identifier = getFunctionName(api.depotCommands.createDocument);
  const closeIdentifier = getFunctionName(internal.gate.closeGate);
  let overlapping = 0;
  for (let trial = 0; trial < 8; trial++) {
    const mark = await backend.admin.logMark();
    const settled = await Promise.allSettled([
      one.mutation(
        api.depotCommands.createDocument,
        document("t", `one-${trial}`),
      ),
      two.mutation(
        api.depotCommands.createDocument,
        document("t", `two-${trial}`),
      ),
      close(backend),
    ]);
    expect(settled[2]?.status).toBe("fulfilled");
    for (const result of settled.slice(0, 2)) {
      if (result.status === "fulfilled")
        expect(result.value).toMatchObject({ kind: "applied" });
      else
        await expectPaused(Promise.reject(result.reason), "tenant:t", "repair");
    }
    const records = await backend.admin.completionsSince(
      mark,
      (rows) =>
        rows.filter(
          (row) =>
            row.componentPath === null &&
            (row.identifier === identifier ||
              row.identifier === closeIdentifier),
        ).length >= 3,
    );
    const closeRecord = records.find(
      (row) => row.identifier === closeIdentifier && row.componentPath === null,
    );
    expect(closeRecord).toBeDefined();
    const commands = records.filter(
      (row) => row.identifier === identifier && row.componentPath === null,
    );
    expect(commands).toHaveLength(2);
    for (const command of commands) {
      if (command.error === null)
        expect(command.timestamp).toBeLessThanOrEqual(closeRecord!.timestamp);
      if (overlap(command, closeRecord!)) overlapping++;
    }
    const cut = await stored(backend);
    await expectPaused(
      one.mutation(
        api.depotCommands.createDocument,
        document("t", `after-${trial}`),
      ),
      "tenant:t",
      "repair",
    );
    expect(await stored(backend)).toEqual(cut);
    await resume(backend);
  }
  measure(
    "commands overlapping the gate close by completion interval",
    overlapping,
  );
  // Without an overlapping invocation this run cannot witness the concurrency obligation.
  expect(overlapping).toBeGreaterThan(0);
});
function overlap(a: CompletionRecord, b: CompletionRecord) {
  return (
    a.timestamp - a.executionTime < b.timestamp &&
    b.timestamp - b.executionTime < a.timestamp
  );
}
