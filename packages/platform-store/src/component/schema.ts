import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vUnknown } from "@libar-dev/platform-core/validation";

const compatGlobalPositionValidator = v.union(v.number(), v.int64());

export default defineSchema({
  /**
   * Events table - stores all domain events.
   *
   * Events are immutable and ordered by globalPosition.
   */
  events: defineTable({
    // Event identity
    eventId: v.string(),
    eventType: v.string(),

    // Stream (aggregate) identity
    streamType: v.string(),
    streamId: v.string(),
    version: v.number(),

    // Global ordering
    globalPosition: compatGlobalPositionValidator,

    // Context
    boundedContext: v.string(),
    tenantId: v.optional(v.string()),
    scopeKey: v.optional(v.string()),

    // Event taxonomy (Phase 9)
    // Category: domain, integration, trigger, fat
    category: v.union(
      v.literal("domain"),
      v.literal("integration"),
      v.literal("trigger"),
      v.literal("fat")
    ),

    // Schema versioning (Phase 9)
    // Used by upcasting pipeline for schema evolution
    schemaVersion: v.number(),

    // Correlation/causation
    correlationId: v.string(),
    causationId: v.optional(v.string()),

    // Timing
    timestamp: v.number(),

    /**
     * Event payload - intentionally untyped at storage layer.
     * Each bounded context defines its own event schemas with Zod validation.
     * The Event Store acts as a generic event log, not a typed repository.
     */
    payload: vUnknown(),

    /**
     * Event metadata - extensible for correlation, tracing, and custom fields.
     * Intentionally untyped to allow context-specific metadata additions.
     */
    metadata: v.optional(vUnknown()),

    /**
     * Idempotency key for duplicate detection (Phase 18b - EventStoreDurability).
     *
     * Used by idempotentAppendEvent() to prevent duplicate event writes
     * when commands/actions are retried. Format varies by source:
     * - Commands: `cmd:${commandId}:${eventType}`
     * - Actions: `action:${actionName}:${correlationId}`
     * - Saga steps: `saga:${sagaId}:${stepName}`
     * - Scheduled jobs: `scheduled:${jobId}:${runId}`
     *
     * @since Phase 18b (EventStoreDurability)
     */
    idempotencyKey: v.optional(v.string()),
  })
    // For reading events from a specific stream in order
    .index("by_stream", ["streamType", "streamId", "version"])
    // For reading all events in global order (projections)
    .index("by_global_position", ["globalPosition"])
    // For filtering by event type
    .index("by_event_type_and_global_position", ["eventType", "globalPosition"])
    // For correlation tracing
    .index("by_correlation", ["correlationId"])
    .index("by_correlation_and_global_position", ["correlationId", "globalPosition"])
    .index("by_scope_key_and_global_position", ["scopeKey", "globalPosition"])
    // For idempotent append duplicate detection (Phase 18b)
    .index("by_idempotency_key", ["idempotencyKey"]),

  /**
   * Streams table - tracks stream metadata for OCC.
   *
   * Each aggregate has one stream record tracking its current version.
   */
  streams: defineTable({
    streamType: v.string(),
    streamId: v.string(),
    currentVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_stream", ["streamType", "streamId"]),

  /**
   * Global position allocator state.
   *
   * Tracks the last millisecond bucket and within-bucket sequence so new event
   * positions stay strictly monotonic at real `Date.now()` scales.
   */
  globalPositionAllocators: defineTable({
    name: v.string(),
    lastTimestamp: v.number(),
    lastSequence: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  /**
   * Idempotency conflict audit trail.
   *
   * Persists rejected same-key/different-payload append attempts so they remain
   * queryable after the mutation returns a rejection result.
   */
  idempotencyConflictAudits: defineTable({
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
    incomingPayload: vUnknown(),
    existingPayload: vUnknown(),
    attemptedAt: v.number(),
  })
    .index("by_idempotency_key", ["idempotencyKey", "attemptedAt"])
    .index("by_audit_id", ["auditId"]),

  /**
   * Projection Status table - tracks projection lifecycle state.
   *
   * Each projection has one status record tracking its current state,
   * progress, and error information for monitoring and rebuild operations.
   *
   * @since Phase 12 (Projection Registry & Lifecycle)
   */
  projectionStatus: defineTable({
    // Projection identity
    projectionName: v.string(),

    // Lifecycle state: active, rebuilding, paused, error
    status: v.union(
      v.literal("active"),
      v.literal("rebuilding"),
      v.literal("paused"),
      v.literal("error")
    ),

    // Progress tracking
    lastGlobalPosition: compatGlobalPositionValidator,
    eventsProcessed: v.number(),
    eventsFailed: v.number(),

    // Timestamps
    createdAt: v.number(),
    lastUpdatedAt: v.number(),

    // Error information (when status is "error")
    errorMessage: v.optional(v.string()),
  })
    // For projection lookup by name
    .index("by_name", ["projectionName"])
    // For filtering by status (e.g., find all errored projections)
    .index("by_status", ["status"])
    // For finding stale projections
    .index("by_last_updated", ["lastUpdatedAt"]),

  /**
   * Process Manager States table - tracks PM instance lifecycle.
   *
   * Each PM instance has one state record tracking processing status,
   * position, and custom state for coordination across events.
   *
   * Process Managers are distinct from Sagas:
   * - PMs: Event-reactive, emit commands, minimal state
   * - Sagas: Multi-step orchestration with compensation
   *
   * @since Phase 13 (Process Manager Abstraction)
   */
  processManagerStates: defineTable({
    // PM identity
    processManagerName: v.string(),
    instanceId: v.string(),

    // Lifecycle state: idle, processing, completed, failed
    status: v.union(
      v.literal("idle"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),

    // Progress tracking
    lastGlobalPosition: compatGlobalPositionValidator,
    commandsEmitted: v.number(),
    commandsFailed: v.number(),

    // Custom state for hybrid PMs
    customState: v.optional(vUnknown()),
    stateVersion: v.number(),

    // Event correlation
    triggerEventId: v.optional(v.string()),
    correlationId: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    lastUpdatedAt: v.number(),

    // Error information (when status is "failed")
    errorMessage: v.optional(v.string()),
  })
    // Primary lookup: PM name + instance ID
    .index("by_pm_instance", ["processManagerName", "instanceId"])
    // For listing all instances of a PM
    .index("by_pm_name", ["processManagerName"])
    // For finding PMs by status (e.g., find all failed)
    .index("by_status", ["status"])
    // For correlation-based lookups
    .index("by_correlation", ["correlationId"])
    // For finding stale PM instances (matches projectionStatus pattern)
    .index("by_last_updated", ["lastUpdatedAt"]),

  /**
   * DCB Scopes table - tracks scope-level versions for multi-entity OCC.
   *
   * Each scope represents a consistency boundary that can span multiple
   * streams/entities within a single bounded context. The scope version
   * is used for optimistic concurrency control at the boundary level.
   *
   * Key concepts:
   * - **Scope Key**: Unique identifier with format `tenant:${tenantId}:${scopeType}:${scopeId}`
   * - **Scope Version**: Incremented atomically when any entity in scope changes
   * - **Virtual Streams**: Logical composition of events from entities in scope
   *
   * DCB enables cross-entity invariants (e.g., reserve 3 products atomically)
   * without distributed locking or Saga overhead for single-BC operations.
   *
   * @since Phase 16 (Dynamic Consistency Boundaries)
   */
  dcbScopes: defineTable({
    // Scope identity - format: tenant:${tenantId}:${scopeType}:${scopeId}
    scopeKey: v.string(),

    // Owning bounded context for authorization checks
    boundedContext: v.string(),

    // OCC tracking
    currentVersion: v.number(),

    // Tenant isolation (extracted from scopeKey for index efficiency)
    tenantId: v.string(),

    // Scope metadata
    scopeType: v.string(), // e.g., "reservation", "order"
    scopeId: v.string(), // The unique ID within the type

    // Timestamps
    createdAt: v.number(),
    lastUpdatedAt: v.number(),

    // Track which streams are part of this scope (for virtual stream queries)
    streamIds: v.optional(v.array(v.string())),
  })
    // Primary lookup by scope key
    .index("by_scope_key", ["scopeKey"])
    // Filter by tenant for tenant-scoped operations
    .index("by_tenant", ["tenantId"])
    // Filter by scope type within tenant
    .index("by_tenant_type", ["tenantId", "scopeType"]),

  /**
   * Process Manager Dead Letters table - failed PM events.
   *
   * Separate from projection dead letters since PMs have different
   * semantics (command emission failures vs read model update failures).
   *
   * @since Phase 13 (Process Manager Abstraction)
   */
  processManagerDeadLetters: defineTable({
    // PM identity
    processManagerName: v.string(),
    instanceId: v.string(),

    // Event that caused the failure (optional, for event-triggered PMs)
    eventId: v.optional(v.string()),

    // Error information
    error: v.string(),
    attemptCount: v.number(),

    // Dead letter status: pending, replayed, ignored
    status: v.union(v.literal("pending"), v.literal("replayed"), v.literal("ignored")),

    // The command that failed to emit (if applicable)
    failedCommand: v.optional(
      v.object({
        commandType: v.string(),
        payload: vUnknown(),
      })
    ),

    // Additional context for debugging
    context: v.optional(vUnknown()),

    // Timestamp
    failedAt: v.number(),
  })
    // For listing dead letters by PM
    .index("by_pm_name", ["processManagerName"])
    // For efficient lookup by PM + instance (Phase 13.2 code review fix)
    .index("by_pm_instance", ["processManagerName", "instanceId"])
    // For filtering by status
    .index("by_status", ["status"])
    // For chronological ordering
    .index("by_failed_at", ["failedAt"]),
});
