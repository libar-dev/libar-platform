/**
 * Correlation Query Demonstrations
 *
 * Provides query functions for tracing command-event relationships.
 * Useful for debugging, auditing, and understanding causality.
 *
 * Key concepts:
 * - Command-event correlation: Which events did a command produce?
 * - Context-based queries: Get all correlations for a bounded context
 * - Command tracing: Full trace including command status + events
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";

/**
 * Get events produced by a specific command.
 *
 * This is the primary correlation lookup - given a command ID,
 * return all event IDs that were produced by that command.
 *
 * @example
 * ```typescript
 * // After executing a command
 * const result = await createOrder(ctx, { orderId: "ord_123", customerId: "cust_1" });
 * const commandId = result.commandId; // or extract from result
 *
 * // Later, query the correlation
 * const correlation = await getCommandEvents(ctx, { commandId });
 * console.log(correlation.eventIds); // ["evt_abc123"]
 * ```
 */
export const getCommandEvents = query({
  args: {
    commandId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      commandId: v.string(),
      eventIds: v.array(v.string()),
      commandType: v.string(),
      boundedContext: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const correlation = await ctx.runQuery(components.commandBus.lib.getEventsByCommandId, {
      commandId: args.commandId,
    });

    return correlation;
  },
});

/**
 * Get all command correlations for a bounded context.
 *
 * Returns a list of command-event correlations for the specified bounded
 * context. Uses timestamp-based pagination via afterTimestamp.
 * Useful for auditing and monitoring.
 *
 * @example
 * ```typescript
 * // Get recent order command correlations
 * const correlations = await getContextCorrelations(ctx, {
 *   boundedContext: "orders",
 *   limit: 20,
 * });
 *
 * // For pagination, use the last correlation's timestamp
 * const nextPage = await getContextCorrelations(ctx, {
 *   boundedContext: "orders",
 *   limit: 20,
 *   afterTimestamp: correlations[correlations.length - 1]?.createdAt,
 * });
 *
 * // Each correlation shows: commandId, eventIds, commandType, createdAt
 * correlations.forEach(c => {
 *   console.log(`${c.commandType}: ${c.eventIds.length} events`);
 * });
 * ```
 */
export const getContextCorrelations = query({
  args: {
    boundedContext: v.string(),
    limit: v.optional(v.number()),
    afterTimestamp: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      commandId: v.string(),
      eventIds: v.array(v.string()),
      commandType: v.string(),
      boundedContext: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const correlations = await ctx.runQuery(components.commandBus.lib.getCorrelationsByContext, {
      boundedContext: args.boundedContext,
      limit: args.limit ?? 50,
      ...(args.afterTimestamp !== undefined ? { afterTimestamp: args.afterTimestamp } : {}),
    });

    return correlations;
  },
});

/**
 * Trace a command with full context.
 *
 * Returns comprehensive tracing information for a command including:
 * - Command status (pending, executed, rejected, failed)
 * - Correlation data (event IDs produced)
 * - Event count
 *
 * This is useful for debugging command execution and understanding
 * the full lifecycle of a command.
 *
 * @example
 * ```typescript
 * const trace = await traceCommand(ctx, { commandId: "cmd_abc123" });
 *
 * console.log(`Status: ${trace.command?.status}`);
 * console.log(`Events produced: ${trace.eventCount}`);
 * console.log(`Event IDs: ${trace.correlation?.eventIds.join(", ")}`);
 * ```
 */
export const traceCommand = query({
  args: {
    commandId: v.string(),
  },
  returns: v.object({
    commandId: v.string(),
    command: v.union(
      v.null(),
      v.object({
        commandId: v.string(),
        commandType: v.string(),
        targetContext: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("executed"),
          v.literal("rejected"),
          v.literal("failed")
        ),
        executedAt: v.optional(v.number()),
        result: v.optional(v.any()),
      })
    ),
    correlation: v.union(
      v.null(),
      v.object({
        commandId: v.string(),
        eventIds: v.array(v.string()),
        commandType: v.string(),
        boundedContext: v.string(),
        createdAt: v.number(),
      })
    ),
    eventCount: v.number(),
  }),
  handler: async (ctx, args) => {
    // Fetch command status and correlation in parallel
    const [commandStatus, correlation] = await Promise.all([
      ctx.runQuery(components.commandBus.lib.getCommandStatus, {
        commandId: args.commandId,
      }),
      ctx.runQuery(components.commandBus.lib.getEventsByCommandId, {
        commandId: args.commandId,
      }),
    ]);

    return {
      commandId: args.commandId,
      command: commandStatus,
      correlation,
      eventCount: correlation?.eventIds.length ?? 0,
    };
  },
});

/**
 * Get order command history.
 *
 * Convenience query that returns all recent command correlations
 * for the orders bounded context. Provides a quick view of order
 * command activity.
 *
 * @example
 * ```typescript
 * // Get recent order command activity
 * const history = await getOrderCommandHistory(ctx, { limit: 10 });
 *
 * history.forEach(c => {
 *   console.log(`${c.commandType} at ${new Date(c.createdAt)}`);
 * });
 * ```
 */
export const getOrderCommandHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      commandId: v.string(),
      eventIds: v.array(v.string()),
      commandType: v.string(),
      boundedContext: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return ctx.runQuery(components.commandBus.lib.getCorrelationsByContext, {
      boundedContext: "orders",
      limit: args.limit ?? 50,
    });
  },
});
