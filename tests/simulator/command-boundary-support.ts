import { convexTest } from "convex-test";
import {
  componentsGeneric,
  queryGeneric,
  type FunctionReference,
} from "convex/server";
import { ConvexError, v, type Value } from "convex/values";
import { expect } from "vitest";
import { internal } from "../../fixture/convex/_generated/api.js";
import schema from "../../fixture/convex/schema.js";
import depotSchema from "../../fixture/convex/depot/schema.js";
import annexSchema from "../../fixture/convex/annex/schema.js";

const inspect = queryGeneric({
  args: {},
  returns: v.any(),
  handler: async (ctx) => ({
    streams: await ctx.db.query("streams").collect(),
    events: await ctx.db.query("events").collect(),
  }),
});
export function app() {
  const t = convexTest(
    schema,
    import.meta.glob("../../fixture/convex/**/*.ts"),
  );
  t.registerComponent("depot", depotSchema, {
    ...import.meta.glob("../../fixture/convex/depot/**/*.ts"),
    "../../fixture/convex/depot/inspection.ts": async () => ({
      stored: inspect,
    }),
  });
  t.registerComponent(
    "annex",
    annexSchema,
    import.meta.glob("../../fixture/convex/annex/**/*.ts"),
  );
  return t;
}
export type App = ReturnType<typeof app>;
export const issuer = "https://fixture-issuer.test";
export async function caller(t: App, subject = "alice", streamId?: string) {
  await t.mutation(internal.grants.grant, {
    tenantId: "t-1",
    principalKind: "human",
    principalId: `${issuer}|${subject}`,
    permission: "depot.documents",
    grantedBy: "operator",
    ...(streamId === undefined
      ? {}
      : { subject: { contextId: "depot", streamType: "document", streamId } }),
  });
  return t.withIdentity({ issuer, subject });
}
const storedRef = componentsGeneric().depot!.inspection!
  .stored as FunctionReference<
  "query",
  "public",
  Record<string, never>,
  { streams: Record<string, Value>[]; events: Record<string, Value>[] }
>;
export async function stored(t: App) {
  const context = await t.run((ctx) => ctx.runQuery(storedRef, {}));
  return {
    ...context,
    receipts: await t.run((ctx) => ctx.db.query("receipts").collect()),
  };
}
export async function failure(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => {
      throw new Error("The command applied instead of throwing");
    },
    (error: unknown) => error,
  );
}
export async function rejection(call: Promise<unknown>) {
  const error = await failure(call);
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<Record<string, Value>>).data;
}
export const create = (documentId = "a") => ({
  tenantId: "t-1",
  requestKey: "shared-key",
  input: { documentId, title: "Report" },
});
export async function expectEmpty(t: App) {
  expect(await stored(t)).toEqual({ streams: [], events: [], receipts: [] });
}
