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
