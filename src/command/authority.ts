// The parent's authority helpers of spec:command.actor-and-scope and spec:command.tenancy-and-authority:
// establishActor, the one reader of ctx.auth, authorize, the one reader of grants on a command path,
// authorizeQuery, which a parent query calls before it discloses anything, the plain helpers an
// operator's function uses to write and delete a grant, and nextTenant, which reads the tenant list.
// None is registered here.
import type { GenericDatabaseReader, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";
import { limitIdLength, utf8Length } from "../context/text.js";
import { assertWritable, scopesOfUseCase } from "../gate/gate.js";
import type { GateDataModel } from "../gate/tables.js";
import type { Actor, AuthorizeInput, SubjectRef } from "./actor-and-scope.js";
import { reject } from "./outcome-boundary.js";
import type {
  CommandDataModel,
  Grant,
  GrantId,
  MutationCtx,
  QueryCtx,
} from "./tables.js";
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
// A grant is written like any other write: a closed "all" or tenant scope, or the restore door,
// refuses it with writePaused before anything is read. The library types db with the command tables;
// every composition that writes grants holds the gate's table too.
async function assertGrantWritable(
  ctx: { db: MutationCtx["db"] },
  tenantId: string,
): Promise<void> {
  await assertWritable(
    ctx as unknown as { db: GenericDatabaseReader<GateDataModel> },
    scopesOfUseCase(tenantId, []),
  );
}
// Inserts the tenant's row in the tenant list when it has none, then the grant, in one mutation, so no
// tenant holds a grant without a row.
export async function insertGrant(
  ctx: { db: MutationCtx["db"] },
  grant: GrantInput,
): Promise<GrantId> {
  // The tenant ID is stored in the tenant list, which holds at most limitIdLength bytes of it.
  const length = utf8Length(grant.tenantId);
  if (length > limitIdLength)
    throw new ConvexError({
      code: "invalidInput",
      message: `tenantId has at most ${limitIdLength} bytes of UTF-8`,
      details: { field: "tenantId", length, limit: limitIdLength },
    });
  await assertGrantWritable(ctx, grant.tenantId);
  const now = Date.now();
  const tenant = await ctx.db
    .query("tenants")
    .withIndex("by_tenant", (q) => q.eq("tenantId", grant.tenantId))
    .first();
  if (tenant === null)
    await ctx.db.insert("tenants", {
      tenantId: grant.tenantId,
      createdAt: now,
    });
  return ctx.db.insert("grants", { ...grant, grantedAt: now });
}
// The tenant after `after` in ascending tenant-ID order, or the first when `after` is null; null when
// none follows. One indexed read, so a pass over the whole deployment takes one tenant at a time.
export async function nextTenant(
  ctx: { db: QueryCtx["db"] },
  after: string | null,
): Promise<string | null> {
  const row = await ctx.db
    .query("tenants")
    .withIndex("by_tenant", (q) =>
      after === null ? q : q.gt("tenantId", after),
    )
    .first();
  return row === null ? null : row.tenantId;
}
// Revocation deletes the rows that grant this permission to this principal, on this subject when one
// is named and otherwise on any, after the same gate read as insertGrant; the next command's read
// finds none. Returns the number deleted. It reads past the command path's bound of limitGrantsRead,
// so it can reduce a principal that holds more.
export async function revokeGrant(
  ctx: { db: MutationCtx["db"] },
  grant: Omit<GrantInput, "grantedBy">,
): Promise<number> {
  await assertGrantWritable(ctx, grant.tenantId);
  const rows = (
    await ctx.db
      .query("grants")
      .withIndex("by_principal", (q) =>
        q
          .eq("tenantId", grant.tenantId)
          .eq("principalKind", grant.principalKind)
          .eq("principalId", grant.principalId),
      )
      .collect()
  ).filter(
    (row) =>
      row.permission === grant.permission &&
      (grant.subject === undefined ||
        (row.subject !== undefined && sameSubject(row.subject, grant.subject))),
  );
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}
// What a parent query states before it discloses anything: its own name, the tenant it reads and the
// permission the read requires.
export type QueryPolicy = {
  name: string;
  tenantId: string;
  permission: string;
  subject?: SubjectRef;
};
const noServiceIssuers: ReadonlySet<string> = new Set();
// Establishes the actor and authorizes it for the tenant, as the pipeline's steps 2 and 4 do, and
// returns the actor. A refusal is the rejection a command throws for the same refusal, with the
// query's name as the entry that refused. It writes nothing.
export async function authorizeQuery<DataModel extends CommandDataModel>(
  parentCtx: GenericQueryCtx<DataModel>,
  policy: QueryPolicy,
  serviceIssuers: ReadonlySet<string> = noServiceIssuers,
): Promise<Actor> {
  // The parent's data model holds the command tables; a database reader is not covariant in its model.
  const ctx = parentCtx as unknown as QueryCtx;
  const actor = await establishActor(ctx, serviceIssuers);
  if (actor === null)
    reject({
      code: "unauthenticated",
      entry: policy.name,
      message: `${policy.name} needs an authenticated caller`,
    });
  const decision = await authorize(ctx, {
    tenantId: policy.tenantId,
    actor,
    permission: policy.permission,
    ...(policy.subject === undefined ? {} : { subject: policy.subject }),
  });
  if (!decision.allowed)
    reject({
      code: "forbidden",
      entry: policy.name,
      message: `The caller may not read ${policy.name} in this tenant`,
      details: { reason: decision.reason },
    });
  return actor;
}
