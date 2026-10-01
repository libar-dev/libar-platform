import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  writes: defineTable({ marker: v.string() }),
  probe2Writes: defineTable({ marker: v.string() }),
  probe3Docs: defineTable({ value: v.number() }),
  blobs: defineTable({ bytes: v.bytes(), group: v.string() }).index(
    "by_group",
    ["group"],
  ),
  rows: defineTable({ position: v.number(), value: v.string() }).index(
    "by_position",
    ["position"],
  ),
});
