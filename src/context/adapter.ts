// The persistence adapter of spec:context.persistence-adapter: execute runs one stream command,
// runOperation runs an operation's plan, bounds it and aggregates the results.
import { ConvexError, getConvexSize, type Value } from "convex/values";
import type { PropertyValidators, Validator } from "convex/values";
import { validate } from "convex-helpers/validators";
import type { Actor } from "../command/actor-and-scope.js";
import {
  checkInvariants,
  fold,
  type CommittedOutcome,
  type DomainEvent,
  type Rejection,
  type StreamVersion,
} from "../kernel/index.js";
import type { EnvelopeInput, EventEnvelope, OperationRef } from "./envelope.js";
import {
  append,
  load,
  type Journal,
  type StreamMeta,
  type StreamRegistration,
} from "./journal.js";
import type { MutationCtx } from "./tables.js";
// A registration of any stream type. Its state type is both read and written, so only any fits all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStreamRegistration = StreamRegistration<any, any, any, any>;
export type StreamCommand<C> = {
  streamId: string;
  expectedVersion?: number;
  command: C;
};
// One element of a plan, built only through planned, which types the command against its registration.
export type PlannedCommand = {
  registration: AnyStreamRegistration;
  streamId: string;
  expectedVersion?: number;
  command: unknown;
};
export function planned<S, C, E extends DomainEvent, R>(
  registration: StreamRegistration<S, C, E, R>,
  streamId: string,
  command: C,
  expectedVersion?: number,
): PlannedCommand {
  return expectedVersion === undefined
    ? { registration, streamId, command }
    : { registration, streamId, command, expectedVersion };
}
export type ExecuteRequest<C> = {
  tenantId: string;
  actor: Actor;
  operation: OperationRef;
  now: number;
  facts: Readonly<Record<string, unknown>>;
  target: StreamCommand<C>;
};
// events holds the envelopes append inserted, in version order.
export type StreamResult<R> = {
  kind: "applied" | "businessFailure";
  result: R;
  dto: Value;
  version: StreamVersion;
  appended: number;
  created: boolean;
  events: EventEnvelope[];
};
export type StreamDto = {
  dto: Value;
  version: StreamVersion;
  appended: number;
  created: boolean;
  events: EventEnvelope[];
};
export type OperationOutcome<O> = CommittedOutcome<O> & {
  streams: StreamDto[];
};
export type OperationDeclaration<I, O> = {
  name: string;
  streams: readonly AnyStreamRegistration[];
  input: PropertyValidators;
  // The pinned Validator<O> admits no object validator: its field paths default to never.
  returns: Validator<O, "required", string>;
  plan: (input: I) => readonly PlannedCommand[];
  combine: (results: readonly StreamResult<unknown>[]) => O;
  maxStreams: number;
};
export type OperationArgs<I> = {
  tenantId: string;
  actor: Actor;
  operation: OperationRef;
  input: I;
  facts?: Readonly<Record<string, unknown>>;
};
const mebibyte = 1024 * 1024;
export const limitStreamsPerCall = 256;
export const limitStreamBytesPerCall = 8 * mebibyte;
export const limitDocumentsWrittenPerCall = 800;
export const limitBytesWrittenPerCall = 8 * mebibyte;
function reject(rejection: Rejection): never {
  throw new ConvexError(rejection);
}
// Load, decide, fold, append and save one stream, in that order, in the caller's sub-transaction.
export async function execute<S, C, E extends DomainEvent, R>(
  ctx: MutationCtx,
  journal: Journal,
  registration: StreamRegistration<S, C, E, R>,
  request: ExecuteRequest<C>,
): Promise<StreamResult<R>> {
  return (await executeMeasured(ctx, journal, registration, request)).result;
}
// execute, with the size step 9 measured of the saved stream row, which the runner's write bound counts.
async function executeMeasured<S, C, E extends DomainEvent, R>(
  ctx: MutationCtx,
  journal: Journal,
  registration: StreamRegistration<S, C, E, R>,
  request: ExecuteRequest<C>,
): Promise<{ result: StreamResult<R>; rowBytes: number }> {
  const { tenantId, target } = request;
  const streamType = registration.decider.streamType;
  const { streamId } = target;
  // Step 2.
  const loaded = await load(ctx, journal, registration, tenantId, streamId);
  // Step 3: both answers come before decide, against the version as loaded.
  if (target.expectedVersion === 0 && loaded.exists)
    reject({
      code: "entityExists",
      message: `Stream ${streamType}/${streamId} already exists`,
      details: { existing: streamId, current: loaded.version },
    });
  if (
    target.expectedVersion !== undefined &&
    target.expectedVersion !== loaded.version
  )
    reject({
      code: "staleVersion",
      message: `Stream ${streamType}/${streamId} is at version ${loaded.version}, not ${target.expectedVersion}`,
      details: { expected: target.expectedVersion, current: loaded.version },
    });
  const expected = target.expectedVersion ?? loaded.version;
  // Where step 3a would migrate a row saved under an older meaning. Migrations are not built yet.
  if (loaded.meta.stateSchemaVersion !== registration.stateSchemaVersion)
    throw new Error(
      `Stream ${streamType}/${streamId} was saved under state schema version ${loaded.meta.stateSchemaVersion}, not ${registration.stateSchemaVersion}, and no migration is built`,
    );
  // Step 4.
  const decision = registration.decider.decide(loaded.state, target.command, {
    now: request.now,
    actor: request.actor,
    facts: request.facts,
  });
  // Step 5.
  if (decision.kind === "rejection") reject(decision.rejection);
  // Step 6.
  if (decision.events.length === 0)
    throw new Error(
      `The ${streamType} decider returned ${decision.kind} with no event`,
    );
  for (const event of decision.events) {
    const validator = Object.hasOwn(
      registration.eventValidators,
      event.eventType,
    )
      ? registration.eventValidators[event.eventType]
      : undefined;
    if (validator === undefined)
      throw new Error(
        `The ${streamType} registration has no validator for ${event.eventType}`,
      );
    // The db makes an ID validator check that the ID names a document of its table.
    if (!validate(validator, event.payload, { db: ctx.db }))
      throw new Error(
        `A ${streamType} ${event.eventType} payload does not match its validator`,
      );
  }
  // Step 7.
  const next = fold(registration.decider.evolve, loaded.state, decision.events);
  const broken = checkInvariants(registration.decider.invariants ?? [], next);
  if (broken.length > 0)
    throw new Error(
      `Stream ${streamType}/${streamId} breaks ${broken.join(", ")} after the fold`,
    );
  // Step 8.
  const envelope: EnvelopeInput = {
    tenantId,
    contextId: journal.contextId,
    streamType,
    streamId,
    operation: request.operation,
    actor: request.actor,
    recordedAt: request.now,
  };
  const appended = await append(
    ctx,
    journal,
    loaded,
    envelope,
    decision.events,
    expected,
  );
  // Step 9: the one write of the stream row.
  const version = appended.lastVersion;
  const meta: StreamMeta = {
    tenantId,
    contextId: journal.contextId,
    streamType,
    streamId,
    streamVersion: version,
    stateSchemaVersion: registration.stateSchemaVersion,
  };
  if (registration.mapping.isDeleted(next))
    meta.deletedAt = loaded.meta.deletedAt ?? request.now;
  if (loaded.meta.baselineVersion !== undefined)
    meta.baselineVersion = loaded.meta.baselineVersion;
  const row = {
    ...meta,
    state: next as Value,
    lastOperationId: request.operation.operationId,
    updatedAt: request.now,
  };
  const bytes = getConvexSize(row);
  if (bytes > registration.mapping.budgetBytes)
    throw new Error(
      `Stream ${streamType}/${streamId} would be saved at ${bytes} bytes, above its budget of ${registration.mapping.budgetBytes}`,
    );
  if (loaded.exists) {
    // The row load read, replaced by its document ID with no second read.
    if (loaded.rowId === undefined)
      throw new Error(
        `Stream ${streamType}/${streamId} was loaded as existing without its row's document ID`,
      );
    await ctx.db.replace(loaded.rowId, row);
  } else {
    await ctx.db.insert("streams", row);
  }
  // Step 10.
  const result: StreamResult<R> = {
    kind: decision.kind,
    result: decision.result,
    dto: registration.toDto(next, meta),
    version: {
      tenantId,
      contextId: journal.contextId,
      streamType,
      streamId,
      version,
    },
    appended: decision.events.length,
    created: !loaded.exists,
    events: appended.envelopes,
  };
  return { result, rowBytes: bytes };
}
// Bounds the plan, executes it in plan order and aggregates the results.
export async function runOperation<I, O>(
  ctx: MutationCtx,
  journal: Journal,
  declaration: OperationDeclaration<I, O>,
  args: OperationArgs<I>,
): Promise<OperationOutcome<O>> {
  // Step 1.
  const plan = declaration.plan(args.input);
  for (const command of plan)
    if (!declaration.streams.includes(command.registration))
      throw new Error(
        `Operation ${declaration.name} planned a ${command.registration.decider.streamType} command on a registration it does not declare`,
      );
  const max = Math.min(declaration.maxStreams, limitStreamsPerCall);
  if (plan.length > max)
    reject({
      code: "operationTooLarge",
      message: `Operation ${declaration.name} plans ${plan.length} streams, above its bound of ${max}`,
      details: { count: plan.length, max },
    });
  const bytes = plan.reduce(
    (sum, command) => sum + command.registration.mapping.budgetBytes,
    0,
  );
  if (bytes > limitStreamBytesPerCall)
    reject({
      code: "operationTooLarge",
      message: `Operation ${declaration.name} plans ${bytes} bytes of streams, above ${limitStreamBytesPerCall}`,
      details: { bytes, maxBytes: limitStreamBytesPerCall },
    });
  // A committed outcome carries at least one event, so a plan of nothing has no outcome to return.
  if (plan.length === 0)
    throw new Error(`Operation ${declaration.name} planned no stream command`);
  const now = Date.now();
  const facts = args.facts ?? {};
  const results: StreamResult<unknown>[] = [];
  let rowBytes = 0;
  for (const command of plan) {
    const target: StreamCommand<unknown> =
      command.expectedVersion === undefined
        ? { streamId: command.streamId, command: command.command }
        : {
            streamId: command.streamId,
            command: command.command,
            expectedVersion: command.expectedVersion,
          };
    const executed = await executeMeasured(ctx, journal, command.registration, {
      tenantId: args.tenantId,
      actor: args.actor,
      operation: args.operation,
      now,
      facts,
      target,
    });
    results.push(executed.result);
    rowBytes += executed.rowBytes;
  }
  // The write bound, counting each saved stream row and each appended event at its measured size.
  const documents = results.reduce(
    (sum, result) => sum + result.appended + 1,
    0,
  );
  const written = results.reduce(
    (sum, result) =>
      sum +
      result.events.reduce(
        (eventBytes, event) => eventBytes + getConvexSize(event as Value),
        0,
      ),
    rowBytes,
  );
  if (
    documents > limitDocumentsWrittenPerCall ||
    written > limitBytesWrittenPerCall
  )
    throw new Error(
      `Operation ${declaration.name} wrote ${documents} documents and ${written} bytes, above ${limitDocumentsWrittenPerCall} documents or ${limitBytesWrittenPerCall} bytes`,
    );
  return {
    kind: results.some((result) => result.kind === "businessFailure")
      ? "businessFailure"
      : "applied",
    result: declaration.combine(results),
    versions: results.map((result) => result.version),
    streams: results.map(({ dto, version, appended, created, events }) => ({
      dto,
      version,
      appended,
      created,
      events,
    })),
  };
}
