import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { cancelWithoutGrantRefusedContract as contract } from "../../generated/contracts/application.orders-inventory-example.cancel-without-grant-refused.contract.js";
import {
  rejectionData,
  steps,
  type CancelWorld,
} from "./cancel-order-steps.js";
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
bindExample(
  contract,
  (): CancelWorld => ({}),
  steps,
  (world) => {
    expect(rejectionData(world)).toEqual({
      kind: "rejection",
      code: "forbidden",
      commandType: "CancelOrder",
      message: "The caller may not run CancelOrder in this tenant",
      details: { reason: "no_grant" },
    });
  },
);
