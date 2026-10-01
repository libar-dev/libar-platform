// The event envelope of spec:context.event-envelope: the fifteen fields every event carries.
import { v } from "convex/values";
import { actorValidator, type Actor } from "../command/actor-and-scope.js";
export type CausedBy =
  | { kind: "command"; commandType: string }
  | { kind: "event"; tenantId: string; contextId: string; eventId: string }
  | { kind: "migration"; migrationName: string };
export const causedByValidator = v.union(
  v.object({ kind: v.literal("command"), commandType: v.string() }),
  v.object({
    kind: v.literal("event"),
    tenantId: v.string(),
    contextId: v.string(),
    eventId: v.string(),
  }),
  v.object({ kind: v.literal("migration"), migrationName: v.string() }),
);
// What the parent passes with every context call and the adapter copies onto every event.
export type OperationRef = {
  operationId: string;
  correlationId?: string;
  causedBy: CausedBy;
};
export const operationRefValidator = v.object({
  operationId: v.string(),
  correlationId: v.optional(v.string()),
  causedBy: causedByValidator,
});
export type EventEnvelope<P = unknown> = {
  eventId: string;
  tenantId: string;
  contextId: string;
  streamType: string;
  streamId: string;
  streamVersion: number;
  eventType: string;
  eventSchemaVersion: number;
  operationId: string;
  correlationId?: string;
  causedBy: CausedBy;
  actor: Actor;
  recordedAt: number;
  occurredAt?: number;
  payload: P;
};
export const eventEnvelopeValidator = v.object({
  eventId: v.string(),
  tenantId: v.string(),
  contextId: v.string(),
  streamType: v.string(),
  streamId: v.string(),
  streamVersion: v.number(),
  eventType: v.string(),
  eventSchemaVersion: v.number(),
  operationId: v.string(),
  correlationId: v.optional(v.string()),
  causedBy: causedByValidator,
  actor: actorValidator,
  recordedAt: v.number(),
  occurredAt: v.optional(v.number()),
  payload: v.any(),
});
// What the adapter hands append, which adds eventId, streamVersion and the domain event's own fields.
export type EnvelopeInput = {
  tenantId: string;
  contextId: string;
  streamType: string;
  streamId: string;
  operation: OperationRef;
  actor: Actor;
  recordedAt: number;
};
