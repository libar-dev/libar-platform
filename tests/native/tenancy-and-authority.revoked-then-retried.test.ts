import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import type { ConvexError, Value } from "convex/values";
import { expect } from "vitest";
import { revokedThenRetriedContract as contract } from "../../generated/contracts/command.tenancy-and-authority.revoked-then-retried.contract.js";
import { required } from "../../harness/native.js";
import {
  answerIs,
  callerHoldsGrant,
  disclosedIs,
  giveGrant,
  grantIs,
  namespaceIs,
  readDocuments,
  returned,
  sendClaiming,
  sends,
  threw,
  type TenancyWorld,
} from "./tenancy-steps.js";
const anchor = specTest({
  id: testAnchorId("test:command.tenancy-and-authority.revoked-then-retried"),
  verifies: ref("spec:command.tenancy-and-authority.revoked-then-retried"),
});
void anchor;
bindExample(
  contract,
  (): TenancyWorld => ({}),
  {
    "a tenant {tenantId} whose caller {principalId} holds a grant for the command":
      (world, { tenantId, principalId }) =>
        callerHoldsGrant(world, tenantId, principalId),
    "the caller's grant is {grant}": (world, { grant }) =>
      grantIs(world, grant),
    "the caller sends the receipted command with request key {sentKey} and local ID {sentLocalId}":
      (world, { sentKey, sentLocalId }) => sends(world, sentKey, sentLocalId),
    "the answer is {answer}": (world, { answer }) => answerIs(world, answer),
    "a stored outcome is disclosed to the caller {disclosed}": (
      world,
      { disclosed },
    ) => disclosedIs(world, disclosed),
    "the namespace the server assigned is {namespace}": (
      world,
      { namespace },
    ) => namespaceIs(world, namespace),
  },
  // The verification bullets.
  async (world) => {
    const backend = required(world.backend, "the backend");
    const firstRun = required(world.firstRun, "the successful run");
    const { requestKey, localId } = required(world.sent, "the sent call");
    // The forbidden data names the reason only: no operation ID, affected ref or version.
    const error = threw(world.answer);
    expect((error as ConvexError<Value>).data).toEqual({
      kind: "rejection",
      code: "forbidden",
      commandType: "CreateDocument",
      message: "The caller may not run CreateDocument in this tenant",
      details: { reason: "no_grant" },
    });
    // The retry wrote nothing, and read nothing: not even the receipt it could have disclosed.
    expect(await backend.admin.readTable("receipts")).toEqual(
      required(world.receiptsAfterFirstRun, "the receipts after the run"),
    );
    expect(
      readDocuments(required(world.completion, "the completion record")),
    ).toBe(0);
    // With the grant back, the same retry is a replay of the stored outcome, so the receipt was
    // there to disclose; its handler read the grant and the receipt.
    await giveGrant(
      backend,
      required(world.tenantId, "the tenant"),
      required(world.subject, "the caller"),
    );
    const replay = await sendClaiming(world, undefined, requestKey, localId);
    expect(returned(replay.answer)).toEqual({
      ...firstRun,
      result: null,
      replayed: true,
    });
    expect(readDocuments(replay.completion)).toBe(2);
  },
);
