import {
  ref,
  specTest,
  testAnchorId,
} from "@libar-dev/software-delivery-protocol";
import { bindExample } from "@libar-dev/software-delivery-protocol/vitest";
import { getFunctionName } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import type { ConvexHttpClient } from "convex/browser";
import { expect } from "vitest";
import { secondContextThrowsContract as contract } from "../../generated/contracts/application.parent-use-cases.second-context-throws.contract.js";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { yardFaultTitle } from "../../fixture/convex/yard/streams.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
import {
  classifyThrown,
  type CommandResponse,
} from "../../src/command/index.js";
const anchor = specTest({
  id: testAnchorId("test:application.parent-use-cases.second-context-throws"),
  verifies: ref("spec:application.parent-use-cases.second-context-throws"),
});
void anchor;
// Sc L2-1, the technical-failure case, on the fixture composition: an ordinary client with a grant
// sends FileDocument, whose executor creates a document in the depot and then files its copy in the
// yard, naming the depot version the depot's call returned. The yard's copy stream throws a plain
// Error from its toDto for the fault title, after the yard wrote its state and event.
const tenantId = "t-1";
const documentId = "doc-1";
const requestKey = "k-file";
const identifier = "filing:fileDocument";
type FileResponse = CommandResponse<{
  documentId: string;
  depotVersion: number;
}>;
type Tables = Record<string, Record<string, Value>[]>;
interface World {
  backend?: Backend;
  client?: ConvexHttpClient;
  contexts?: number;
  // The version the first context's call returns for the new document, which the failure names.
  firstVersion?: number;
  error?: unknown;
  response?: FileResponse;
  records?: CompletionRecord[];
}
// Every table the command writes: the parent's receipts, and the state and journal of both contexts.
async function readTables(backend: Backend): Promise<Tables> {
  return {
    receipts: await backend.admin.readTable("receipts"),
    depotStreams: await backend.admin.readTable("streams", {
      component: "depot",
    }),
    depotEvents: await backend.admin.readTable("events", {
      component: "depot",
    }),
    yardStreams: await backend.admin.readTable("streams", {
      component: "yard",
    }),
    yardEvents: await backend.admin.readTable("events", { component: "yard" }),
  };
}
// Sends FileDocument and keeps what the caller received and the request's completion records.
async function send(world: World, title: string) {
  const backend = required(world.backend, "the backend");
  const mark = await backend.admin.logMark();
  let error: unknown;
  let response: FileResponse | undefined;
  try {
    response = await required(world.client, "the client").mutation(
      api.filing.fileDocument,
      { tenantId, requestKey, input: { documentId, title } },
    );
  } catch (thrown) {
    error = thrown;
  }
  const own = (entry: CompletionRecord) =>
    entry.identifier === identifier && entry.componentPath === null;
  const records = await backend.admin.completionsSince(mark, (entries) =>
    entries.some(own),
  );
  const record = required(records.find(own), "the command's completion record");
  const request = records.filter(
    (entry) => entry.requestId === record.requestId,
  );
  // One top-level mutation: the request left one completion record, the parent's own, and both
  // contexts' sub-transactions are part of it.
  expect(request, JSON.stringify(request)).toHaveLength(1);
  expect(request[0]).toMatchObject({
    udfType: "Mutation",
    identifier,
    componentPath: null,
  });
  return { error, response, records: request };
}
// The text the fault puts in the error. It names the depot version the yard was given, which the
// executor read from the depot's answer, so only a depot call that returned can produce it.
const faultText = (world: World) =>
  `Fault injected: ${yardFaultTitle}, filing document/${documentId} at depot version ${required(world.firstVersion, "the first context's version")}`;
