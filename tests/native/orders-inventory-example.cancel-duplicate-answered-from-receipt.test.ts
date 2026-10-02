import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { cancelDuplicateAnsweredFromReceiptContract as contract } from "../../generated/contracts/application.orders-inventory-example.cancel-duplicate-answered-from-receipt.contract.js";
import { required } from "../../harness/native.js";
import { steps, type CancelWorld } from "./cancel-order-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.orders-inventory-example.cancel-duplicate-answered-from-receipt",
  ),
  verifies: ref(
    "spec:application.orders-inventory-example.cancel-duplicate-answered-from-receipt",
  ),
});
void anchor;
// The cancel of order-1 is sent again under the same key k-1 and is answered from its receipt.
bindExample(
  contract,
  (): CancelWorld => ({}),
  steps,
  async (world) => {
    const { backend } = required(world.order, "the backend");
    const first = required(world.first, "the first cancel");
    expect(world.response).toMatchObject({
      kind: "applied",
      replayed: true,
      result: null,
      operationId: first.operationId,
    });
    expect(
      (await backend.admin.readTable("receipts")).filter(
        (row) => row["requestKey"] === "k-1",
      ),
    ).toMatchObject([{ operationId: first.operationId }]);
  },
);
