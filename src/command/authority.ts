// The parent's authority helpers of spec:command.actor-and-scope and spec:command.tenancy-and-authority:
// establishActor, the one reader of ctx.auth, authorize, the one reader of grants on a command path, and
// the plain helpers an operator's function uses to write and delete a grant. None is registered here.
import type { Actor, AuthorizeInput, SubjectRef } from "./actor-and-scope.js";
import type { Grant, GrantId, MutationCtx, QueryCtx } from "./tables.js";
export type AuthorizeDecision =
  | { allowed: true; grantIds: GrantId[] }
  | { allowed: false; reason: "no_grant" | "subject_mismatch" };
export const limitGrantsRead = 500;
// null when the caller is not authenticated; a service actor when its issuer is a configured service
// issuer, and a human actor otherwise.
export async function establishActor(
  ctx: MutationCtx | QueryCtx,
  serviceIssuers: ReadonlySet<string>,
): Promise<Actor | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return {
    kind: serviceIssuers.has(identity.issuer) ? "service" : "human",
    id: identity.tokenIdentifier,
    issuer: identity.issuer,
  };
}
async function grantsOf(
  ctx: { db: MutationCtx["db"] | QueryCtx["db"] },
  tenantId: string,
  principalKind: Actor["kind"],
  principalId: string,
): Promise<Grant[]> {
  const grants = await ctx.db
    .query("grants")
    .withIndex("by_principal", (q) =>
      q
        .eq("tenantId", tenantId)
        .eq("principalKind", principalKind)
        .eq("principalId", principalId),
    )
    .take(limitGrantsRead + 1);
  // take(n) never shows whether more exist, so a 501st row is read and surfaced, never truncated.
  if (grants.length > limitGrantsRead)
    throw new Error(
      `A ${principalKind} principal holds more than ${limitGrantsRead} grants in tenant ${tenantId}`,
    );
  return grants;
}
const sameSubject = (a: SubjectRef, b: SubjectRef | undefined) =>
  b !== undefined &&
  a.contextId === b.contextId &&
  a.streamType === b.streamType &&
  a.streamId === b.streamId;
// A grant with no subject covers every subject; a grant that names one covers that subject only.
export async function authorize(
  ctx: MutationCtx | QueryCtx,
  input: AuthorizeInput,
): Promise<AuthorizeDecision> {
  const grants = (
    await grantsOf(ctx, input.tenantId, input.actor.kind, input.actor.id)
  ).filter((grant) => grant.permission === input.permission);
  const matching = grants.filter(
    (grant) =>
      grant.subject === undefined || sameSubject(grant.subject, input.subject),
  );
  if (matching.length > 0)
    return { allowed: true, grantIds: matching.map((grant) => grant._id) };
  return {
    allowed: false,
    reason: grants.length > 0 ? "subject_mismatch" : "no_grant",
  };
}
export type GrantInput = {
  tenantId: string;
  principalKind: Actor["kind"];
  principalId: string;
  permission: string;
  subject?: SubjectRef;
  grantedBy: string;
};
export async function insertGrant(
  ctx: { db: MutationCtx["db"] },
  grant: GrantInput,
): Promise<GrantId> {
  return ctx.db.insert("grants", { ...grant, grantedAt: Date.now() });
}
// Revocation deletes the rows that grant this permission to this principal, on this subject when one
// is named and otherwise on any; the next command's read finds none. Returns the number deleted.
export async function revokeGrant(
  ctx: { db: MutationCtx["db"] },
  grant: Omit<GrantInput, "grantedBy">,
): Promise<number> {
  const rows = (
    await grantsOf(ctx, grant.tenantId, grant.principalKind, grant.principalId)
  ).filter(
    (row) =>
      row.permission === grant.permission &&
      (grant.subject === undefined ||
        (row.subject !== undefined && sameSubject(row.subject, grant.subject))),
  );
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}
