import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect, test } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend } from "../../harness/native.js";
// utf8Length runs in the parent, for the request key, and in the context, for the stream ID. Text of
// two-byte characters sits exactly at each 256-byte bound and one character above it.
test("native: multibyte text is measured in UTF-8 bytes at the request key and stream ID bounds", async () => {
  const { admin, issuer, url } = await fixtureBackend();
  const client = ordinaryClient(url, { token: await issuer.token("user-1") });
  await admin.run(getFunctionName(internal.grants.grant), {
    tenantId: "t-1",
    principalKind: "human",
    principalId: `${issuer.issuer}|user-1`,
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  const atBound = "é".repeat(128);
  const aboveBound = "é".repeat(129);
  const send = (requestKey: string, documentId: string) =>
    client
      .mutation(api.depotCommands.createDocument, {
        tenantId: "t-1",
        requestKey,
        input: { documentId, title: "Report" },
      })
      .then(
        (response: unknown) => ({ response }),
        (error: unknown) => ({ error }),
      );
  const detailsOf = (answer: { response: unknown } | { error: unknown }) => {
    if (!("error" in answer)) throw new Error("The command did not throw");
    expect(answer.error).toBeInstanceOf(ConvexError);
    const data = (answer.error as ConvexError<Value>).data as Record<
      string,
      Value
    >;
    expect(data).toMatchObject({ kind: "rejection", code: "invalidInput" });
    return data.details;
  };
  expect(await send(atBound, atBound)).toMatchObject({
    response: { kind: "applied", replayed: false },
  });
  expect(detailsOf(await send(aboveBound, "doc-1"))).toEqual({
    field: "requestKey",
    length: 258,
    limit: 256,
  });
  expect(detailsOf(await send("k-2", aboveBound))).toEqual({
    field: "streamId",
    length: 258,
    limit: 256,
  });
  // Only the call at the bounds stored anything.
  expect(await admin.readTable("receipts")).toHaveLength(1);
  expect(await admin.readTable("streams", { component: "depot" })).toEqual([
    expect.objectContaining({ streamId: atBound }),
  ]);
});
