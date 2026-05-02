import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { v7 as uuidv7 } from "uuid";
import {
  allocateGlobalPositions,
  compareGlobalPositions,
  isGlobalPositionAfter,
  maxGlobalPosition,
  normalizeGlobalPosition,
  type GlobalPosition,
  type GlobalPositionLike,
} from "@libar-dev/platform-core/events";
import { createIdempotencyFingerprint, stableStringify } from "@libar-dev/platform-core/durability";
import {
  assertBoundaryValuesSize,
  DEFAULT_BOUNDARY_VALUE_MAX_BYTES,
  vUnknown,
} from "@libar-dev/platform-core/validation";
import {
  assertPMValidTransition,
  getPMValidEventsFrom,
  type ProcessManagerLifecycleEvent,
} from "@libar-dev/platform-core/processManager";
import { verificationProofValidator, verifyActor } from "./verification.js";

const compatGlobalPositionValidator = v.union(v.number(), v.int64());
const GLOBAL_POSITION_ALLOCATOR_NAME = "event-store";
const EVENT_STORE_VALUE_MAX_BYTES = DEFAULT_BOUNDARY_VALUE_MAX_BYTES;
const MAX_APPEND_BATCH_SIZE = 100;
const MAX_CORRELATION_LIMIT = 1000;
const MAX_VIRTUAL_STREAM_LIMIT = 1000;

const storedUnknownValueValidator = vUnknown();
const storedMetadataValidator = v.optional(vUnknown());

const storedEventValidator = v.object({
  eventId: v.string(),
  eventType: v.string(),
  streamType: v.string(),
  streamId: v.string(),
  version: v.number(),
  globalPosition: compatGlobalPositionValidator,
  boundedContext: v.string(),
  tenantId: v.optional(v.string()),
  scopeKey: v.optional(v.string()),
  category: v.union(
    v.literal("domain"),
    v.literal("integration"),
    v.literal("trigger"),
    v.literal("fat")
  ),
  schemaVersion: v.number(),
  correlationId: v.string(),
  causationId: v.optional(v.string()),
  timestamp: v.number(),
  payload: storedUnknownValueValidator,
  metadata: storedMetadataValidator,
});

const readFromPositionResultValidator = v.object({
  events: v.array(storedEventValidator),
  nextPosition: compatGlobalPositionValidator,
  hasMore: v.boolean(),
});

const correlatedEventSummaryValidator = v.object({
  eventId: v.string(),
  eventType: v.string(),
  streamType: v.string(),
  streamId: v.string(),
  version: v.number(),
  globalPosition: compatGlobalPositionValidator,
  boundedContext: v.string(),
  tenantId: v.optional(v.string()),
  scopeKey: v.optional(v.string()),
  category: v.union(
    v.literal("domain"),
    v.literal("integration"),
    v.literal("trigger"),
    v.literal("fat")
  ),
  schemaVersion: v.number(),
  correlationId: v.string(),
  causationId: v.optional(v.string()),
  timestamp: v.number(),
});

const getByCorrelationResultValidator = v.object({
  events: v.array(correlatedEventSummaryValidator),
  nextCursor: v.union(compatGlobalPositionValidator, v.null()),
  hasMore: v.boolean(),
});

function buildDuplicateAppendResult(events: Array<Doc<"events">>): {
  status: "duplicate";
  eventIds: string[];
  globalPositions: GlobalPosition[];
  newVersion: number;
} {
  const sortedEvents = [...events].sort((left, right) => left.version - right.version);

  return {
    status: "duplicate",
    eventIds: sortedEvents.map((event) => event.eventId),
    globalPositions: sortedEvents.map((event) => normalizeGlobalPosition(event.globalPosition)),
    newVersion: sortedEvents[sortedEvents.length - 1]?.version ?? 0,
  };
}

/**
 * Append events to a stream with optimistic concurrency control.
 *
 * @contract-status: Enforced
 *
 * @param streamType - Type of the stream (e.g., "Order")
 * @param streamId - ID of the stream instance
 * @param expectedVersion - Expected current version (0 for new streams)
 * @param events - Array of events to append
 * @returns Success, duplicate replay, OCC conflict, or audited idempotency conflict.
 */