bindExample(contract, (): World => ({}), {
  "a use case that calls {contexts} contexts in one mutation": async (
    world,
    { contexts },
  ) => {
    const backend = await fixtureBackend();
    await backend.admin.run(getFunctionName(internal.grants.grant), {
      tenantId,
      principalKind: "human",
      principalId: `${backend.issuer.issuer}|user-1`,
      permission: permissions.documents,
      grantedBy: "native-test",
    });
    const client = ordinaryClient(backend.url, {
      token: await backend.issuer.token("user-1"),
    });
    Object.assign(world, { backend, client, contexts });
  },
  // A create brings the document to version 1, and the depot's call returns it before the yard runs.
  "the first context has written its state and events": (world) => {
    world.firstVersion = 1;
  },
  "the second context {secondOutcome}": async (world, { secondOutcome }) => {
    expect(secondOutcome).toBe("throws");
    const sent = await send(world, yardFaultTitle);
    Object.assign(world, sent);
    measure("secondContextThrows", {
      error: sent.error === undefined ? null : String(sent.error),
      records: sent.records.map((entry) => ({
        identifier: entry.identifier,
        udfType: entry.udfType,
        componentPath: entry.componentPath,
        error: entry.error,
        usageStats: entry.usageStats,
      })),
    });
  },
  "the mutation {commit}": (world, { commit }) => {
    expect(commit).toBe("rolls back");
    const [record] = required(world.records, "the completion records");
    expect(world.response).toBeUndefined();
    expect(record?.error).toContain(faultText(world));
  },
  "the caller receives {response}": (world, { response }) => {
    expect(response).toBe("a technical failure");
    // A technical failure is a plain error, never a ConvexError, so the caller reads no rejection data.
    expect(world.error, String(world.error)).toBeInstanceOf(Error);
    expect(world.error).not.toBeInstanceOf(ConvexError);
    expect(classifyThrown(world.error).kind).toBe("technical");
    expect(String(world.error)).toContain(faultText(world));
  },
  "the number of stored receipts, events and state changes is {stored}": async (
    world,
    { stored },
  ) => {
    const backend = required(world.backend, "the backend");
    // The backend started empty and the grant is the only row written before the command.
    const after = await readTables(backend);
    measure("storedAfterFailure", {
      receipts: after.receipts?.length ?? 0,
      depotStreams: after.depotStreams?.length ?? 0,
      depotEvents: after.depotEvents?.length ?? 0,
      yardStreams: after.yardStreams?.length ?? 0,
      yardEvents: after.yardEvents?.length ?? 0,
    });
    expect(
      Object.values(after).reduce((count, rows) => count + rows.length, 0),
    ).toBe(stored);
    // The same command without the fault, under the same request key, is new intent: it is
    // applied, and each of the two contexts holds its stream row and event under its operation.
    const retried = await send(world, "Filed");
    expect(retried.error, String(retried.error)).toBeUndefined();
    const applied = required(retried.response, "the applied response");
    const firstVersion = required(world.firstVersion, "the version");
    expect(applied).toMatchObject({
      kind: "applied",
      replayed: false,
      result: { documentId, depotVersion: firstVersion },
      versions: [
        { contextId: "depot", streamType: "document", streamId: documentId },
        { contextId: "yard", streamType: "copy", streamId: documentId },
      ],
    });
    expect(
      new Set(applied.versions.map((version) => version.contextId)).size,
    ).toBe(required(world.contexts, "the number of contexts"));
    const committed = await readTables(backend);
    const ofOperation = (rows: Record<string, Value>[] | undefined) =>
      (rows ?? []).filter((row) => row.operationId === applied.operationId);
    expect(ofOperation(committed.receipts)).toMatchObject([
      { requestKey, outcome: "applied" },
    ]);
    expect(ofOperation(committed.depotEvents)).toMatchObject([
      { streamType: "document", streamId: documentId, streamVersion: 1 },
    ]);
    expect(ofOperation(committed.yardEvents)).toMatchObject([
      { streamType: "copy", streamId: documentId, streamVersion: 1 },
    ]);
    expect(committed.depotStreams).toMatchObject([
      { streamId: documentId, streamVersion: firstVersion },
    ]);
    expect(committed.yardStreams).toMatchObject([
      { streamId: documentId, streamVersion: 1 },
    ]);
  },
});
