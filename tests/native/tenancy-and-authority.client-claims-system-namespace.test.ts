import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { clientClaimsSystemNamespaceContract as contract } from "../../generated/contracts/command.tenancy-and-authority.client-claims-system-namespace.contract.js";
import { verifyBothRoutesClosed } from "./tenancy-claims.js";
import {
  answerIs,
  callerHoldsGrant,
  claims,
  disclosedIs,
  grantIs,
  namespaceIs,
  sends,
  type TenancyWorld,
} from "./tenancy-steps.js";
const anchor = specTest({
  id: testAnchorId(
    "test:command.tenancy-and-authority.client-claims-system-namespace",
  ),
  verifies: ref(
    "spec:command.tenancy-and-authority.client-claims-system-namespace",
  ),
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
    "a public client claims namespace {claimed} by {via}": (
      world,
      { claimed, via },
    ) => claims(world, claimed, via),
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
  (world) => verifyBothRoutesClosed(world),
);
