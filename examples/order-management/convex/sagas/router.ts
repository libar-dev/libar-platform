/**
 * Event routing for saga triggering.
 *
 * Routes domain events to appropriate saga workflows.
 * Called after event append to determine if a saga should be started.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { createScopedLogger } from "@libar-dev/platform-core";
import { PLATFORM_LOG_LEVEL } from "../infrastructure";

// =============================================================================
// Internal Function References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 errors when accessing internal paths.
// =============================================================================
const startSagaIfNotExistsMutation = makeFunctionReference<"mutation">(
  "sagas/registry:startSagaIfNotExists"
) as FunctionReference<"mutation", FunctionVisibility>;

/**
 * Logger for saga routing operations.
 */
const logger = createScopedLogger("Saga:Router", PLATFORM_LOG_LEVEL);

/**
 * Extract a required string field from an event payload.
 * Throws an error if the field is missing or not a string.
 */
function extractRequiredField(payload: Record<string, unknown>, fieldName: string): string {
  const value = payload[fieldName];
  if (typeof value !== "string" || !value) {
    throw new Error(`Event payload missing required ${fieldName} field`);
  }
  return value;
}

/**
 * Event routing configuration.
 * Maps event types to saga configurations.
 */
const eventRoutes: Record<
  string,
  {
    sagaType: string;
    getSagaId: (payload: Record<string, unknown>) => string;
  }
> = {
  OrderSubmitted: {
    sagaType: "OrderFulfillment",
    getSagaId: (payload) => extractRequiredField(payload, "orderId"),
  },
};

/**
 * Route event result type.
 */
type RouteEventResult =
  | { status: "no_route" }
  | { status: "exists"; sagaStatus: string; workflowId: string }
  | { status: "created"; workflowId: string }
  | { status: "error"; error: string };

/**
 * Route an event to the appropriate saga.
 *
 * Called after event append to trigger saga workflows.
 * Idempotency is handled by the saga registry.
 */
export const routeEvent = internalMutation({
  args: {
    eventType: v.string(),
    eventId: v.string(),
    streamId: v.string(),
    globalPosition: v.number(),
    /**
     * Event payload - intentionally uses v.any() for flexibility.
     * Validated by saga-specific Zod schema at runtime.
     */
    payload: v.record(v.string(), v.any()),
    /** Correlation ID for deriving correlation chains in saga commands */
    correlationId: v.string(),
  },
  handler: async (ctx, args): Promise<RouteEventResult> => {
    const route = eventRoutes[args.eventType];

    if (!route) {
      // No saga configured for this event type
      logger.debug("No saga route configured", {
        eventType: args.eventType,
        eventId: args.eventId,
        correlationId: args.correlationId,
      });
      return { status: "no_route" };
    }

    const sagaId = route.getSagaId(args.payload as Record<string, unknown>);

    logger.debug("Saga ID resolved", {
      sagaType: route.sagaType,
      sagaId,
      eventType: args.eventType,
      eventId: args.eventId,
      correlationId: args.correlationId,
    });

    // Delegate to registry for idempotent saga start
    // Wrapped in try-catch to prevent saga routing failures from interrupting event append
    try {
      const result = await ctx.runMutation(startSagaIfNotExistsMutation, {
        sagaType: route.sagaType,
        sagaId,
        triggerEventId: args.eventId,
        triggerGlobalPosition: args.globalPosition,
        eventPayload: args.payload,
        correlationId: args.correlationId,
      });

      if (result.status === "created") {
        logger.info("Saga started", {
          sagaType: route.sagaType,
          sagaId,
          workflowId: result.workflowId,
          eventType: args.eventType,
          correlationId: args.correlationId,
        });
      } else if (result.status === "exists") {
        logger.debug("Saga already exists", {
          sagaType: route.sagaType,
          sagaId,
          sagaStatus: result.sagaStatus,
          workflowId: result.workflowId,
          correlationId: args.correlationId,
        });
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Saga routing failed", {
        sagaType: route.sagaType,
        sagaId,
        eventType: args.eventType,
        eventId: args.eventId,
        error: errorMessage,
        correlationId: args.correlationId,
      });
      return { status: "error", error: errorMessage };
    }
  },
});
