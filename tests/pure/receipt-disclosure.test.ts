import { expect, test } from "vitest";
import { classifyReceipt, type Receipt } from "../../src/command/index.js";

const receipt = {
  _id: "receipt" as Receipt["_id"],
  _creationTime: 0,
  tenantId: "t-1",
  namespace: "public",
  commandType: "CreateDocument",
  requestKey: "shared-key",
  fingerprint: "original",
  contractVersion: 1,
  outcome: "applied",
  operationId: "private-operation",
  affected: [],
  versions: [],
  actorId: "bob",
  recordedAt: 0,
  expiresAt: 1000,
  tombstone: false,
} satisfies Receipt;
// spec:command.idempotency-and-receipts, typeReceiptClass and fnClassifyReceipt.
test("pure: a conflicting receipt classification carries no stored facts", () => {
  expect(classifyReceipt(receipt, "other", 1, 999)).toEqual({
    class: "conflict",
  });
});
test.each(["original", "other"])(
  "pure: an unsupported receipt version carries no stored facts with fingerprint %s",
  (fingerprint) => {
    expect(classifyReceipt(receipt, fingerprint, 2, 999)).toEqual({
      class: "unsupportedVersion",
    });
  },
);
// spec:command.idempotency-and-receipts, fnClassifyReceipt: no error names a field of the stored receipt.
test("pure: the error a tombstone receipt throws names no field of the stored receipt", () => {
  let message: string | undefined;
  try {
    classifyReceipt({ ...receipt, tombstone: true }, "original", 1, 999);
  } catch (error) {
    message = String(error);
  }
  expect(message).toContain("tombstone");
  for (const field of [
    "operationId",
    "requestKey",
    "fingerprint",
    "actorId",
    "commandType",
    "tenantId",
  ] as const)
    expect(message).not.toContain(receipt[field]);
});
