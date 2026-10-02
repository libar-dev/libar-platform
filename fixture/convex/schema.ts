import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { auditTables } from "../../src/audit/index.js";
import { commandTables } from "../../src/command/index.js";
import { gateTables } from "../../src/gate/index.js";
import { readModelTables, rowConventions } from "../../src/read-model/index.js";
import { documentTitleFields } from "./documentTitles.js";
import { documentSummaryFields } from "./summaries.js";
export default defineSchema({
  timestamps: defineTable({ label: v.string(), commitTs: v.any() }).index(
    "by_commit",
    ["commitTs"],
  ),
  migrationSettings: defineTable({
    failKey: v.union(v.string(), v.null()),
    reads: v.number(),
    exhaustKey: v.optional(v.string()),
  }),
  migrationVisits: defineTable({ key: v.string(), version: v.number() }),
  enumerationPages: defineTable({
    tenantId: v.string(),
    cursor: v.union(v.string(), v.null()),
    size: v.number(),
  }),
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
  // The command library's receipts, grants and tenant list.
  ...commandTables,
  // The maintenance gate the pipeline's step 7 reads, and the audit records. See gate.ts.
  ...gateTables,
  ...auditTables,
  // The generation registry, and the rows of the fixture's document summary. See summaries.ts.
  ...readModelTables,
  documentSummaries: defineTable({
    ...rowConventions,
    ...documentSummaryFields,
  })
    .index("by_key", ["tenantId", "generation", "key"])
    .index("by_status", ["tenantId", "generation", "status", "key"]),
  // The rows of the fixture's second read model, whose projection throws. See documentTitles.ts.
  documentTitles: defineTable({
    ...rowConventions,
    ...documentTitleFields,
  }).index("by_key", ["tenantId", "generation", "key"]),
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
