// The journal of spec:context.journal: a context's events, the stream registration, load and append.
import type { DocumentByName as Doc } from "convex/server";
import {
  getConvexSize,
  type GenericId,
  type Validator,
  type Value,
} from "convex/values";
import type { Decider, DomainEvent } from "../kernel/index.js";
import type { EnvelopeInput, EventEnvelope } from "./envelope.js";
import type { ContextDataModel, MutationCtx, QueryCtx } from "./tables.js";
// The Spec uses Journal without declaring it; this is the configuration createJournal is given.
export type Journal = {
  readonly contextId: string;
  readonly history: "rebuildable" | "auditOnly";
};
export function createJournal(config: {
  contextId: string;
  history: "rebuildable" | "auditOnly";
}): Journal {
  return Object.freeze({
    contextId: config.contextId,
    history: config.history,
  });
}
// spec:kernel.state-document-mapping, single mapping only: the stream row holds the whole state.
// budgetBytes is the largest size of the stream row the stream type allows.
export type StateDocumentMapping<S> = {
  kind: "single";
  budgetBytes: number;
  isDeleted: (state: S) => boolean;
};
// Declared once per stream type. stateSchemaVersion is the meaning the current evolve produces.
export type StreamRegistration<S, C, E extends DomainEvent, R> = {
  decider: Decider<S, C, E, R>;
  mapping: StateDocumentMapping<S>;
  stateSchemaVersion: number;
  // Field paths are string, not the default never, so that object validators fit.
  eventValidators: Record<string, Validator<unknown, "required", string>>;
  dto: Validator<Value, "required", string>;
  toDto: (state: S, meta: StreamMeta) => Value;
};
// stateSchemaVersion is the meaning the row was saved under.
export type StreamMeta = {
  tenantId: string;
  contextId: string;
  streamType: string;
  streamId: string;
  streamVersion: number;
  stateSchemaVersion: number;
  deletedAt?: number;
  baselineVersion?: number;
};
// rowId is the stream row's document ID, set when the row exists, so step 9 replaces the row by it.
export type LoadedStream<S> = {
  state: S;
  version: number;
  exists: boolean;
  meta: StreamMeta;
  rowId?: GenericId<"streams">;
};
export type AppendResult = {
  firstVersion: number;
  lastVersion: number;
  envelopes: EventEnvelope[];
};
// spec:constraints.events-stay-small, measured as Convex measures a value.
export const limitPayloadBytes = 16384;
// Reads the stream row by by_identity, or returns initial() at version 0 when there is none.
export async function load<S, C, E extends DomainEvent, R>(
  ctx: QueryCtx | MutationCtx,
  journal: Journal,
  registration: StreamRegistration<S, C, E, R>,
  tenantId: string,
  streamId: string,
): Promise<LoadedStream<S>> {
  const streamType = registration.decider.streamType;
  const row = await ctx.db
    .query("streams")
    .withIndex("by_identity", (q) =>
      q
        .eq("tenantId", tenantId)
        .eq("streamType", streamType)
        .eq("streamId", streamId),
    )
    .unique();
  if (row === null)
    return {
      state: registration.decider.initial(),
      version: 0,
      exists: false,
      meta: {
        tenantId,
        contextId: journal.contextId,
        streamType,
        streamId,
        streamVersion: 0,
        stateSchemaVersion: registration.stateSchemaVersion,
      },
    };
  return {
    state: row.state as S,
    version: row.streamVersion,
    exists: true,
    meta: metaOf(registration, row),
    rowId: row._id,
  };
}
// The metadata of a stream row as read, for load and for a list that holds rows already.
export function metaOf<S, C, E extends DomainEvent, R>(
  registration: StreamRegistration<S, C, E, R>,
  row: Doc<ContextDataModel, "streams">,
): StreamMeta {
  const { streamType, streamId } = row;
  // Data saved by newer code: the remedy is to redeploy that code, never to decide on it here.
  if (row.stateSchemaVersion > registration.stateSchemaVersion)
    throw new Error(
      `Stream ${streamType}/${streamId} was saved under state schema version ${row.stateSchemaVersion}, newer than this code's ${registration.stateSchemaVersion}`,
    );
  const meta: StreamMeta = {
    tenantId: row.tenantId,
    contextId: row.contextId,
    streamType,
    streamId,
    streamVersion: row.streamVersion,
    stateSchemaVersion: row.stateSchemaVersion,
  };
  if (row.deletedAt !== undefined) meta.deletedAt = row.deletedAt;
  if (row.baselineVersion !== undefined)
    meta.baselineVersion = row.baselineVersion;
  return meta;
}
// Inserts the events at expectedVersion + 1 onward and returns the envelopes it inserted. It writes
// no stream row: the adapter saves the row once, after the append.
export async function append<S, E extends DomainEvent>(
  ctx: MutationCtx,
  journal: Journal,
  loaded: LoadedStream<S>,
  envelope: EnvelopeInput,
  events: readonly E[],
  expectedVersion: number,
): Promise<AppendResult> {
  const { tenantId, streamType, streamId } = envelope;
  if (
    envelope.contextId !== journal.contextId ||
    tenantId !== loaded.meta.tenantId ||
    streamType !== loaded.meta.streamType ||
    streamId !== loaded.meta.streamId
  )
    throw new Error(
      `An append to ${streamType}/${streamId} names a stream other than the one loaded`,
    );
  if (events.length === 0)
    throw new Error(`An append to ${streamType}/${streamId} has no events`);
  // Puts the stream's range in the read set, so the engine serializes concurrent appends. The range
  // starts at the expected version, so a journal whose last event is not at that version is caught too.
  const [first, second] = await ctx.db
    .query("events")
    .withIndex("by_stream", (q) =>
      q
        .eq("tenantId", tenantId)
        .eq("streamType", streamType)
        .eq("streamId", streamId)
        .gte("streamVersion", expectedVersion),
    )
    .take(2);
  const ahead =
    first !== undefined && first.streamVersion > expectedVersion
      ? first
      : second;
  if (ahead !== undefined)
    throw new Error(
      `Stream ${streamType}/${streamId} holds version ${ahead.streamVersion} above the expected ${expectedVersion}: its row and its events disagree`,
    );
  if (expectedVersion > 0 && first === undefined)
    throw new Error(
      `Stream ${streamType}/${streamId} is at version ${expectedVersion} and its journal holds no event at that version: its row and its events disagree`,
    );
  const envelopes: EventEnvelope[] = [];
  for (const [index, event] of events.entries()) {
    const bytes = getConvexSize(event.payload as Value);
    if (bytes > limitPayloadBytes)
      throw new Error(
        `A ${event.eventType} payload of ${bytes} bytes exceeds the ${limitPayloadBytes} byte bound`,
      );
    const inserted: EventEnvelope = {
      eventId: crypto.randomUUID(),
      tenantId,
      contextId: journal.contextId,
      streamType,
      streamId,
      streamVersion: expectedVersion + 1 + index,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      operationId: envelope.operation.operationId,
      causedBy: envelope.operation.causedBy,
      actor: envelope.actor,
      recordedAt: envelope.recordedAt,
      payload: event.payload,
    };
    if (envelope.operation.correlationId !== undefined)
      inserted.correlationId = envelope.operation.correlationId;
    if (event.occurredAt !== undefined) inserted.occurredAt = event.occurredAt;
    await ctx.db.insert("events", inserted);
    envelopes.push(inserted);
  }
  return {
    firstVersion: expectedVersion + 1,
    lastVersion: expectedVersion + events.length,
    envelopes,
  };
}
