import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { cancelSecondContextRejectsContract as contract } from "../../generated/contracts/application.orders-inventory-example.cancel-second-context-rejects.contract.js";
import { required } from "../../harness/native.js";
import {
  cancelRequest,
  orderId,
  rejectionData,
  steps,
  type CancelWorld,
} from "./cancel-order-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.orders-inventory-example.cancel-second-context-rejects",
  ),
  verifies: ref(
    "spec:application.orders-inventory-example.cancel-second-context-rejects",
  ),
});
void anchor;
// The setup released order-1's units in Inventory alone, so CancelOrder's Orders call records the
// cancel and returns the order's lines, and Inventory then refuses their release. The refusal is
// the kernel's bare Rejection thrown in Inventory's sub-transaction, and the whole mutation throws it.
bindExample(
  contract,
  (): CancelWorld => ({}),
  steps,
  async (world) => {
    // The call order and the quantities' source are shown at the pure test tier, by the executor itself.
    expect(rejectionData(world)).toEqual({
      kind: "rejection",
      code: "insufficientAllocation",
      entry: "CancelOrder",
      message: "Cannot release 3 when 0 are allocated",
      details: { requested: 3, allocated: 0 },
    });
    const { record, request } = await cancelRequest(world);
    expect(request).toHaveLength(1);
    expect(record.error).toMatch(/^Uncaught ConvexError: /);
    expect(record.usageStats["databaseWriteDocuments"]).toBe(0);
    const { backend } = required(world.order, "the backend");
    const own = (rows: Record<string, unknown>[]) =>
      rows.filter((row) => row["streamId"] === orderId);
    expect(
      own(await backend.admin.readTable("streams", { component: "orders" })),
    ).toMatchObject([{ streamVersion: 1, state: { status: "placed" } }]);
    expect(
      own(await backend.admin.readTable("events", { component: "orders" })),
    ).toMatchObject([{ eventType: "OrderPlaced" }]);
    expect(
      (await backend.admin.readTable("receipts")).filter(
        (row) => row["requestKey"] === "k-1",
      ),
    ).toEqual([]);
  },
);
