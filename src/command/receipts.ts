// Receipts of spec:command.idempotency-and-receipts: the key, the fingerprint, the lookup, the
// classification and the insert. Helpers inside the pipeline's mutation, never registered functions.
import { convexToJson, type JSONValue, type Value } from "convex/values";
import type { AffectedRef, StreamVersion } from "../kernel/index.js";
import type { CallerNamespace } from "./actor-and-scope.js";
import type { MutationCtx, Receipt } from "./tables.js";
import { nextTenant } from "./authority.js";
import { v } from "convex/values";
export type ReceiptKey = {
  tenantId: string;
  namespace: CallerNamespace;
  commandType: string;
  requestKey: string;
};
// No tombstone class: an expired receipt is new intent.
export type ReceiptClass =
  | { class: "new" }
  | { class: "duplicate"; receipt: Receipt }
  | { class: "conflict" }
  | { class: "unsupportedVersion" };
export type ReceiptInsert = ReceiptKey & {
  fingerprint: string;
  contractVersion: number;
  outcome: "applied" | "businessFailure";
  operationId: string;
  affected: AffectedRef[];
  versions: StreamVersion[];
  actorId: string;
};
// afterExpiry has one value: an expired receipt is deleted.
export type Retention = { window: number; afterExpiry: "delete" };
export const defaultRetention: Retention = {
  window: 7 * 24 * 60 * 60 * 1000,
  afterExpiry: "delete",
};
export const limitAffectedRefs = 1000;
function sorted(json: JSONValue): string {
  if (Array.isArray(json)) return `[${json.map(sorted).join(",")}]`;
  if (json !== null && typeof json === "object")
    return `{${Object.keys(json)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${sorted(json[key] ?? null)}`)
      .join(",")}}`;
  return JSON.stringify(json);
}
// The Convex JSON form of the value, so an int64, bytes and a non-finite number each have one tagged
// encoding, written with object keys sorted, undefined members omitted and no whitespace.
export function canonicalJson(value: unknown): string {
  return sorted(convexToJson(value as Value));
}
// The lowercase hex SHA-256 of the canonical input and the contract version. Never the request key,
// the tenant, the namespace, the actor, a timestamp, a correlation ID or a captured fact.
export async function fingerprintOf(
  input: unknown,
  contractVersion: number,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${canonicalJson(input)}\n${contractVersion}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function lookupReceipt(
  ctx: MutationCtx,
  key: ReceiptKey,
): Promise<Receipt | null> {
  return ctx.db
    .query("receipts")
    .withIndex("by_key", (q) =>
      q
        .eq("tenantId", key.tenantId)
        .eq("namespace", key.namespace)
        .eq("commandType", key.commandType)
        .eq("requestKey", key.requestKey),
    )
    .unique();
}
// contractVersion is the declaration's and now the mutation's Date.now(). Expiry is checked first, then
// the contract version, then the fingerprint.
export function classifyReceipt(
  found: Receipt | null,
  fingerprint: string,
  contractVersion: number,
  now: number,
): ReceiptClass {
  if (found === null || found.expiresAt <= now) return { class: "new" };
  if (found.tombstone)
    throw new Error(
      "A receipt is a tombstone, which no retention writes: afterExpiry is always delete",
    );
  if (found.contractVersion !== contractVersion)
    return { class: "unsupportedVersion" };
  if (found.fingerprint !== fingerprint) return { class: "conflict" };
  return { class: "duplicate", receipt: found };
}
// recordedAt is the mutation's Date.now(), and expiresAt is a retention window after it.
export async function insertReceipt(
  ctx: MutationCtx,
  receipt: ReceiptInsert,
  retention: Retention = defaultRetention,
) {
  if (
    receipt.affected.length > limitAffectedRefs ||
    receipt.versions.length > limitAffectedRefs
  )
    throw new Error(
      `A receipt holds at most ${limitAffectedRefs} affected refs and versions, not ${receipt.affected.length} affected refs and ${receipt.versions.length} versions`,
    );
  const recordedAt = Date.now();
  return ctx.db.insert("receipts", {
    ...receipt,
    recordedAt,
    expiresAt: recordedAt + retention.window,
    tombstone: false,
  });
}

// spec:command.receipt-table fnSweep. Operations supplies the time and batch size.
export const limitSweepBatch = 1000;
export const sweepArgs = {
  tenantId: v.string(),
  now: v.number(),
  limit: v.number(),
};
export const sweepResultValidator = v.object({
  deleted: v.number(),
  compacted: v.number(),
  more: v.boolean(),
});
export type SweepResult = { deleted: number; compacted: number; more: boolean };
export async function sweep(
  ctx: MutationCtx,
  { tenantId, now, limit }: { tenantId: string; now: number; limit: number },
): Promise<SweepResult> {
  if (!Number.isFinite(now))
    throw new Error("Receipt sweep now must be finite");
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Receipt sweep limit must be a positive safe integer");
  const size = Math.min(limit, limitSweepBatch);
  const expired = () =>
    ctx.db
      .query("receipts")
      .withIndex("by_tenant_expiry", (q) =>
        q.eq("tenantId", tenantId).lte("expiresAt", now),
      );
  const rows = await expired().take(size);
  let deleted = 0;
  for (const row of rows) {
    if (!row.tombstone) {
      const classified = classifyReceipt(
        row,
        row.fingerprint,
        row.contractVersion,
        now,
      );
      if (classified.class !== "new")
        throw new Error("Receipt sweep expected an expired receipt");
    }
    await ctx.db.delete(row._id);
    deleted++;
  }
  return { deleted, compacted: 0, more: (await expired().first()) !== null };
}
// The operations caller carries after between runs. A tenant with more stays on the same cursor;
// a null tenant ends the pass. Nothing schedules another run.
export const sweepNextArgs = {
  after: v.union(v.string(), v.null()),
  now: v.number(),
  limit: v.number(),
};
export const sweepNextResultValidator = v.object({
  ...sweepResultValidator.fields,
  tenantId: v.union(v.string(), v.null()),
  after: v.union(v.string(), v.null()),
});
export async function sweepNext(
  ctx: MutationCtx,
  args: { after: string | null; now: number; limit: number },
): Promise<SweepResult & { tenantId: string | null; after: string | null }> {
  const tenantId = await nextTenant(ctx, args.after);
  if (tenantId === null)
    return { tenantId, after: null, deleted: 0, compacted: 0, more: false };
  const result = await sweep(ctx, { ...args, tenantId });
  return { ...result, tenantId, after: result.more ? args.after : tenantId };
}
