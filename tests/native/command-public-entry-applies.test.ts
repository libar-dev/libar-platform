import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend } from "../../harness/native.js";
// A fixture command sent through its public entry by an ordinary client that holds a fixture-issuer
// token and a grant an operator gave it with admin access.
test("native: an ordinary client with a grant sends a receipted command through the public entry, and the receipt, stream row and event commit together", async () => {
  const { admin, issuer, url } = await fixtureBackend();
  const principalId = `${issuer.issuer}|user-1`;
  await admin.run(getFunctionName(internal.grants.grant), {
    tenantId: "t-1",
    principalKind: "human",
    principalId,
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  const client = ordinaryClient(url, { token: await issuer.token("user-1") });
  const call = {
    tenantId: "t-1",
    requestKey: "k-1",
    correlationId: "c-1",
    input: { documentId: "doc-1", title: "Report" },
  };
  const response = await client.mutation(
    api.depotCommands.createDocument,
    call,
  );
  const version = {
    tenantId: "t-1",
    contextId: "depot",
    streamType: "document",
    streamId: "doc-1",
    version: 1,
  };
  expect(response).toEqual({
    kind: "applied",
    result: { documentId: "doc-1", status: "draft" },
    operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    affected: [
      { contextId: "depot", streamType: "document", streamId: "doc-1" },
    ],
    versions: [version],
    replayed: false,
  });
  const { operationId } = response;
  const receipts = await admin.readTable("receipts");
  expect(receipts).toMatchObject([
    {
      tenantId: "t-1",
      namespace: "public",
      commandType: "CreateDocument",
      requestKey: "k-1",
      outcome: "applied",
      operationId,
      affected: response.affected,
      versions: [version],
      actorId: principalId,
      tombstone: false,
    },
  ]);
  expect(
    await admin.readTable("streams", { component: "depot" }),
  ).toMatchObject([
    {
      tenantId: "t-1",
      streamId: "doc-1",
      streamVersion: 1,
      lastOperationId: operationId,
    },
  ]);
  expect(await admin.readTable("events", { component: "depot" })).toMatchObject(
    [
      {
        tenantId: "t-1",
        streamId: "doc-1",
        streamVersion: 1,
        eventType: "created",
        operationId,
        correlationId: "c-1",
        causedBy: { kind: "command", commandType: "CreateDocument" },
        actor: { kind: "human", id: principalId, issuer: issuer.issuer },
      },
    ],
  );
  // The same key and input again is a replay: the stored outcome, result null, and nothing new.
  expect(await client.mutation(api.depotCommands.createDocument, call)).toEqual(
    { ...response, result: null, replayed: true },
  );
  expect(await admin.readTable("receipts")).toEqual(receipts);
  expect(await admin.readTable("events", { component: "depot" })).toHaveLength(
    1,
  );
});
