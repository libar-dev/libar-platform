import { defineSchema } from "convex/server";
import { commandTables } from "../../src/command/index.js";
export default defineSchema({
  // The command library's receipts and grants.
  ...commandTables,
});
