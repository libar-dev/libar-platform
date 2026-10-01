import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { expect } from "vitest";
import { sameKeyTwoTenantsContract as contract } from "../../generated/contracts/command.tenancy-and-authority.same-key-two-tenants.contract.js";
import { required } from "../../harness/native.js";
import {
  answerIs,
  callerHoldsGrant,
  disclosedIs,
  grantIs,
  namespaceIs,
  otherTenantApplied,
  receiptsOf,
  returned,
  sends,
  type TenancyWorld,
} from "./tenancy-steps.js";
const anchor = specTest({
  id: testAnchorId("test:command.tenancy-and-authority.same-key-two-tenants"),
  verifies: ref("spec:command.tenancy-and-authority.same-key-two-tenants"),
});
void anchor;
bindExample(
  contract,
  (): TenancyWorld => ({}),
  {
    "a tenant {tenantId} whose caller {principalId} holds a grant for the command":
      (world, { tenantId, principalId }) =>
        callerHoldsGrant(world, tenantId, principalId),
    "another tenant {otherTenantId} already applied a receipted command with request key {requestKey} and local ID {localId}":
      (world, { otherTenantId, requestKey, localId }) =>
        otherTenantApplied(world, otherTenantId, requestKey, localId),
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
    const tenantId = required(world.tenantId, "the tenant");
    const other = required(world.other, "the other tenant's call");
    const { requestKey, localId } = required(world.sent, "the sent call");
    const response = returned(world.answer);
    // Two receipts for the one key, one per tenant, with different operation IDs.
    expect(await backend.admin.readTable("receipts")).toHaveLength(2);
    const [own] = await receiptsOf(world, tenantId, requestKey);
    const [others] = await receiptsOf(world, other.tenantId, requestKey);
    expect(own).toMatchObject({ operationId: response.operationId });
    expect(others).toMatchObject({ operationId: other.response.operationId });
    expect(response.operationId).not.toBe(other.response.operationId);
    // Two streams with the one local ID, one per tenant.
    const streams = (
      await backend.admin.readTable("streams", { component: "depot" })
    ).filter((stream) => stream.streamId === localId);
    expect(streams.map((stream) => stream.tenantId).sort()).toEqual(
      [other.tenantId, tenantId].sort(),
    );
    // Nothing of tenant A in tenant B's response. An affected ref names no tenant, so it is compared
    // with the ref tenant B's own receipt stores.
    expect(response.versions).toHaveLength(1);
    for (const version of response.versions)
      expect(version.tenantId).toBe(tenantId);
    expect(response.affected).toEqual(own?.affected);
  },
);