export const appendToStream = mutation({
  args: {
    streamType: v.string(),
    streamId: v.string(),
    expectedVersion: v.number(),
    boundedContext: v.string(),
    tenantId: v.optional(v.string()),
    verificationProof: verificationProofValidator,
    events: v.array(
      v.object({
        eventId: v.string(),
        eventType: v.string(),
        scopeKey: v.optional(v.string()),
        /**
         * Event taxonomy (Phase 9)
         * - domain: Internal facts within bounded context for ES replay
         * - integration: Cross-context communication with versioned contracts
         * - trigger: ID-only notifications for GDPR compliance
         * - fat: Full state snapshots for external systems
         */
        category: v.optional(
          v.union(
            v.literal("domain"),
            v.literal("integration"),
            v.literal("trigger"),
            v.literal("fat")
          )
        ),
        /**
         * Schema version for upcasting pipeline (Phase 9)
         * Defaults to 1 if not specified.
         */
        schemaVersion: v.optional(v.number()),
        /**
         * Event payload - intentionally untyped at storage layer.
         * Each bounded context defines its own event schemas with Zod validation.
         * The Event Store acts as a generic log, not a typed repository.
         */
        payload: vUnknown(),
        metadata: v.optional(
          v.object({
            correlationId: v.string(),
            causationId: v.optional(v.string()),
            userId: v.optional(v.string()),
            schemaVersion: v.optional(v.number()),
          })
        ),
        /**
         * Idempotency key for duplicate detection (Phase 18b - EventStoreDurability).
         */
        idempotencyKey: v.optional(v.string()),
      })
    ),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      eventIds: v.array(v.string()),
      globalPositions: v.array(compatGlobalPositionValidator),
      newVersion: v.number(),
    }),
    v.object({
      status: v.literal("duplicate"),
      eventIds: v.array(v.string()),
      globalPositions: v.array(compatGlobalPositionValidator),
      newVersion: v.number(),
    }),
    v.object({
      status: v.literal("conflict"),
      currentVersion: v.number(),
    }),
    v.object({
      status: v.literal("idempotency_conflict"),
      existingEventId: v.string(),
      auditId: v.string(),
      currentVersion: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const { streamType, streamId, expectedVersion, tenantId, events } = args;
    if (events.length > MAX_APPEND_BATCH_SIZE) {
      throw new Error(
        `appendToStream supports at most ${MAX_APPEND_BATCH_SIZE} events per batch. Received ${events.length}.`
      );
    }

    const verifiedActor = await verifyActor({
      proof: args.verificationProof,
      expectedSubjectId: args.boundedContext,
      expectedSubjectType: "boundedContext",
      expectedBoundedContext: args.boundedContext,
      ...(tenantId !== undefined && { expectedTenantId: tenantId }),
    });
    const boundedContext = verifiedActor.boundedContext;

    for (const event of events) {
      if (event.scopeKey === undefined) {
        continue;
      }

      const parsedScope = parseScopeKey(event.scopeKey);
      if (!parsedScope) {
        throw new Error(`Invalid scope key format: ${event.scopeKey}`);
      }

      if (verifiedActor.tenantId !== parsedScope.tenantId) {
        throw new Error(
          `Scoped append tenant mismatch for ${event.scopeKey}: proof tenant ${verifiedActor.tenantId ?? "<none>"} cannot write tenant ${parsedScope.tenantId}`
        );
      }

      const scope = await ctx.db
        .query("dcbScopes")
        .withIndex("by_scope_key", (q) => q.eq("scopeKey", event.scopeKey!))
        .first();

      if (!scope) {
        throw new Error(`Scope ${event.scopeKey} must exist before appending scoped events`);
      }

      if (scope.boundedContext !== boundedContext) {
        throw new Error(
          `Scope ${event.scopeKey} belongs to bounded context ${scope.boundedContext}, not ${boundedContext}`
        );
      }
    }

    assertBoundaryValuesSize(
      args.events.flatMap((event, index) => [
        {
          fieldName: `appendToStream.events[${index}].payload`,
          value: event.payload,
          maxBytes: EVENT_STORE_VALUE_MAX_BYTES,
        },
        {
          fieldName: `appendToStream.events[${index}].metadata`,
          value: event.metadata,
          maxBytes: EVENT_STORE_VALUE_MAX_BYTES,
        },
      ])
    );

    const existingStream = await ctx.db
      .query("streams")
      .withIndex("by_stream", (q) => q.eq("streamType", streamType).eq("streamId", streamId))
      .first();

    const currentVersion = existingStream?.currentVersion ?? 0;

    const duplicateEvents: Array<Doc<"events">> = [];

    for (const event of events) {
      if (event.idempotencyKey === undefined) {
        continue;
      }

      const existingEvent = await ctx.db
        .query("events")
        .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", event.idempotencyKey))
        .first();

      if (!existingEvent) {
        continue;
      }

      const incomingFingerprint = createIdempotencyFingerprint({
        streamType,
        streamId,
        boundedContext,
        ...(tenantId !== undefined && { tenantId }),
        eventType: event.eventType,
        category: event.category ?? "domain",
        schemaVersion: event.schemaVersion ?? 1,
        payload: event.payload,
      });

      const existingFingerprint = createIdempotencyFingerprint({
        streamType: existingEvent.streamType,
        streamId: existingEvent.streamId,
        boundedContext: existingEvent.boundedContext,
        ...(existingEvent.tenantId !== undefined && { tenantId: existingEvent.tenantId }),
        eventType: existingEvent.eventType,
        category: existingEvent.category,
        schemaVersion: existingEvent.schemaVersion,
        payload: existingEvent.payload,
      });

      if (existingFingerprint !== incomingFingerprint) {
        const auditId = `ida_${uuidv7()}`;
        await ctx.db.insert("idempotencyConflictAudits", {
          auditId,
          idempotencyKey: event.idempotencyKey,
          streamType,
          streamId,
          boundedContext,
          ...(tenantId !== undefined && { tenantId }),
          incomingEventType: event.eventType,
          existingEventId: existingEvent.eventId,
          existingEventType: existingEvent.eventType,
          conflictReason: "same_key_different_payload",
          incomingFingerprint,
          existingFingerprint,
          incomingPayload: event.payload,
          existingPayload: existingEvent.payload,
          attemptedAt: Date.now(),
        });

        return {
          status: "idempotency_conflict" as const,
          existingEventId: existingEvent.eventId,
          auditId,
          currentVersion,
        };
      }

      duplicateEvents.push(existingEvent);
    }

    if (duplicateEvents.length > 0) {
      if (
        duplicateEvents.length !== events.length ||
        duplicateEvents.length !== new Set(duplicateEvents.map((event) => event.eventId)).size
      ) {
        const firstDuplicate = duplicateEvents[0]!;
        const incomingEvent =
          events.find((event) => event.idempotencyKey !== undefined) ?? events[0]!;
        const auditId = `ida_${uuidv7()}`;

        await ctx.db.insert("idempotencyConflictAudits", {
          auditId,
          idempotencyKey: incomingEvent.idempotencyKey ?? "<mixed-batch>",
          streamType,
          streamId,
          boundedContext,
          ...(tenantId !== undefined && { tenantId }),
          incomingEventType: incomingEvent.eventType,
          existingEventId: firstDuplicate.eventId,
          existingEventType: firstDuplicate.eventType,
          conflictReason: "partial_duplicate_batch",
          incomingFingerprint: stableStringify(events),
          existingFingerprint: stableStringify(
            duplicateEvents.map((event) => ({
              eventId: event.eventId,
              eventType: event.eventType,
              version: event.version,
            }))
          ),
          incomingPayload: events,
          existingPayload: duplicateEvents.map((event) => event.payload),
          attemptedAt: Date.now(),
        });

        return {
          status: "idempotency_conflict" as const,
          existingEventId: firstDuplicate.eventId,
          auditId,
          currentVersion,
        };
      }

      return buildDuplicateAppendResult(duplicateEvents);
    }

    // Check for concurrency conflict
    if (currentVersion !== expectedVersion) {
      return {
        status: "conflict" as const,
        currentVersion,
      };
    }

    const timestamp = Date.now();
    const allocator = await ctx.db
      .query("globalPositionAllocators")
      .withIndex("by_name", (q) => q.eq("name", GLOBAL_POSITION_ALLOCATOR_NAME))
      .first();
    const allocated = allocateGlobalPositions(
      allocator
        ? {
            lastTimestamp: allocator.lastTimestamp,
            lastSequence: allocator.lastSequence,
          }
        : null,
      events.length,
      timestamp
    );

    // Prepare event records
    const eventIds: string[] = [];
    const globalPositions: GlobalPosition[] = [];
    let nextVersion = currentVersion;

    for (const [index, event] of events.entries()) {
      nextVersion++;
      const globalPosition = allocated.positions[index]!;
      const metadata = event.metadata;

      if (!metadata) {
        throw new Error("appendToStream requires events[*].metadata.correlationId");
      }

      await ctx.db.insert("events", {
        eventId: event.eventId,
        eventType: event.eventType,
        streamType,
        streamId,
        version: nextVersion,
        globalPosition,
        boundedContext,
        ...(tenantId !== undefined && { tenantId }),
        ...(event.scopeKey !== undefined && { scopeKey: event.scopeKey }),
        // Phase 9: Event taxonomy and schema versioning (required fields with defaults)
        category: event.category ?? "domain",
        schemaVersion: event.schemaVersion ?? 1,
        correlationId: metadata.correlationId,
        timestamp,
        payload: event.payload,
        ...(metadata.causationId !== undefined && {
          causationId: metadata.causationId,
        }),
        metadata,
        // Phase 18b: Idempotency key for duplicate detection
        ...(event.idempotencyKey !== undefined && { idempotencyKey: event.idempotencyKey }),
      });

      eventIds.push(event.eventId);
      globalPositions.push(globalPosition);
    }

    if (allocator) {
      await ctx.db.patch(allocator._id, {
        lastTimestamp: allocated.lastTimestamp,
        lastSequence: allocated.lastSequence,
        updatedAt: timestamp,
      });
    } else {
      await ctx.db.insert("globalPositionAllocators", {
        name: GLOBAL_POSITION_ALLOCATOR_NAME,
        lastTimestamp: allocated.lastTimestamp,
        lastSequence: allocated.lastSequence,
        updatedAt: timestamp,
      });
    }

    // Update or create stream record
    if (existingStream) {
      await ctx.db.patch(existingStream._id, {
        currentVersion: nextVersion,
        updatedAt: timestamp,
      });
    } else {
      await ctx.db.insert("streams", {
        streamType,
        streamId,
        currentVersion: nextVersion,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    return {
      status: "success" as const,
      eventIds,
      globalPositions,
      newVersion: nextVersion,
    };
  },
});

/**
 * Read events from a specific stream.
 */
export const readStream = query({
  args: {
    streamType: v.string(),
    streamId: v.string(),
    fromVersion: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(storedEventValidator),
  handler: async (ctx, args) => {
    const { streamType, streamId, fromVersion = 0, limit = 1000 } = args;

    const events = await ctx.db
      .query("events")
      .withIndex("by_stream", (q) => q.eq("streamType", streamType).eq("streamId", streamId))
      .filter((q) => q.gt(q.field("version"), fromVersion))
      .take(limit);

    return events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      streamType: e.streamType,
      streamId: e.streamId,
      version: e.version,
      globalPosition: e.globalPosition,
      boundedContext: e.boundedContext,
      ...(e.tenantId !== undefined && { tenantId: e.tenantId }),
      ...(e.scopeKey !== undefined && { scopeKey: e.scopeKey }),
      category: e.category,
      schemaVersion: e.schemaVersion,
      correlationId: e.correlationId,
      timestamp: e.timestamp,
      payload: e.payload,
      ...(e.causationId !== undefined && { causationId: e.causationId }),
      ...(e.metadata !== undefined && { metadata: e.metadata }),
    }));
  },
});

/**
 * Read all events globally in order (for projections).
 *
 * ## Event Type Filtering
 *
 * When using the `eventTypes` filter, the function fans out across the
 * `by_event_type_and_global_position` compound index and merges the results back
 * into global-position order.
 *
 * ## Recommended Usage
 *
 * - For projection rebuilds: Call without eventTypes filter, process all events
 * - For catching up on specific events: Use smaller batches and loop until done
 *
 * @param fromPosition - Start reading from this global position (exclusive)
 * @param limit - Maximum number of events to return (default: 100)
 * @param eventTypes - Optional filter for specific event types
 * @param boundedContext - Optional filter for specific bounded context
 * @returns Events ordered by globalPosition plus pagination metadata
 */
export const readFromPosition = query({
  args: {
    fromPosition: v.optional(compatGlobalPositionValidator),
    limit: v.optional(v.number()),
    eventTypes: v.optional(v.array(v.string())),
    boundedContext: v.optional(v.string()),
  },
  returns: readFromPositionResultValidator,
  handler: async (ctx, args) => {
    const { limit = 100, eventTypes, boundedContext } = args;
    const fromPosition = normalizeGlobalPosition(args.fromPosition ?? -1, "fromPosition");

    const uniqueEventTypes = eventTypes ? [...new Set(eventTypes)] : undefined;
    let candidateEvents: Array<Doc<"events">>;

    if (uniqueEventTypes && uniqueEventTypes.length > 0) {
      const cursors = new Map(uniqueEventTypes.map((eventType) => [eventType, fromPosition]));
      const mergedEvents = new Map<string, Doc<"events">>();
      const exhaustedEventTypes = new Set<string>();

      while (exhaustedEventTypes.size < uniqueEventTypes.length) {
        let fetchedAny = false;

        for (const eventType of uniqueEventTypes) {
          if (exhaustedEventTypes.has(eventType)) {
            continue;
          }

          const page = await ctx.db
            .query("events")
            .withIndex("by_event_type_and_global_position", (q) =>
              q
                .eq("eventType", eventType)
                .gt("globalPosition", cursors.get(eventType) ?? fromPosition)
            )
            .take(limit + 1);

          if (page.length === 0) {
            exhaustedEventTypes.add(eventType);
            continue;
          }

          fetchedAny = true;

          for (const event of page) {
            mergedEvents.set(event.eventId, event);
          }

          cursors.set(
            eventType,
            normalizeGlobalPosition(page[page.length - 1]!.globalPosition, `${eventType}.cursor`)
          );

          if (page.length <= limit) {
            exhaustedEventTypes.add(eventType);
          }
        }

        candidateEvents = Array.from(mergedEvents.values())
          .filter((event) => !boundedContext || event.boundedContext === boundedContext)
          .sort((left, right) => compareGlobalPositions(left.globalPosition, right.globalPosition));

        if (candidateEvents.length > limit || !fetchedAny) {
          break;
        }
      }

      candidateEvents ??= [];
    } else {
      let query = ctx.db
        .query("events")
        .withIndex("by_global_position", (q) => q.gt("globalPosition", fromPosition));

      if (boundedContext) {
        query = query.filter((q) => q.eq(q.field("boundedContext"), boundedContext));
      }

      candidateEvents = await query.take(limit + 1);
    }

    const filteredEvents = boundedContext
      ? candidateEvents.filter((event) => event.boundedContext === boundedContext)
      : candidateEvents;

    const limitedEvents = filteredEvents.slice(0, limit);
    const hasMore = filteredEvents.length > limit;
    const events = limitedEvents.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      streamType: e.streamType,
      streamId: e.streamId,
      version: e.version,
      globalPosition: e.globalPosition,
      boundedContext: e.boundedContext,
      ...(e.tenantId !== undefined && { tenantId: e.tenantId }),
      ...(e.scopeKey !== undefined && { scopeKey: e.scopeKey }),
      category: e.category,
      schemaVersion: e.schemaVersion,
      correlationId: e.correlationId,
      timestamp: e.timestamp,
      payload: e.payload,
      ...(e.causationId !== undefined && { causationId: e.causationId }),
      ...(e.metadata !== undefined && { metadata: e.metadata }),
    }));

    return {
      events,
      nextPosition: limitedEvents[limitedEvents.length - 1]?.globalPosition ?? fromPosition,
      hasMore,
    };
  },
});

