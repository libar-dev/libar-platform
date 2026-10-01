import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalMutation, mutation } from "./_generated/server.js";
import type { MutationCtx } from "./_generated/server.js";
export interface Caught {
  isConvexError: boolean;
  data: unknown;
  message: string;
  addedProperty: string | null;
}
const thrown = {
  kind: v.union(v.literal("convexError"), v.literal("plainError")),
  data: v.any(),
};
const parentArgs = {
  ...thrown,
  boundary: v.union(v.literal("nested"), v.literal("annex")),
};
export const throwAfterWrite = internalMutation({
  args: thrown,
  returns: v.null(),
  handler: async (ctx, { kind, data }) => {
    const before = await ctx.meta.getTransactionMetrics();
    await ctx.db.insert("throwerWrites", { by: "thrower" });
    const after = await ctx.meta.getTransactionMetrics();
    const rows = await ctx.db
      .query("throwerWrites")
      .withIndex("by_by", (q) => q.eq("by", "thrower"))
      .take(2);
    // This guard runs inside the transaction, before the throw rolls the row back.
    if (after.documentsWritten.used - before.documentsWritten.used !== 1 || rows.length !== 1)
      throw new Error("The thrower did not write exactly one row before throwing");
    if (kind === "plainError")
      throw Object.assign(new Error(`plain failure: ${String(data)}`), {
        addedProperty: "present",
      });
    throw new ConvexError(data);
  },
});
function callThrower(
  ctx: MutationCtx,
  a: {
    boundary: "nested" | "annex";
    kind: "convexError" | "plainError";
    data: unknown;
  },
): Promise<null> {
  return ctx.runMutation(
    a.boundary === "nested"
      ? internal.failures.throwAfterWrite
      : components.annex.failures.throwAfterWrite,
    { kind: a.kind, data: a.data },
  );
}
export const catching = mutation({
  args: parentArgs,
  returns: v.any(),
  handler: async (ctx, a): Promise<Caught> => {
    await ctx.db.insert("parentWrites", { by: "catching parent" });
    let caught: unknown;
    try {
      await callThrower(ctx, a);
    } catch (error) {
      caught = error;
    }
    return {
      isConvexError: caught instanceof ConvexError,
      data: caught instanceof ConvexError ? (caught.data as unknown) : null,
      message: caught === undefined ? "nothing was thrown" : String(caught),
      addedProperty:
        (caught as { addedProperty?: string } | undefined)?.addedProperty ??
        null,
    };
  },
});
export const passing = mutation({
  args: parentArgs,
  returns: v.null(),
  handler: (ctx, a): Promise<null> => callThrower(ctx, a),
});
