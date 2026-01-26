import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { v7 as uuidv7 } from "uuid";

/**
 * GlobalPosition formula constants.
 *
 * Formula: timestamp * TIMESTAMP_MULTIPLIER + streamHash * HASH_MULTIPLIER + (version % VERSION_MODULO)
 *
 * This formula ensures:
 * - Globally unique positions (stream identity included via hash)
 * - Monotonically increasing within a stream
 * - Time-ordered across streams (timestamp is primary sort key)
 *
 * ## Precision Trade-off (Documented Limitation)
 *
 * With real timestamps (~1.7×10^12 ms since epoch), the formula result exceeds
 * Number.MAX_SAFE_INTEGER (~9×10^15). This is accepted because:
 *
 * 1. **Uniqueness maintained**: Stream hash differentiation prevents collisions
 * 2. **Ordering sufficient**: Approximate ordering is adequate for checkpointing
 * 3. **Collision probability**: Effectively zero in practice (requires same ms,
 *    same hash bucket, same version % 1000)
 *
 * See ADR-024 in docs/architecture/DECISIONS.md for full trade-off analysis.
 */
const GLOBAL_POSITION_CONSTANTS = {
  /** Multiplier for timestamp - makes time the primary sort key (1 million) */
  TIMESTAMP_MULTIPLIER: 1_000_000,
  /** Multiplier for stream hash - provides 1000 buckets for stream differentiation */
  HASH_MULTIPLIER: 1_000,
  /** Modulo for version - handles version tiebreaker within same millisecond (0-999) */
  VERSION_MODULO: 1_000,
  /** Modulo for stream hash (djb2 output) - 1000 buckets balances collision vs distribution */
  HASH_MODULO: 1_000,
} as const;

/**
 * Append events to a stream with optimistic concurrency control.
 *
 * @param streamType - Type of the stream (e.g., "Order")
 * @param streamId - ID of the stream instance
 * @param expectedVersion - Expected current version (0 for new streams)
 * @param events - Array of events to append
 * @returns Success with event IDs and positions, or conflict with current version
 */
