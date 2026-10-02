import { defineSchema, defineTable } from "convex/server";
import { auditTables } from "../../src/audit/index.js";
import { commandTables } from "../../src/command/index.js";
import { gateTables } from "../../src/gate/index.js";
import { readModelTables, rowConventions } from "../../src/read-model/index.js";
import { orderSummaryFields } from "./orderSummary.js";
export default defineSchema({
  // The command library's receipts, grants and tenant list.
  ...commandTables,
  // The maintenance gate the pipeline's step 7 reads, and the audit records. See gate.ts.
  ...gateTables,
  ...auditTables,
  // The generation registry, and the rows of the order summary. See orderSummary.ts.
  ...readModelTables,
  orderSummaries: defineTable({ ...rowConventions, ...orderSummaryFields })
    .index("by_key", ["tenantId", "generation", "key"])
    .index("by_status", ["tenantId", "generation", "status", "placedAt"]),
});
