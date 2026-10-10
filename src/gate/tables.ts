// The maintenance gate's table of spec:application.write-pause, as a fragment every composition that
// registers a command spreads into defineSchema, because the pipeline's step 7 reads it. It holds at
// most one document, whose closed entries are in the order they were closed.
import {
  defineTable,
  type DataModelFromSchemaDefinition,
  type DocumentByName,
  type SchemaDefinition,
} from "convex/server";
import { v } from "convex/values";
import type { auditTables } from "../audit/tables.js";
// changedBy is the stated operator and changedAt the closing mutation's Date.now().
export const closedEntryValidator = v.object({
  scopeKey: v.string(),
  reason: v.string(),
  generationId: v.optional(v.id("generations")),
  changedAt: v.number(),
  changedBy: v.string(),
});
export const gateTables = {
  maintenanceGates: defineTable({
    key: v.literal("gates"),
    closed: v.array(closedEntryValidator),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
};
export type GateDataModel = DataModelFromSchemaDefinition<
  SchemaDefinition<typeof gateTables, true>
>;
export type GateDocument = DocumentByName<GateDataModel, "maintenanceGates">;
export type ClosedEntry = GateDocument["closed"][number];
// What a gate change writes: the gate document and its operator audit record, in one mutation.
export type GateChangeDataModel = DataModelFromSchemaDefinition<
  SchemaDefinition<typeof gateTables & typeof auditTables, true>
>;
