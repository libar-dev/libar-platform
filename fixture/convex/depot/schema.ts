import { defineSchema, defineTable } from "convex/server";
import { contextTables } from "../../../src/context/index.js";
import { v } from "convex/values";
export default defineSchema({
  ...contextTables,
  migrationVisits: defineTable({ streamId: v.string() }),
  migrationSettings: defineTable({
    parentId: v.string(),
    callback: v.string(),
  }),
});