/**
 * Get the current version of a stream.
 */
export const getStreamVersion = query({
  args: {
    streamType: v.string(),
    streamId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { streamType, streamId } = args;

    const stream = await ctx.db
      .query("streams")
      .withIndex("by_stream", (q) => q.eq("streamType", streamType).eq("streamId", streamId))
      .first();

    return stream?.currentVersion ?? 0;
  },
});

/**
 * Get events by correlation ID (for tracing).
 */
export const getByCorrelation = query({
  args: {
    correlationId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(compatGlobalPositionValidator),
  },
  returns: getByCorrelationResultValidator,
  handler: async (ctx, args) => {
    const effectiveLimit = Math.min(args.limit ?? 100, MAX_CORRELATION_LIMIT);
    const events = await ctx.db
      .query("events")
      .withIndex("by_correlation_and_global_position", (q) => {
        const range = q.eq("correlationId", args.correlationId);
        return args.cursor !== undefined ? range.gt("globalPosition", args.cursor) : range;
      })
      .take(effectiveLimit + 1);

    const hasMore = events.length > effectiveLimit;
    const page = events.slice(0, effectiveLimit);

    return {
      events: page.map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        streamType: e.streamType,
        streamId: e.streamId,
        version: e.version,
        globalPosition: e.globalPosition,
        boundedContext: e.boundedContext,
        ...(e.tenantId !== undefined && { tenantId: e.tenantId }),
        ...(e.scopeKey !== undefined && { scopeKey: e.scopeKey }),
        category: e.category,
        schemaVersion: e.schemaVersion,
        correlationId: e.correlationId,
        timestamp: e.timestamp,
        ...(e.causationId !== undefined && { causationId: e.causationId }),
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.globalPosition ?? null) : null,
      hasMore,
    };
  },
});

/**
 * Get the current global position (highest position in the event store).
 *
 * Note: With timestamp-based positions, this returns the maximum position
 * found in the events table. Returns 0 if no events exist.
 */
export const getGlobalPosition = query({
  args: {},
  returns: compatGlobalPositionValidator,
  handler: async (ctx) => {
    // Query events in descending order by globalPosition, take first
    const latestEvent = await ctx.db
      .query("events")
      .withIndex("by_global_position")
      .order("desc")
      .first();

    return latestEvent?.globalPosition ?? 0n;
  },
});

/**
 * Get event by idempotency key.
 *
 * Used by idempotentAppendEvent() to detect duplicate event writes
 * when commands/actions are retried. Returns the existing event if
 * one already exists with the given idempotency key.
 *
 * @param idempotencyKey - The idempotency key to look up
 * @returns Event if found, null otherwise
 *
 * @since Phase 18b (EventStoreDurability)
 */
export const getByIdempotencyKey = query({
  args: {
    idempotencyKey: v.string(),
  },
  returns: v.union(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      version: v.number(),
      globalPosition: compatGlobalPositionValidator,
      boundedContext: v.string(),
      tenantId: v.optional(v.string()),
      scopeKey: v.optional(v.string()),
      category: v.union(
        v.literal("domain"),
        v.literal("integration"),
        v.literal("trigger"),
        v.literal("fat")
      ),
      schemaVersion: v.number(),
      correlationId: v.string(),
      causationId: v.optional(v.string()),
      timestamp: v.number(),
      payload: storedUnknownValueValidator,
      metadata: storedMetadataValidator,
      idempotencyKey: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const { idempotencyKey } = args;

    const event = await ctx.db
      .query("events")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    if (!event) {
      return null;
    }

    return {
      eventId: event.eventId,
      eventType: event.eventType,
      streamType: event.streamType,
      streamId: event.streamId,
      version: event.version,
      globalPosition: event.globalPosition,
      boundedContext: event.boundedContext,
      ...(event.tenantId !== undefined && { tenantId: event.tenantId }),
      category: event.category,
      schemaVersion: event.schemaVersion,
      correlationId: event.correlationId,
      timestamp: event.timestamp,
      payload: event.payload,
      ...(event.causationId !== undefined && { causationId: event.causationId }),
      ...(event.metadata !== undefined && { metadata: event.metadata }),
      ...(event.idempotencyKey !== undefined && { idempotencyKey: event.idempotencyKey }),
    };
  },
});

