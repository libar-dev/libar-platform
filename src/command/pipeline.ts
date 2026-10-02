// The command pipeline of spec:command.command-pipeline: the steps between a caller's request and the
// committed outcome, in one top-level mutation. Its only failure signal is a throw.
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import { getConvexSize, v, type Validator, type Value } from "convex/values";
import {
  limitActorIdLength,
  limitIdLength,
  utf8Length,
} from "../context/text.js";
import type { CausedBy, OperationRef } from "../context/envelope.js";
import {
  affectedRefValidator,
  streamVersionValidator,
} from "../context/outcome.js";
import type { AffectedRef, StreamVersion } from "../kernel/index.js";
import type { Actor, CallerNamespace } from "./actor-and-scope.js";
import { authorize } from "./authority.js";
import type { CommandDeclaration } from "./declaration.js";
import { refuseTransient, reject } from "./outcome-boundary.js";
import {
  classifyReceipt,
  fingerprintOf,
  insertReceipt,
  lookupReceipt,
  type ReceiptKey,
} from "./receipts.js";
import type { MutationCtx } from "./tables.js";
import { writeAudit, type AuditDataModel } from "../audit/index.js";
import { assertWritable, scopesOfUseCase } from "../gate/gate.js";
import type { GateDataModel } from "../gate/tables.js";
import {
  fromSource,
  writeReadModels,
  type ReadModelDataModel,
  type RegistryReader,
  type RowWriter,
} from "../read-model/index.js";
// The public entry fills namespace with "public" and actor from step 2, and never sets causedBy.
export type PipelineCall<I> = {
  tenantId: string;
  namespace: CallerNamespace;
  actor: Actor;
  requestKey?: string;
  correlationId?: string;
  causedBy?: CausedBy;
  input: I;
};
// result is null exactly when the answer is a replay, because a receipt stores no result.
export type CommandResponse<R> = {
  kind: "applied" | "businessFailure";
  operationId: string;
  affected: AffectedRef[];
  versions: StreamVersion[];
} & ({ replayed: false; result: R } | { replayed: true; result: null });
export const outcomeKindValidator = v.union(
  v.literal("applied"),
  v.literal("businessFailure"),
);
export function commandResponseValidator<R>(
  output: Validator<R, "required", string>,
) {
  return v.union(
    v.object({
      kind: outcomeKindValidator,
      result: output,
      operationId: v.string(),
      affected: v.array(affectedRefValidator),
      versions: v.array(streamVersionValidator),
      replayed: v.literal(false),
    }),
    v.object({
      kind: outcomeKindValidator,
      result: v.null(),
      operationId: v.string(),
      affected: v.array(affectedRefValidator),
      versions: v.array(streamVersionValidator),
      replayed: v.literal(true),
    }),
  );
}
// The elements of the input's top-level arrays, which is what bounds.maxItems counts.
function itemsOf(input: unknown): number {
  if (input === null || typeof input !== "object") return 0;
  return Object.values(input).reduce<number>(
    (sum, field) => sum + (Array.isArray(field) ? field.length : 0),
    0,
  );
}
// The text fields a caller sets beside the input, their bounds in UTF-8 bytes and how each is read,
// in the order step 1 checks them: limitCallText of spec:command.command-pipeline.
type CallText = readonly [
  field: string,
  limit: number,
  read: (call: PipelineCall<unknown>) => string | undefined,
];
const callText: readonly CallText[] = [
  ["tenantId", limitIdLength, (call) => call.tenantId],
  ["requestKey", limitIdLength, (call) => call.requestKey],
  ["correlationId", limitIdLength, (call) => call.correlationId],
  ["actor.id", limitActorIdLength, (call) => call.actor.id],
  ["actor.issuer", limitIdLength, (call) => call.actor.issuer],
  [
    "actor.onBehalfOf.id",
    limitActorIdLength,
    (call) => call.actor.onBehalfOf?.id,
  ],
  ["actor.delegationRef", limitIdLength, (call) => call.actor.delegationRef],
  [
    "causedBy.commandType",
    limitIdLength,
    ({ causedBy }) =>
      causedBy?.kind === "command" ? causedBy.commandType : undefined,
  ],
  [
    "causedBy.tenantId",
    limitIdLength,
    ({ causedBy }) =>
      causedBy?.kind === "event" ? causedBy.tenantId : undefined,
  ],
  [
    "causedBy.contextId",
    limitIdLength,
    ({ causedBy }) =>
      causedBy?.kind === "event" ? causedBy.contextId : undefined,
  ],
  [
    "causedBy.eventId",
    limitIdLength,
    ({ causedBy }) =>
      causedBy?.kind === "event" ? causedBy.eventId : undefined,
  ],
  [
    "causedBy.migrationName",
    limitIdLength,
    ({ causedBy }) =>
      causedBy?.kind === "migration" ? causedBy.migrationName : undefined,
  ],
];
// The fields and bounds of callText in their order, for a test to hold against the Spec's list.
export const callTextOrder: readonly { field: string; limit: number }[] =
  callText.map(([field, limit]) => ({ field, limit }));
