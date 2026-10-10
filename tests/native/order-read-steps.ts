// The steps of spec:application.read-models' examples in which a caller reads an order through the
// parent query getOrder on the production composition: an order placed by a user granted every
// permission, then a caller with no identity or with an identity and no grant in the tenant. Admin
// access only gives grants and reads tables.
import type { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect, onTestFinished } from "vitest";
import { api } from "../../example/convex/_generated/api.js";
import { readOrdersPermission } from "../../example/convex/readModels.js";
import {
  ordinaryClient,
  ordinarySocketClient,
  watchQuery,
} from "../../harness/clients.js";
import { required } from "../../harness/native.js";
import { classifyThrown } from "../../src/command/index.js";
import {
  caught,
  grant,
  line,
  orderWorld,
  receiveStock,
  tenantId,
  type OrderWorld,
} from "./order-use-case.js";
type Response = FunctionReturnType<typeof api.ordering.placeOrder>;
export type Caller =
  "with no identity" | "with an identity and no grant in the tenant";
export interface ReadWorld {
  order?: OrderWorld;
  placed?: Response;
  receiptsBefore?: number;
  caller?: Caller;
  client?: ConvexHttpClient;
  errors?: unknown[];
}
const orderId = "order-1";
const lines = [line("sku-1", 1, 250)];
const stranger = "user-2";
const args = { tenantId, orderId };
const receipts = async (world: ReadWorld) =>
  (
    await required(world.order, "the backend").backend.admin.readTable(
      "receipts",
    )
  ).length;
// The order is placed with a request key, so the command's own receipt exists before the read.
export async function orderPlaced(world: ReadWorld) {
  const order = await orderWorld();
  world.order = order;
  await receiveStock(order, [{ stockItemId: "sku-1", quantity: 1 }]);
  world.placed = await order.client.mutation(api.ordering.placeOrder, {
    tenantId,
    requestKey: "k-1",
    input: { orderId, lines },
  });
  expect(world.placed).toMatchObject({ kind: "applied", replayed: false });
  world.receiptsBefore = await receipts(world);
}
export async function callerIs(world: ReadWorld, caller: Caller) {
  const { backend } = required(world.order, "the backend");
  world.caller = caller;
  world.client =
    caller === "with no identity"
      ? ordinaryClient(backend.url)
      : ordinaryClient(backend.url, {
          token: await backend.issuer.token(stranger),
        });
}
// The caller with no identity also subscribes, from a socket client with no token.
export async function readsTheOrder(world: ReadWorld, action: string) {
  if (action !== "the caller reads the order through the parent")
    throw new Error(`This test binds a read of the order through the parent`);
  const client = required(world.client, "the caller's client");
  world.errors = [await caught(client.query(api.orderQueries.getOrder, args))];
  if (world.caller === "with no identity") {
    const { backend } = required(world.order, "the backend");
    const socket = ordinarySocketClient(backend.url);
    onTestFinished(() => socket.close());
    const watch = watchQuery(socket, api.orderQueries.getOrder, args);
    world.errors.push(
      await caught(watch.until(() => true, "the subscription's refusal")),
    );
  }
}
export function readThrows(world: ReadWorld, code: string) {
  const errors = required(world.errors, "the read's errors");
  for (const error of errors) {
    expect(error).toBeInstanceOf(ConvexError);
    expect(classifyThrown(error).kind).toBe("rejection");
    expect((error as ConvexError<Value>).data).toMatchObject({
      kind: "rejection",
      code,
      entry: "getOrder",
    });
  }
  expect((errors[0] as ConvexError<Value>).data).toEqual(
    code === "unauthenticated"
      ? {
          kind: "rejection",
          code,
          entry: "getOrder",
          message: "getOrder needs an authenticated caller",
        }
      : {
          kind: "rejection",
          code,
          entry: "getOrder",
          message: "The caller may not read getOrder in this tenant",
          details: { reason: "no_grant" },
        },
  );
}
// The read wrote no receipt. A caller granted orders.read then reads the order's DTO: the user who
// placed it, or, for the caller with an identity, the same caller once granted.
export async function receiptsWritten(world: ReadWorld, count: number) {
  expect(
    (await receipts(world)) - required(world.receiptsBefore, "the receipts"),
  ).toBe(count);
  const order = required(world.order, "the backend");
  let reader = order.client;
  if (world.caller === "with an identity and no grant in the tenant") {
    await grant(order.backend, stranger, readOrdersPermission);
    reader = required(world.client, "the caller's client");
  }
  const placed = required(world.placed, "the placed order");
  expect(await reader.query(api.orderQueries.getOrder, args)).toEqual({
    orderId,
    status: "placed",
    lines,
    total: 250,
    placedAt: expect.any(Number),
    version: placed.versions.find(({ contextId }) => contextId === "orders"),
  });
}