export const getIdempotencyConflictAudits = query({
  args: {
    idempotencyKey: v.string(),
  },
  returns: v.array(
    v.object({
      auditId: v.string(),
      idempotencyKey: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      boundedContext: v.string(),
      tenantId: v.optional(v.string()),
      incomingEventType: v.string(),
      existingEventId: v.string(),
      existingEventType: v.string(),
      conflictReason: v.string(),
      incomingFingerprint: v.string(),
      existingFingerprint: v.string(),
      incomingPayload: storedUnknownValueValidator,
      existingPayload: storedUnknownValueValidator,
      attemptedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const audits = await ctx.db
      .query("idempotencyConflictAudits")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .collect();

    return audits.map((audit) => ({
      auditId: audit.auditId,
      idempotencyKey: audit.idempotencyKey,
      streamType: audit.streamType,
      streamId: audit.streamId,
      boundedContext: audit.boundedContext,
      ...(audit.tenantId !== undefined && { tenantId: audit.tenantId }),
      incomingEventType: audit.incomingEventType,
      existingEventId: audit.existingEventId,
      existingEventType: audit.existingEventType,
      conflictReason: audit.conflictReason,
      incomingFingerprint: audit.incomingFingerprint,
      existingFingerprint: audit.existingFingerprint,
      incomingPayload: audit.incomingPayload,
      existingPayload: audit.existingPayload,
      attemptedAt: audit.attemptedAt,
    }));
  },
});

// ============================================================================
// Process Manager State Operations (Phase 13)
// ============================================================================

/**
 * Process Manager status validator.
 * Matches ProcessManagerStatus type from @libar-dev/platform-core/processManager.
 */
const pmStatusValidator = v.union(
  v.literal("idle"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed")
);

/**
 * Dead letter status validator.
 */
const deadLetterStatusValidator = v.union(
  v.literal("pending"),
  v.literal("replayed"),
  v.literal("ignored")
);

function assertTransitionOrNull(
  from: Doc<"processManagerStates">["status"],
  event: ProcessManagerLifecycleEvent,
  processManagerName: string,
  instanceId: string
): Doc<"processManagerStates">["status"] | null {
  try {
    return assertPMValidTransition(from, event, processManagerName, instanceId);
  } catch {
    return null;
  }
}

/**
 * Get or create a process manager state instance.
 *
 * If the instance exists, returns it (with optional reset to idle).
 * If not, creates a new instance in idle state.
 *
 * ## Concurrency Safety
 *
 * Uniqueness of (processManagerName, instanceId) is guaranteed by:
 * 1. **Single-writer semantics** via Workpool partition keys in PM executor
 *    - Each PM instance is processed by exactly one worker at a time
 *    - Partition key = `${pmName}:${instanceId}` ensures no concurrent access
 * 2. **Compound index** `by_pm_instance` for efficient existence checks
 *
 * This design eliminates race conditions at the application level rather than
 * relying on database-level uniqueness constraints. The Workpool partition
 * key serializes all operations for a given PM instance.
 *
 * @param processManagerName - Name of the process manager
 * @param instanceId - Unique instance ID (typically from correlation property)
 * @param options - Optional settings for initialization
 * @returns The process manager state
 */
export const getOrCreatePMState = mutation({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
    options: v.optional(
      v.object({
        /** Custom state for hybrid PMs */
        customState: v.optional(vUnknown()),
        /** State version for schema evolution */
        stateVersion: v.optional(v.number()),
        /** Trigger event ID for causation tracking */
        triggerEventId: v.optional(v.string()),
        /** Correlation ID for linking related events/commands */
        correlationId: v.optional(v.string()),
        /** Whether to reset to idle if exists and is in terminal state */
        resetIfTerminal: v.optional(v.boolean()),
      })
    ),
  },
  returns: v.object({
    processManagerName: v.string(),
    instanceId: v.string(),
    status: pmStatusValidator,
    lastGlobalPosition: compatGlobalPositionValidator,
    commandsEmitted: v.number(),
    commandsFailed: v.number(),
    customState: v.optional(vUnknown()),
    stateVersion: v.number(),
    triggerEventId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    createdAt: v.number(),
    lastUpdatedAt: v.number(),
    errorMessage: v.optional(v.string()),
    isNew: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { processManagerName, instanceId, options = {} } = args;
    const now = Date.now();

    assertBoundaryValuesSize([
      {
        fieldName: "getOrCreatePMState.options.customState",
        value: options.customState,
        maxBytes: EVENT_STORE_VALUE_MAX_BYTES,
      },
    ]);

    // Check if instance already exists
    const existing = await ctx.db
      .query("processManagerStates")
      .withIndex("by_pm_instance", (q) =>
        q.eq("processManagerName", processManagerName).eq("instanceId", instanceId)
      )
      .first();

    if (existing) {
      // Optionally reset terminal states
      const isTerminal = existing.status === "completed" || existing.status === "failed";
      if (options.resetIfTerminal && isTerminal) {
        // Clear error by setting to empty string (undefined is no-op in Convex patch)
        await ctx.db.patch(existing._id, {
          status: "idle",
          lastUpdatedAt: now,
          ...(existing.errorMessage && { errorMessage: "" }),
        });
        return {
          processManagerName: existing.processManagerName,
          instanceId: existing.instanceId,
          status: "idle" as const,
          lastGlobalPosition: existing.lastGlobalPosition,
          commandsEmitted: existing.commandsEmitted,
          commandsFailed: existing.commandsFailed,
          stateVersion: existing.stateVersion,
          createdAt: existing.createdAt,
          lastUpdatedAt: now,
          isNew: false,
          ...(existing.customState !== undefined && { customState: existing.customState }),
          ...(existing.triggerEventId !== undefined && { triggerEventId: existing.triggerEventId }),
          ...(existing.correlationId !== undefined && { correlationId: existing.correlationId }),
        };
      }

      return {
        processManagerName: existing.processManagerName,
        instanceId: existing.instanceId,
        status: existing.status,
        lastGlobalPosition: existing.lastGlobalPosition,
        commandsEmitted: existing.commandsEmitted,
        commandsFailed: existing.commandsFailed,
        stateVersion: existing.stateVersion,
        createdAt: existing.createdAt,
        lastUpdatedAt: existing.lastUpdatedAt,
        isNew: false,
        ...(existing.customState !== undefined && { customState: existing.customState }),
        ...(existing.triggerEventId !== undefined && { triggerEventId: existing.triggerEventId }),
        ...(existing.correlationId !== undefined && { correlationId: existing.correlationId }),
        ...(existing.errorMessage !== undefined && { errorMessage: existing.errorMessage }),
      };
    }

    // Create new instance
    await ctx.db.insert("processManagerStates", {
      processManagerName,
      instanceId,
      status: "idle",
      lastGlobalPosition: 0n,
      commandsEmitted: 0,
      commandsFailed: 0,
      stateVersion: options.stateVersion ?? 1,
      createdAt: now,
      lastUpdatedAt: now,
      ...(options.customState !== undefined && { customState: options.customState }),
      ...(options.triggerEventId !== undefined && { triggerEventId: options.triggerEventId }),
      ...(options.correlationId !== undefined && { correlationId: options.correlationId }),
    });

    return {
      processManagerName,
      instanceId,
      status: "idle" as const,
      lastGlobalPosition: 0n,
      commandsEmitted: 0,
      commandsFailed: 0,
      stateVersion: options.stateVersion ?? 1,
      createdAt: now,
      lastUpdatedAt: now,
      isNew: true,
      ...(options.customState !== undefined && { customState: options.customState }),
      ...(options.triggerEventId !== undefined && { triggerEventId: options.triggerEventId }),
      ...(options.correlationId !== undefined && { correlationId: options.correlationId }),
    };
  },
});

/**
 * Get a process manager state by instance.
 *
 * @param processManagerName - Name of the process manager
 * @param instanceId - Instance ID to look up
 * @returns The process manager state, or null if not found
 */
export const getPMState = query({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
  },
  returns: v.union(
    v.object({
      processManagerName: v.string(),
      instanceId: v.string(),
      status: pmStatusValidator,
      lastGlobalPosition: compatGlobalPositionValidator,
      commandsEmitted: v.number(),
      commandsFailed: v.number(),
      customState: v.optional(vUnknown()),
      stateVersion: v.number(),
      triggerEventId: v.optional(v.string()),
      correlationId: v.optional(v.string()),
      createdAt: v.number(),
      lastUpdatedAt: v.number(),
      errorMessage: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const { processManagerName, instanceId } = args;

    const state = await ctx.db
      .query("processManagerStates")
      .withIndex("by_pm_instance", (q) =>
        q.eq("processManagerName", processManagerName).eq("instanceId", instanceId)
      )
      .first();

    if (!state) {
      return null;
    }

    return {
      processManagerName: state.processManagerName,
      instanceId: state.instanceId,
      status: state.status,
      lastGlobalPosition: state.lastGlobalPosition,
      commandsEmitted: state.commandsEmitted,
      commandsFailed: state.commandsFailed,
      stateVersion: state.stateVersion,
      createdAt: state.createdAt,
      lastUpdatedAt: state.lastUpdatedAt,
      ...(state.customState !== undefined && { customState: state.customState }),
      ...(state.triggerEventId !== undefined && { triggerEventId: state.triggerEventId }),
      ...(state.correlationId !== undefined && { correlationId: state.correlationId }),
      ...(state.errorMessage !== undefined && { errorMessage: state.errorMessage }),
    };
  },
});

/**
 * Update a process manager state.
 *
 * Supports updating status, position, custom state, and metrics.
 * Uses optimistic update pattern - returns updated state.
 *
 * @param processManagerName - Name of the process manager
 * @param instanceId - Instance ID to update
 * @param updates - Fields to update
 * @returns Updated state, or null if not found
 */
export const updatePMState = mutation({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
    updates: v.object({
      status: v.optional(pmStatusValidator),
      lastGlobalPosition: v.optional(compatGlobalPositionValidator),
      customState: v.optional(vUnknown()),
      stateVersion: v.optional(v.number()),
      commandsEmitted: v.optional(v.number()),
      commandsFailed: v.optional(v.number()),
      triggerEventId: v.optional(v.string()),
      correlationId: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
  },
  returns: v.union(
    v.object({
      status: v.literal("updated"),
      processManagerName: v.string(),
      instanceId: v.string(),
      newStatus: pmStatusValidator,
      lastGlobalPosition: compatGlobalPositionValidator,
    }),
    v.object({
      status: v.literal("not_found"),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, instanceId, updates } = args;
    const now = Date.now();
    assertBoundaryValuesSize([
      {
        fieldName: "updatePMState.updates.customState",
        value: updates.customState,
        maxBytes: EVENT_STORE_VALUE_MAX_BYTES,
      },
    ]);
    const normalizedLastGlobalPosition =
      updates.lastGlobalPosition !== undefined
        ? normalizeGlobalPosition(updates.lastGlobalPosition, "updates.lastGlobalPosition")
        : undefined;

    const existing = await ctx.db
      .query("processManagerStates")
      .withIndex("by_pm_instance", (q) =>
        q.eq("processManagerName", processManagerName).eq("instanceId", instanceId)
      )
      .first();

    if (!existing) {
      return { status: "not_found" as const };
    }

    // Build update object with only defined fields
    const updateFields = {
      lastUpdatedAt: now,
      ...(updates.status !== undefined && { status: updates.status }),
      ...(normalizedLastGlobalPosition !== undefined && {
        lastGlobalPosition: normalizedLastGlobalPosition,
      }),
      ...(updates.customState !== undefined && { customState: updates.customState }),
      ...(updates.stateVersion !== undefined && { stateVersion: updates.stateVersion }),
      ...(updates.commandsEmitted !== undefined && { commandsEmitted: updates.commandsEmitted }),
      ...(updates.commandsFailed !== undefined && { commandsFailed: updates.commandsFailed }),
      ...(updates.triggerEventId !== undefined && { triggerEventId: updates.triggerEventId }),
      ...(updates.correlationId !== undefined && { correlationId: updates.correlationId }),
      ...(updates.errorMessage !== undefined && { errorMessage: updates.errorMessage }),
    };

    await ctx.db.patch(existing._id, updateFields);

    return {
      status: "updated" as const,
      processManagerName,
      instanceId,
      newStatus: updates.status ?? existing.status,
      lastGlobalPosition: normalizedLastGlobalPosition ?? existing.lastGlobalPosition,
    };
  },
});

/**
 * Transition a process manager state with lifecycle validation.
 *
 * Validates that the transition is allowed by the PM state machine:
 * - idle → processing (START)
 * - processing → completed (SUCCESS)
 * - processing → failed (FAIL)
 * - completed → idle (RESET)
 * - failed → processing (RETRY)
 * - failed → idle (RESET)
 *
 * @param processManagerName - Name of the process manager
 * @param instanceId - Instance ID to transition
 * @param event - Lifecycle event to apply
 * @param options - Additional updates to apply with the transition
 * @returns Transition result
 */
export const transitionPMState = mutation({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
    event: v.union(
      v.literal("START"),
      v.literal("SUCCESS"),
      v.literal("FAIL"),
      v.literal("RETRY"),
      v.literal("RESET")
    ),
    options: v.optional(
      v.object({
        lastGlobalPosition: v.optional(compatGlobalPositionValidator),
        triggerEventId: v.optional(v.string()),
        correlationId: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        commandsEmitted: v.optional(v.number()),
        commandsFailed: v.optional(v.number()),
        customState: v.optional(vUnknown()),
      })
    ),
  },
  returns: v.union(
    v.object({
      status: v.literal("transitioned"),
      fromStatus: pmStatusValidator,
      toStatus: pmStatusValidator,
      event: v.string(),
    }),
    v.object({
      status: v.literal("invalid_transition"),
      currentStatus: pmStatusValidator,
      event: v.string(),
      validEvents: v.array(v.string()),
    }),
    v.object({
      status: v.literal("not_found"),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, instanceId, event, options = {} } = args;
    const now = Date.now();
    assertBoundaryValuesSize([
      {
        fieldName: "transitionPMState.options.customState",
        value: options.customState,
        maxBytes: EVENT_STORE_VALUE_MAX_BYTES,
      },
    ]);
    const normalizedLastGlobalPosition =
      options.lastGlobalPosition !== undefined
        ? normalizeGlobalPosition(options.lastGlobalPosition, "options.lastGlobalPosition")
        : undefined;

    const existing = await ctx.db
      .query("processManagerStates")
      .withIndex("by_pm_instance", (q) =>
        q.eq("processManagerName", processManagerName).eq("instanceId", instanceId)
      )
      .first();

    if (!existing) {
      return { status: "not_found" as const };
    }

    const newStatus = assertTransitionOrNull(
      existing.status,
      event,
      processManagerName,
      instanceId
    );

    if (newStatus === null) {
      return {
        status: "invalid_transition" as const,
        currentStatus: existing.status,
        event,
        validEvents: getPMValidEventsFrom(existing.status),
      };
    }

    // Build update with transition - clear error on recovery transitions
    // Note: We use empty string to "clear" errorMessage since Convex patch()
    // treats undefined as a no-op. Empty string is our sentinel for "no error".
    const clearError = event === "RESET" || event === "RETRY";
    const updateFields = {
      status: newStatus,
      lastUpdatedAt: now,
      // Clear error by setting to empty string (undefined is no-op in Convex patch)
      ...(clearError && existing.errorMessage && { errorMessage: "" }),
      ...(normalizedLastGlobalPosition !== undefined && {
        lastGlobalPosition: normalizedLastGlobalPosition,
      }),
      ...(options.triggerEventId !== undefined && { triggerEventId: options.triggerEventId }),
      ...(options.correlationId !== undefined && { correlationId: options.correlationId }),
      ...(!clearError &&
        options.errorMessage !== undefined && { errorMessage: options.errorMessage }),
      ...(options.commandsEmitted !== undefined && { commandsEmitted: options.commandsEmitted }),
      ...(options.commandsFailed !== undefined && { commandsFailed: options.commandsFailed }),
      ...(options.customState !== undefined && { customState: options.customState }),
    };

    await ctx.db.patch(existing._id, updateFields);

    return {
      status: "transitioned" as const,
      fromStatus: existing.status,
      toStatus: newStatus,
      event,
    };
  },
});

/**
 * List process manager states with filtering.
 *
 * @param options - Query options for filtering
 * @returns Array of process manager states
 */
export const listPMStates = query({
  args: {
    processManagerName: v.optional(v.string()),
    status: v.optional(pmStatusValidator),
    correlationId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      processManagerName: v.string(),
      instanceId: v.string(),
      status: pmStatusValidator,
      lastGlobalPosition: compatGlobalPositionValidator,
      commandsEmitted: v.number(),
      commandsFailed: v.number(),
      customState: v.optional(vUnknown()),
      stateVersion: v.number(),
      triggerEventId: v.optional(v.string()),
      correlationId: v.optional(v.string()),
      createdAt: v.number(),
      lastUpdatedAt: v.number(),
      errorMessage: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, status, correlationId, limit = 100 } = args;

    // Cap limit at 1000
    const effectiveLimit = Math.min(limit, 1000);

    let results: Doc<"processManagerStates">[];

    // Priority: name > status > correlation index; additional filters applied in-memory
    if (processManagerName) {
      results = await ctx.db
        .query("processManagerStates")
        .withIndex("by_pm_name", (q) => q.eq("processManagerName", processManagerName))
        .take(effectiveLimit);
    } else if (status) {
      results = await ctx.db
        .query("processManagerStates")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(effectiveLimit);
    } else if (correlationId) {
      results = await ctx.db
        .query("processManagerStates")
        .withIndex("by_correlation", (q) => q.eq("correlationId", correlationId))
        .take(effectiveLimit);
    } else {
      results = await ctx.db.query("processManagerStates").take(effectiveLimit);
    }

    // Apply additional filters in memory
    let filtered = results;
    if (processManagerName && status) {
      filtered = filtered.filter((s) => s.status === status);
    }
    if (correlationId && (processManagerName || status)) {
      filtered = filtered.filter((s) => s.correlationId === correlationId);
    }

    return filtered.map((s) => ({
      processManagerName: s.processManagerName,
      instanceId: s.instanceId,
      status: s.status,
      lastGlobalPosition: s.lastGlobalPosition,
      commandsEmitted: s.commandsEmitted,
      commandsFailed: s.commandsFailed,
      stateVersion: s.stateVersion,
      createdAt: s.createdAt,
      lastUpdatedAt: s.lastUpdatedAt,
      ...(s.customState !== undefined && { customState: s.customState }),
      ...(s.triggerEventId !== undefined && { triggerEventId: s.triggerEventId }),
      ...(s.correlationId !== undefined && { correlationId: s.correlationId }),
      ...(s.errorMessage !== undefined && { errorMessage: s.errorMessage }),
    }));
  },
});

// ============================================================================
// Process Manager Dead Letter Operations (Phase 13)
// ============================================================================

/**
 * Record a dead letter for a failed process manager processing.
 *
 * Idempotent: If a dead letter already exists for the same (pmName, instanceId, eventId),
 * returns the existing record instead of creating a duplicate. This handles retries
 * gracefully without accumulating duplicate dead letters.
 *
 * @param deadLetter - Dead letter information
 * @returns The created (or existing) dead letter ID
 */
export const recordPMDeadLetter = mutation({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
    eventId: v.optional(v.string()),
    error: v.string(),
    attemptCount: v.number(),
    failedCommand: v.optional(
      v.object({
        commandType: v.string(),
        payload: vUnknown(),
      })
    ),
    context: v.optional(vUnknown()),
  },
  returns: v.union(
    v.object({
      status: v.literal("recorded"),
      deadLetterId: v.string(),
    }),
    v.object({
      status: v.literal("already_exists"),
      deadLetterId: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, instanceId, eventId, error, attemptCount, failedCommand, context } =
      args;
    const now = Date.now();

    assertBoundaryValuesSize([
      {
        fieldName: "recordPMDeadLetter.failedCommand.payload",
        value: failedCommand?.payload,
        maxBytes: EVENT_STORE_VALUE_MAX_BYTES,
      },
      {
        fieldName: "recordPMDeadLetter.context",
        value: context,
        maxBytes: EVENT_STORE_VALUE_MAX_BYTES,
      },
    ]);

    // Check for existing dead letter (idempotency)
    // Use the new by_pm_instance index for efficient lookup
    const existingQuery = ctx.db
      .query("processManagerDeadLetters")
      .withIndex("by_pm_instance", (q) =>
        q.eq("processManagerName", processManagerName).eq("instanceId", instanceId)
      );

    // If eventId provided, filter for exact match
    const existing = eventId
      ? await existingQuery.filter((q) => q.eq(q.field("eventId"), eventId)).first()
      : await existingQuery.first();

    if (existing) {
      // Update attempt count if higher (in case of retries)
      if (attemptCount > existing.attemptCount) {
        await ctx.db.patch(existing._id, {
          attemptCount,
          error, // Update with latest error
          failedAt: now,
        });
      }
      return {
        status: "already_exists" as const,
        deadLetterId: existing._id.toString(),
      };
    }

    const id = await ctx.db.insert("processManagerDeadLetters", {
      processManagerName,
      instanceId,
      error,
      attemptCount,
      status: "pending",
      failedAt: now,
      ...(eventId !== undefined && { eventId }),
      ...(failedCommand !== undefined && { failedCommand }),
      ...(context !== undefined && { context }),
    });

    return {
      status: "recorded" as const,
      deadLetterId: id.toString(),
    };
  },
});

/**
 * Update a dead letter status (for replay or ignore operations).
 *
 * @param processManagerName - Name of the process manager
 * @param instanceId - Instance ID
 * @param eventId - Event ID (optional, used to find specific dead letter)
 * @param newStatus - New status to set
 * @returns Update result
 */
export const updatePMDeadLetterStatus = mutation({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
    eventId: v.optional(v.string()),
    newStatus: deadLetterStatusValidator,
  },
  returns: v.union(
    v.object({
      status: v.literal("updated"),
      previousStatus: deadLetterStatusValidator,
    }),
    v.object({
      status: v.literal("not_found"),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, instanceId, eventId, newStatus } = args;

    // Use the by_pm_instance compound index for efficient lookup (Phase 13.2 fix)
    const baseQuery = ctx.db
      .query("processManagerDeadLetters")
      .withIndex("by_pm_instance", (q) =>
        q.eq("processManagerName", processManagerName).eq("instanceId", instanceId)
      );

    // If eventId specified, filter for exact match; otherwise get first for instance
    const deadLetter = eventId
      ? await baseQuery.filter((q) => q.eq(q.field("eventId"), eventId)).first()
      : await baseQuery.first();

    if (!deadLetter) {
      return { status: "not_found" as const };
    }

    const previousStatus = deadLetter.status;
    await ctx.db.patch(deadLetter._id, { status: newStatus });

    return {
      status: "updated" as const,
      previousStatus,
    };
  },
});

/**
 * List dead letters with filtering.
 *
 * @param options - Query options for filtering
 * @returns Array of dead letters
 */
export const listPMDeadLetters = query({
  args: {
    processManagerName: v.optional(v.string()),
    status: v.optional(deadLetterStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      processManagerName: v.string(),
      instanceId: v.string(),
      eventId: v.optional(v.string()),
      error: v.string(),
      attemptCount: v.number(),
      status: deadLetterStatusValidator,
      failedCommand: v.optional(
        v.object({
          commandType: v.string(),
          payload: vUnknown(),
        })
      ),
      context: v.optional(vUnknown()),
      failedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, status, limit = 100 } = args;
    const effectiveLimit = Math.min(limit, 1000);

    let results: Doc<"processManagerDeadLetters">[];

    if (processManagerName) {
      results = await ctx.db
        .query("processManagerDeadLetters")
        .withIndex("by_pm_name", (q) => q.eq("processManagerName", processManagerName))
        .order("desc")
        .take(effectiveLimit);
    } else if (status) {
      results = await ctx.db
        .query("processManagerDeadLetters")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(effectiveLimit);
    } else {
      results = await ctx.db
        .query("processManagerDeadLetters")
        .withIndex("by_failed_at")
        .order("desc")
        .take(effectiveLimit);
    }

    // Apply additional filters in memory
    let filtered = results;
    if (processManagerName && status) {
      filtered = filtered.filter((dl) => dl.status === status);
    }

    return filtered.map((dl) => ({
      processManagerName: dl.processManagerName,
      instanceId: dl.instanceId,
      error: dl.error,
      attemptCount: dl.attemptCount,
      status: dl.status,
      failedAt: dl.failedAt,
      ...(dl.eventId !== undefined && { eventId: dl.eventId }),
      ...(dl.failedCommand !== undefined && { failedCommand: dl.failedCommand }),
      ...(dl.context !== undefined && { context: dl.context }),
    }));
  },
});

// ============================================================================
// DCB Scope Operations (Phase 16)
// ============================================================================

/**
 * Scope key regex for validation.
 * Format: tenant:${tenantId}:${scopeType}:${scopeId}
 */
const SCOPE_KEY_REGEX = /^tenant:([^:]+):([^:]+):(.+)$/;

/**
 * Parse scope key into components.
 *
 * NOTE: Intentionally duplicated from @libar-dev/platform-core to keep
 * component code self-contained. Must stay in sync with
 * platform-core/src/dcb/scopeKey.ts if format changes.
 *
 * @internal
 */
function parseScopeKey(scopeKey: string): {
  tenantId: string;
  scopeType: string;
  scopeId: string;
} | null {
  const match = scopeKey.match(SCOPE_KEY_REGEX);
  if (!match) {
    return null;
  }
  const tenantId = match[1];
  const scopeType = match[2];
  const scopeId = match[3];
  if (!tenantId || !scopeType || !scopeId) {
    return null;
  }
  return { tenantId, scopeType, scopeId };
}

/**
 * Get or create a DCB scope.
 *
 * Returns the current scope state. If scope doesn't exist, creates it with version 0.
 *
 * @param scopeKey - Scope key in format `tenant:${tenantId}:${scopeType}:${scopeId}`
 * @returns Scope state with isNew flag indicating if it was just created
 */
export const getOrCreateScope = mutation({
  args: {
    scopeKey: v.string(),
    boundedContext: v.string(),
    verificationProof: verificationProofValidator,
  },
  returns: v.object({
    scopeKey: v.string(),
    boundedContext: v.string(),
    currentVersion: v.number(),
    tenantId: v.string(),
    scopeType: v.string(),
    scopeId: v.string(),
    isNew: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { scopeKey, boundedContext } = args;

    // Parse and validate scope key
    const parsed = parseScopeKey(scopeKey);
    if (!parsed) {
      throw new Error(
        `Invalid scope key format: ${scopeKey}. Expected: tenant:\${tenantId}:\${scopeType}:\${scopeId}`
      );
    }

    await verifyActor({
      proof: args.verificationProof,
      expectedSubjectId: boundedContext,
      expectedSubjectType: "boundedContext",
      expectedBoundedContext: boundedContext,
      expectedTenantId: parsed.tenantId,
    });

    // Check if scope exists
    const existing = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (existing) {
      if (existing.boundedContext !== boundedContext) {
        throw new Error(
          `Scope ${scopeKey} belongs to bounded context ${existing.boundedContext}, not ${boundedContext}`
        );
      }

      return {
        scopeKey,
        boundedContext: existing.boundedContext,
        currentVersion: existing.currentVersion,
        tenantId: existing.tenantId,
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
        isNew: false,
      };
    }

    // Create new scope with version 0
    const now = Date.now();
    await ctx.db.insert("dcbScopes", {
      scopeKey,
      boundedContext,
      currentVersion: 0,
      tenantId: parsed.tenantId,
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeId,
      createdAt: now,
      lastUpdatedAt: now,
    });

    return {
      scopeKey,
      boundedContext,
      currentVersion: 0,
      tenantId: parsed.tenantId,
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeId,
      isNew: true,
    };
  },
});

/**
 * Check if expected version matches current scope version.
 *
 * Used for OCC validation before committing.
 *
 * @param scopeKey - Scope key to check
 * @param expectedVersion - Expected version for OCC
 * @returns Match status with current version if mismatch
 */
export const checkScopeVersion = query({
  args: {
    scopeKey: v.string(),
    expectedVersion: v.number(),
  },
  returns: v.union(
    v.object({ status: v.literal("match") }),
    v.object({
      status: v.literal("mismatch"),
      currentVersion: v.number(),
    }),
    v.object({ status: v.literal("not_found") })
  ),
  handler: async (ctx, args) => {
    const { scopeKey, expectedVersion } = args;

    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (!scope) {
      // New scope - expectedVersion should be 0
      if (expectedVersion === 0) {
        return { status: "match" as const };
      }
      return { status: "not_found" as const };
    }

    if (scope.currentVersion === expectedVersion) {
      return { status: "match" as const };
    }

    return {
      status: "mismatch" as const,
      currentVersion: scope.currentVersion,
    };
  },
});

/**
 * Atomically commit scope version increment with OCC.
 *
 * Also updates the list of stream IDs that are part of this scope
 * (for virtual stream queries).
 *
 * @param scopeKey - Scope key to commit
 * @param expectedVersion - Expected version for OCC
 * @param streamIds - Optional stream IDs to associate with this scope
 * @returns Success with new version, or conflict with current version
 */
export const commitScope = mutation({
  args: {
    scopeKey: v.string(),
    expectedVersion: v.number(),
    boundedContext: v.string(),
    verificationProof: verificationProofValidator,
    streamIds: v.optional(v.array(v.string())),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      newVersion: v.number(),
    }),
    v.object({
      status: v.literal("conflict"),
      currentVersion: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const { scopeKey, expectedVersion, boundedContext, streamIds } = args;
    const now = Date.now();

    const parsed = parseScopeKey(scopeKey);
    if (!parsed) {
      throw new Error(`Invalid scope key format: ${scopeKey}`);
    }

    await verifyActor({
      proof: args.verificationProof,
      expectedSubjectId: boundedContext,
      expectedSubjectType: "boundedContext",
      expectedBoundedContext: boundedContext,
      expectedTenantId: parsed.tenantId,
    });

    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    // Handle new scope creation
    if (!scope) {
      if (expectedVersion !== 0) {
        return { status: "conflict" as const, currentVersion: 0 };
      }

      await ctx.db.insert("dcbScopes", {
        scopeKey,
        boundedContext,
        currentVersion: 1,
        tenantId: parsed.tenantId,
        scopeType: parsed.scopeType,
        scopeId: parsed.scopeId,
        createdAt: now,
        lastUpdatedAt: now,
        ...(streamIds && { streamIds }),
      });

      return { status: "success" as const, newVersion: 1 };
    }

    if (scope.boundedContext !== boundedContext) {
      throw new Error(
        `Scope ${scopeKey} belongs to bounded context ${scope.boundedContext}, not ${boundedContext}`
      );
    }

    // Check OCC
    if (scope.currentVersion !== expectedVersion) {
      return {
        status: "conflict" as const,
        currentVersion: scope.currentVersion,
      };
    }

    // Commit version increment
    const newVersion = scope.currentVersion + 1;

    // Merge stream IDs if provided
    const mergedStreamIds = streamIds
      ? [...new Set([...(scope.streamIds ?? []), ...streamIds])]
      : scope.streamIds;

    await ctx.db.patch(scope._id, {
      currentVersion: newVersion,
      lastUpdatedAt: now,
      ...(mergedStreamIds && { streamIds: mergedStreamIds }),
    });

    return { status: "success" as const, newVersion };
  },
});

/**
 * Get a scope by key.
 *
 * @param scopeKey - Scope key to look up
 * @returns Scope if found, null otherwise
 */
export const getScope = query({
  args: {
    scopeKey: v.string(),
  },
  returns: v.union(
    v.object({
      scopeKey: v.string(),
      boundedContext: v.string(),
      currentVersion: v.number(),
      tenantId: v.string(),
      scopeType: v.string(),
      scopeId: v.string(),
      createdAt: v.number(),
      lastUpdatedAt: v.number(),
      streamIds: v.optional(v.array(v.string())),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const { scopeKey } = args;

    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (!scope) {
      return null;
    }

    return {
      scopeKey: scope.scopeKey,
      boundedContext: scope.boundedContext,
      currentVersion: scope.currentVersion,
      tenantId: scope.tenantId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      createdAt: scope.createdAt,
      lastUpdatedAt: scope.lastUpdatedAt,
      ...(scope.streamIds && { streamIds: scope.streamIds }),
    };
  },
});

/**
 * List scopes by tenant.
 *
 * @param tenantId - Tenant ID to filter by
 * @param scopeType - Optional scope type to filter by
 * @param limit - Maximum number of scopes to return
 * @returns Array of scopes
 */
export const listScopesByTenant = query({
  args: {
    tenantId: v.string(),
    scopeType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      scopeKey: v.string(),
      boundedContext: v.string(),
      currentVersion: v.number(),
      tenantId: v.string(),
      scopeType: v.string(),
      scopeId: v.string(),
      createdAt: v.number(),
      lastUpdatedAt: v.number(),
      streamIds: v.optional(v.array(v.string())),
    })
  ),
  handler: async (ctx, args) => {
    const { tenantId, scopeType, limit = 100 } = args;
    const effectiveLimit = Math.min(limit, 1000);

    let results: Doc<"dcbScopes">[];

    if (scopeType) {
      results = await ctx.db
        .query("dcbScopes")
        .withIndex("by_tenant_type", (q) => q.eq("tenantId", tenantId).eq("scopeType", scopeType))
        .take(effectiveLimit);
    } else {
      results = await ctx.db
        .query("dcbScopes")
        .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
        .take(effectiveLimit);
    }

    return results.map((s) => ({
      scopeKey: s.scopeKey,
      boundedContext: s.boundedContext,
      currentVersion: s.currentVersion,
      tenantId: s.tenantId,
      scopeType: s.scopeType,
      scopeId: s.scopeId,
      createdAt: s.createdAt,
      lastUpdatedAt: s.lastUpdatedAt,
      ...(s.streamIds && { streamIds: s.streamIds }),
    }));
  },
});

// ============================================================================
// Virtual Stream Queries (Phase 16)
// ============================================================================

/**
 * Query events across all streams in a DCB scope.
 *
 * Virtual streams provide a logical view of all events within a scope,
 * regardless of which physical stream they belong to.
 *
 * @param scopeKey - Scope key to query
 * @param fromGlobalPosition - Start position (exclusive)
 * @param limit - Maximum events to return
 * @returns Events from all streams in the scope, ordered by globalPosition
 */
export const readVirtualStream = query({
  args: {
    scopeKey: v.string(),
    fromGlobalPosition: v.optional(compatGlobalPositionValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      version: v.number(),
      globalPosition: compatGlobalPositionValidator,
      boundedContext: v.string(),
      tenantId: v.optional(v.string()),
      scopeKey: v.optional(v.string()),
      category: v.union(
        v.literal("domain"),
        v.literal("integration"),
        v.literal("trigger"),
        v.literal("fat")
      ),
      schemaVersion: v.number(),
      correlationId: v.string(),
      causationId: v.optional(v.string()),
      timestamp: v.number(),
      payload: storedUnknownValueValidator,
      metadata: storedMetadataValidator,
    })
  ),
  handler: async (ctx, args) => {
    const { scopeKey, limit = 100 } = args;
    const effectiveLimit = Math.min(limit, MAX_VIRTUAL_STREAM_LIMIT);
    const fromGlobalPosition = normalizeGlobalPosition(
      args.fromGlobalPosition ?? -1,
      "fromGlobalPosition"
    );

    // Get scope to find associated stream IDs
    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (!scope) {
      return [];
    }

    const indexedEvents = (
      await ctx.db
        .query("events")
        .withIndex("by_scope_key_and_global_position", (q) =>
          q.eq("scopeKey", scopeKey).gt("globalPosition", fromGlobalPosition)
        )
        .take(effectiveLimit)
    ).filter(
      (event) =>
        event.boundedContext === scope.boundedContext &&
        (event.tenantId === scope.tenantId || event.tenantId === undefined)
    );

    const streamIds = scope.streamIds ?? [];
    let legacyEvents: Array<Doc<"events">> = [];

    if (streamIds.length > 0) {
      const legacyCandidates = await Promise.all(
        streamIds.map((streamId) =>
          ctx.db
            .query("events")
            .withIndex("by_global_position", (q) => q.gt("globalPosition", fromGlobalPosition))
            .filter((q) =>
              q.and(
                q.eq(q.field("streamId"), streamId),
                q.eq(q.field("scopeKey"), undefined),
                q.eq(q.field("boundedContext"), scope.boundedContext),
                q.or(
                  q.eq(q.field("tenantId"), scope.tenantId),
                  q.eq(q.field("tenantId"), undefined)
                )
              )
            )
            .take(effectiveLimit)
        )
      );
      legacyEvents = legacyCandidates.flat();
    }

    const mergedEvents = [...indexedEvents, ...legacyEvents]
      .reduce<Array<Doc<"events">>>((unique, event) => {
        if (!unique.some((existing) => existing.eventId === event.eventId)) {
          unique.push(event);
        }
        return unique;
      }, [])
      .sort((a, b) => compareGlobalPositions(a.globalPosition, b.globalPosition));

    const limitedEvents = mergedEvents.slice(0, effectiveLimit);

    return limitedEvents.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      streamType: e.streamType,
      streamId: e.streamId,
      version: e.version,
      globalPosition: e.globalPosition,
      boundedContext: e.boundedContext,
      ...(e.tenantId !== undefined && { tenantId: e.tenantId }),
      ...(e.scopeKey !== undefined ? { scopeKey: e.scopeKey } : {}),
      category: e.category,
      schemaVersion: e.schemaVersion,
      correlationId: e.correlationId,
      timestamp: e.timestamp,
      payload: e.payload,
      ...(e.causationId !== undefined && { causationId: e.causationId }),
      ...(e.metadata !== undefined && { metadata: e.metadata }),
    }));
  },
});

/**
 * Get the latest global position across all streams in a scope.
 *
 * @param scopeKey - Scope key to query
 * @returns Latest global position, or 0 if scope has no events
 */
export const getScopeLatestPosition = query({
  args: {
    scopeKey: v.string(),
  },
  returns: compatGlobalPositionValidator,
  handler: async (ctx, args) => {
    const { scopeKey } = args;

    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (!scope) {
      return 0n;
    }

    const positions: GlobalPositionLike[] = [];
    const latestScopedEvent = await ctx.db
      .query("events")
      .withIndex("by_scope_key_and_global_position", (q) => q.eq("scopeKey", scopeKey))
      .order("desc")
      .first();

    if (
      latestScopedEvent &&
      latestScopedEvent.boundedContext === scope.boundedContext &&
      (latestScopedEvent.tenantId === scope.tenantId || latestScopedEvent.tenantId === undefined) &&
      isGlobalPositionAfter(latestScopedEvent.globalPosition, -1)
    ) {
      positions.push(latestScopedEvent.globalPosition);
    }

    for (const streamId of scope.streamIds ?? []) {
      const latestEvent = await ctx.db
        .query("events")
        .filter((q) =>
          q.and(
            q.eq(q.field("streamId"), streamId),
            q.eq(q.field("scopeKey"), undefined),
            q.eq(q.field("boundedContext"), scope.boundedContext),
            q.or(q.eq(q.field("tenantId"), scope.tenantId), q.eq(q.field("tenantId"), undefined))
          )
        )
        .order("desc")
        .first();

      if (latestEvent && isGlobalPositionAfter(latestEvent.globalPosition, -1)) {
        positions.push(latestEvent.globalPosition);
      }
    }

    return maxGlobalPosition(positions, 0n);
  },
});
