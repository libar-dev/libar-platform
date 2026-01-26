/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 *
 * @libar-docs-uses Workpool, idempotentAppend, WorkpoolPartitioningStrategy, EventBus
 * @libar-docs-used-by IntegrationRoutes, CrossContextIntegration, SagaEngine
 * @libar-docs-usecase "When publishing events across bounded contexts durably"
 *
 * ## Durable Cross-Context Event Publication
 *
 * Cross-context events use Workpool-backed publication with tracking,
 * retry, and dead letter handling.
 *
 * ### Why Durable Publication?
 *
 * Fire-and-forget publication loses events when subscribers fail. For
 * event-driven architectures to be reliable, cross-context communication
 * must be durable with guaranteed delivery or explicit failure tracking.
 *
 * ### Publication Ownership
 *
 * The source bounded context owns publication tracking. This maintains
 * BC boundaries and allows source-specific circuit breaker logic.
 *
 * ### Partition Key Strategy
 *
 * Uses `pub:${eventId}:${targetContext}` to ensure per-event ordering
 * while allowing parallel delivery to different events. See
 * WorkpoolPartitioningStrategy spec for partition key patterns.
 *
 * ### Usage
 *
 * ```typescript
 * const publisher = createDurableEventPublisher(publicationPool, {
 *   maxAttempts: 5,
 *   initialBackoffMs: 100,
 *   base: 2,
 * });
 *
 * await publisher.publish(ctx, {
 *   event: orderSubmittedEvent,
 *   sourceContext: "orders",
 *   targetContexts: ["inventory", "notifications"],
 *   correlationId,
 * });
 * ```
 *
 * @libar-docs-uses DurableFunctionAdapters, WorkpoolPartitioningStrategy
 */

import type { DurablePublisherConfig, EventPublication, PublicationStatus } from "./types.js";
import type { SafeActionRef, SafeMutationRef } from "../function-refs/types.js";
import { v7 as uuidv7 } from "uuid";
import type { WorkpoolLike } from "./durableAppend.js";

/**
 * Event to publish across contexts.
 */
export interface PublishableEvent {
  eventId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  streamType: string;
  streamId: string;
  correlationId?: string;
}

/**
 * Arguments for publishing an event.
 */
export interface PublishEventArgs {
  event: PublishableEvent;
  sourceContext: string;
  targetContexts: string[];
  correlationId?: string;
}

/**
 * Result of publishing an event via durable publication.
 *
 * Named `DurablePublishResult` to distinguish from the general
 * `PublishResult` in eventbus/types.ts.
 */
export interface DurablePublishResult {
  eventId: string;
  publications: Array<{
    targetContext: string;
    publicationId: string;
    status: PublicationStatus;
  }>;
}

/**
 * Context type for publish operations.
 *
 * Provides type-safe database operations for publication tracking.
 */
export interface PublishContext {
  db: {
    insert: (table: string, doc: Record<string, unknown>) => Promise<unknown>;
    query: (table: string) => {
      withIndex: (
        indexName: string,
        predicate: (q: { eq: (field: string, value: unknown) => unknown }) => unknown
      ) => {
        collect: () => Promise<PublicationRecord[]>;
        first: () => Promise<PublicationRecord | null>;
      };
    };
    patch: (id: unknown, fields: Record<string, unknown>) => Promise<void>;
  };
}

/**
 * Shape of publication record as stored in the database.
 *
 * Stores full event data to support retry operations. Without storing
 * the event details, retries would fail as they couldn't reconstruct
 * the complete event payload.
 */
interface PublicationRecord {
  _id: unknown;
  publicationId: string;
  eventId: string;
  sourceContext: string;
  targetContext: string;
  status: PublicationStatus;
  attemptCount?: number;
  lastAttemptAt?: number;
  deliveredAt?: number;
  error?: string;
  createdAt: number;
  correlationId?: string;
  // Full event data for retry support
  eventType: string;
  eventData: Record<string, unknown>;
  streamType: string;
  streamId: string;
}

/**
 * Durable event publisher interface.
 */
export interface DurableEventPublisher {
  /**
   * Publish an event to multiple target contexts.
   *
   * Creates publication tracking records and enqueues delivery
   * actions via Workpool. Each target context gets its own
   * tracking record and delivery action.
   */
  publish(ctx: PublishContext, args: PublishEventArgs): Promise<DurablePublishResult>;

  /**
   * Query publication status by event ID.
   */
  getPublicationStatus(ctx: PublishContext, eventId: string): Promise<EventPublication[]>;

  /**
   * Retry a failed publication.
   */
  retryPublication(
    ctx: PublishContext,
    publicationId: string
  ): Promise<{ status: "retried" | "not_found" | "already_delivered" }>;
}

/**
 * Dependencies for creating a durable event publisher.
 */
export interface DurablePublisherDependencies {
  /** Workpool for delivery retry management */
  workpool: WorkpoolLike;
  /** Reference to the delivery action in the app's convex/ directory */
  deliveryActionRef: SafeActionRef;
  /** Reference to the onComplete handler for delivery status updates */
  onCompleteRef: SafeMutationRef;
  /** Table name for publication tracking (default: "eventPublications") */
  tableName?: string;
}

/**
 * Full configuration for creating a durable event publisher.
 */
export interface DurablePublisherFullConfig extends DurablePublisherConfig {
  dependencies: DurablePublisherDependencies;
}

