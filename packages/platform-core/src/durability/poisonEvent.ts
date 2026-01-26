/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * @libar-docs-uses EventStoreFoundation, Workpool
 * @libar-docs-used-by ProjectionProcessor, EventReplayInfrastructure, ProjectionRebuilder
 * @libar-docs-usecase "When projection processing must not be blocked by malformed events"
 *
 * ## Poison Event Handling
 *
 * Events that cause projection processing failures are tracked; after N
 * failures, they are quarantined and skipped to prevent infinite retry loops.
 *
 * ### Why Poison Event Handling?
 *
 * A single malformed event should not block all downstream projections
 * indefinitely. Quarantine allows progress while alerting operators for
 * manual investigation.
 *
 * ### Poison Event Flow
 *
 * | Attempt | Action |
 * |---------|--------|
 * | 1 | Process event, catch error, record attempt |
 * | 2 | Retry with backoff, catch error, record attempt |
 * | 3 | Quarantine event, skip in future processing, alert |
 *
 * ### Recovery
 *
 * Quarantined events can be:
 * - Manually fixed and reprocessed after code fix deployed
 * - Permanently ignored if event data is invalid
 * - Used to generate compensating events
 *
 * ### Usage
 *
 * ```typescript
 * // In projection processor
 * const handler = withPoisonEventHandling(
 *   async (ctx, event) => {
 *     // Projection logic that might fail
 *     await processOrderEvent(ctx, event);
 *   },
 *   { projectionName: "orderSummary", maxAttempts: 3 }
 * );
 *
 * // Will automatically track failures and quarantine
 * await handler(ctx, event);
 * ```
 *
 * @libar-docs-uses EventStoreFoundation
 */

import type { PoisonEventRecord, PoisonEventConfig } from "./types.js";
import type { SafeQueryRef, SafeMutationRef } from "../function-refs/types.js";

/**
 * Context type for poison event operations.
 *
 * Provides type-safe runQuery/runMutation methods that accept
 * SafeQueryRef/SafeMutationRef function references.
 */
export interface PoisonEventContext {
  runQuery: <T>(ref: SafeQueryRef, args: Record<string, unknown>) => Promise<T>;
  runMutation: <T>(ref: SafeMutationRef, args: Record<string, unknown>) => Promise<T>;
}

/**
 * Event type for poison event handler.
 *
 * Events processed by poison handlers should have at minimum
 * an identifier (eventId or _id) and optionally event type info.
 */
