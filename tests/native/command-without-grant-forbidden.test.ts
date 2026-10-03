import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend } from "../../harness/native.js";
// A caller the fixture issuer vouches for, but with no grant in the tenant, is refused before any
// execution. The same call succeeds on the same deployment once the caller holds a grant.
test("native: an ordinary client without a grant is refused with forbidden, and nothing is stored", async () => {
  const { admin, issuer, url } = await fixtureBackend();
  const client = ordinaryClient(url, { token: await issuer.token("user-1") });
  const call = {
    tenantId: "t-1",
    requestKey: "k-1",
    input: { documentId: "doc-1", title: "Report" },
  };
  const error = await client
    .mutation(api.depotCommands.createDocument, call)
    .then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<Value>).data).toEqual({
    kind: "rejection",
    code: "forbidden",
    entry: "CreateDocument",
    message: "The caller may not run CreateDocument in this tenant",
    details: { reason: "no_grant" },
  });
  const stored = async () => ({
    receipts: await admin.readTable("receipts"),
    streams: await admin.readTable("streams", { component: "depot" }),
    events: await admin.readTable("events", { component: "depot" }),
  });
  expect(await stored()).toEqual({ receipts: [], streams: [], events: [] });
  // A grant in another tenant does not help.
  await admin.run(getFunctionName(internal.grants.grant), {
    tenantId: "t-2",
    principalKind: "human",
    principalId: `${issuer.issuer}|user-1`,
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  await expect(
    client.mutation(api.depotCommands.createDocument, call),
  ).rejects.toThrow(ConvexError);
  expect(await stored()).toEqual({ receipts: [], streams: [], events: [] });
  // The command exists and runs on this deployment for a caller who holds the grant.
  await admin.run(getFunctionName(internal.grants.grant), {
    tenantId: "t-1",
    principalKind: "human",
    principalId: `${issuer.issuer}|user-1`,
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  expect(
    await client.mutation(api.depotCommands.createDocument, call),
  ).toMatchObject({ kind: "applied", replayed: false });
});
