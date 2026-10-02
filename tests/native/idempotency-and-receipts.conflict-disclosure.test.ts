import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { ConvexError, type Value } from "convex/values";
import { expect } from "vitest";
import { keyReuseChangedInputContract as contract } from "../../generated/contracts/command.idempotency-and-receipts.key-reuse-changed-input.contract.js";
import { required } from "../../harness/native.js";
import {
  type ReceiptWorld,
  givenAdmission,
  givenCaller,
  givenCommand,
  givenPriorReceipt,
  thenEffects,
  thenReceipts,
  thenSecond,
  thenUnchanged,
  whenSends,
} from "./receipted-calls.js";
const anchor = specTest({
  id: testAnchorId("test:command.idempotency-and-receipts.conflict-disclosure"),
  verifies: ref(
    "spec:command.idempotency-and-receipts.key-reuse-changed-input",
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
  "the first answer is {first}": (world, { first }) => {
    expect(first).toBe("conflict");
    const answer = required(
      required(world.answers, "answers")[0],
      "first answer",
    );
    if (!("error" in answer)) throw new Error("The command did not throw");
    expect(answer.error).toBeInstanceOf(ConvexError);
    const data = (answer.error as ConvexError<Value>).data;
    expect(data).toMatchObject({
      kind: "rejection",
      code: "idempotencyConflict",
      commandType: "AddStock",
    });
    expect.soft(data).not.toHaveProperty("details");
    expect
      .soft(JSON.stringify(data))
      .not.toContain(required(world.prior, "original").response.operationId);
  },
  "the second answer is {second}": thenSecond,
  "the business effects committed number {effects}": thenEffects,
  "the receipts stored for the key number {receipts}": thenReceipts,
  "the original outcome and state are unchanged {unchanged}": thenUnchanged,
});
