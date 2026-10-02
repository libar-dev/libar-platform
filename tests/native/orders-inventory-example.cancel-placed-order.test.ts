import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { cancelPlacedOrderContract as contract } from "../../generated/contracts/application.orders-inventory-example.cancel-placed-order.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import { required } from "../../harness/native.js";
import {
  cancelRequest,
  orderId,
  stockItemId,
  stockState,
  steps,
  type CancelWorld,
} from "./cancel-order-steps.js";
import { tenantId } from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.orders-inventory-example.cancel-placed-order",
  ),
  verifies: ref(
    "spec:application.orders-inventory-example.cancel-placed-order",
  ),
});
void anchor;
// CancelOrder on the production composition cancels order-1 in Orders and then releases its two
// lines, summed, on sku-1 in Inventory: one mutation, one receipt, and the summary row replaced.
bindExample(
  contract,
  (): CancelWorld => ({}),
  steps,
  async (world) => {
    const order = required(world.order, "the backend");
    const response = required(world.response, "the response");
    // The stock item's totals are what they were before PlaceOrder allocated.
    const before = required(world.stockBefore, "the stock before the order");
    expect(await stockState(world)).toEqual(before["state"]);
    expect(await stockState(world)).toEqual({ onHand: 5, allocated: 0 });
    const orderVersion = {
      tenantId,
      contextId: "orders",
      streamType: "order",
      streamId: orderId,
      version: 2,
    };
    expect(response).toMatchObject({
      kind: "applied",
      replayed: false,
      result: { orderId, released: [{ stockItemId, quantity: 3 }] },
      versions: [
        orderVersion,
        {
          tenantId,
          contextId: "inventory",
          streamType: "stockItem",
          streamId: stockItemId,
          version: 3,
        },
      ],
    });
    const ofOperation = async (component: string) =>
      (await order.backend.admin.readTable("events", { component })).filter(
        (row) => row["operationId"] === response.operationId,
      );
    expect(await ofOperation("orders")).toMatchObject([
      { eventType: "OrderCancelled", streamId: orderId, payload: {} },
    ]);
    expect(await ofOperation("inventory")).toMatchObject([
      {
        eventType: "AllocationReleased",
        streamId: stockItemId,
        payload: { orderId, quantity: 3 },
      },
    ]);
    expect(
      (await order.backend.admin.readTable("receipts")).filter(
        (row) => row["requestKey"] === "k-1",
      ),
    ).toMatchObject([{ operationId: response.operationId }]);
    expect(await order.backend.admin.readTable("orderSummaries")).toMatchObject(
      [
        {
          key: orderId,
          sourceVersions: [orderVersion],
          lineCount: 2,
          total: 1499,
        },
      ],
    );
    // The command ran as one top-level mutation, which committed.
    const { record, request } = await cancelRequest(world);
    expect(request).toHaveLength(1);
    expect(record.error).toBeNull();
    // The parent reads the cancelled order with what it was placed with, and lists it by its status.
    const placed = await order.client.query(api.orderQueries.getOrder, {
      tenantId,
      orderId,
    });
    expect(placed).toMatchObject({
      orderId,
      status: "cancelled",
      lines: [
        { stockItemId, quantity: 2, unitPrice: 250 },
        { stockItemId, quantity: 1, unitPrice: 999 },
      ],
      total: 1499,
      version: orderVersion,
    });
    const list = (status: "placed" | "cancelled") =>
      order.client.query(api.readModels.listOrderSummaries, {
        tenantId,
        status,
        paginationOpts: { cursor: null, numItems: 10 },
      });
    expect((await list("cancelled")).page).toMatchObject([
      { orderId, status: "cancelled", placedAt: placed?.placedAt },
    ]);
    expect((await list("placed")).page).toEqual([]);
  },
);
