// The writer check and the two gate writers of spec:application.write-pause. gateAllows is the one gate
// read: the restore door through the environment first, then the gate document. assertWritable is
// gateAllows plus the throw, called by the command pipeline's step 7 and by nothing else. closeScope and
// resumeScope are the only writers of the gate document, and each writes its operator audit record in
// the caller's mutation with no catch around it, so a failed insert changes nothing.
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { writeOperatorAudit } from "../audit/write.js";
import { refuseTransient } from "../command/outcome-boundary.js";
import type { SourceRef } from "../read-model/write.js";
import type {
  ClosedEntry,
  GateChangeDataModel,
  GateDataModel,
  GateDocument,
} from "./tables.js";
// "all", "tenant:" + tenantId, or "source:" + contextId + ":" + streamType.
export type ScopeKey = "all" | (string & {});
export type GateAnswer =
  { allowed: true } | { allowed: false; scopeKey: ScopeKey; reason: string };
// At most 16 scopes closed at once, so the document stays a few kilobytes.
export const limitClosedScopes = 16;
// A reason is 1 to 256 bytes of UTF-8, so the refusal's message stays under a kilobyte.
export const limitGateReasonBytes = 256;
export const tenantScope = (tenantId: string): ScopeKey => `tenant:${tenantId}`;
export const sourceScope = (source: SourceRef): ScopeKey =>
  `source:${source.contextId}:${source.streamType}`;
// "all", the tenant scope and one source scope per stream type the declaration writes, in that order.
export function scopesOfUseCase(
  tenantId: string,
  writes: readonly SourceRef[],
): ScopeKey[] {
  return ["all", tenantScope(tenantId), ...writes.map(sourceScope)];
}
// The one point read of the gate document; an absent document is no closed scope.
async function readGate(db: GenericDatabaseReader<GateDataModel>) {
  return db
    .query("maintenanceGates")
    .withIndex("by_key", (q) => q.eq("key", "gates"))
    .unique();
}
// Only the exact value "restore" closes the door. No component reads the variable.
export function restoreDoorClosed(): boolean {
  return process.env.MAINTENANCE_MODE === "restore";
}
// An entry is exempt only when the read states a generation, the entry names one, and they are equal.
const exempt = (
  entry: ClosedEntry,
  allowGeneration?: GenericId<"generations">,
) =>
  allowGeneration !== undefined &&
  entry.generationId !== undefined &&
  entry.generationId === allowGeneration;
export async function gateAllows(
  ctx: { db: GenericDatabaseReader<GateDataModel> },
  scopes: readonly ScopeKey[],
  allowGeneration?: GenericId<"generations">,
): Promise<GateAnswer> {
  if (restoreDoorClosed())
    return { allowed: false, scopeKey: "all", reason: "restore" };
  const gate = await readGate(ctx.db);
  const entry = gate?.closed.find(
    (closed) =>
      scopes.includes(closed.scopeKey) && !exempt(closed, allowGeneration),
  );
  return entry === undefined
    ? { allowed: true }
    : { allowed: false, scopeKey: entry.scopeKey, reason: entry.reason };
}
export async function assertWritable(
  ctx: { db: GenericDatabaseReader<GateDataModel> },
  scopes: readonly ScopeKey[],
): Promise<void> {
  const answer = await gateAllows(ctx, scopes);
  if (!answer.allowed)
    refuseTransient({
      code: "writePaused",
      message: `write paused for ${answer.scopeKey}: ${answer.reason}`,
    });
}
type GateWriter = { db: GenericDatabaseWriter<GateChangeDataModel> };
async function saveClosed(
  ctx: GateWriter,
  gate: GateDocument | null,
  closed: ClosedEntry[],
  now: number,
) {
  if (gate === null)
    await ctx.db.insert("maintenanceGates", {
      key: "gates",
      closed,
      updatedAt: now,
    });
  else await ctx.db.patch(gate._id, { closed, updatedAt: now });
}
// Called by closeGate and by the rebuild's startGeneration, which passes the generation row it inserted.
export async function closeScope(
  ctx: GateWriter,
  scopeKey: ScopeKey,
  reason: string,
  operator: string,
  generationId?: GenericId<"generations">,
): Promise<void> {
  const gate = await readGate(ctx.db);
  const closed = gate?.closed ?? [];
  if (closed.some((entry) => entry.scopeKey === scopeKey))
    throw new Error(`The scope ${scopeKey} is already closed`);
  if (closed.length >= limitClosedScopes)
    throw new Error(
      `The gate holds ${limitClosedScopes} closed scopes, its limit`,
    );
  const now = Date.now();
  const generation = generationId === undefined ? {} : { generationId };
  await saveClosed(
    ctx,
    gate,
    [
      ...closed,
      { scopeKey, reason, ...generation, changedAt: now, changedBy: operator },
    ],
    now,
  );
  await writeOperatorAudit(ctx, {
    kind: "gate.close",
    scopeKey,
    reason,
    ...generation,
    operator,
  });
}
// Called by resumeGate and by the rebuild's abortGeneration and switchGeneration. The audit record
// carries the reason and the generation of the entry it removed.
export async function resumeScope(
  ctx: GateWriter,
  scopeKey: ScopeKey,
  operator: string,
): Promise<void> {
  const gate = await readGate(ctx.db);
  const entry = gate?.closed.find((closed) => closed.scopeKey === scopeKey);
  if (gate === null || entry === undefined)
    throw new Error(`The scope ${scopeKey} is not closed`);
  await saveClosed(
    ctx,
    gate,
    gate.closed.filter((closed) => closed !== entry),
    Date.now(),
  );
  await writeOperatorAudit(ctx, {
    kind: "gate.resume",
    scopeKey,
    reason: entry.reason,
    ...(entry.generationId === undefined
      ? {}
      : { generationId: entry.generationId }),
    operator,
  });
}
