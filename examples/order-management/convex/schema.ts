import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * App-level schema.
 *
 * This schema contains:
 * - All projections (read models) - moved from bounded contexts for proper CQRS separation
 * - Cross-context projections
 * - Saga state tracking
 * - Shared projection infrastructure (checkpoints, dead letters)
 *
 * Bounded context components (Orders, Inventory) contain ONLY CMS tables.
 * Projections live at app level to enable cross-context views and proper ES pattern.
 */
export default defineSchema({
  /**
   * Cross-context dashboard metrics.
   * (Aggregated from multiple bounded contexts)
   */
  dashboardMetrics: defineTable({
    metricType: v.string(),
    value: v.number(),
    updatedAt: v.number(),
  }).index("by_type", ["metricType"]),

  /**
   * Saga state tracking table.
   *
   * Tracks saga instances for idempotency and status monitoring.
   * Each saga is uniquely identified by (sagaType, sagaId).
   */
  sagas: defineTable({
    /** Type of the saga (e.g., "OrderFulfillment") */
    sagaType: v.string(),

    /** Business identifier for idempotency (e.g., orderId) */
    sagaId: v.string(),

    /** Workflow run ID from @convex-dev/workflow */
    workflowId: v.string(),

    /** Current saga status */
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("compensating"),
      v.literal("compensated")
    ),

    /** ID of the event that triggered this saga */
    triggerEventId: v.string(),

    /** Global position of the trigger event */
    triggerGlobalPosition: v.number(),

    /** When the saga was created */
    createdAt: v.number(),

    /** When the saga was last updated */
    updatedAt: v.number(),

    /** When the saga completed (if applicable) */
    completedAt: v.optional(v.number()),

    /** Error message if saga failed */
    error: v.optional(v.string()),
  })
    .index("by_sagaId", ["sagaType", "sagaId"])
    .index("by_status", ["sagaType", "status"])
    .index("by_workflowId", ["workflowId"]),

  // =============================================================================
  // ORDER PROJECTIONS
  // =============================================================================

  /**
   * Order Summaries - read model for order listings.
   * Updated by order events from the Orders bounded context.
   */
  orderSummaries: defineTable({
    orderId: v.string(),
    customerId: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("cancelled")
    ),
    itemCount: v.number(),
    totalAmount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Last processed event's global position for conflict detection */
    lastGlobalPosition: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_customerId", ["customerId", "createdAt"])
    .index("by_status", ["status", "createdAt"]),

  /**
   * Order Items - read model for order line item details.
   * Updated by OrderItemAdded/OrderItemRemoved events.
   * Enables Order Detail page to display individual items.
   */
  orderItems: defineTable({
    orderId: v.string(),
    productId: v.string(),
    productName: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    lineTotal: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_orderId_productId", ["orderId", "productId"]),

  // =============================================================================
  // INVENTORY PROJECTIONS
  // =============================================================================

  /**
   * Product Catalog - read model for product listings.
   * Updated by product events from the Inventory bounded context.
   */
  productCatalog: defineTable({
    productId: v.string(),
    productName: v.string(),
    sku: v.string(),
    unitPrice: v.number(), // Price per unit (dollars for demo)
    availableQuantity: v.number(),
    reservedQuantity: v.number(),
    totalQuantity: v.number(), // available + reserved
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_productId", ["productId"])
    .index("by_sku", ["sku"]),

  /**
   * Stock Availability - read model for availability checks.
   * Optimized for quick stock level lookups.
   */
  stockAvailability: defineTable({
    productId: v.string(),
    availableQuantity: v.number(),
    reservedQuantity: v.number(),
    updatedAt: v.number(),
  }).index("by_productId", ["productId"]),

  /**
   * Active Reservations - read model for monitoring.
   * Includes items array for self-contained projection updates.
   */
  activeReservations: defineTable({
    reservationId: v.string(),
    orderId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("released"),
      v.literal("expired")
    ),
    itemCount: v.number(),
    items: v.array(
      v.object({
        productId: v.string(),
        quantity: v.number(),
      })
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_reservationId", ["reservationId"])
    .index("by_orderId", ["orderId"])
    .index("by_status", ["status", "createdAt"]),

  // =============================================================================
  // CROSS-CONTEXT PROJECTIONS
  // =============================================================================

  /**
   * Order With Inventory Status - cross-context view.
   * Combines order status with reservation status for dashboard views.
   * Updated by events from BOTH Orders and Inventory contexts.
   */
  orderWithInventoryStatus: defineTable({
    orderId: v.string(),
    customerId: v.string(),
    orderStatus: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("confirmed"),
      v.literal("cancelled")
    ),
    reservationId: v.optional(v.string()),
    reservationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("released"),
        v.literal("expired"),
        v.literal("failed")
      )
    ),
    totalAmount: v.number(),
    itemCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_customerId", ["customerId", "createdAt"])
    .index("by_orderStatus", ["orderStatus", "createdAt"]),

  // =============================================================================
  // SHARED PROJECTION INFRASTRUCTURE
  // =============================================================================

  /**
   * Projection Checkpoints - track projection progress.
   * Used for idempotency and rebuild operations.
   */
  projectionCheckpoints: defineTable({
    projectionName: v.string(),
    partitionKey: v.string(), // Usually orderId, productId, or "global"
    lastGlobalPosition: v.number(),
    lastEventId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_projection_partition", ["projectionName", "partitionKey"])
    .index("by_projection", ["projectionName"]),

  /**
   * Projection Dead Letters - failed projection processing.
   * Used for monitoring and manual replay of failed projections.
   *
   * Status flow:
   * - pending: Initial state after failure
   * - retrying: Being re-processed
   * - retried: Successfully re-processed
   * - replayed: Manually marked as replayed
   * - ignored: Manually marked as not requiring replay
   */
  projectionDeadLetters: defineTable({
    eventId: v.string(),
    projectionName: v.string(),
    error: v.string(),
    attemptCount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("retrying"),
      v.literal("retried"),
      v.literal("replayed"),
      v.literal("ignored")
    ),
    failedAt: v.number(),
    retryStartedAt: v.optional(v.number()), // Timestamp when retry started
  })
    .index("by_status", ["status", "failedAt"])
    .index("by_eventId", ["eventId"])
    .index("by_projection", ["projectionName", "status"]),

  // =============================================================================
  // EVENT DURABILITY INFRASTRUCTURE (Phase 18b)
  // =============================================================================

  /**
   * Event Publications - cross-context event delivery tracking.
   *
   * Tracks publication attempts for events published to other bounded contexts.
   * Used by createDurableEventPublisher() for reliable cross-context communication.
   *
   * Status flow:
   * - pending: Publication scheduled, not yet attempted
   * - delivered: Successfully delivered to target context
   * - failed: All retry attempts exhausted
   * - dead_lettered: Moved to dead letter queue after max retries
   *
   * @since Phase 18b (EventStoreDurability)
   */
  eventPublications: defineTable({
    /** Unique publication ID for tracking */
    publicationId: v.string(),

    /** ID of the event being published */
    eventId: v.string(),

    /** Source bounded context that originated the event */
    sourceContext: v.string(),

    /** Target bounded context for delivery */
    targetContext: v.string(),

    /** Current publication status */
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("dead_lettered")
    ),

    /** Number of delivery attempts */
    attemptCount: v.number(),

    /** Timestamp of last attempt */
    lastAttemptAt: v.optional(v.number()),

    /** Error message from last failed attempt */
    lastError: v.optional(v.string()),

    /** When the publication was created */
    createdAt: v.number(),

    /** When the status was last updated */
    updatedAt: v.number(),

    /** When the publication was delivered (if applicable) */
    deliveredAt: v.optional(v.number()),

    /** Correlation ID for tracing */
    correlationId: v.optional(v.string()),

    /** Event type (stored for retry support) */
    eventType: v.optional(v.string()),

    /** Event payload data (stored for retry support) */
    eventData: v.optional(v.any()),

    /** Stream type (stored for retry support) */
    streamType: v.optional(v.string()),

    /** Stream ID (stored for retry support) */
    streamId: v.optional(v.string()),
  })
    .index("by_publicationId", ["publicationId"])
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status", "createdAt"])
    .index("by_target_status", ["targetContext", "status"])
    .index("by_source_status", ["sourceContext", "status"]),

  /**
   * Poison Events - malformed or repeatedly failing events.
   *
   * Quarantines events that fail processing after max retry attempts.
   * Each record is projection-specific (an event can be poisoned for
   * one projection but not others).
   *
   * Status flow:
   * - quarantined: Event failed processing, requires manual review
   * - replayed: Event was manually fixed and replayed successfully
   * - ignored: Event was reviewed and marked as ignorable
   *
   * @since Phase 18b (EventStoreDurability)
   */
  poisonEvents: defineTable({
    /** ID of the poisoned event */
    eventId: v.string(),

    /** Event type for filtering */
    eventType: v.string(),

    /** Projection name where the event failed */
    projectionName: v.string(),

    /** Poison event status
     * - pending: Failed but not yet at maxAttempts (will be retried)
     * - quarantined: Failed maxAttempts times (won't retry until unquarantined)
     * - replayed: Was quarantined, now reset for retry
     * - ignored: Permanently ignoring this event
     */
    status: v.union(
      v.literal("pending"),
      v.literal("quarantined"),
      v.literal("replayed"),
      v.literal("ignored")
    ),

    /** Number of failed processing attempts */
    attemptCount: v.number(),

    /** Error message from last failure (may be empty for pending records) */
    error: v.optional(v.string()),

    /** Error stack trace (if available) */
    errorStack: v.optional(v.string()),

    /** Event payload (snapshot for debugging) */
    eventPayload: v.optional(v.any()),

    /** When the event was first quarantined (only set when status is quarantined) */
    quarantinedAt: v.optional(v.number()),

    /** When the record was first created */
    createdAt: v.optional(v.number()),

    /** When the status was last updated */
    updatedAt: v.number(),

    /** Who reviewed/resolved this poison event */
    resolvedBy: v.optional(v.string()),

    /** Notes from manual review */
    reviewNotes: v.optional(v.string()),
  })
    .index("by_eventId_projection", ["eventId", "projectionName"])
    .index("by_status", ["status", "quarantinedAt"])
    .index("by_projection_status", ["projectionName", "status"])
    .index("by_status_projection", ["status", "projectionName"])
    .index("by_eventType", ["eventType", "status"]),

  /**
   * Event Append Dead Letters - failed durable append operations.
   *
   * Records events that failed to append to the event store after
   * Workpool exhausted all retry attempts.
   *
   * Status flow:
   * - pending: Append failed, awaiting review or retry
   * - retrying: Retry in progress
   * - retried: Successfully retried
   * - ignored: Reviewed and marked as ignorable
   *
   * @since Phase 18b (EventStoreDurability)
   */
  eventAppendDeadLetters: defineTable({
    /** Idempotency key of the failed append */
    idempotencyKey: v.string(),

    /** Stream type (e.g., "Order", "Inventory") */
    streamType: v.string(),

    /** Stream ID */
    streamId: v.string(),

    /** Event type that failed */
    eventType: v.optional(v.string()),

    /** Bounded context */
    boundedContext: v.optional(v.string()),

    /** Dead letter status */
    status: v.union(
      v.literal("pending"),
      v.literal("retrying"),
      v.literal("retried"),
      v.literal("ignored")
    ),

    /** Error message from final failure */
    error: v.string(),

    /** Number of attempts before dead letter */
    attemptCount: v.number(),

    /** When the append originally failed */
    failedAt: v.number(),

    /** When the status was last updated */
    updatedAt: v.number(),

    /** Correlation ID for tracing */
    correlationId: v.optional(v.string()),

    /** Who reviewed/resolved this dead letter */
    resolvedBy: v.optional(v.string()),

    /** Notes from manual review */
    reviewNotes: v.optional(v.string()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status", ["status", "failedAt"])
    .index("by_stream", ["streamType", "streamId", "status"]),

  // ===========================================================================
  // REPLAY CHECKPOINTS - Projection Rebuild Tracking (Phase 18b-1)
  // ===========================================================================
  /**
   * Tracks progress of projection rebuild operations.
   * Enables checkpoint-based resumption for long-running replays.
   *
   * @libar-docs
   * @libar-docs-implements EventReplayInfrastructure
   */
  replayCheckpoints: defineTable({
    replayId: v.string(), // Unique identifier (for external reference)
    projection: v.string(), // Target projection name
    startPosition: v.number(), // Original starting globalPosition (for progress calculation)
    lastPosition: v.number(), // Last successfully processed globalPosition
    targetPosition: v.optional(v.number()), // End position (null = current max)
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    eventsProcessed: v.number(), // Total events processed so far
    chunksCompleted: v.number(), // Number of chunks completed
    error: v.optional(v.string()), // Error message if failed
    startedAt: v.number(), // Timestamp when replay started
    updatedAt: v.number(), // Last checkpoint update timestamp
    completedAt: v.optional(v.number()), // Timestamp when completed
  })
    .index("by_projection_status", ["projection", "status"])
    .index("by_replayId", ["replayId"])
    .index("by_status", ["status"]),

  // ===========================================================================
  // COMMAND INTENTS - Intent/Completion Bracketing (Phase 18.5)
  // ===========================================================================
  /**
   * Command Intents - track long-running command execution.
   *
   * Records intent before command execution and completion after.
   * Enables detection of orphaned commands that started but never finished.
   *
   * Status flow:
   * - pending: Intent recorded, execution in progress
   * - completed: Command succeeded
   * - failed: Command failed (business rejection or error)
   * - abandoned: Timeout expired, no completion recorded
   *
   * @since Phase 18.5 (DurableEventsIntegration)
   */
  commandIntents: defineTable({
    /** Unique intent key (operationType:streamType:streamId:timestamp) */
    intentKey: v.string(),

    /** Type of operation (e.g., "SubmitOrder", "ReserveStock") */
    operationType: v.string(),

    /** Stream type (e.g., "Order", "Inventory") */
    streamType: v.string(),

    /** Stream ID (e.g., orderId, productId) */
    streamId: v.string(),

    /** Bounded context (e.g., "orders", "inventory") */
    boundedContext: v.string(),

    /** Intent status */
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("abandoned")
    ),

    /** Timeout in milliseconds before orphan detection */
    timeoutMs: v.number(),

    /** Optional metadata for debugging */
    metadata: v.optional(v.any()),

    /** Correlation ID for distributed tracing */
    correlationId: v.optional(v.string()),

    /** When the intent was completed (if applicable) */
    completedAt: v.optional(v.number()),

    /** Event ID created by successful completion */
    completionEventId: v.optional(v.string()),

    /** Error message if failed */
    error: v.optional(v.string()),

    /** When the intent was created */
    createdAt: v.number(),

    /** When the intent was last updated */
    updatedAt: v.number(),
  })
    .index("by_intentKey", ["intentKey"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_streamId", ["streamType", "streamId"]),

  // =============================================================================
  // AGENT BC INFRASTRUCTURE
  // =============================================================================

  /**
   * Agent Checkpoints - track agent processing position.
   * Used for exactly-once semantics and resumption after restart.
   *
   * Agent BC lives at app level (not as Convex component) because:
   * - Agents need cross-BC event access
   * - Components have isolated databases
   * - Agents are cross-cutting concerns
   *
   * @since Phase 22 (AgentAsBoundedContext)
   */
  agentCheckpoints: defineTable({
    /** Agent BC identifier (e.g., "churn-risk-agent") */
    agentId: v.string(),

    /** Subscription instance ID */
    subscriptionId: v.string(),

    /** Last processed global position (-1 = none processed) */
    lastProcessedPosition: v.number(),

    /** Last processed event ID */
    lastEventId: v.string(),

    /** Checkpoint status: active, paused, stopped */
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("stopped")
    ),

    /** Total events processed by this agent */
    eventsProcessed: v.number(),

    /** Last checkpoint update timestamp */
    updatedAt: v.number(),
  })
    .index("by_agentId", ["agentId"])
    .index("by_status", ["status", "updatedAt"]),

  /**
   * Agent Dead Letters - failed event processing.
   * Separate from projection dead letters due to different semantics.
   *
   * Status flow:
   * - pending: Initial state after failure
   * - replayed: Successfully re-processed
   * - ignored: Manually marked as not requiring replay
   *
   * @since Phase 22 (AgentAsBoundedContext)
   */
  agentDeadLetters: defineTable({
    /** Agent BC identifier */
    agentId: v.string(),

    /** Subscription instance ID */
    subscriptionId: v.string(),

    /** ID of the event that failed processing */
    eventId: v.string(),

    /** Global position of the failed event */
    globalPosition: v.number(),

    /** Sanitized error message */
    error: v.string(),

    /** Number of processing attempts */
    attemptCount: v.number(),

    /** Dead letter status */
    status: v.union(
      v.literal("pending"),
      v.literal("replayed"),
      v.literal("ignored")
    ),

    /** When the failure occurred */
    failedAt: v.number(),

    /** Workpool work ID for debugging */
    workId: v.optional(v.string()),

    /** Optional context for debugging */
    context: v.optional(
      v.object({
        correlationId: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        ignoreReason: v.optional(v.string()),
      })
    ),
  })
    .index("by_agentId_status", ["agentId", "status", "failedAt"])
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status", "failedAt"]),

  /**
   * Agent Audit Events - decision tracking for explainability.
   * Records all agent decisions, approvals, and rejections.
   *
   * @since Phase 22 (AgentAsBoundedContext)
   */
  agentAuditEvents: defineTable({
    /** Audit event type */
    eventType: v.union(
      v.literal("AgentDecisionMade"),
      v.literal("AgentActionApproved"),
      v.literal("AgentActionRejected"),
      v.literal("AgentActionExpired"),
      v.literal("AgentAnalysisCompleted"),
      v.literal("AgentAnalysisFailed")
    ),

    /** Agent BC identifier */
    agentId: v.string(),

    /** Unique decision ID for correlation */
    decisionId: v.string(),

    /** When the event occurred */
    timestamp: v.number(),

    /** Event-specific payload (varies by eventType) */
    payload: v.any(),
  })
    .index("by_agentId_timestamp", ["agentId", "timestamp"])
    .index("by_decisionId", ["decisionId"])
    .index("by_eventType", ["eventType", "timestamp"]),
});