export const appendToStream = mutation({
  args: {
    streamType: v.string(),
    streamId: v.string(),
    expectedVersion: v.number(),
    boundedContext: v.string(),
    events: v.array(
      v.object({
        eventId: v.string(),
        eventType: v.string(),
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
        payload: v.any(),
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
      globalPositions: v.array(v.number()),
      newVersion: v.number(),
    }),
    v.object({
      status: v.literal("conflict"),
      currentVersion: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const { streamType, streamId, expectedVersion, boundedContext, events } = args;

    // Get or create stream record
    const existingStream = await ctx.db
      .query("streams")
      .withIndex("by_stream", (q) => q.eq("streamType", streamType).eq("streamId", streamId))
      .first();

    const currentVersion = existingStream?.currentVersion ?? 0;

    // Check for concurrency conflict
    if (currentVersion !== expectedVersion) {
      return {
        status: "conflict" as const,
        currentVersion,
      };
    }

    // Generate timestamp-based global positions that are globally unique.
    // Formula: timestamp * 1_000_000 + streamHash * 1_000 + (version % 1000)
    //
    // This ensures:
    // - Globally unique positions (stream identity included in calculation)
    // - Monotonically increasing within a stream
    // - Time-ordered across streams (timestamp is primary sort key)
    //
    // Why this matters:
    // - Without streamHash, two streams appending at the same millisecond with
    //   the same version % 1000 would get identical globalPositions (collision!)
    // - Projection checkpoints rely on globalPosition uniqueness for idempotency
    const timestamp = Date.now();

    // Simple hash function for stream identity (djb2 algorithm)
    // This provides good distribution with minimal collision risk
    const streamIdentity = `${streamType}:${streamId}`;
    let hash = 5381;
    for (let i = 0; i < streamIdentity.length; i++) {
      hash = (hash * 33) ^ streamIdentity.charCodeAt(i);
    }
    const streamHash = Math.abs(hash % GLOBAL_POSITION_CONSTANTS.HASH_MODULO);

    // Prepare event records
    const eventIds: string[] = [];
    const globalPositions: number[] = [];
    let nextVersion = currentVersion;

    for (const event of events) {
      nextVersion++;
      // Combine timestamp, stream hash, and version for globally unique position
      // - timestamp * 1M: primary time ordering
      // - streamHash * 1K: stream identity offset (0-999)
      // - version % 1K: version tiebreaker within stream (0-999)
      const globalPosition =
        timestamp * GLOBAL_POSITION_CONSTANTS.TIMESTAMP_MULTIPLIER +
        streamHash * GLOBAL_POSITION_CONSTANTS.HASH_MULTIPLIER +
        (nextVersion % GLOBAL_POSITION_CONSTANTS.VERSION_MODULO);

      await ctx.db.insert("events", {
        eventId: event.eventId,
        eventType: event.eventType,
        streamType,
        streamId,
        version: nextVersion,
        globalPosition,
        boundedContext,
        // Phase 9: Event taxonomy and schema versioning (required fields with defaults)
        category: event.category ?? "domain",
        schemaVersion: event.schemaVersion ?? 1,
        correlationId: event.metadata?.correlationId ?? `corr_${uuidv7()}`,
        timestamp,
        payload: event.payload,
        ...(event.metadata?.causationId !== undefined && {
          causationId: event.metadata.causationId,
        }),
        ...(event.metadata !== undefined && { metadata: event.metadata }),
        // Phase 18b: Idempotency key for duplicate detection
        ...(event.idempotencyKey !== undefined && { idempotencyKey: event.idempotencyKey }),
      });

      eventIds.push(event.eventId);
      globalPositions.push(globalPosition);
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
  returns: v.array(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      version: v.number(),
      globalPosition: v.number(),
      boundedContext: v.string(),
      // Phase 9: Event taxonomy and schema versioning (required)
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
      payload: v.any(),
      metadata: v.optional(v.any()),
    })
  ),
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
 * ## Event Type Filtering Limitation
 *
 * When using the `eventTypes` filter:
 * - Filtering happens IN-MEMORY after fetching from the database
 * - The function fetches 3x the requested limit to compensate for filtering
 * - This works well when your event types are common (>30% of all events)
 *
 * **For sparse event distributions** (e.g., if your event type is <10% of events):
 * - You may receive fewer results than the requested limit
 * - Consider querying the `by_event_type` index directly for better performance
 * - Or use the `getByEventType` query (if available) for specific event types
 *
 * ## Recommended Usage
 *
 * - For projection rebuilds: Call without eventTypes filter, process all events
 * - For catching up on specific events: Use smaller batches and loop until done
 *
 * @param fromPosition - Start reading from this global position (exclusive)
 * @param limit - Maximum number of events to return (default: 100)
 * @param eventTypes - Optional filter for specific event types (in-memory filter)
 * @param boundedContext - Optional filter for specific bounded context
 * @returns Array of events ordered by globalPosition
 */
export const readFromPosition = query({
  args: {
    fromPosition: v.optional(v.number()),
    limit: v.optional(v.number()),
    eventTypes: v.optional(v.array(v.string())),
    boundedContext: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      version: v.number(),
      globalPosition: v.number(),
      boundedContext: v.string(),
      // Phase 9: Event taxonomy and schema versioning (required)
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
      payload: v.any(),
      metadata: v.optional(v.any()),
    })
  ),
  handler: async (ctx, args) => {
    const { fromPosition = -1, limit = 100, eventTypes, boundedContext } = args;

    // When filtering by eventTypes, fetch more to compensate for filtering
    // This is a tradeoff - we may fetch more than needed but ensure we return enough
    const fetchLimit = eventTypes ? limit * 3 : limit;

    let query = ctx.db
      .query("events")
      .withIndex("by_global_position")
      .filter((q) => q.gt(q.field("globalPosition"), fromPosition));

    // Apply bounded context filter at query level
    if (boundedContext) {
      query = query.filter((q) => q.eq(q.field("boundedContext"), boundedContext));
    }

    const events = await query.take(fetchLimit);

    // Filter by event types in memory if specified, then apply limit
    let filteredEvents = eventTypes
      ? events.filter((e) => eventTypes.includes(e.eventType))
      : events;

    // Apply limit after filtering
    if (eventTypes && filteredEvents.length > limit) {
      filteredEvents = filteredEvents.slice(0, limit);
    }

    return filteredEvents.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      streamType: e.streamType,
      streamId: e.streamId,
      version: e.version,
      globalPosition: e.globalPosition,
      boundedContext: e.boundedContext,
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
  },
  returns: v.array(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      version: v.number(),
      globalPosition: v.number(),
      boundedContext: v.string(),
      // Phase 9: Event taxonomy and schema versioning (required)
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
      payload: v.any(),
      metadata: v.optional(v.any()),
    })
  ),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_correlation", (q) => q.eq("correlationId", args.correlationId))
      .collect();

    return events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      streamType: e.streamType,
      streamId: e.streamId,
      version: e.version,
      globalPosition: e.globalPosition,
      boundedContext: e.boundedContext,
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
 * Get the current global position (highest position in the event store).
 *
 * Note: With timestamp-based positions, this returns the maximum position
 * found in the events table. Returns 0 if no events exist.
 */
export const getGlobalPosition = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // Query events in descending order by globalPosition, take first
    const latestEvent = await ctx.db
      .query("events")
      .withIndex("by_global_position")
      .order("desc")
      .first();

    return latestEvent?.globalPosition ?? 0;
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
      globalPosition: v.number(),
      boundedContext: v.string(),
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
      payload: v.any(),
      metadata: v.optional(v.any()),
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
        customState: v.optional(v.any()),
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
    lastGlobalPosition: v.number(),
    commandsEmitted: v.number(),
    commandsFailed: v.number(),
    customState: v.optional(v.any()),
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
      lastGlobalPosition: 0,
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
      lastGlobalPosition: 0,
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
      lastGlobalPosition: v.number(),
      commandsEmitted: v.number(),
      commandsFailed: v.number(),
      customState: v.optional(v.any()),
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
      lastGlobalPosition: v.optional(v.number()),
      customState: v.optional(v.any()),
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
      lastGlobalPosition: v.number(),
    }),
    v.object({
      status: v.literal("not_found"),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, instanceId, updates } = args;
    const now = Date.now();

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
      ...(updates.lastGlobalPosition !== undefined && {
        lastGlobalPosition: updates.lastGlobalPosition,
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
      lastGlobalPosition: updates.lastGlobalPosition ?? existing.lastGlobalPosition,
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
        lastGlobalPosition: v.optional(v.number()),
        triggerEventId: v.optional(v.string()),
        correlationId: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        commandsEmitted: v.optional(v.number()),
        commandsFailed: v.optional(v.number()),
        customState: v.optional(v.any()),
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

    const existing = await ctx.db
      .query("processManagerStates")
      .withIndex("by_pm_instance", (q) =>
        q.eq("processManagerName", processManagerName).eq("instanceId", instanceId)
      )
      .first();

    if (!existing) {
      return { status: "not_found" as const };
    }

    // State transition lookup table
    const transitions: Record<string, Record<string, string>> = {
      idle: { START: "processing" },
      processing: { SUCCESS: "completed", FAIL: "failed" },
      completed: { RESET: "idle" },
      failed: { RETRY: "processing", RESET: "idle" },
    };

    const validTransitions = transitions[existing.status] ?? {};
    const newStatus = validTransitions[event];

    if (!newStatus) {
      return {
        status: "invalid_transition" as const,
        currentStatus: existing.status,
        event,
        validEvents: Object.keys(validTransitions),
      };
    }

    // Build update with transition - clear error on recovery transitions
    // Note: We use empty string to "clear" errorMessage since Convex patch()
    // treats undefined as a no-op. Empty string is our sentinel for "no error".
    const clearError = event === "RESET" || event === "RETRY";
    const typedNewStatus = newStatus as "idle" | "processing" | "completed" | "failed";

    const updateFields = {
      status: typedNewStatus,
      lastUpdatedAt: now,
      // Clear error by setting to empty string (undefined is no-op in Convex patch)
      ...(clearError && existing.errorMessage && { errorMessage: "" }),
      ...(options.lastGlobalPosition !== undefined && {
        lastGlobalPosition: options.lastGlobalPosition,
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
      toStatus: newStatus as "idle" | "processing" | "completed" | "failed",
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
      lastGlobalPosition: v.number(),
      commandsEmitted: v.number(),
      commandsFailed: v.number(),
      customState: v.optional(v.any()),
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

    let results;

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
        payload: v.any(),
      })
    ),
    context: v.optional(v.any()),
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
          payload: v.any(),
        })
      ),
      context: v.optional(v.any()),
      failedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const { processManagerName, status, limit = 100 } = args;
    const effectiveLimit = Math.min(limit, 1000);

    let results;

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
  },
  returns: v.object({
    scopeKey: v.string(),
    currentVersion: v.number(),
    tenantId: v.string(),
    scopeType: v.string(),
    scopeId: v.string(),
    isNew: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { scopeKey } = args;

    // Parse and validate scope key
    const parsed = parseScopeKey(scopeKey);
    if (!parsed) {
      throw new Error(
        `Invalid scope key format: ${scopeKey}. Expected: tenant:\${tenantId}:\${scopeType}:\${scopeId}`
      );
    }

    // Check if scope exists
    const existing = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (existing) {
      return {
        scopeKey,
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
      currentVersion: 0,
      tenantId: parsed.tenantId,
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeId,
      createdAt: now,
      lastUpdatedAt: now,
    });

    return {
      scopeKey,
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
    const { scopeKey, expectedVersion, streamIds } = args;
    const now = Date.now();

    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    // Handle new scope creation
    if (!scope) {
      if (expectedVersion !== 0) {
        return { status: "conflict" as const, currentVersion: 0 };
      }

      const parsed = parseScopeKey(scopeKey);
      if (!parsed) {
        throw new Error(`Invalid scope key format: ${scopeKey}`);
      }

      await ctx.db.insert("dcbScopes", {
        scopeKey,
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

    let results;

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
    fromGlobalPosition: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      eventId: v.string(),
      eventType: v.string(),
      streamType: v.string(),
      streamId: v.string(),
      version: v.number(),
      globalPosition: v.number(),
      boundedContext: v.string(),
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
      payload: v.any(),
      metadata: v.optional(v.any()),
    })
  ),
  handler: async (ctx, args) => {
    const { scopeKey, fromGlobalPosition = -1, limit = 100 } = args;

    // Get scope to find associated stream IDs
    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (!scope || !scope.streamIds || scope.streamIds.length === 0) {
      return [];
    }

    // Query events from all streams in the scope
    // Note: This is an in-memory aggregation approach. For large scopes,
    // consider adding a dcbScopeKey field to events table with an index.
    const allEvents = [];

    for (const streamId of scope.streamIds) {
      const events = await ctx.db
        .query("events")
        .withIndex("by_global_position")
        .filter((q) =>
          q.and(
            q.gt(q.field("globalPosition"), fromGlobalPosition),
            q.eq(q.field("streamId"), streamId)
          )
        )
        .take(limit);

      allEvents.push(...events);
    }

    // Sort by global position and apply limit
    allEvents.sort((a, b) => a.globalPosition - b.globalPosition);
    const limitedEvents = allEvents.slice(0, limit);

    return limitedEvents.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      streamType: e.streamType,
      streamId: e.streamId,
      version: e.version,
      globalPosition: e.globalPosition,
      boundedContext: e.boundedContext,
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
  returns: v.number(),
  handler: async (ctx, args) => {
    const { scopeKey } = args;

    const scope = await ctx.db
      .query("dcbScopes")
      .withIndex("by_scope_key", (q) => q.eq("scopeKey", scopeKey))
      .first();

    if (!scope || !scope.streamIds || scope.streamIds.length === 0) {
      return 0;
    }

    let maxPosition = 0;
    for (const streamId of scope.streamIds) {
      const latestEvent = await ctx.db
        .query("events")
        .filter((q) => q.eq(q.field("streamId"), streamId))
        .order("desc")
        .first();

      if (latestEvent && latestEvent.globalPosition > maxPosition) {
        maxPosition = latestEvent.globalPosition;
      }
    }

    return maxPosition;
  },
});
