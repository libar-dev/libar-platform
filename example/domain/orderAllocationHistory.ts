// The order allocation history's rules: keyOf maps an event to the order it belongs to, and project
// folds one order's events into its row
// (spec:application.history-projection#design.orderAllocationHistoryFold). Each field of the row
// is written by the events of one stream, placedAt and cancelledAt by the order's and each
// allocation by its stock item's, and the allocations are kept in stock item ID order, so the row
// is one value whatever the order in which the events of different streams arrive. The parent's
// HistoryProjection holds these rules; no context mounts them, so index.ts does not export them.
import type { OrderEvent } from "./order.js";
import type { StockItemEvent } from "./stockItem.js";
// The part of an event envelope the rules read; the context library's EventEnvelope has each field.
export type HistoryEvent = {
  streamId: string;
  eventType: string;
  recordedAt: number;
  occurredAt?: number;
  payload: unknown;
};
// The quantity one stock item allocated to the order, when, and when it was released.
export type OrderAllocation = {
  stockItemId: string;
  quantity: number;
  allocatedAt: number;
  releasedAt?: number;
};
export type OrderAllocationHistoryFields = {
  orderId: string;
  placedAt?: number;
  cancelledAt?: number;
  allocations: OrderAllocation[];
};
type OrderEventType = OrderEvent["eventType"];
type AllocationPayload = Extract<
  StockItemEvent,
  { eventType: "StockAllocated" | "AllocationReleased" }
>["payload"];
const orderEventTypes: readonly OrderEventType[] = [
  "OrderPlaced",
  "OrderCancelled",
];
// The order an event belongs to, or null for an event that is not this view's.
export function orderAllocationHistoryKeyOf(
  _tenantId: string,
  event: HistoryEvent,
): string | null {
  if ((orderEventTypes as readonly string[]).includes(event.eventType))
    return event.streamId;
  if (
    event.eventType === "StockAllocated" ||
    event.eventType === "AllocationReleased"
  )
    return (event.payload as AllocationPayload).orderId;
  return null;
}
// Stock item IDs compared by UTF-16 code units, the order the allocations are kept in.
const byStockItemId = (left: OrderAllocation, right: OrderAllocation) =>
  left.stockItemId < right.stockItemId
    ? -1
    : left.stockItemId > right.stockItemId
      ? 1
      : 0;
function foldOne(
  row: OrderAllocationHistoryFields,
  event: HistoryEvent,
): OrderAllocationHistoryFields {
  const time = event.occurredAt ?? event.recordedAt;
  switch (event.eventType) {
    case "OrderPlaced":
      return { ...row, placedAt: time };
    case "OrderCancelled":
      return { ...row, cancelledAt: time };
    case "StockAllocated": {
      const { quantity } = event.payload as AllocationPayload;
      const allocations = row.allocations.filter(
        (allocation) => allocation.stockItemId !== event.streamId,
      );
      allocations.push({
        stockItemId: event.streamId,
        quantity,
        allocatedAt: time,
      });
      return { ...row, allocations: allocations.sort(byStockItemId) };
    }
    case "AllocationReleased":
      return {
        ...row,
        allocations: row.allocations.map((allocation) =>
          allocation.stockItemId === event.streamId
            ? { ...allocation, releasedAt: time }
            : allocation,
        ),
      };
    default:
      return row;
  }
}
// Folds the events of one order, each stream's in version order, into its prior row, or into a new row
// named by the first event's key. A row is never deleted: a cancelled order keeps its row, so a
// release after the cancel folds into it.
export function projectOrderAllocationHistory(
  tenantId: string,
  prior: OrderAllocationHistoryFields | null,
  events: readonly HistoryEvent[],
): OrderAllocationHistoryFields {
  let start = prior;
  if (start === null) {
    const orderId = events
      .map((event) => orderAllocationHistoryKeyOf(tenantId, event))
      .find((key) => key !== null);
    if (orderId === undefined || orderId === null)
      throw new Error(
        "The order allocation history needs a prior row or an event of an order",
      );
    start = { orderId, allocations: [] };
  }
  return events.reduce(foldOne, start);
}
