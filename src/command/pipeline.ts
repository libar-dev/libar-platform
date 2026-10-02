// The command pipeline of spec:command.command-pipeline: the steps between a caller's request and the
// committed outcome, in one top-level mutation. Its only failure signal is a throw.
import { getConvexSize, v, type Validator, type Value } from "convex/values";
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
  limitIdLength,
  lookupReceipt,
  type ReceiptKey,
} from "./receipts.js";
import type { MutationCtx } from "./tables.js";
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
// Step 1 after the entry's args validators: the lengths of the IDs a receipt row holds, the
// declaration's bounds and its refinement, all before any read.
function parse<I, R>(decl: CommandDeclaration<I, R>, call: PipelineCall<I>) {
  const commandType = decl.name;
  const ids = [
    ["tenantId", call.tenantId, "A tenant ID"],
    ["requestKey", call.requestKey, "A request key"],
  ] as const;
  for (const [field, value, what] of ids)
    if (value !== undefined && value.length > limitIdLength)
      reject({
        code: "invalidInput",
        commandType,
        message: `${what} has at most ${limitIdLength} characters`,
        details: { field, length: value.length, limit: limitIdLength },
      });
  // The declaration's name is no caller's input: a long one is a defect.
  if (commandType.length > limitIdLength)
    throw new Error(
      `A command type has at most ${limitIdLength} characters, and this declaration's name has ${commandType.length}`,
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
// Steps 1 and 3 to 11 for either entry; the public entry ran step 2 before it built the call. Step 7
// reads no gate, and steps 10 and 11 write no audit record and emit no diagnostic.
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
          message: `The receipt for this key was recorded under contract version ${classified.storedContractVersion}, not ${decl.contractVersion}`,
          details: {
            storedContractVersion: classified.storedContractVersion,
            contractVersion: decl.contractVersion,
            operationId: classified.storedOperationId,
          },
        });
      case "conflict":
        reject({
          code: "idempotencyConflict",
          commandType,
          message: "This request key was used with other input",
          details: { operationId: classified.storedOperationId },
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
  // Step 7: the operation, minted once, before the first context call.
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
