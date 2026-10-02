import { defineSchema, defineTable } from "convex/server";
import { commandTables } from "../../src/command/index.js";
import { readModelTables, rowConventions } from "../../src/read-model/index.js";
import { orderSummaryFields } from "./orderSummary.js";
export default defineSchema({
  // The command library's receipts and grants.
  ...commandTables,
  // The generation registry, and the rows of the order summary. See orderSummary.ts.
  ...readModelTables,
  orderSummaries: defineTable({ ...rowConventions, ...orderSummaryFields })
    .index("by_key", ["tenantId", "generation", "key"])
    .index("by_status", ["tenantId", "generation", "status", "placedAt"]),
});
