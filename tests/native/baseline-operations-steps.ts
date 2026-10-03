import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { expect } from "vitest";
import { api } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import {
  auditFaultOrderId,
  sinkFaultTenant,
  orderPermission,
} from "../../fixture/convex/orders.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, required } from "../../harness/native.js";
import { classifyThrown } from "../../src/command/index.js";

type Answer = FunctionReturnType<typeof api.orders.placeOrder>;
export interface AuditWorld {
  backend?: Backend;
  client?: ReturnType<typeof ordinaryClient>;
  tenantId?: string;
  orderId?: string;
  before?: Awaited<ReturnType<typeof tables>>;
  answer?: Answer;
  error?: unknown;
  completion?: CompletionRecord;
}
async function tables(backend: Backend) {
  return {
    events: await backend.admin.readTable("events", { component: "depot" }),
    streams: await backend.admin.readTable("streams", { component: "depot" }),
    receipts: await backend.admin.readTable("receipts"),
    audits: await backend.admin.readTable("auditRecords"),
  };
}
export async function prepare(world: AuditWorld, audit: string) {
  expect(audit).toBe("a mandatory audit record");
  const backend = await fixtureBackend();
  world.backend = backend;
  expect(sinkFaultTenant).toBe("tenant-sink-fault");
  expect(auditFaultOrderId).toBe("order-audit-fault");
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-1"),
  });
  world.client = client;
  for (const tenantId of ["tenant-all-1", sinkFaultTenant]) {
    for (const permission of [orderPermission, permissions.stock])
      await backend.admin.run("grants:grant", {
        tenantId,
        principalKind: "human",
        principalId: `${backend.issuer.issuer}|user-1`,
        permission,
        grantedBy: "operator",
      });
    await client.mutation(api.depotCommands.addStock, {
      tenantId,
      input: { lines: [{ productId: "p-1", quantity: 10 }] },
    });
  }
}
export function select(world: AuditWorld, subsystem: string) {
  expect(["mandatory audit", "metrics and logging"]).toContain(subsystem);
  world.tenantId =
    subsystem === "mandatory audit" ? "tenant-all-1" : sinkFaultTenant;
  world.orderId =
    subsystem === "mandatory audit" ? auditFaultOrderId : "order-all-1";
}
async function send(
  world: AuditWorld,
  tenantId: string,
  orderId: string,
  requestKey: string,
) {
  const backend = required(world.backend, "backend");
  const mark = await backend.admin.logMark();
  let answer: Answer | undefined;
  let error: unknown;
  try {
    answer = await required(world.client, "client").mutation(
      api.orders.placeOrder,
      {
        tenantId,
        requestKey,
        input: {
          orderId,
          title: "Order",
          lines: [{ productId: "p-1", quantity: 1 }],
        },
      },
    );
  } catch (thrown) {
    error = thrown;
  }
  const own = (record: CompletionRecord) =>
    record.identifier === "orders:placeOrder" && record.componentPath === null;
  const records = await backend.admin.completionsSince(mark, (entries) =>
    entries.some(own),
  );
  return {
    answer,
    error,
    completion: required(records.find(own), "PlaceOrder completion"),
  };
}
export async function run(world: AuditWorld) {
  world.before = await tables(required(world.backend, "backend"));
  Object.assign(
    world,
    await send(
      world,
      required(world.tenantId, "tenant"),
      required(world.orderId, "order"),
      "all-1-key",
    ),
  );
}
export async function assertResult(world: AuditWorld, result: string) {
  const after = await tables(required(world.backend, "backend"));
  if (result === "rolls back") {
    expect(world.answer).toBeUndefined();
    expect(after).toEqual(required(world.before, "tables before command"));
    return;
  }
  expect(result).toBe("commits");
  expect(world.error).toBeUndefined();
  expect(world.answer).toMatchObject({ kind: "applied", replayed: false });
  const { operationId } = world.answer as { operationId: string };
  const events = after.events.filter(
    (event) => event.operationId === operationId,
  );
  expect(events).toHaveLength(2);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        streamType: "document",
        streamId: "order-all-1",
      }),
      expect.objectContaining({ streamType: "stock", streamId: "p-1" }),
    ]),
  );
  expect(after.events).toHaveLength(
    required(world.before, "tables before command").events.length + 2,
  );
  expect(after.receipts).toEqual([
    expect.objectContaining({
      requestKey: "all-1-key",
      operationId,
      outcome: "applied",
    }),
  ]);
  expect(after.audits).toEqual([
    expect.objectContaining({
      tenantId: "tenant-sink-fault",
      operationId,
      requestKey: "all-1-key",
      commandType: "PlaceOrder",
      kind: "business",
      decision: "applied",
      subject: {
        contextId: "depot",
        streamType: "document",
        streamId: "order-all-1",
      },
    }),
  ]);
}
export async function assertFailure(world: AuditWorld, surfaced: string) {
  const record = required(world.completion, "completion");
  const diagnostics = record.logLines.filter((line) =>
    line.includes("diagnostic {"),
  );
  const gaps = record.logLines.filter((line) =>
    line.includes("diagnostic gap"),
  );
  if (surfaced === "returned to the caller as a technical failure") {
    expect(world.error).toBeInstanceOf(Error);
    expect(world.error).not.toBeInstanceOf(ConvexError);
    expect(classifyThrown(world.error).kind).toBe("technical");
    expect(record.error).toContain("auditRecords");
    expect(record.error).toContain("auditFault");
    expect(diagnostics).toHaveLength(1);
    for (const text of ["technical", "tenant-all-1", "all-1-key"])
      expect(diagnostics[0]).toContain(text);
    expect(diagnostics[0]).not.toContain("operationId");
    expect(gaps).toEqual([]);
  } else {
    expect(surfaced).toBe(
      "reported as a diagnostic gap without touching the write",
    );
    expect(record.error).toBeNull();
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain(
      (world.answer as { operationId: string }).operationId,
    );
    expect(gaps[0]).toContain("applied");
    expect(diagnostics).toEqual([]);
  }
  const control = await send(
    world,
    "tenant-all-1",
    "order-control",
    "all-1-control",
  );
  expect(control.error).toBeUndefined();
  expect(control.answer).toMatchObject({ kind: "applied", replayed: false });
  const operationId = (control.answer as { operationId: string }).operationId;
  const audits = (await tables(required(world.backend, "backend"))).audits;
  expect(audits).toHaveLength(
    surfaced === "returned to the caller as a technical failure" ? 1 : 2,
  );
  expect(audits.filter((row) => row.operationId === operationId)).toEqual([
    expect.objectContaining({ operationId, decision: "applied" }),
  ]);
  expect(control.completion.error).toBeNull();
  const lines = control.completion.logLines.filter((line) =>
    line.includes("diagnostic {"),
  );
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain(operationId);
  expect(lines[0]).toContain("applied");
  expect(
    control.completion.logLines.filter((line) =>
      line.includes("diagnostic gap"),
    ),
  ).toEqual([]);
}
