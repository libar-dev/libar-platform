// The composition's receipt sweep, called by operations.
import * as receipts from "../../src/command/receipts.js";
import { internalMutation } from "./_generated/server.js";
export const sweep = internalMutation({
  args: receipts.sweepArgs,
  returns: receipts.sweepResultValidator,
  handler: receipts.sweep,
});
export const sweepNext = internalMutation({
  args: receipts.sweepNextArgs,
  returns: receipts.sweepNextResultValidator,
  handler: receipts.sweepNext,
});
