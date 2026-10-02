import { getConvexSize, getDocumentSize } from "convex/values";
import { expect, test } from "vitest";
import {
  utf8Length,
  limitIdLength,
  limitActorIdLength,
} from "../../src/command/index.js";
import {
  utf8Length as contextUtf8Length,
  limitEnvelopeBytes,
  limitPayloadBytes,
  limitEventBytes,
} from "../../src/context/index.js";

test.each([
  ["", 0],
  ["a", 1],
  ["é", 2],
  ["€", 3],
  ["😀", 4],
] as const)("UTF-8 length of %j is %i bytes", (value, bytes) => {
  expect(utf8Length(value)).toBe(bytes);
  expect(contextUtf8Length(value)).toBe(bytes);
  expect(utf8Length(value)).toBe(getConvexSize(value) - 2);
});
test("the exported text and event bounds agree", () => {
  expect(limitIdLength).toBe(256);
  expect(limitActorIdLength).toBe(512);
  expect(limitEnvelopeBytes).toBe(4096);
  expect(limitPayloadBytes).toBe(16384);
  expect(limitEventBytes).toBe(20480);
  expect(limitEventBytes).toBe(limitPayloadBytes + limitEnvelopeBytes);
});
// spec:context.event-envelope, limitEnvelopeBytes and limitEventBytes.
test.each([
  [0, 3486],
  [200, 4086],
])(
  "caller fields at their bounds with names of %i bytes measure %i bytes",
  (names, bytes) => {
    const value = {
      eventId: "e".repeat(36),
      tenantId: "t".repeat(256),
      contextId: "c".repeat(names),
      streamType: "s".repeat(names),
      streamId: "s".repeat(256),
      streamVersion: 1,
      eventType: "e".repeat(names),
      eventSchemaVersion: 1,
      operationId: "o".repeat(36),
      correlationId: "c".repeat(256),
      actor: {
        kind: "reviewer",
        id: "a".repeat(512),
        issuer: "i".repeat(256),
        onBehalfOf: { kind: "reviewer", id: "b".repeat(512) },
        delegationRef: "d".repeat(256),
      },
      causedBy: {
        kind: "event",
        tenantId: "t".repeat(256),
        contextId: "c".repeat(256),
        eventId: "e".repeat(256),
      },
      recordedAt: 1,
      occurredAt: 1,
      payload: {},
    };
    expect(getConvexSize(value) - getConvexSize(value.payload)).toBe(bytes);
    expect(bytes).toBeLessThanOrEqual(4096);
  },
);
test("stored document system fields add 61 bytes", () => {
  expect(getDocumentSize({}) - getConvexSize({})).toBe(61);
});

// UTF-8 replaces an unpaired surrogate with U+FFFD. The pinned Convex size helper counts it differently.
test("UTF-8 length counts an unpaired high surrogate as three bytes", () => {
  const value = "\ud800";
  expect(new TextEncoder().encode(value)).toHaveLength(3);
  expect(utf8Length(value)).toBe(3);
  expect(contextUtf8Length(value)).toBe(3);
});
