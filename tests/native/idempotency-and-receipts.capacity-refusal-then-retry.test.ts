import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { capacityRefusalThenRetryContract as contract } from "../../generated/contracts/command.idempotency-and-receipts.capacity-refusal-then-retry.contract.js";
import {
  type ReceiptWorld,
  expectTransient,
  givenAdmission,
  givenCaller,
  givenCommand,
  givenPriorReceipt,
  replayWithPartOn,
  thenEffects,
  thenFirst,
  thenReceipts,
  thenSecond,
  thenUnchanged,
  whenSends,
} from "./receipted-calls.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.idempotency-and-receipts.capacity-refusal-then-retry",
  ),
  verifies: ref(
    "spec:command.idempotency-and-receipts.capacity-refusal-then-retry",
  ),
});
void anchor;
bindExample(contract, (): ReceiptWorld => ({}), {
  "a tenant {tenantId} and a caller in namespace {namespace}": givenCaller,
  "a receipted command {commandType} with request key {requestKey} and business input fingerprint {fingerprint}":
    givenCommand,
  "a receipt for the same key already exists with {priorReceipt}":
    givenPriorReceipt,
  "the admission policy {admission}": givenAdmission,
  "the caller sends the command {sends}": whenSends,
  "the first answer is {first}": thenFirst,
  "the second answer is {second}": thenSecond,
  "the business effects committed number {effects}": thenEffects,
  "the receipts stored for the key number {receipts}": thenReceipts,
  "the original outcome and state are unchanged {unchanged}": async (
    world,
    params,
  ) => {
    await thenUnchanged(world, params);
    // The ordering rule: with the receipt present, the refusing policy is never consulted.
    await replayWithPartOn(world, "capacity", expectTransient("capacity"));
  },
});
