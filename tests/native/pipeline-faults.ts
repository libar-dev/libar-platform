import { getFunctionName } from "convex/server";
import { ConvexError, convexToJson, type Value } from "convex/values";
import type { ConvexHttpClient } from "convex/browser";
import { expect } from "vitest";
import { api, internal } from "../../fixture/convex/_generated/api.js";
import { faultTitles } from "../../fixture/convex/depot/streams.js";
import { permissions } from "../../fixture/convex/depotCommands.js";
import { classifyThrown } from "../../src/command/index.js";
import type { CommandResponse } from "../../src/command/index.js";
import type { CompletionRecord } from "../../harness/admin.js";
import type { Backend } from "../../harness/backend.js";
import { ordinaryClient } from "../../harness/clients.js";
import { fixtureBackend, measure, required } from "../../harness/native.js";
// Sc L1-2 on the fixture composition: an ordinary client with a grant brings one depot document to a
// version with receipted commands, then sends one more receipted AmendDocument that fails at one of
// three points. The faults are the fixture's own: the depot's document mapping and toDto throw for
// the fixture's fault titles, and the fixture executor throws while the command's failBeforeReceipt
// switch is on.
export type FaultPoint =
  | "after the state write"
  | "after the journal append"
  | "before the receipt insert";
type DocumentResponse = CommandResponse<{
  documentId: string;
  status: "none" | "draft" | "submitted" | "shipped";
}>;
type Tables = {
  streams: Record<string, Value>[];
  events: Record<string, Value>[];
  receipts: Record<string, Value>[];
};
export interface FaultWorld {
  backend?: Backend;
  client?: ConvexHttpClient;
  version?: number;
  setup?: DocumentResponse[];
  before?: Tables;
  point?: FaultPoint;
  error?: unknown;
  response?: DocumentResponse;
  records?: CompletionRecord[];
}
export const tenantId = "t-1";
export const documentId = "doc-1";
export const requestKey = "k-command";
const commandType = "AmendDocument";
const identifier = "depotCommands:amendDocument";
// The title each fault point sends. Before the receipt insert the depot succeeds, so the title is an
// ordinary one and the fault is the fixture executor's switch.
const titles: Record<FaultPoint, string> = {
  "after the state write": faultTitles.afterStateWrite,
  "after the journal append": faultTitles.afterJournalAppend,
  "before the receipt insert": "Final",
};
// The text the fault puts in the error the client receives. Before the receipt insert it names the
// version the depot call returned, one above the version the stream was at, which shows the call
// completed before the parent threw.
const faultText = (point: FaultPoint, version: number) =>
  ({
    "after the state write": `Fault injected: ${faultTitles.afterStateWrite}`,
    "after the journal append": `Fault injected: ${faultTitles.afterJournalAppend}`,
    "before the receipt insert": `Fault injected: ${commandType} failed after its context call returned document/${documentId} at version ${version + 1}`,
  })[point];
async function readTables(backend: Backend): Promise<Tables> {
  const ofDocument = (row: Record<string, Value>) =>
    row.tenantId === tenantId &&
    row.streamType === "document" &&
    row.streamId === documentId;
  return {
    streams: (
      await backend.admin.readTable("streams", { component: "depot" })
    ).filter(ofDocument),
    events: (
      await backend.admin.readTable("events", { component: "depot" })
    ).filter(ofDocument),
    receipts: await backend.admin.readTable("receipts"),
  };
}
// Every Convex value of a document, system fields included, in one string.
const bytesOf = (row: Record<string, Value>) =>
  JSON.stringify(convexToJson(row));
