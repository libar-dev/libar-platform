import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * Commands table - stores commands for idempotency and audit trail.
   *
   * Commands are tracked by commandId to prevent duplicate execution.
   */
  commands: defineTable({
    // Command identity
    commandId: v.string(),
    commandType: v.string(),
    targetContext: v.string(),

    /**
     * Command payload - intentionally untyped at storage layer.
     * Each bounded context defines its own command schemas with Zod validation.
     * The Command Bus acts as a generic message store, not a typed repository.
     */
    payload: v.any(),

    // Metadata
    metadata: v.object({
      userId: v.optional(v.string()),
      correlationId: v.string(),
      timestamp: v.number(),
    }),

    // Status tracking
    status: v.union(
      v.literal("pending"),
      v.literal("executed"),
      v.literal("rejected"),
      v.literal("failed")
    ),

    /**
     * Command result - intentionally untyped.
     * Result structure varies by command type and execution outcome.
     * May contain success data, error details, or rejection context.
     */
    result: v.optional(v.any()),

    // Timing
    executedAt: v.optional(v.number()),

    // TTL for cleanup (milliseconds since creation)
    ttl: v.number(),

    // Pre-computed expiration timestamp for efficient cleanup queries
    // Computed at insert time: metadata.timestamp + ttl
    expiresAt: v.number(),
  })
    // For idempotency lookup
    .index("by_commandId", ["commandId"])
    // For correlation tracing
    .index("by_correlationId", ["metadata.correlationId"])
    // For status queries
    .index("by_status", ["status", "metadata.timestamp"])
    // For context-specific queries
    .index("by_context", ["targetContext", "metadata.timestamp"])
    // For efficient expired command cleanup
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Command-Event Correlations table - tracks which events a command produced.
   *
   * This enables:
   * - Looking up events produced by a specific command (indexed via by_commandId)
   * - Full audit trail reconstruction
   *
   * Note: Reverse lookup (event → command) requires scanning since eventIds is an array.
   * For efficient reverse lookup, consider a separate event-to-command mapping table.
   */
  commandEventCorrelations: defineTable({
    /** The command ID that produced the event(s) */
    commandId: v.string(),

    /** The event IDs produced by this command */
    eventIds: v.array(v.string()),

    /** Command type for filtering/analytics */
    commandType: v.string(),

    /** Bounded context for filtering */
    boundedContext: v.string(),

    /** When the correlation was recorded */
    createdAt: v.number(),

    /** TTL for cleanup (milliseconds since creation) */
    ttl: v.number(),

    /** Pre-computed expiration timestamp: createdAt + ttl */
    expiresAt: v.number(),
  })
    // For forward lookup: command → events
    .index("by_commandId", ["commandId"])
    // For context-specific queries
    .index("by_context", ["boundedContext", "createdAt"])
    // For efficient expired correlation cleanup
    .index("by_expiresAt", ["expiresAt"]),
});