export interface ProcessableEvent {
  eventId?: string;
  _id?: string;
  eventType?: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * Event handler function type.
 *
 * @typeParam TEvent - The event type, defaults to ProcessableEvent
 */
export type EventHandler<TEvent extends ProcessableEvent = ProcessableEvent> = (
  ctx: PoisonEventContext,
  event: TEvent
) => Promise<void>;

/**
 * Dependencies for poison event operations.
 *
 * Since platform-core cannot access app-level tables directly,
 * all database operations are injected as function references.
 */
export interface PoisonEventDependencies {
  /** Query to get poison record by eventId + projectionName */
  getPoisonRecord: SafeQueryRef;
  /** Mutation to create or update poison record */
  upsertPoisonRecord: SafeMutationRef;
  /** Query to list quarantined events */
  listQuarantinedRecords: SafeQueryRef;
  /** Query to get poison event stats */
  getPoisonStats: SafeQueryRef;
}

/**
 * Shape of poison record as returned from app-level database queries.
 *
 * This interface documents the expected structure from app-level
 * poison event tables.
 */
interface PoisonRecordFromDb {
  eventId: string;
  eventType?: string;
  projectionName: string;
  status: "pending" | "quarantined" | "replayed";
  attemptCount: number;
  error?: string;
  errorStack?: string;
  eventPayload?: unknown;
  quarantinedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  resolvedBy?: string;
}

/**
 * Full configuration for poison event handling including dependencies.
 */
export interface PoisonEventFullConfig extends PoisonEventConfig {
  /** Projection name this handler processes */
  projectionName: string;
  /** Database operation dependencies */
  dependencies: PoisonEventDependencies;
  /** Optional callback when an event is quarantined */
  onQuarantine?: (info: {
    eventId: string;
    projectionName: string;
    attempts: number;
    error: string;
  }) => void;
}

/**
 * Wrap a projection handler with poison event handling.
 *
 * The wrapper tracks failures per event per projection. After
 * maxAttempts failures, the event is quarantined and skipped
 * in future processing.
 *
 * **Architecture Note:** This function uses dependency injection because
 * platform-core cannot directly access app-level tables. The app provides
 * database operations via the `dependencies` parameter.
 *
 * @param handler - Original event handler
 * @param config - Full poison event configuration with dependencies
 * @returns Wrapped handler with poison event handling
 *
 * @example
 * ```typescript
 * const safeHandler = withPoisonEventHandling(
 *   orderSummaryHandler,
 *   {
 *     projectionName: "orderSummary",
 *     maxAttempts: 3,
 *     alertOnQuarantine: true,
 *     dependencies: {
 *       getPoisonRecord: internal.projections.poison.getPoisonRecord,
 *       upsertPoisonRecord: internal.projections.poison.upsertPoisonRecord,
 *       listQuarantinedRecords: internal.projections.poison.listQuarantined,
 *       getPoisonStats: internal.projections.poison.getStats,
 *     },
 *     onQuarantine: ({ eventId, projectionName, attempts, error }) => {
 *       // Custom alerting - send to monitoring, log, etc.
 *       console.error(`[POISON] Event ${eventId} quarantined after ${attempts} attempts`);
 *     },
 *   }
 * );
 *
 * await safeHandler(ctx, event);
 * ```
 */
export function withPoisonEventHandling<TEvent extends ProcessableEvent = ProcessableEvent>(
  handler: EventHandler<TEvent>,
  config: PoisonEventFullConfig
): EventHandler<TEvent> {
  const { projectionName, maxAttempts, alertOnQuarantine, dependencies, onQuarantine } = config;

  return async (ctx: PoisonEventContext, event: TEvent) => {
    const eventId = event.eventId ?? event._id;

    // Check if event is already quarantined
    const existingRecord = await ctx.runQuery<PoisonRecordFromDb | null>(
      dependencies.getPoisonRecord,
      {
        eventId,
        projectionName,
      }
    );

    if (existingRecord?.status === "quarantined") {
      // Skip quarantined events silently
      return;
    }

    try {
      // Attempt to process the event
      await handler(ctx, event);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const now = Date.now();

      // Calculate new attempt count
      const attempts = (existingRecord?.attemptCount ?? 0) + 1;
      const shouldQuarantine = attempts >= maxAttempts;

      // Upsert the poison record
      await ctx.runMutation<void>(dependencies.upsertPoisonRecord, {
        eventId,
        eventType: event.eventType ?? event.type ?? "unknown",
        projectionName,
        status: shouldQuarantine ? "quarantined" : "pending",
        attemptCount: attempts,
        error: errorMessage,
        errorStack,
        eventPayload: event,
        quarantinedAt: shouldQuarantine ? now : existingRecord?.quarantinedAt,
        updatedAt: now,
      });

      if (shouldQuarantine && alertOnQuarantine) {
        // Invoke optional alert callback for operator visibility
        if (onQuarantine) {
          onQuarantine({
            eventId: eventId ?? "",
            projectionName,
            attempts,
            error: errorMessage,
          });
        }
      }

      // Re-throw if not yet quarantined (allow Workpool to retry)
      if (!shouldQuarantine) {
        throw error;
      }
      // If quarantined, swallow the error to allow other events to process
    }
  };
}

/**
 * Arguments for isEventQuarantined.
 */
export interface IsEventQuarantinedArgs {
  eventId: string;
  projectionName: string;
  dependencies: Pick<PoisonEventDependencies, "getPoisonRecord">;
}

/**
 * Check if an event is quarantined for a projection.
 *
 * @param ctx - Query context
 * @param args - Event ID, projection name, and dependencies
 * @returns Whether event is quarantined
 *
 * @example
 * ```typescript
 * const isQuarantined = await isEventQuarantined(ctx, {
 *   eventId: "evt_123",
 *   projectionName: "orderSummary",
 *   dependencies: { getPoisonRecord: internal.projections.poison.getPoisonRecord },
 * });
 *
 * if (isQuarantined) {
 *   console.log("Event is quarantined, skipping");
 * }
 * ```
 */
export async function isEventQuarantined(
  ctx: PoisonEventContext,
  args: IsEventQuarantinedArgs
): Promise<boolean> {
  const { eventId, projectionName, dependencies } = args;

  const record = await ctx.runQuery<PoisonRecordFromDb | null>(dependencies.getPoisonRecord, {
    eventId,
    projectionName,
  });

  return record?.status === "quarantined";
}

/**
 * Arguments for getPoisonEventRecord.
 */
export interface GetPoisonEventRecordArgs {
  eventId: string;
  projectionName: string;
  dependencies: Pick<PoisonEventDependencies, "getPoisonRecord">;
}

/**
 * Get poison event record for an event/projection.
 *
 * @param ctx - Query context
 * @param args - Event ID, projection name, and dependencies
 * @returns Poison event record or null
 *
 * @example
 * ```typescript
 * const record = await getPoisonEventRecord(ctx, {
 *   eventId: "evt_123",
 *   projectionName: "orderSummary",
 *   dependencies: { getPoisonRecord: internal.projections.poison.getPoisonRecord },
 * });
 *
 * if (record) {
 *   console.log(`Attempts: ${record.attempts}, Last error: ${record.lastError}`);
 * }
 * ```
 */
export async function getPoisonEventRecord(
  ctx: PoisonEventContext,
  args: GetPoisonEventRecordArgs
): Promise<PoisonEventRecord | null> {
  const { eventId, projectionName, dependencies } = args;

  const dbRecord = await ctx.runQuery<PoisonRecordFromDb | null>(dependencies.getPoisonRecord, {
    eventId,
    projectionName,
  });

  if (!dbRecord) {
    return null;
  }

  // Map app-level record to platform type
  const result: PoisonEventRecord = {
    eventId: dbRecord.eventId,
    projectionName: dbRecord.projectionName,
    attempts: dbRecord.attemptCount,
    lastError: dbRecord.error ?? "",
    createdAt: dbRecord.quarantinedAt ?? dbRecord.createdAt ?? Date.now(),
    updatedAt: dbRecord.updatedAt ?? Date.now(),
  };

  if (dbRecord.status === "quarantined" && dbRecord.quarantinedAt !== undefined) {
    result.quarantinedAt = dbRecord.quarantinedAt;
  }

  return result;
}

/**
 * Arguments for unquarantineEvent.
 */
export interface UnquarantineEventArgs {
  eventId: string;
  projectionName: string;
  dependencies: Pick<PoisonEventDependencies, "getPoisonRecord" | "upsertPoisonRecord">;
}

/**
 * Unquarantine an event for reprocessing.
 *
 * Use after deploying a fix for the issue that caused the event
 * to be quarantined. The event will be reprocessed on next
 * projection run.
 *
 * @param ctx - Mutation context
 * @param args - Event ID, projection name, and dependencies
 * @returns Result of unquarantine operation
 *
 * @example
 * ```typescript
 * const result = await unquarantineEvent(ctx, {
 *   eventId: "evt_123",
 *   projectionName: "orderSummary",
 *   dependencies: {
 *     getPoisonRecord: internal.projections.poison.getPoisonRecord,
 *     upsertPoisonRecord: internal.projections.poison.upsertPoisonRecord,
 *   },
 * });
 *
 * if (result.status === "unquarantined") {
 *   console.log("Event will be reprocessed on next projection run");
 * }
 * ```
 */
export async function unquarantineEvent(
  ctx: PoisonEventContext,
  args: UnquarantineEventArgs
): Promise<{ status: "unquarantined" | "not_found" | "not_quarantined" }> {
  const { eventId, projectionName, dependencies } = args;

  // Check current status
  const record = await ctx.runQuery<PoisonRecordFromDb | null>(dependencies.getPoisonRecord, {
    eventId,
    projectionName,
  });

  if (!record) {
    return { status: "not_found" };
  }

  if (record.status !== "quarantined") {
    return { status: "not_quarantined" };
  }

  // Update status to allow reprocessing (reset attempt count)
  await ctx.runMutation<void>(dependencies.upsertPoisonRecord, {
    eventId,
    eventType: record.eventType,
    projectionName,
    status: "replayed",
    attemptCount: 0,
    error: record.error,
    errorStack: record.errorStack,
    eventPayload: record.eventPayload,
    quarantinedAt: record.quarantinedAt,
    updatedAt: Date.now(),
    resolvedBy: "system", // Could accept as parameter if needed
  });

  return { status: "unquarantined" };
}

/**
 * Arguments for listQuarantinedEvents.
 */
export interface ListQuarantinedEventsArgs {
  projectionName?: string;
  limit?: number;
  dependencies: Pick<PoisonEventDependencies, "listQuarantinedRecords">;
}

/**
 * List quarantined events for a projection.
 *
 * @param ctx - Query context
 * @param args - Optional projection name filter, limit, and dependencies
 * @returns List of quarantined event records
 *
 * @example
 * ```typescript
 * // List all quarantined events
 * const allQuarantined = await listQuarantinedEvents(ctx, {
 *   limit: 100,
 *   dependencies: { listQuarantinedRecords: internal.projections.poison.listQuarantined },
 * });
 *
 * // List for specific projection
 * const orderQuarantined = await listQuarantinedEvents(ctx, {
 *   projectionName: "orderSummary",
 *   limit: 50,
 *   dependencies: { listQuarantinedRecords: internal.projections.poison.listQuarantined },
 * });
 * ```
 */
export async function listQuarantinedEvents(
  ctx: PoisonEventContext,
  args: ListQuarantinedEventsArgs
): Promise<PoisonEventRecord[]> {
  const { projectionName, limit, dependencies } = args;

  const records = await ctx.runQuery<PoisonRecordFromDb[]>(dependencies.listQuarantinedRecords, {
    projectionName,
    limit: limit ?? 100,
  });

  // Map app-level records to platform type
  return records.map((record) => {
    const result: PoisonEventRecord = {
      eventId: record.eventId,
      projectionName: record.projectionName,
      attempts: record.attemptCount,
      lastError: record.error ?? "",
      createdAt: record.quarantinedAt ?? record.createdAt ?? Date.now(),
      updatedAt: record.updatedAt ?? Date.now(),
    };

    if (record.quarantinedAt !== undefined) {
      result.quarantinedAt = record.quarantinedAt;
    }

    return result;
  });
}

/**
 * Arguments for getPoisonEventStats.
 */
export interface GetPoisonEventStatsArgs {
  dependencies: Pick<PoisonEventDependencies, "getPoisonStats">;
}

/**
 * Poison event statistics result.
 */
export interface PoisonEventStats {
  totalQuarantined: number;
  byProjection: Record<string, number>;
  recentErrors: Array<{
    eventId: string;
    projectionName: string;
    error: string;
    quarantinedAt: number;
  }>;
}

/**
 * Get statistics on poison events.
 *
 * Useful for monitoring dashboards and alerting on high poison rates.
 *
 * @param ctx - Query context
 * @param args - Dependencies for database access
 * @returns Poison event statistics
 *
 * @example
 * ```typescript
 * const stats = await getPoisonEventStats(ctx, {
 *   dependencies: { getPoisonStats: internal.projections.poison.getStats },
 * });
 *
 * console.log(`Total quarantined: ${stats.totalQuarantined}`);
 * for (const [projection, count] of Object.entries(stats.byProjection)) {
 *   console.log(`  ${projection}: ${count}`);
 * }
 * ```
 */
export async function getPoisonEventStats(
  ctx: PoisonEventContext,
  args: GetPoisonEventStatsArgs
): Promise<PoisonEventStats> {
  const { dependencies } = args;

  const stats = await ctx.runQuery(dependencies.getPoisonStats, {});

  // Type for the stats response from the app-level query
  interface StatsFromDb {
    totalQuarantined?: number;
    total?: number;
    byProjection?: Record<string, number>;
    recentErrors?: Array<{
      eventId: string;
      projectionName: string;
      error?: string;
      lastError?: string;
      quarantinedAt?: number;
    }>;
  }

  const typedStats = stats as StatsFromDb;

  // Normalize the response to match our interface
  return {
    totalQuarantined: typedStats.totalQuarantined ?? typedStats.total ?? 0,
    byProjection: typedStats.byProjection ?? {},
    recentErrors: (typedStats.recentErrors ?? []).map((error) => ({
      eventId: error.eventId,
      projectionName: error.projectionName,
      error: error.error ?? error.lastError ?? "",
      quarantinedAt: error.quarantinedAt ?? Date.now(),
    })),
  };
}
