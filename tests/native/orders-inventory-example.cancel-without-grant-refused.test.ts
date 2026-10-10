import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { cancelWithoutGrantRefusedContract as contract } from "../../generated/contracts/application.orders-inventory-example.cancel-without-grant-refused.contract.js";
import { api } from "../../example/convex/_generated/api.js";
import { required } from "../../harness/native.js";
import {
  lackingClient,
  neverPlaced,
  rejectionData,
  steps,
  type CancelWorld,
} from "./cancel-order-steps.js";
import { tenantId } from "./order-use-case.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.orders-inventory-example.cancel-without-grant-refused",
  ),
  verifies: ref(
    "spec:application.orders-inventory-example.cancel-without-grant-refused",
  ),
});
void anchor;
// A second user who holds every other grant of the composition, but not orders.cancel, is refused.
const forbidden = {
  kind: "rejection",
  code: "forbidden",
  entry: "CancelOrder",
  message: "The caller may not run CancelOrder in this tenant",
  details: { reason: "no_grant" },
};
bindExample(
  contract,
  (): CancelWorld => ({}),
  steps,
  async (world) => {
    expect(rejectionData(world)).toEqual(forbidden);
    // The same caller's cancel of an order never placed is refused the same way: had Orders decided
    // before the check, it would have answered orderNotFound.
    const client = await lackingClient(required(world.order, "the backend"));
    const error = await client
      .mutation(api.ordering.cancelOrder, {
        tenantId,
        requestKey: "k-2",
        input: { orderId: neverPlaced },
      })
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<Value>).data).toEqual(forbidden);
  },
);
