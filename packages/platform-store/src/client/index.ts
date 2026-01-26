/**
 * EventStore client wrapper for type-safe event store operations.
 */
import type {
  FunctionReference,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDataModel,
} from "convex/server";

/**
 * Event category (Phase 9 event taxonomy).
 * - domain: Internal facts within bounded context for ES replay
 * - integration: Cross-context communication with versioned contracts
 * - trigger: ID-only notifications for GDPR compliance
 * - fat: Full state snapshots for external systems
 */
export type EventCategory = "domain" | "integration" | "trigger" | "fat";

/**
 * Event input for appending to a stream.
 */
export interface EventInput {
  eventId: string;
  eventType: string;
  payload: unknown;
  /**
   * Event category (Phase 9). Defaults to "domain" if not specified.
   */
  category?: EventCategory;
  /**
   * Schema version for upcasting pipeline (Phase 9). Defaults to 1 if not specified.
   */
  schemaVersion?: number;
  metadata?: {
    correlationId: string;
    causationId?: string;
    userId?: string;
  };
}

/**
 * Arguments for appending events to a stream.
 */
export interface AppendArgs {
  streamType: string;
  streamId: string;
  expectedVersion: number;
  boundedContext: string;
  events: EventInput[];
  [key: string]: unknown;
}

/**
 * Result of append operation.
 */
export type AppendResult =
  | {
      status: "success";
      eventIds: string[];
      globalPositions: number[];
      newVersion: number;
    }
  | {
      status: "conflict";
      currentVersion: number;
    };

/**
 * Stored event from the event store.
 */
export interface StoredEvent {
  eventId: string;
  eventType: string;
  streamType: string;
  streamId: string;
  version: number;
  globalPosition: number;
  boundedContext: string;
  /**
   * Event category (Phase 9 event taxonomy).
   */
  category: EventCategory;
  /**
   * Schema version for upcasting pipeline (Phase 9).
   */
  schemaVersion: number;
  correlationId: string;
  causationId?: string;
  timestamp: number;
  payload: unknown;
  metadata?: unknown;
}

/**
 * Read stream arguments.
 */
export interface ReadStreamArgs {
  streamType: string;
  streamId: string;
  fromVersion?: number;
  limit?: number;
  [key: string]: unknown;
}

/**
 * Read from position arguments.
 */
export interface ReadFromPositionArgs {
  fromPosition?: number;
  limit?: number;
  eventTypes?: string[];
  boundedContext?: string;
  [key: string]: unknown;
}

/**
 * Get stream version arguments.
 */
export interface GetStreamVersionArgs {
  streamType: string;
  streamId: string;
  [key: string]: unknown;
}

/**
 * Get by correlation arguments.
 */
export interface GetByCorrelationArgs {
  correlationId: string;
  [key: string]: unknown;
}

/**
 * Context type for mutations.
 * Using GenericMutationCtx for proper type safety while remaining
 * compatible with any app's data model.
 */
type MutationCtx = GenericMutationCtx<GenericDataModel>;

/**
 * Context type for queries.
 */
type QueryCtx = GenericQueryCtx<GenericDataModel>;

/**
 * Type for the component API.
 * This will be provided by the consuming application's generated types.
 */
export interface EventStoreApi {
  lib: {
    appendToStream: FunctionReference<"mutation", "internal", AppendArgs, AppendResult>;
    readStream: FunctionReference<"query", "internal", ReadStreamArgs, StoredEvent[]>;
    readFromPosition: FunctionReference<"query", "internal", ReadFromPositionArgs, StoredEvent[]>;
    getStreamVersion: FunctionReference<"query", "internal", GetStreamVersionArgs, number>;
    getByCorrelation: FunctionReference<"query", "internal", GetByCorrelationArgs, StoredEvent[]>;
    getGlobalPosition: FunctionReference<"query", "internal", Record<string, never>, number>;
  };
}

/**
 * @libar-docs
 * @libar-docs-pattern EventStore
 * @libar-docs-event-sourcing @libar-docs-overview @libar-docs-core
 * @libar-docs-status completed
 * @libar-docs-usecase "Appending events after CMS updates"
 * @libar-docs-usecase "Reading events for projection processing"
 * @libar-docs-used-by CommandOrchestrator
 *
 * ## EventStore - Central Event Storage
 *
 * Central event storage component for Event Sourcing.
 *
 * Type-safe client for the Convex Event Store component. Provides the foundation
 * for Event Sourcing with optimistic concurrency control (OCC) and global ordering.
 *
 * ### When to Use
 *
 * - Appending events as part of dual-write pattern
 * - Reading event streams for projections
 * - Querying events by correlation ID for tracing
 *
 * ### Key Features
 *
 * | Feature | Description |
 * |---------|-------------|
 * | **OCC** | Version-based conflict detection via `expectedVersion` |
 * | **Global Position** | Monotonic ordering for projection checkpoints |
 * | **Stream Isolation** | Events grouped by `streamType` + `streamId` |
 * | **Correlation** | Event tracing via `correlationId` chain |
 *
 * ### Usage Pattern
 *
 * The EventStore is used by the CommandOrchestrator to append events after
 * successful CMS updates (dual-write pattern). It's also used by projections
 * to read events for building read models.
 *
 * @example
 * ```typescript
 * import { EventStore } from "@libar-dev/platform-store";
 * import { components } from "./_generated/api";
 *
 * const eventStore = new EventStore(components.eventStore);
 *
 * // Append event with OCC
 * const result = await eventStore.appendToStream(ctx, {
 *   streamType: "Order",
 *   streamId: orderId,
 *   expectedVersion: 0,  // 0 = new stream, n = expected current version
 *   boundedContext: "orders",
 *   events: [{ eventId, eventType: "OrderCreated", payload: {...} }],
 * });
 *
 * if (result.status === "conflict") {
 *   // Handle version conflict - retry or reject
 * }
 *
 * // Read for projections
 * const events = await eventStore.readFromPosition(ctx, {
 *   fromPosition: lastCheckpoint,
 *   limit: 100,
 * });
 * ```
 */
export class EventStore<TApi extends EventStoreApi = EventStoreApi> {
  constructor(public readonly component: TApi) {}

  /**
   * Append events to a stream with optimistic concurrency control.
   */
  async appendToStream(ctx: MutationCtx, args: AppendArgs): Promise<AppendResult> {
    return ctx.runMutation(this.component.lib.appendToStream, args);
  }

  /**
   * Read events from a specific stream.
   */
  async readStream(ctx: QueryCtx, args: ReadStreamArgs): Promise<StoredEvent[]> {
    return ctx.runQuery(this.component.lib.readStream, args);
  }

  /**
   * Read all events globally in order (for projections).
   */
  async readFromPosition(ctx: QueryCtx, args: ReadFromPositionArgs): Promise<StoredEvent[]> {
    return ctx.runQuery(this.component.lib.readFromPosition, args);
  }

  /**
   * Get the current version of a stream.
   */
  async getStreamVersion(ctx: QueryCtx, args: GetStreamVersionArgs): Promise<number> {
    return ctx.runQuery(this.component.lib.getStreamVersion, args);
  }

  /**
   * Get events by correlation ID (for tracing).
   */
  async getByCorrelation(ctx: QueryCtx, args: GetByCorrelationArgs): Promise<StoredEvent[]> {
    return ctx.runQuery(this.component.lib.getByCorrelation, args);
  }

  /**
   * Get the current global position.
   */
  async getGlobalPosition(ctx: QueryCtx): Promise<number> {
    return ctx.runQuery(this.component.lib.getGlobalPosition, {});
  }
}
