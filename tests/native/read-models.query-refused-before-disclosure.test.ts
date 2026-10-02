import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { queryRefusedBeforeDisclosureContract as contract } from "../../generated/contracts/application.read-models.query-refused-before-disclosure.contract.js";
import {
  callerIs,
  orderPlaced,
  readsTheOrder,
  readThrows,
  receiptsWritten,
  type ReadWorld,
} from "./order-read-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:application.read-models.query-refused-before-disclosure",
  ),
  verifies: ref("spec:application.read-models.query-refused-before-disclosure"),
});
void anchor;
bindExample(contract, (): ReadWorld => ({}), {
  "an order placed in a tenant": (world) => orderPlaced(world),
  "a caller {caller}": (world, { caller }) => callerIs(world, caller),
  "{action}": (world, { action }) => readsTheOrder(world, action),
  "the read throws rejection {code} that names the query": (world, { code }) =>
    readThrows(world, code),
  "the number of receipts the read wrote is {receipts}": (
    world,
    { receipts },
  ) => receiptsWritten(world, receipts),
});
