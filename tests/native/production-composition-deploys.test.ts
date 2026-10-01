import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";
import { internal } from "../../example/convex/_generated/api.js";
import { api as fixtureApi } from "../../fixture/convex/_generated/api.js";
import { ordinaryClient } from "../../harness/clients.js";
import { productionBackend } from "../../harness/native.js";
// Binds this file to the harness Spec, whose second composition it checks directly.
const anchor = specTest({
  id: testAnchorId("test:platform.native-harness.production-composition"),
  verifies: ref("spec:platform.native-harness"),
});
void anchor;

test("native: the production composition deploys from example/ on its own backend, runs its grant mutation and registers no fixture function", async () => {
  const backend = await productionBackend();
  const grant = {
    tenantId: "tenant-a",
    principalKind: "human",
    principalId: `${backend.issuer.issuer}|alice`,
    permission: "orders.read",
  };
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    ...grant,
    grantedBy: "setup",
  });
  expect(await backend.admin.readTable("grants")).toMatchObject([grant]);
  expect(backend.facts()).toMatchObject({
    composition: "production",
    installedLayers: [],
    identitySource: { kind: "fixture issuer", issuer: backend.issuer.issuer },
  });
  // A public query the fixture composition registers is not on this deployment.
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("alice"),
  });
  const fixtureQuery = getFunctionName(fixtureApi.identity.caller);
  await expect(
    client.query(makeFunctionReference<"query">(fixtureQuery), {}),
  ).rejects.toThrow(`Could not find public function for '${fixtureQuery}'`);
});