/**
 * Create a durable event publisher instance.
 *
 * The publisher creates tracking records in the eventPublications table
 * and enqueues delivery actions via Workpool. Each target context gets
 * its own tracking record and delivery action.
 *
 * **Dependencies:** The publisher requires references to app-level functions:
 * - `deliveryActionRef` - Action that performs the actual delivery
 * - `onCompleteRef` - Mutation that updates publication status on completion
 *
 * @param config - Full publisher configuration with dependencies
 * @returns Durable event publisher
 *
 * @example
 * ```typescript
 * // Create publisher with dependencies
 * const publisher = createDurableEventPublisher({
 *   maxAttempts: 5,
 *   initialBackoffMs: 100,
 *   base: 2,
 *   dependencies: {
 *     workpool: publicationPool,
 *     deliveryActionRef: internal.integration.deliverEvent,
 *     onCompleteRef: internal.integration.deadLetters.onPublicationComplete,
 *   },
 * });
 *
 * // Publish an event
 * await publisher.publish(ctx, {
 *   event: orderSubmittedEvent,
 *   sourceContext: "orders",
 *   targetContexts: ["inventory", "notifications"],
 * });
 * ```
 */
export function createDurableEventPublisher(
  config: DurablePublisherFullConfig
): DurableEventPublisher {
  const { dependencies, maxAttempts } = config;
  const { workpool, deliveryActionRef, onCompleteRef } = dependencies;
  const tableName = dependencies.tableName ?? "eventPublications";

  return {
    async publish(ctx: PublishContext, args: PublishEventArgs): Promise<DurablePublishResult> {
      const publications: DurablePublishResult["publications"] = [];
      const now = Date.now();

      for (const targetContext of args.targetContexts) {
        const publicationId = `pub_${uuidv7()}`;

        // Insert tracking record with full event data for retry support
        await ctx.db.insert(tableName, {
          publicationId,
          eventId: args.event.eventId,
          sourceContext: args.sourceContext,
          targetContext,
          status: "pending" as PublicationStatus,
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
          correlationId: args.correlationId ?? args.event.correlationId,
          // Store full event data for retry operations
          eventType: args.event.eventType,
          eventData: args.event.eventData,
          streamType: args.event.streamType,
          streamId: args.event.streamId,
        });

        // Enqueue delivery action
        const partitionKey = createPublicationPartitionKey(args.event.eventId, targetContext);

        await workpool.enqueueAction(
          ctx,
          deliveryActionRef,
          {
            event: args.event,
            targetContext,
            publicationId,
          },
          {
            key: partitionKey.value,
            onComplete: onCompleteRef,
            context: {
              publicationId,
              eventId: args.event.eventId,
              targetContext,
              sourceContext: args.sourceContext,
              maxAttempts,
            },
          }
        );

        publications.push({
          targetContext,
          publicationId,
          status: "pending",
        });
      }

      return {
        eventId: args.event.eventId,
        publications,
      };
    },

    async getPublicationStatus(ctx: PublishContext, eventId: string): Promise<EventPublication[]> {
      const records = await ctx.db
        .query(tableName)
        .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
        .collect();

      return records.map((record) => {
        const publication: EventPublication = {
          eventId: record.eventId,
          sourceContext: record.sourceContext,
          targetContext: record.targetContext,
          status: record.status,
          attempts: record.attemptCount ?? 0,
          createdAt: record.createdAt,
        };

        if (record.lastAttemptAt !== undefined) {
          publication.lastAttemptAt = record.lastAttemptAt;
        }
        if (record.deliveredAt !== undefined) {
          publication.deliveredAt = record.deliveredAt;
        }
        if (record.error !== undefined) {
          publication.error = record.error;
        }

        return publication;
      });
    },

    async retryPublication(
      ctx: PublishContext,
      publicationId: string
    ): Promise<{ status: "retried" | "not_found" | "already_delivered" }> {
      const record = await ctx.db
        .query(tableName)
        .withIndex("by_publication_id", (q) => q.eq("publicationId", publicationId))
        .first();

      if (!record) {
        return { status: "not_found" };
      }

      if (record.status === "delivered") {
        return { status: "already_delivered" };
      }

      // Update status to retried
      await ctx.db.patch(record._id, {
        status: "retried" as PublicationStatus,
        attemptCount: (record.attemptCount ?? 0) + 1,
        lastAttemptAt: Date.now(),
      });

      // Re-enqueue delivery action
      const partitionKey = createPublicationPartitionKey(record.eventId, record.targetContext);

      await workpool.enqueueAction(
        ctx,
        deliveryActionRef,
        {
          event: {
            eventId: record.eventId,
            eventType: record.eventType,
            eventData: record.eventData,
            streamType: record.streamType,
            streamId: record.streamId,
            correlationId: record.correlationId,
          },
          targetContext: record.targetContext,
          publicationId,
        },
        {
          key: partitionKey.value,
          onComplete: onCompleteRef,
          context: {
            publicationId,
            eventId: record.eventId,
            targetContext: record.targetContext,
            sourceContext: record.sourceContext,
            maxAttempts,
            isRetry: true,
          },
        }
      );

      return { status: "retried" };
    },
  };
}

/**
 * Create the partition key for publication delivery.
 *
 * Uses `pub:${eventId}:${targetContext}` format to ensure per-event
 * ordering while allowing parallel delivery across different events.
 *
 * @param eventId - Event ID
 * @param targetContext - Target context name
 * @returns Partition key object
 */
export function createPublicationPartitionKey(
  eventId: string,
  targetContext: string
): { name: string; value: string } {
  return {
    name: "publication",
    value: `${eventId}:${targetContext}`,
  };
}
