import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  timestamps: defineTable({ label: v.string(), commitTs: v.any() }).index(
    "by_commit",
    ["commitTs"],
  ),
  notes: defineTable({ source: v.string() }),
  throwerWrites: defineTable({ by: v.string() }).index("by_by", ["by"]),
  samples: defineTable({ value: v.number() }),
  blobs: defineTable({ group: v.string(), payload: v.string() }).index(
    "by_group",
    ["group"],
  ),
  rows: defineTable({ position: v.number(), label: v.string() }).index(
    "by_position",
    ["position"],
  ),
});
