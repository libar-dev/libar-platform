import {
  codeAnchor,
  codeAnchorId,
  ref,
} from "@libar-dev/software-delivery-protocol";
import { v } from "convex/values";
import { expect, test } from "vitest";
import {
  contextTables,
  createJournal,
  eventEnvelopeValidator,
  operationOutcomeValidator,
  planned,
  type StreamRegistration,
} from "../../src/context/index.js";
import {
  stockDecider,
  type StockCommand,
  type StockEvent,
  type StockResult,
  type StockState,
} from "../../fixture/domain/index.js";
// Binds the context library under src/context/ to its Specs. The library is bundled into every
// context component, so it carries no Protocol import itself; these tests carry its anchors.
const anchorComponent = codeAnchor({
  id: codeAnchorId("impl:context.context-component"),
  label: "defineOperation and the depot fixture context",
  satisfies: ref("spec:context.context-component"),
});
const anchorAdapter = codeAnchor({
  id: codeAnchorId("impl:context.persistence-adapter"),
  label: "execute, planned and runOperation in src/context",
  satisfies: ref("spec:context.persistence-adapter"),
});
const anchorJournal = codeAnchor({
  id: codeAnchorId("impl:context.journal"),
  label: "createJournal, load and append in src/context",
  satisfies: ref("spec:context.journal"),
});
const anchorTables = codeAnchor({
  id: codeAnchorId("impl:context.tables"),
  label: "the context tables in src/context",
  satisfies: ref("spec:context.tables"),
});
const anchorEnvelope = codeAnchor({
  id: codeAnchorId("impl:context.event-envelope"),
  label: "the envelope types and validators in src/context",
  satisfies: ref("spec:context.event-envelope"),
});
const anchorBatch = codeAnchor({
  id: codeAnchorId("impl:context.batch-shaped-api"),
  label:
    "the operation bounds in src/context and the depot's list-shaped operations",
  satisfies: ref("spec:context.batch-shaped-api"),
});
void [
  anchorComponent,
  anchorAdapter,
  anchorJournal,
  anchorTables,
  anchorEnvelope,
  anchorBatch,
];
const stock: StreamRegistration<
  StockState,
  StockCommand,
  StockEvent,
  StockResult
> = {
  decider: stockDecider,
  mapping: { kind: "single", budgetBytes: 4096, isDeleted: () => false },
  stateSchemaVersion: 1,
  eventValidators: {},
  dto: v.null(),
  toDto: () => null,
};

test("pure: planned leaves expectedVersion out unless the plan names one, and keeps 0", () => {
  const command: StockCommand = { commandType: "claim", quantity: 1 };
  expect(planned(stock, "p-1", command)).toStrictEqual({
    registration: stock,
    streamId: "p-1",
    command,
  });
  expect(planned(stock, "p-1", command, 0)).toStrictEqual({
    registration: stock,
    streamId: "p-1",
    command,
    expectedVersion: 0,
  });
});

test("pure: a journal is the frozen configuration it was created with", () => {
  const journal = createJournal({ contextId: "depot", history: "auditOnly" });
  expect(journal).toStrictEqual({ contextId: "depot", history: "auditOnly" });
  expect(Object.isFrozen(journal)).toBe(true);
});

test("pure: the events table's fields are the envelope's fifteen, and every index leads with tenantId", () => {
  const envelopeFields = Object.keys(eventEnvelopeValidator.fields).sort();
  expect(envelopeFields).toHaveLength(15);
  expect(Object.keys(contextTables.events.validator.fields).sort()).toEqual(
    envelopeFields,
  );
  expect(contextTables.events.validator.fields).toEqual(
    eventEnvelopeValidator.fields,
  );
  const indexes = Object.values(contextTables).flatMap((table) =>
    table[" indexes"](),
  );
  expect(
    indexes.map(({ indexDescriptor, fields }) => [indexDescriptor, fields]),
  ).toEqual([
    ["by_identity", ["tenantId", "streamType", "streamId"]],
    ["by_stream", ["tenantId", "streamType", "streamId", "streamVersion"]],
    ["by_event_id", ["tenantId", "eventId"]],
    ["by_operation", ["tenantId", "operationId"]],
  ]);
});

test("pure: an operation outcome carries kind, result, versions and per-stream DTO, version, count, created flag and envelopes", () => {
  const outcome = operationOutcomeValidator(v.string());
  expect(Object.keys(outcome.fields)).toEqual([
    "kind",
    "result",
    "versions",
    "streams",
  ]);
  expect(outcome.fields.result.kind).toBe("string");
  expect(Object.keys(outcome.fields.streams.element.fields)).toEqual([
    "dto",
    "version",
    "appended",
    "created",
    "events",
  ]);
  expect(outcome.fields.streams.element.fields.events.element).toBe(
    eventEnvelopeValidator,
  );
});
