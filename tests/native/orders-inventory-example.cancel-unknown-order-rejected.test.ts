import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { cancelUnknownOrderRejectedContract as contract } from "../../generated/contracts/application.orders-inventory-example.cancel-unknown-order-rejected.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import { required } from "../../harness/native.js";
import {
  neverPlaced,
  rejectionData,
  steps,
  type CancelWorld,
} from "./cancel-order-steps.js";
import { tenantId } from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.orders-inventory-example.cancel-unknown-order-rejected",
  ),
  verifies: ref(
    "spec:application.orders-inventory-example.cancel-unknown-order-rejected",
  ),
});
void anchor;
// CancelOrder for order-2, which no PlaceOrder recorded: the order decider decides it against the
// initial state and refuses it, and the adapter creates no stream for it.
bindExample(
  contract,
  (): CancelWorld => ({}),
  steps,
  async (world) => {
    expect(rejectionData(world)).toEqual({
      kind: "rejection",
      code: "orderNotFound",
      entry: "CancelOrder",
      message: "The order does not exist",
    });
    const order = required(world.order, "the backend");
    for (const table of ["streams", "events"])
      expect(
        (
          await order.backend.admin.readTable(table, { component: "orders" })
        ).filter((row) => row["streamId"] === neverPlaced),
      ).toEqual([]);
    expect(
      await order.client.query(api.orderQueries.getOrder, {
        tenantId,
        orderId: neverPlaced,
      }),
    ).toBeNull();
  },
);
