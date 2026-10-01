import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { expect, test } from "vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import { fixtureBackend } from "../../harness/native.js";
// The depot is the fixture composition's context component, built on src/context. A fixture
// internal mutation, run with the harness's admin access, calls one of its operations.
const call = (operationId: string, input: Record<string, Value>) => ({
  tenantId: "t-1",
  actor: { kind: "operator", id: "native-test" },
  operation: {
    operationId,
    causedBy: { kind: "command", commandType: "fixture" },
  },
  input,
});
test("native: a depot operation called through a fixture internal mutation commits its stream row and event, and a rejection commits nothing", async () => {
  const { admin } = await fixtureBackend();
  const created = await admin.run(
    getFunctionName(internal.depotRelay.createDocuments),
    call("op-create", {
      documents: [{ documentId: "doc-1", title: "Report" }],
    }),
  );
  const version = {
    tenantId: "t-1",
    contextId: "depot",
    streamType: "document",
    streamId: "doc-1",
    version: 1,
  };
  expect(created).toMatchObject({
    kind: "applied",
    result: { documents: [{ documentId: "doc-1", status: "draft" }] },
    versions: [version],
    streams: [{ appended: 1, created: true, version }],
  });
  const read = async () => ({
    streams: await admin.readTable("streams", { component: "depot" }),
    events: await admin.readTable("events", { component: "depot" }),
  });
  const before = await read();
  expect(before.streams).toMatchObject([
    {
      streamId: "doc-1",
      streamVersion: 1,
      state: { status: "draft", title: "Report", amendments: 0 },
      lastOperationId: "op-create",
    },
  ]);
  expect(before.events).toMatchObject([
    {
      streamId: "doc-1",
      streamVersion: 1,
      eventType: "created",
      operationId: "op-create",
      payload: { title: "Report" },
    },
  ]);
  const error = await admin
    .run(
      getFunctionName(internal.depotRelay.shipDocuments),
      call("op-ship", { documents: [{ documentId: "doc-1" }] }),
    )
    .then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<{ code: string }>).data).toMatchObject({
    code: "invalidTransition",
    details: { from: "draft", trigger: "ship" },
  });
  expect(await read()).toEqual(before);
});
