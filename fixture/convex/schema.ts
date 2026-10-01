import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { commandTables } from "../../src/command/index.js";
export default defineSchema({
  notes: defineTable({ source: v.string() }),
  depthRows: defineTable({ trial: v.string() }).index("by_trial", ["trial"]),
  markers: defineTable({ trial: v.string() }).index("by_trial", ["trial"]),
  throwerWrites: defineTable({ by: v.string() }).index("by_by", ["by"]),
  parentWrites: defineTable({ by: v.string() }),
  samples: defineTable({ value: v.number() }),
  // A parent table read by the built-in paginate, as a read-model list reads one. See parentList.ts.
  parentRows: defineTable({ position: v.number(), label: v.string() }).index(
    "by_position",
    ["position"],
  ),
  blobs: defineTable({ group: v.string(), bytes: v.bytes() }).index(
    "by_group",
    ["group"],
  ),
  // The command library's receipts and grants.
  ...commandTables,
  // A switch a test turns on with admin access to make one fixture command refuse admission or fail
  // after its context call returned. See switches.ts.
  switches: defineTable({
    tenantId: v.string(),
    commandType: v.string(),
    name: v.union(
      v.literal("rateLimited"),
      v.literal("capacity"),
      v.literal("failBeforeReceipt"),
    ),
  }).index("by_command", ["tenantId", "commandType", "name"]),
});
