import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { retryAfterLostResponseContract as contract } from "../../generated/contracts/command.idempotency-and-receipts.retry-after-lost-response.contract.js";
import {
  type ReceiptWorld,
  expectFaultInjected,
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
    "test:command.idempotency-and-receipts.retry-after-lost-response",
  ),
  verifies: ref(
    "spec:command.idempotency-and-receipts.retry-after-lost-response",
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
    // The fail-if-run part stays on: a further replay stores nothing, and a call that executes fails.
    await replayWithPartOn(
      world,
      "failBeforeReceipt",
      expectFaultInjected("AddStock"),
    );
  },
});
