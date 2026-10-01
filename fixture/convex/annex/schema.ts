import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  notes: defineTable({ source: v.string() }),
  throwerWrites: defineTable({ by: v.string() }),
  samples: defineTable({ value: v.number() }),
  blobCounts: defineTable({ group: v.string(), blob: v.id("blobs") }).index(
    "by_group",
    ["group"],
  ),
  blobs: defineTable({ group: v.string(), bytes: v.bytes() }).index(
    "by_group",
    ["group"],
  ),
  rows: defineTable({ position: v.number(), label: v.string() }).index(
    "by_position",
    ["position"],
  ),
});
