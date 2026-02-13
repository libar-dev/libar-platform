/**
 * @libar-docs
 * @libar-docs-pattern EventSubscriptionRegistry
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-layer infrastructure
 * @libar-docs-uses OrderNotificationPM, ReservationReleasePM, AgentAsBoundedContext, AgentLLMIntegration
 * @libar-docs-used-by OrderManagementInfrastructure
 *
 * EventBus pub/sub subscription definitions.
 * PM subscriptions (priority 200) + Agent subscriptions (priority 250).
 * NOTE: Projections via CommandConfig are NOT duplicated here.
 */
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { defineSubscriptions, type WorkpoolOnCompleteArgs } from "@libar-dev/platform-core";
import {
  createPMSubscription,
  type PMEventHandlerArgs,
} from "@libar-dev/platform-core/processManager";
import {
  createAgentSubscription,
  type AgentEventHandlerArgs,
} from "@libar-dev/platform-bus/agent-subscription";
import {
  orderNotificationPM,
  reservationReleasePM,
  handleOrderCancelledRef,
} from "./processManagers";
import { churnRiskAgentConfig } from "./contexts/agent/_config.js";

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
const handleOrderConfirmedRef = makeFunctionReference<"mutation">(
  "processManagers/orderNotification:handleOrderConfirmed"
) as FunctionReference<"mutation", FunctionVisibility, PMEventHandlerArgs, unknown>;

// Agent action handler reference (TS2589 prevention)
// This is the ACTION half — runs in Workpool, can call LLM APIs
const analyzeChurnRiskEventRef = makeFunctionReference<"action">(
  "contexts/agent/handlers/analyzeEvent:analyzeChurnRiskEvent"
) as FunctionReference<"action", FunctionVisibility, AgentEventHandlerArgs, unknown>;

// Agent onComplete handler reference (TS2589 prevention)
// This is the MUTATION half — persists audit, command, approval, checkpoint
const handleChurnRiskOnCompleteRef = makeFunctionReference<"mutation">(
  "contexts/agent/handlers/onComplete:handleChurnRiskOnComplete"
) as FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

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
  // Uses action/mutation split: action for LLM calls, onComplete for persistence
  registry.add(
    createAgentSubscription(churnRiskAgentConfig, {
      actionHandler: analyzeChurnRiskEventRef,
      onComplete: handleChurnRiskOnCompleteRef,
      retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
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
