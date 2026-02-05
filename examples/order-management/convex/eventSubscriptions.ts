/**
 * EventBus subscription definitions.
 *
 * This file defines event subscriptions for the pub/sub event delivery model.
 * Includes:
 * - Process Manager subscriptions (event → command flows)
 * - Audit logging subscriptions (when added)
 * - Cross-context event listeners
 *
 * NOTE: Do NOT duplicate projections that are already triggered via CommandConfig,
 * as that would cause double delivery of the same event.
 *
 * **Import patterns:**
 * - Use `internal.xxx` for project-level handlers (e.g., audit, analytics, PMs)
 * - Use `components.xxx` for calling Convex component functions from handlers
 *
 * @example Adding a subscription:
 * ```typescript
 * registry
 *   .subscribe("auditLog.onAnyEvent", internal.audit.logEvent)
 *   .forCategories("domain")
 *   .withTransform((event, chain) => ({
 *     eventId: event.eventId,
 *     eventType: event.eventType,
 *     timestamp: event.timestamp,
 *     correlationId: chain.correlationId,
 *   }))
 *   .build();
 * ```
 */
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { defineSubscriptions } from "@libar-dev/platform-core";
import {
  createPMSubscription,
  type PMEventHandlerArgs,
} from "@libar-dev/platform-core/processManager";
import {
  createAgentSubscription,
  type AgentEventHandlerArgs,
} from "@libar-dev/platform-bus/agent-subscription";
import { orderNotificationPM, reservationReleasePM, handleOrderCancelledRef } from "./processManagers";
import { churnRiskAgentConfig } from "./contexts/agent/_config.js";

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
const handleOrderConfirmedRef = makeFunctionReference<"mutation">(
  "processManagers/orderNotification:handleOrderConfirmed"
) as FunctionReference<"mutation", FunctionVisibility, PMEventHandlerArgs, unknown>;

// Agent handler references (TS2589 prevention)
const handleChurnRiskEventRef = makeFunctionReference<"mutation">(
  "contexts/agent/handlers/eventHandler:handleChurnRiskEvent"
) as FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, unknown>;

/**
 * Event subscriptions for EventBus.
 *
 * Includes Process Manager subscriptions for event-reactive coordination.
 * Projections are triggered directly via CommandConfig (not duplicated here).
 */
export const eventSubscriptions = defineSubscriptions((registry) => {
  // ============================================================================
  // PROCESS MANAGER SUBSCRIPTIONS
  // ============================================================================

  // Order Notification PM: OrderConfirmed → SendNotification
  // Priority 200 = after projections (100), before sagas (300)
  registry.add(
    createPMSubscription(orderNotificationPM, {
      handler: handleOrderConfirmedRef,
    })
  );

  // Reservation Release PM: OrderCancelled → ReleaseReservation
  // Releases reservation when a confirmed order is cancelled
  registry.add(
    createPMSubscription(reservationReleasePM, {
      handler: handleOrderCancelledRef,
    })
  );

  // ============================================================================
  // AGENT BC SUBSCRIPTIONS
  // ============================================================================

  // Churn Risk Agent: OrderCancelled → Pattern Detection → SuggestCustomerOutreach
  // Priority 250 = after projections (100) and PMs (200), before sagas (300)
  registry.add(
    createAgentSubscription(churnRiskAgentConfig, {
      handler: handleChurnRiskEventRef,
      priority: 250,
    })
  );

  // ============================================================================
  // AUDIT / ANALYTICS SUBSCRIPTIONS (Future)
  // ============================================================================
  // registry
  //   .subscribe("auditLog.onDomainEvent", internal.audit.logEvent)
  //   .forCategories("domain")
  //   .build();
});
