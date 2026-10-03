// The largest row of the order allocation history measures 55,803 bytes with getConvexSize, within
// the row budget the view declares, the ceiling of 65,536
// (spec:application.history-projection#design.tableOrderAllocationHistory). The row is the stored
// document: the row conventions every read-model row carries
// (spec:application.projection-contract#design.validatorRowConventions) beside the fields the fold
// writes, with the tenant and order IDs at their bound, the most stock items an order names, each
// ID at the example's bound, and every allocation released.
import { getConvexSize, type ObjectType } from "convex/values";
import { expect, test } from "vitest";
import { journal as inventoryJournal } from "../../example/convex/inventory/streams.js";
import { maxOrderLines } from "../../example/convex/ordering.js";
import { journal as ordersJournal } from "../../example/convex/orders/streams.js";
import { maxStockItemIdBytes } from "../../example/convex/receiving.js";
import {
  orderDecider,
  stockItemDecider,
  type OrderEvent,
  type StockItemEvent,
} from "../../example/domain/index.js";
import {
  projectOrderAllocationHistory,
  type HistoryEvent,
  type OrderAllocationHistoryFields,
} from "../../example/domain/orderAllocationHistory.js";
import { limitIdLength, utf8Length } from "../../src/command/index.js";
import type { StreamVersion } from "../../src/kernel/index.js";
import {
  limitRowBudgetBytes,
  rowConventions,
} from "../../src/read-model/index.js";
const tenantId = "t".padEnd(limitIdLength, "x");
const orderId = "o".padEnd(limitIdLength, "x");
// One distinct stock item per line of the largest order.
const stockItemIds = Array.from({ length: maxOrderLines }, (_, i) =>
  String(i).padStart(3, "0").padEnd(maxStockItemIdBytes, "x"),
);
const historyEvent = (
  streamId: string,
  recordedAt: number,
  { eventType, payload }: OrderEvent | StockItemEvent,
): HistoryEvent => ({ streamId, eventType, recordedAt, payload });
// The order placed and cancelled, and every stock item allocated to it and released.
const fields: OrderAllocationHistoryFields = projectOrderAllocationHistory(
  tenantId,
  null,
  [
    historyEvent(orderId, 1, {
      eventType: "OrderPlaced",
      eventSchemaVersion: 1,
      payload: {
        lines: stockItemIds.map((stockItemId) => ({
          stockItemId,
          quantity: 1,
          unitPrice: 0,
        })),
        total: 0,
      },
    }),
    ...stockItemIds.map((stockItemId) =>
      historyEvent(stockItemId, 2, {
        eventType: "StockAllocated",
        eventSchemaVersion: 1,
        payload: { orderId, quantity: 1 },
      }),
    ),
    ...stockItemIds.map((stockItemId) =>
      historyEvent(stockItemId, 3, {
        eventType: "AllocationReleased",
        eventSchemaVersion: 1,
        payload: { orderId, quantity: 1 },
      }),
    ),
    historyEvent(orderId, 4, {
      eventType: "OrderCancelled",
      eventSchemaVersion: 1,
      payload: {},
    }),
  ],
);
// The highest version folded of the order's stream and of each stock item's.
const sourceVersions: StreamVersion[] = [
  {
    tenantId,
    contextId: ordersJournal.contextId,
    streamType: orderDecider.streamType,
    streamId: orderId,
    version: 2,
  },
  ...stockItemIds.map((streamId) => ({
    tenantId,
    contextId: inventoryJournal.contextId,
    streamType: stockItemDecider.streamType,
    streamId,
    version: 3,
  })),
];
const row: ObjectType<typeof rowConventions> & OrderAllocationHistoryFields = {
  ...fields,
  tenantId,
  generation: 1,
  key: orderId,
  projectionVersion: 1,
  sourceVersions,
};

test("pure: the largest order allocation history row measures 55,803 bytes, within the view's row budget of 65,536", () => {
  expect([tenantId, orderId].map(utf8Length)).toStrictEqual([256, 256]);
  expect(new Set(stockItemIds.map(utf8Length))).toStrictEqual(new Set([64]));
  expect(row.allocations).toHaveLength(100);
  expect(
    row.allocations.every(({ releasedAt }) => releasedAt !== undefined),
  ).toBe(true);
  expect([row.placedAt, row.cancelledAt]).toStrictEqual([1, 4]);
  expect(row.sourceVersions).toHaveLength(101);
  const size = getConvexSize(row);
  expect(size).toBe(55803);
  expect(limitRowBudgetBytes).toBe(65536);
  expect(size).toBeLessThanOrEqual(limitRowBudgetBytes);
});
