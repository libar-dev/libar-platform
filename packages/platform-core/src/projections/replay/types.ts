/**
 * @libar-docs
 * @libar-docs-implements EventReplayInfrastructure
 * @libar-docs-status completed
 *
 * Types for event replay and projection rebuilding.
 */

import { z } from "zod";
import type { SafeMutationRef } from "../../function-refs/types.js";

// Replay status values
export const ReplayStatusSchema = z.enum(["running", "paused", "completed", "failed", "cancelled"]);
export type ReplayStatus = z.infer<typeof ReplayStatusSchema>;

// Replay checkpoint (matches schema.ts definition)
export interface ReplayCheckpoint {
  _id: string;
  replayId: string;
  projection: string;
  startPosition: number; // Original starting globalPosition (for progress calculation)
  lastPosition: number;
  targetPosition?: number;
  status: ReplayStatus;
  eventsProcessed: number;
  chunksCompleted: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

// Progress information for UI display
export interface ReplayProgress {
  replayId: string;
  projectionName: string;
  status: ReplayStatus;
  eventsProcessed: number;
  totalEvents: number;
  percentComplete: number;
  chunksCompleted: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  estimatedRemainingMs?: number;
  error?: string;
}

// Arguments for triggering a rebuild
export interface TriggerRebuildArgs {
  projectionName: string;
  fromGlobalPosition?: number;
  chunkSize?: number;
}

// Arguments for processing a chunk
export interface ProcessChunkArgs {
  replayId: string;
  projectionName: string;
  fromPosition: number;
  chunkSize: number;
}

// Chunk processing result
export interface ChunkProcessResult {
  status: "processing" | "completed";
  eventsProcessed: number;
  lastPosition?: number;
}

// Trigger rebuild result
export type TriggerRebuildResult =
  | {
      success: true;
      replayId: string;
      totalEvents: number;
    }
  | {
      success: false;
      error: "REPLAY_ALREADY_ACTIVE";
      existingReplayId?: string;
    };

// Cancel rebuild result
export type CancelRebuildResult =
  | {
      success: true;
      eventsProcessedBeforeCancel: number;
    }
  | {
      success: false;
      error: "REPLAY_NOT_FOUND" | "REPLAY_NOT_RUNNING";
      currentStatus?: ReplayStatus;
    };

// =============================================================================
// Replay Handler Types (for handler integration)
// =============================================================================

/**
 * A stored event from the Event Store, used for replay.
 */
export interface StoredEventForReplay {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  streamType: string;
  streamId: string;
  globalPosition: number;
  version: number;
  timestamp: number;
  correlationId?: string | undefined;
  causationId?: string | undefined;
}

/**
 * A replay handler entry that maps an event type to a handler mutation.
 *
 * The `toArgsFromEvent` function transforms a raw stored event into
 * the specific args shape expected by the handler mutation.
 */
export interface ReplayHandlerEntry<TArgs = unknown> {
  /**
   * Reference to the handler mutation (FunctionReference).
   *
   * Uses SafeMutationRef for type-safe function reference handling
   * with TS2589 prevention via makeFunctionReference pattern.
   */
  handler: SafeMutationRef;

  /**
   * Transform stored event to handler args.
   */
  toArgsFromEvent: (event: StoredEventForReplay) => TArgs;
}

/**
 * Map of event types to replay handlers for a single projection.
 */
export type ProjectionReplayHandlers = Map<string, ReplayHandlerEntry>;

/**
 * Registry interface for replay handlers.
 */
export interface ReplayHandlerRegistry {
  /**
   * Get the handler for a specific projection and event type.
   */
  get(projectionName: string, eventType: string): ReplayHandlerEntry | undefined;

  /**
   * Check if a handler exists.
   */
  has(projectionName: string, eventType: string): boolean;

  /**
   * Get all event types handled by a projection.
   */
  getEventTypes(projectionName: string): string[];

  /**
   * Get all registered projection names.
   */
  getProjectionNames(): string[];
}

/**
 * Create a replay handler registry.
 *
 * @example
 * ```typescript
 * const registry = createReplayHandlerRegistry();
 *
 * registry.register("orderSummary", {
 *   "OrderCreated": {
 *     handler: onOrderCreated,
 *     toArgsFromEvent: (event) => ({
 *       orderId: event.payload.orderId,
 *       customerId: event.payload.customerId,
 *       eventId: event.eventId,
 *       globalPosition: event.globalPosition,
 *     }),
 *   },
 * });
 * ```
 */
export function createReplayHandlerRegistry(): ReplayHandlerRegistry & {
  register(projectionName: string, handlers: Record<string, ReplayHandlerEntry>): void;
} {
  const projectionHandlers = new Map<string, Map<string, ReplayHandlerEntry>>();

  return {
    register(projectionName: string, handlers: Record<string, ReplayHandlerEntry>): void {
      const handlerMap = new Map<string, ReplayHandlerEntry>();
      for (const [eventType, entry] of Object.entries(handlers)) {
        handlerMap.set(eventType, entry);
      }
      projectionHandlers.set(projectionName, handlerMap);
    },

    get(projectionName: string, eventType: string): ReplayHandlerEntry | undefined {
      return projectionHandlers.get(projectionName)?.get(eventType);
    },

    has(projectionName: string, eventType: string): boolean {
      return projectionHandlers.get(projectionName)?.has(eventType) ?? false;
    },

    getEventTypes(projectionName: string): string[] {
      const handlers = projectionHandlers.get(projectionName);
      return handlers ? Array.from(handlers.keys()) : [];
    },

    getProjectionNames(): string[] {
      return Array.from(projectionHandlers.keys());
    },
  };
}