// Step 1 after the entry's args validators: caller-set text, the declaration's bounds and its
// refinement, all before any read.
function parse<I, R>(decl: CommandDeclaration<I, R>, call: PipelineCall<I>) {
  const commandType = decl.name;
  for (const [field, limit, read] of callText) {
    const value = read(call);
    if (value === undefined) continue;
    const length = utf8Length(value);
    if (length > limit)
      reject({
        code: "invalidInput",
        commandType,
        message: `${field} has at most ${limit} bytes of UTF-8`,
        details: { field, length, limit },
      });
  }
  // The declaration's name is no caller's input: a long one is a defect.
  const nameBytes = utf8Length(commandType);
  if (nameBytes > limitIdLength)
    throw new Error(
      `A command type has at most ${limitIdLength} bytes of UTF-8, and this declaration's name has ${nameBytes}`,
    );
  const { maxItems, maxBytes } = decl.bounds ?? {};
  const items = itemsOf(call.input);
  if (maxItems !== undefined && items > maxItems)
    reject({
      code: "operationTooLarge",
      commandType,
      message: `${commandType} takes at most ${maxItems} items, not ${items}`,
      details: { items, maxItems },
    });
  const bytes = getConvexSize(call.input as Value);
  if (maxBytes !== undefined && bytes > maxBytes)
    reject({
      code: "operationTooLarge",
      commandType,
      message: `${commandType} takes at most ${maxBytes} bytes of input, not ${bytes}`,
      details: { bytes, maxBytes },
    });
  const refused = decl.refine?.(call.input) ?? null;
  if (refused !== null)
    reject({ ...refused, code: "invalidInput", commandType });
}
// Steps 1 and 3 to 11 for either entry; the public entry ran step 2 before it built the call. Step 11
// emits no diagnostic.
export async function runPipeline<I, R>(
  ctx: MutationCtx,
  decl: CommandDeclaration<I, R>,
  call: PipelineCall<I>,
): Promise<CommandResponse<R>> {
  const commandType = decl.name;
  parse(decl, call);
  // Step 3: the tenantId argument is the scope of every read and write that follows.
  const { tenantId, actor, input } = call;
  // Step 4, before any execution and before any receipt is read.
  const decision = await authorize(ctx, {
    tenantId,
    actor,
    permission: decl.permission.permission,
    ...(decl.permission.subjectFrom === undefined
      ? {}
      : { subject: decl.permission.subjectFrom(input) }),
  });
  if (!decision.allowed)
    reject({
      code: "forbidden",
      commandType,
      message: `The caller may not run ${commandType} in this tenant`,
      details: { reason: decision.reason },
    });
  // Step 5, for a receipted call.
  let receipt: (ReceiptKey & { fingerprint: string }) | undefined;
  if (call.requestKey !== undefined) {
    const key: ReceiptKey = {
      tenantId,
      namespace: call.namespace,
      commandType,
      requestKey: call.requestKey,
    };
    const fingerprint = await fingerprintOf(input, decl.contractVersion);
    const found = await lookupReceipt(ctx, key);
    const classified = classifyReceipt(
      found,
      fingerprint,
      decl.contractVersion,
      Date.now(),
    );
    switch (classified.class) {
      case "new":
        // An expired receipt is absent, and is deleted in this mutation.
        if (found !== null) await ctx.db.delete(found._id);
        break;
      case "unsupportedVersion":
        reject({
          code: "unsupportedContractVersion",
          commandType,
          message: "This request key was used under another contract version",
        });
      case "conflict":
        reject({
          code: "idempotencyConflict",
          commandType,
          message: "This request key was used with other input",
        });
      case "duplicate": {
        const stored = classified.receipt;
        return {
          kind: stored.outcome,
          result: null,
          operationId: stored.operationId,
          affected: stored.affected,
          versions: stored.versions,
          replayed: true,
        };
      }
    }
    receipt = { ...key, fingerprint };
  }
  // Step 6, for new intent only.
  if (decl.admission !== undefined) {
    const admission = await decl.admission(ctx, call);
    if (!admission.admitted)
      refuseTransient({
        code: admission.code,
        message: `${commandType} is not admitted now`,
        ...(admission.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: admission.retryAfterMs }),
      });
  }
  // Step 7: the gate, read once, and only then the operation, minted once, before the first context
  // call. The library types ctx with the command tables; every composition that registers a command
  // holds the gate's table too, and at run time ctx is that composition's own.
  await assertWritable(
    ctx as unknown as { db: GenericDatabaseReader<GateDataModel> },
    scopesOfUseCase(tenantId, decl.writes),
  );
  const operation: OperationRef = {
    operationId: crypto.randomUUID(),
    causedBy: call.causedBy ?? { kind: "command", commandType },
    ...(call.correlationId === undefined
      ? {}
      : { correlationId: call.correlationId }),
  };
  // Step 8.
  const executed = await decl.executor(ctx, {
    tenantId,
    actor,
    operation,
    input,
  });
  const affected = executed.versions.map(
    ({ contextId, streamType, streamId }) => ({
      contextId,
      streamType,
      streamId,
    }),
  );
  // Step 9: the declaration's writes, proven against what the executor returned, then its read models.
  for (const { version } of executed.streams)
    if (!decl.writes.some((source) => fromSource(source, { version })))
      throw new Error(
        `${commandType} wrote ${version.contextId}/${version.streamType}, which its declaration does not list in writes`,
      );
  if (decl.readModels !== undefined && decl.readModels.length > 0)
    // The library types ctx with the command tables. A parent that declares a read model holds the
    // registry and the read model's table too, and at run time ctx is that parent's own.
    await writeReadModels(
      ctx as unknown as RegistryReader<ReadModelDataModel> &
        RowWriter<ReadModelDataModel>,
      commandType,
      decl.readModels,
      { tenantId, streams: executed.streams },
    );
  // Step 10.
  if (receipt !== undefined)
    await insertReceipt(
      ctx,
      {
        ...receipt,
        contractVersion: decl.contractVersion,
        outcome: executed.kind,
        operationId: operation.operationId,
        affected,
        versions: executed.versions,
        actorId: actor.id,
      },
      decl.retention,
    );
  // Step 10, the audit record of a declaration that sets audit, every field from the command alone.
  if (decl.audit !== undefined) {
    const first = executed.versions[0];
    const subject =
      decl.permission.subjectFrom?.(input) ??
      (first === undefined
        ? undefined
        : {
            contextId: first.contextId,
            streamType: first.streamType,
            streamId: first.streamId,
          });
    if (subject === undefined)
      throw new Error(
        `${commandType} sets audit, declares no subjectFrom and returned no version, so its audit record has no subject`,
      );
    await writeAudit(
      ctx as unknown as { db: GenericDatabaseWriter<AuditDataModel> },
      {
        tenantId,
        operationId: operation.operationId,
        ...(call.requestKey === undefined
          ? {}
          : { requestKey: call.requestKey }),
        commandType,
        actor,
        subject,
        kind: decl.audit.kind,
        decision: executed.kind,
        causedBy: operation.causedBy,
      },
    );
  }
  // Step 11.
  return {
    kind: executed.kind,
    result: executed.result,
    operationId: operation.operationId,
    affected,
    versions: executed.versions,
    replayed: false,
  };
}
