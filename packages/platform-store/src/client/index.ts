/**
 * EventStore client wrapper for type-safe event store operations.
 */
import type {
  FunctionReference,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDataModel,
} from "convex/server";
import type { EventCategory } from "@libar-dev/platform-contracts-shared";
import type { GlobalPositionLike } from "@libar-dev/platform-core/events";
import { createVerificationProof } from "@libar-dev/platform-core/security";
export type { EventCategory } from "@libar-dev/platform-contracts-shared";

/**
 * Event input for appending to a stream.
 */
export interface EventInput {
  eventId: string;
  eventType: string;
  scopeKey?: string;
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
  tenantId?: string;
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
      globalPositions: GlobalPositionLike[];
      newVersion: number;
    }
  | {
      status: "duplicate";
      eventIds: string[];
      globalPositions: GlobalPositionLike[];
      newVersion: number;
    }
  | {
      status: "conflict";
      currentVersion: number;
    }
  | {
      status: "idempotency_conflict";
      existingEventId: string;
      auditId: string;
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
  globalPosition: GlobalPositionLike;
  boundedContext: string;
  tenantId?: string;
  scopeKey?: string;
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

export interface IdempotencyConflictAudit {
  auditId: string;
  idempotencyKey: string;
  streamType: string;
  streamId: string;
  boundedContext: string;
  tenantId?: string;
  incomingEventType: string;
  existingEventId: string;
  existingEventType: string;
  conflictReason: string;
  incomingFingerprint: string;
  existingFingerprint: string;
  incomingPayload: unknown;
  existingPayload: unknown;
  attemptedAt: number;
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
  fromPosition?: GlobalPositionLike;
  limit?: number;
  eventTypes?: string[];
  boundedContext?: string;
  [key: string]: unknown;
}

export interface ReadFromPositionResult {
  events: StoredEvent[];
  nextPosition: GlobalPositionLike;
  hasMore: boolean;
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
  limit?: number;
  cursor?: GlobalPositionLike;
  [key: string]: unknown;
}

export interface CorrelatedEventSummary {
  eventId: string;
  eventType: string;
  streamType: string;
  streamId: string;
  version: number;
  globalPosition: GlobalPositionLike;
  boundedContext: string;
  tenantId?: string;
  scopeKey?: string;
  category: EventCategory;
  schemaVersion: number;
  correlationId: string;
  causationId?: string;
  timestamp: number;
}

export interface GetByCorrelationResult {
  events: CorrelatedEventSummary[];
  nextCursor: GlobalPositionLike | null;
  hasMore: boolean;
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
    readFromPosition: FunctionReference<
      "query",
      "internal",
      ReadFromPositionArgs,
      ReadFromPositionResult
    >;
    getStreamVersion: FunctionReference<"query", "internal", GetStreamVersionArgs, number>;
    getByCorrelation: FunctionReference<"query", "internal", GetByCorrelationArgs, GetByCorrelationResult>;
    getGlobalPosition: FunctionReference<"query", "internal", Record<string, never>, GlobalPositionLike>;
    getIdempotencyConflictAudits: FunctionReference<
      "query",
      "internal",
      { idempotencyKey: string },
      IdempotencyConflictAudit[]
    >;
  };
}

/**
 * @architect
 * @architect-pattern EventStore
 * @architect-event-sourcing @architect-overview @architect-core
 * @architect-status completed
 * @architect-usecase "Appending events after CMS updates"
 * @architect-usecase "Reading events for projection processing"
 * @architect-used-by CommandOrchestrator
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
    const verificationProof = await createVerificationProof({
      target: "eventStore",
      issuer: "platform-store:EventStore.appendToStream",
      subjectId: args.boundedContext,
      subjectType: "boundedContext",
      boundedContext: args.boundedContext,
      ...(args.tenantId !== undefined && { tenantId: args.tenantId }),
    });

    const result = await ctx.runMutation(this.component.lib.appendToStream, {
      ...args,
      verificationProof,
    });

    if (result.status === "idempotency_conflict") {
      throw new Error(
        `appendToStream rejected idempotency key reuse with different payload. ` +
          `existingEventId=${result.existingEventId} auditId=${result.auditId}`
      );
    }

    return result;
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
  async readFromPosition(
    ctx: QueryCtx,
    args: ReadFromPositionArgs
  ): Promise<ReadFromPositionResult> {
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
  async getByCorrelation(ctx: QueryCtx, args: GetByCorrelationArgs): Promise<GetByCorrelationResult> {
    return ctx.runQuery(this.component.lib.getByCorrelation, args);
  }

  /**
   * Get the current global position.
   */
  async getGlobalPosition(ctx: QueryCtx): Promise<GlobalPositionLike> {
    return ctx.runQuery(this.component.lib.getGlobalPosition, {});
  }

  async getIdempotencyConflictAudits(
    ctx: QueryCtx,
    idempotencyKey: string
  ): Promise<IdempotencyConflictAudit[]> {
    return ctx.runQuery(this.component.lib.getIdempotencyConflictAudits, { idempotencyKey });
  }
}
