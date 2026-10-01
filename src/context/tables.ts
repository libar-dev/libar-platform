// The tables of spec:context.tables, as a fragment a context component's schema.ts spreads into
// defineSchema. Single mapping only: no streamParts table.
import {
  defineTable,
  type DataModelFromSchemaDefinition,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type SchemaDefinition,
} from "convex/server";
import { v } from "convex/values";
import { actorValidator } from "../command/actor-and-scope.js";
import { causedByValidator } from "./envelope.js";
export const contextTables = {
  streams: defineTable({
    tenantId: v.string(),
    contextId: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    streamVersion: v.number(),
    stateSchemaVersion: v.number(),
    state: v.any(),
    baselineVersion: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    lastOperationId: v.string(),
    updatedAt: v.number(),
  }).index("by_identity", ["tenantId", "streamType", "streamId"]),
  events: defineTable({
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
  })
    .index("by_stream", ["tenantId", "streamType", "streamId", "streamVersion"])
    .index("by_event_id", ["tenantId", "eventId"])
    .index("by_operation", ["tenantId", "operationId"]),
};
// The data model the library reads and writes. A component's own data model holds these tables.
export type ContextDataModel = DataModelFromSchemaDefinition<
  SchemaDefinition<typeof contextTables, true>
>;
export type MutationCtx = GenericMutationCtx<ContextDataModel>;
export type QueryCtx = GenericQueryCtx<ContextDataModel>;
