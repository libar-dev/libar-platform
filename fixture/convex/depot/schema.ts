/**
 * @sdpAnchor impl:context.context-component.depot-schema
 * @sdpLabel the depot fixture's schema
 * @sdpReferences spec:context.context-component
 */
import { defineSchema, defineTable } from "convex/server";
import { contextTables } from "../../../src/context/index.js";
import { v } from "convex/values";
// A context component's schema holds the context library's tables. This fixture context adds the two
// tables its migrations use, see migrations.ts.
export default defineSchema({
  ...contextTables,
  migrationVisits: defineTable({ streamId: v.string() }),
  migrationSettings: defineTable({
    parentId: v.string(),
    callback: v.string(),
  }),
});
