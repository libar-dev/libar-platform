import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { secondContextRejectsContract as contract } from "../../generated/contracts/application.parent-use-cases.second-context-rejects.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import { required } from "../../harness/native.js";
import type { LogMark } from "../../harness/admin.js";
import {
  caught,
  changedDocuments,
  line,
  orderWorld,
  receiveStock,
  stored,
  tenantId,
  type OrderWorld,
  type Stored,
} from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId("test:application.parent-use-cases.second-context-rejects"),
  verifies: ref("spec:application.parent-use-cases.second-context-rejects"),
});
void anchor;
// PlaceOrder on the production composition calls Orders, which records the order, and then
// Inventory, which refuses a line that asks for more stock than is on hand. The refusal is the
// kernel's bare Rejection thrown in Inventory's sub-transaction, and the whole mutation throws it.
interface World {
  order?: OrderWorld;
  contexts?: number;
  before?: Stored;
  mark?: LogMark;
  error?: unknown;
}
const placeOrderIdentifier = "ordering:placeOrder";
const orderId = "order-1";
const call = {
  tenantId,
  requestKey: "k-1",
  input: { orderId, lines: [line("sku-1", 3, 250)] },
};
// The function log's records of the one request that ran PlaceOrder after the mark.
async function placeOrderRequest(world: World) {
  const { backend } = required(world.order, "the backend");
  const own = (entry: { identifier: string; componentPath: string | null }) =>
    entry.identifier === placeOrderIdentifier && entry.componentPath === null;
  const records = await backend.admin.completionsSince(
    required(world.mark, "the log mark"),
    (entries) => entries.some(own),
  );
  const record = required(records.find(own), "the command's completion record");
  return {
    record,
    request: records.filter((entry) => entry.requestId === record.requestId),
  };
}
bindExample(contract, (): World => ({}), {
  "a use case that calls {contexts} contexts in one mutation": async (
    world,
    { contexts },
  ) => {
    world.order = await orderWorld();
    world.contexts = contexts;
  },
  // Two units of stock are on hand, and the order asks for three of them. Orders accepts the order
  // before Inventory decides on the stock.
  "the first context has written its state and events": async (world) => {
    const order = required(world.order, "the backend");
    await receiveStock(order, [{ stockItemId: "sku-1", quantity: 2 }]);
    world.before = await stored(order);
  },
  "the second context {secondOutcome}": async (world, { secondOutcome }) => {
    if (secondOutcome !== "rejects")
      throw new Error(`This test binds a second context that rejects`);
    const { backend, client } = required(world.order, "the backend");
    world.mark = await backend.admin.logMark();
    world.error = await caught(client.mutation(api.ordering.placeOrder, call));
  },
  // The backend recorded the request's one top-level mutation as failed, with no document written,
  // and the Orders context holds no stream and no event of the order.
  "the mutation {commit}": async (world, { commit }) => {
    expect(commit).toBe("rolls back");
    const { record, request } = await placeOrderRequest(world);
    expect(request).toHaveLength(1);
    expect(record.error).toMatch(/^Uncaught ConvexError: /);
    expect(record.usageStats["databaseWriteDocuments"]).toBe(0);
    const after = await stored(required(world.order, "the backend"));
    expect(
      after["orders.streams"]?.filter((row) => row["streamId"] === orderId),
    ).toEqual([]);
    expect(
      after["orders.events"]?.filter((row) => row["streamId"] === orderId),
    ).toEqual([]);
  },
  "the caller receives {response}": (world, { response }) => {
    expect(response).toBe("the rejection");
    expect(world.error).toBeInstanceOf(ConvexError);
    expect((world.error as ConvexError<Value>).data).toEqual({
      kind: "rejection",
      code: "insufficientStock",
      entry: "PlaceOrder",
      message: "Cannot allocate 3 when 2 are available",
      details: { requested: 3, available: 2 },
    });
  },
  // Nothing of the attempt is stored: no receipt for the key, no order, no summary, no stock change.
  // The missing unit then arrives, and the same command and key are applied, as one mutation that
  // writes both contexts.
  "the number of stored receipts, events and state changes is {stored}": async (
    world,
    { stored: count },
  ) => {
    const order = required(world.order, "the backend");
    const after = await stored(order);
    expect(
      changedDocuments(required(world.before, "the stored documents"), after),
    ).toBe(count);
    expect(
      after["receipts"]?.filter((row) => row["requestKey"] === call.requestKey),
    ).toEqual([]);
    expect(after["orderSummaries"]).toEqual([]);
    await receiveStock(order, [{ stockItemId: "sku-1", quantity: 1 }]);
    world.mark = await order.backend.admin.logMark();
    const response = await order.client.mutation(api.ordering.placeOrder, call);
    expect(response).toMatchObject({
      kind: "applied",
      replayed: false,
      result: { orderId, lineCount: 1, total: 750 },
    });
    const contexts = new Set(
      response.versions.map(({ contextId }) => contextId),
    );
    expect(contexts).toEqual(new Set(["orders", "inventory"]));
    expect(contexts.size).toBe(required(world.contexts, "the contexts"));
    const { request } = await placeOrderRequest(world);
    expect(request).toHaveLength(1);
    const applied = await stored(order);
    expect(applied["receipts"]).toMatchObject([
      { requestKey: call.requestKey, operationId: response.operationId },
    ]);
    expect(applied["orders.streams"]).toMatchObject([
      {
        streamId: orderId,
        streamVersion: 1,
        lastOperationId: response.operationId,
      },
    ]);
    expect(applied["orderSummaries"]).toMatchObject([{ key: orderId }]);
  },
});
