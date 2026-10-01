import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  notes: defineTable({ source: v.string() }),
  depthRows: defineTable({ trial: v.string() }).index("by_trial", ["trial"]),
  markers: defineTable({ trial: v.string() }).index("by_trial", ["trial"]),
  throwerWrites: defineTable({ by: v.string() }).index("by_by", ["by"]),
  parentWrites: defineTable({ by: v.string() }),
  samples: defineTable({ value: v.number() }),
  blobs: defineTable({ group: v.string(), bytes: v.bytes() }).index(
    "by_group",
    ["group"],
  ),
});