export async function prepareStream(world: FaultWorld, version: number) {
  const backend = await fixtureBackend();
  const principalId = `${backend.issuer.issuer}|user-1`;
  await backend.admin.run(getFunctionName(internal.grants.grant), {
    tenantId,
    principalKind: "human",
    principalId,
    permission: permissions.documents,
    grantedBy: "native-test",
  });
  const client = ordinaryClient(backend.url, {
    token: await backend.issuer.token("user-1"),
  });
  // A create makes version 1 and each amend one more.
  const setup: DocumentResponse[] = [
    await client.mutation(api.depotCommands.createDocument, {
      tenantId,
      requestKey: "k-setup-1",
      input: { documentId, title: "Draft 1" },
    }),
  ];
  for (let next = 2; next <= version; next++)
    setup.push(
      await client.mutation(api.depotCommands.amendDocument, {
        tenantId,
        requestKey: `k-setup-${next}`,
        input: {
          documentId,
          title: `Draft ${next}`,
          expectedVersion: next - 1,
        },
      }),
    );
  for (const [index, response] of setup.entries())
    expect(response).toMatchObject({
      kind: "applied",
      replayed: false,
      versions: [{ streamId: documentId, version: index + 1 }],
    });
  const before = await readTables(backend);
  expect(before.streams).toMatchObject([{ streamVersion: version }]);
  expect(before.events).toHaveLength(version);
  expect(before.receipts).toHaveLength(version);
  Object.assign(world, { backend, client, version, setup, before });
}
export async function injectFault(world: FaultWorld, point: FaultPoint) {
  world.point = point;
  if (point === "before the receipt insert")
    await required(world.backend, "the backend").admin.run(
      getFunctionName(internal.switches.set),
      { tenantId, commandType, name: "failBeforeReceipt", on: true },
    );
}
// The command the example sends, at the version the stream holds.
export const commandCall = (world: FaultWorld) => ({
  tenantId,
  requestKey,
  input: {
    documentId,
    title: titles[required(world.point, "the fault point")],
    expectedVersion: required(world.version, "the version"),
  },
});
export async function runCommand(world: FaultWorld) {
  const backend = required(world.backend, "the backend");
  const client = required(world.client, "the client");
  const mark = await backend.admin.logMark();
  let error: unknown;
  try {
    world.response = await client.mutation(
      api.depotCommands.amendDocument,
      commandCall(world),
    );
  } catch (thrown) {
    error = thrown;
  }
  world.error = error;
  const records = await backend.admin.completionsSince(mark, (entries) =>
    entries.some(
      (entry) =>
        entry.identifier === identifier && entry.componentPath === null,
    ),
  );
  const own = required(
    records.find(
      (entry) =>
        entry.identifier === identifier && entry.componentPath === null,
    ),
    "the command's completion record",
  );
  world.records = records.filter((entry) => entry.requestId === own.requestId);
  measure("faultedCommand", {
    point: required(world.point, "the fault point"),
    error: error === undefined ? null : String(error),
    records: world.records.map((entry) => ({
      identifier: entry.identifier,
      udfType: entry.udfType,
      componentPath: entry.componentPath,
      error: entry.error,
    })),
  });
  // One top-level mutation: the request left one completion record, the parent's own, and the
  // depot's sub-transaction is part of it.
  expect(world.records, JSON.stringify(world.records)).toHaveLength(1);
  expect(world.records[0]).toMatchObject({
    udfType: "Mutation",
    identifier,
    componentPath: null,
  });
}
export function assertOutcome(
  world: FaultWorld,
  outcome: "technical failure" | "applied",
) {
  const [record] = required(world.records, "the completion records");
  if (outcome === "applied") {
    expect(world.error, String(world.error)).toBeUndefined();
    expect(world.response).toMatchObject({ kind: "applied" });
    expect(record?.error).toBeNull();
    return;
  }
  const point = required(world.point, "the fault point");
  expect(world.response).toBeUndefined();
  // A technical failure is a plain error, never a ConvexError, so no client reads it as a
  // rejection or a transient refusal.
  expect(world.error, String(world.error)).toBeInstanceOf(Error);
  expect(world.error).not.toBeInstanceOf(ConvexError);
  expect(classifyThrown(world.error).kind).toBe("technical");
  const text = faultText(point, required(world.version, "the version"));
  expect(String(world.error)).toContain(text);
  expect(record?.error).toContain(text);
}
export async function assertVersion(world: FaultWorld, versionAfter: number) {
  const after = await readTables(required(world.backend, "the backend"));
  expect(after.streams).toHaveLength(1);
  expect(after.streams[0]?.streamVersion).toBe(versionAfter);
}
// The stream's row as stored, system fields included, is what it was before the command.
export async function assertStateUnchanged(world: FaultWorld) {
  const before = required(world.before, "the tables before the command");
  const after = await readTables(required(world.backend, "the backend"));
  expect(after.streams.map(bytesOf)).toEqual(before.streams.map(bytesOf));
}
export async function assertReceipt(world: FaultWorld, receiptExists: boolean) {
  const after = await readTables(required(world.backend, "the backend"));
  const forKey = after.receipts.filter(
    (row) =>
      row.tenantId === tenantId &&
      row.namespace === "public" &&
      row.commandType === commandType &&
      row.requestKey === requestKey,
  );
  expect(forKey).toHaveLength(receiptExists ? 1 : 0);
  if (!receiptExists)
    expect(after.receipts).toEqual(
      required(world.before, "the tables before the command").receipts,
    );
}
// The setup commands' operation IDs are known from their responses; the failed command's is not, so
// an event of the command is an event of the stream under any other operation ID.
export async function assertEvent(world: FaultWorld, eventExists: boolean) {
  const after = await readTables(required(world.backend, "the backend"));
  const setupOperations = new Set(
    required(world.setup, "the setup responses").map(
      (response) => response.operationId,
    ),
  );
  const fromCommand = after.events.filter(
    (row) => !setupOperations.has(String(row.operationId)),
  );
  expect(fromCommand).toHaveLength(eventExists ? 1 : 0);
  if (!eventExists) {
    expect(after.events).toEqual(
      required(world.before, "the tables before the command").events,
    );
    expect(after.events.map((row) => row.streamVersion)).toEqual(
      after.events.map((_, index) => index + 1),
    );
  }
}
// A command that names the version the stream held before the failure applies at the next one.
export async function assertNextCommandApplies(
  world: FaultWorld,
  call: { requestKey: string; title: string },
) {
  const version = required(world.version, "the version");
  const response = await required(world.client, "the client").mutation(
    api.depotCommands.amendDocument,
    {
      tenantId,
      requestKey: call.requestKey,
      input: { documentId, title: call.title, expectedVersion: version },
    },
  );
  expect(response).toMatchObject({
    kind: "applied",
    replayed: false,
    versions: [{ streamId: documentId, version: version + 1 }],
  });
  return response;
}
// The same command with the same request key, once the fault is off, is new intent: no receipt
// survived the failure, so it executes, commits its receipt and its event, and is not a replay.
export async function assertRetryExecutes(world: FaultWorld) {
  const backend = required(world.backend, "the backend");
  await backend.admin.run(getFunctionName(internal.switches.set), {
    tenantId,
    commandType,
    name: "failBeforeReceipt",
    on: false,
  });
  const version = required(world.version, "the version");
  const response = await required(world.client, "the client").mutation(
    api.depotCommands.amendDocument,
    commandCall(world),
  );
  expect(response).toMatchObject({
    kind: "applied",
    replayed: false,
    result: { documentId, status: "draft" },
    versions: [{ streamId: documentId, version: version + 1 }],
  });
  const after = await readTables(backend);
  expect(
    after.receipts.filter((row) => row.requestKey === requestKey),
  ).toMatchObject([{ operationId: response.operationId, outcome: "applied" }]);
  expect(
    after.events.filter((row) => row.operationId === response.operationId),
  ).toMatchObject([{ streamVersion: version + 1, eventType: "amended" }]);
}
