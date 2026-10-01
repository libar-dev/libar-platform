// Switches a native test turns on and off with admin access between calls. The fixture commands read
// them through their own admission policy and executor, the parts the composition supplies to the
// command library, which knows nothing of them.
import { v } from "convex/values";
import type {
  AdmissionPolicy,
  MutationCtx as CommandCtx,
} from "../../src/command/index.js";
import type { StreamVersion } from "../../src/kernel/index.js";
import type { DatabaseReader } from "./_generated/server.js";
import { internalMutation } from "./_generated/server.js";
const switchName = v.union(
  v.literal("rateLimited"),
  v.literal("capacity"),
  v.literal("failBeforeReceipt"),
);
export const set = internalMutation({
  args: {
    tenantId: v.string(),
    commandType: v.string(),
    name: switchName,
    on: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { tenantId, commandType, name, on }) => {
    const row = await ctx.db
      .query("switches")
      .withIndex("by_command", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("commandType", commandType)
          .eq("name", name),
      )
      .unique();
    if (on && row === null)
      await ctx.db.insert("switches", { tenantId, commandType, name });
    if (!on && row !== null) await ctx.db.delete("switches", row._id);
    return null;
  },
});
// The command library types its ctx with the tables it owns; at run time it is the app's own ctx.
const db = (ctx: CommandCtx) => ctx.db as unknown as DatabaseReader;
async function switchesOn(
  ctx: CommandCtx,
  tenantId: string,
  commandType: string,
) {
  const rows = await db(ctx)
    .query("switches")
    .withIndex("by_command", (q) =>
      q.eq("tenantId", tenantId).eq("commandType", commandType),
    )
    .take(3);
  return new Set(rows.map((row) => row.name));
}
// Refuses new intent while the command's rateLimited or capacity switch is on.
export const switchedAdmission =
  (commandType: string): AdmissionPolicy<unknown> =>
  async (ctx, call) => {
    const on = await switchesOn(ctx, call.tenantId, commandType);
    if (on.has("rateLimited"))
      return { admitted: false, code: "rateLimited", retryAfterMs: 1000 };
    if (on.has("capacity")) return { admitted: false, code: "capacity" };
    return { admitted: true };
  };
// Fails the command after its context call returned and before the receipt insert, while the
// command's failBeforeReceipt switch is on. The error names the versions the context call returned,
// which only a call that completed can know.
export async function failBeforeReceiptIfSwitched(
  ctx: CommandCtx,
  tenantId: string,
  commandType: string,
  versions: readonly StreamVersion[],
) {
  if ((await switchesOn(ctx, tenantId, commandType)).has("failBeforeReceipt"))
    throw new Error(
      `Fault injected: ${commandType} failed after its context call returned ${versions
        .map(
          ({ streamType, streamId, version }) =>
            `${streamType}/${streamId} at version ${version}`,
        )
        .join(", ")}`,
    );
}
