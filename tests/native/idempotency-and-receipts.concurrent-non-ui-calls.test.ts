import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { concurrentNonUiCallsContract as contract } from "../../generated/contracts/command.idempotency-and-receipts.concurrent-non-ui-calls.contract.js";
import {
  type ReceiptWorld,
  givenAdmission,
  givenCaller,
  givenCommand,
  givenPriorReceipt,
  thenEffects,
  thenFirst,
  thenReceipts,
  thenSecond,
  thenUnchanged,
  whenSends,
} from "./receipted-calls.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.idempotency-and-receipts.concurrent-non-ui-calls",
  ),
  verifies: ref(
    "spec:command.idempotency-and-receipts.concurrent-non-ui-calls",
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
  "the original outcome and state are unchanged {unchanged}": thenUnchanged,
});
