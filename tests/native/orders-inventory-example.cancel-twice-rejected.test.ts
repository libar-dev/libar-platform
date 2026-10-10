import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { cancelTwiceRejectedContract as contract } from "../../generated/contracts/application.orders-inventory-example.cancel-twice-rejected.contract.js";
import { required } from "../../harness/native.js";
import {
  rejectionData,
  stockState,
  steps,
  type CancelWorld,
} from "./cancel-order-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.orders-inventory-example.cancel-twice-rejected",
  ),
  verifies: ref(
    "spec:application.orders-inventory-example.cancel-twice-rejected",
  ),
});
void anchor;
// A second CancelOrder of order-1 under a new key is refused by the order's own state in Orders.
bindExample(
  contract,
  (): CancelWorld => ({}),
  steps,
  async (world) => {
    expect(rejectionData(world)).toEqual({
      kind: "rejection",
      code: "orderAlreadyCancelled",
      entry: "CancelOrder",
      message: "The order is already cancelled",
    });
    const { backend } = required(world.order, "the backend");
    expect(
      (await backend.admin.readTable("receipts")).filter(
        (row) => row["requestKey"] === "k-2",
      ),
    ).toEqual([]);
    // Had Inventory decided, its release of 3 would have been refused insufficientAllocation.
    expect(await stockState(world)).toEqual({ onHand: 5, allocated: 0 });
  },
);
