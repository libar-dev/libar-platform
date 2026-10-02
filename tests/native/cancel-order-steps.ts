// The steps of spec:application.orders-inventory-example's example space, shared by its native
// examples. They run CancelOrder on the production composition: admin access seeds the grants, runs
// the order summary's first activation and, for one example, calls the Inventory context's release
// operation as setup, and reads stored documents and the function log; every command and query is sent
// by an ordinary client whose token the fixture issuer signs.
import type { ConvexHttpClient } from "convex/browser";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { api } from "../../example/convex/_generated/api.js";
import { cancelOrderPermission } from "../../example/convex/ordering.js";
import type { CompletionRecord, LogMark } from "../../harness/admin.js";
import { ordinaryClient } from "../../harness/clients.js";
import { required } from "../../harness/native.js";
import {
  changedDocuments,
  grant,
  line,
  orderWorld,
  permissions,
  receiveStock,
  stored,
  tenantId,
  type OrderWorld,
  type Stored,
} from "./order-use-case.js";
export const stockItemId = "sku-1";
export const orderId = "order-1";
// The order ID a cancel of an order never placed names.
export const neverPlaced = "order-2";
// A second user of the fixture issuer, who holds every grant of the composition except orders.cancel.
const lackingUser = "user-2";
export const cancelOrderIdentifier = getFunctionName(api.ordering.cancelOrder);
type CancelResponse = FunctionReturnType<typeof api.ordering.cancelOrder>;
type PlaceResponse = FunctionReturnType<typeof api.ordering.placeOrder>;
export interface CancelWorld {
  order?: OrderWorld;
  ordered?: number;
  // The stock item's stream row as it was before PlaceOrder allocated.
  stockBefore?: Record<string, Value>;
  placed?: PlaceResponse;
  // The cancel a Given step sent under k-1.
  first?: CancelResponse;
  target?: string;
  key?: string;
  before?: Stored;
  mark?: LogMark;
  response?: CancelResponse;
  error?: unknown;
}
const backendOf = (world: CancelWorld) =>
  required(world.order, "the backend").backend;
async function stockRow(world: CancelWorld) {
  const rows = await backendOf(world).admin.readTable("streams", {
    component: "inventory",
  });
  return required(
    rows.find((row) => row["streamId"] === stockItemId),
    "the stock item's stream row",
  );
}
export const stockState = async (world: CancelWorld) =>
  (await stockRow(world))["state"] as { onHand: number; allocated: number };
export async function unitsReceived(world: CancelWorld, onHand: number) {
  world.order = await orderWorld();
  await receiveStock(world.order, [{ stockItemId, quantity: onHand }]);
}
// Two lines on the one stock item, of ordered less one and of one unit, which Inventory sums.
export async function orderPlaced(world: CancelWorld, ordered: number) {
  const order = required(world.order, "the backend");
  if (ordered < 2) throw new Error("Two lines need at least two units");
  world.stockBefore = await stockRow(world);
  world.placed = await order.client.mutation(api.ordering.placeOrder, {
    tenantId,
    requestKey: "k-place",
    input: {
      orderId,
      lines: [line(stockItemId, ordered - 1, 250), line(stockItemId, 1, 999)],
    },
  });
  expect(world.placed).toMatchObject({ kind: "applied", replayed: false });
  world.ordered = ordered;
}
export async function orderBefore(
  world: CancelWorld,
  before:
    | "is cancelled under request key k-1"
    | "has its units released by Inventory alone",
) {
  const order = required(world.order, "the backend");
  if (before === "is cancelled under request key k-1") {
    world.first = await order.client.mutation(api.ordering.cancelOrder, {
      tenantId,
      requestKey: "k-1",
      input: { orderId },
    });
    expect(world.first).toMatchObject({ kind: "applied", replayed: false });
    return;
  }
  // No command releases stock without cancelling its order, so the setup calls the Inventory
  // context's own operation with admin access; its state stays the fold of its events.
  const outcome = await order.backend.admin.run(
    "operations:release",
    {
      tenantId,
      actor: { kind: "operator", id: "native-test" },
      operation: {
        operationId: "setup-release",
        causedBy: { kind: "command", commandType: "Setup" },
      },
      input: {
        orderId,
        lines: [
          { stockItemId, quantity: required(world.ordered, "the order") },
        ],
      },
    },
    { component: "inventory" },
  );
  expect(outcome).toMatchObject({ kind: "applied" });
}
async function lackingClient(order: OrderWorld): Promise<ConvexHttpClient> {
  for (const permission of permissions)
    if (permission !== cancelOrderPermission)
      await grant(order.backend, lackingUser, permission);
  return ordinaryClient(order.backend.url, {
    token: await order.backend.issuer.token(lackingUser),
  });
}
export async function cancelSent(
  world: CancelWorld,
  {
    grant: holds,
    target,
    key,
  }: {
    grant: "holding" | "lacking";
    target: "that order" | "an order never placed";
    key: string;
  },
) {
  const order = required(world.order, "the backend");
  const client =
    holds === "holding" ? order.client : await lackingClient(order);
  world.target = target === "that order" ? orderId : neverPlaced;
  world.key = key;
  world.before = await stored(order);
  world.mark = await order.backend.admin.logMark();
  try {
    world.response = await client.mutation(api.ordering.cancelOrder, {
      tenantId,
      requestKey: key,
      input: { orderId: world.target },
    });
  } catch (error) {
    world.error = error;
  }
}
export function callerReceives(
  world: CancelWorld,
  response: "the result" | "the receipt's answer" | "the rejection",
) {
  if (response === "the rejection") {
    expect(world.response).toBeUndefined();
    expect(world.error).toBeInstanceOf(ConvexError);
    expect(rejectionData(world)).toMatchObject({
      kind: "rejection",
      commandType: "CancelOrder",
    });
    return;
  }
  expect(world.error).toBeUndefined();
  if (response === "the result") {
    expect(world.response).toMatchObject({ kind: "applied", replayed: false });
    return;
  }
  const first = required(world.first, "the first cancel");
  expect(world.response).toEqual({
    kind: "applied",
    result: null,
    operationId: first.operationId,
    affected: first.affected,
    versions: first.versions,
    replayed: true,
  });
}
export const rejectionData = (world: CancelWorld) =>
  (world.error as ConvexError<Record<string, Value>>).data;
export function rejectionCodeIs(world: CancelWorld, code: string) {
  expect(rejectionData(world)["code"]).toBe(code);
}
export async function allocatedIs(world: CancelWorld, allocated: number) {
  expect((await stockState(world)).allocated).toBe(allocated);
}
// The table holds the one summary row of the order placed, whatever order the cancel named.
export async function summaryStatusIs(
  world: CancelWorld,
  status: "placed" | "cancelled",
) {
  const rows = await backendOf(world).admin.readTable("orderSummaries");
  expect(rows).toMatchObject([{ key: orderId, status }]);
}
export async function writtenIs(world: CancelWorld, written: number) {
  const after = await stored(required(world.order, "the backend"));
  expect(
    changedDocuments(required(world.before, "the stored documents"), after),
  ).toBe(written);
}
// The function log's records of the one request that ran CancelOrder after the mark.
export async function cancelRequest(world: CancelWorld): Promise<{
  record: CompletionRecord;
  request: CompletionRecord[];
}> {
  const own = (entry: { identifier: string; componentPath: string | null }) =>
    entry.identifier === cancelOrderIdentifier && entry.componentPath === null;
  const records = await backendOf(world).admin.completionsSince(
    required(world.mark, "the log mark"),
    (entries) => entries.some(own),
  );
  const record = required(records.find(own), "the command's completion record");
  return {
    record,
    request: records.filter((entry) => entry.requestId === record.requestId),
  };
}
// Every step of the example space, for an example to bind the ones its fence names.
export const steps = {
  "{onHand} units of a stock item received through ReceiveStock": (
    world: CancelWorld,
    { onHand }: { onHand: number },
  ) => unitsReceived(world, onHand),
  "an order placed for {ordered} of them over two lines": (
    world: CancelWorld,
    { ordered }: { ordered: number },
  ) => orderPlaced(world, ordered),
  "the order {before}": (
    world: CancelWorld,
    {
      before,
    }: {
      before:
        | "is cancelled under request key k-1"
        | "has its units released by Inventory alone";
    },
  ) => orderBefore(world, before),
  "a caller {grant} the permission orders.cancel sends CancelOrder for {target} under request key {key}":
    (
      world: CancelWorld,
      params: {
        grant: "holding" | "lacking";
        target: "that order" | "an order never placed";
        key: string;
      },
    ) => cancelSent(world, params),
  "the caller receives {response}": (
    world: CancelWorld,
    {
      response,
    }: { response: "the result" | "the receipt's answer" | "the rejection" },
  ) => callerReceives(world, response),
  "the rejection code is {code}": (
    world: CancelWorld,
    { code }: { code: string },
  ) => rejectionCodeIs(world, code),
  "the stock item's quantity allocated is {allocated}": (
    world: CancelWorld,
    { allocated }: { allocated: number },
  ) => allocatedIs(world, allocated),
  "the order summary's status is {status}": (
    world: CancelWorld,
    { status }: { status: "placed" | "cancelled" },
  ) => summaryStatusIs(world, status),
  "the number of documents the command wrote is {written}": (
    world: CancelWorld,
    { written }: { written: number },
  ) => writtenIs(world, written),
};
