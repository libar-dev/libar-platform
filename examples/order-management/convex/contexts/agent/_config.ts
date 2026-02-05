/**
 * Churn Risk Agent Configuration
 *
 * Defines the configuration for the churn risk detection agent.
 * This agent subscribes to order-related events and detects patterns
 * that indicate a customer may be at risk of churning.
 *
 * @module contexts/agent/config
 */

import type {
  AgentBCConfig,
  AgentDecision,
  AgentExecutionContext,
} from "@libar-dev/platform-core/agent";
import { PatternTriggers } from "@libar-dev/platform-core/agent";
import type { PublishedEvent } from "@libar-dev/platform-core";

// Import shared utilities
import { extractCustomerId, calculateChurnConfidence, buildChurnReason } from "./_utils/index.js";

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Agent identifier used for checkpoints, subscriptions, and audit.
 */
export const CHURN_RISK_AGENT_ID = "churn-risk-agent" as const;

/**
 * Event types the churn risk agent subscribes to.
 */
export const CHURN_RISK_SUBSCRIPTIONS = [
  "OrderCancelled",
  // Future: "OrderRefunded", "OrderComplaintFiled"
] as const;

/**
 * Churn risk agent configuration.
 *
 * Detects customer churn risk by analyzing cancellation patterns:
 * - Window: 30 days
 * - Trigger: 3+ cancellation events
 * - Confidence threshold: 0.8 for auto-execution
 *
 * @example
 * ```typescript
 * // Use in subscription registration
 * const subscription = createAgentSubscription(churnRiskAgentConfig, {
 *   handler: internal.contexts.agent.handlers.eventHandler.handleChurnRiskEvent,
 * });
 * ```
 */
export const churnRiskAgentConfig: AgentBCConfig = {
  id: CHURN_RISK_AGENT_ID,

  subscriptions: [...CHURN_RISK_SUBSCRIPTIONS],

  patternWindow: {
    duration: "30d",
    minEvents: 3,
    eventLimit: 100,
    loadBatchSize: 50,
  },

  confidenceThreshold: 0.8,

  humanInLoop: {
    confidenceThreshold: 0.9,
    requiresApproval: ["DeleteCustomer", "RefundOrder"],
    autoApprove: ["LogChurnRisk"],
    approvalTimeout: "24h",
  },

  rateLimits: {
    maxRequestsPerMinute: 60,
    maxConcurrent: 5,
    queueDepth: 100,
    costBudget: {
      daily: 10.0,
      alertThreshold: 0.8,
    },
  },

  /**
   * Event handler that processes events and makes decisions.
   *
   * This implementation uses rule-based pattern detection (no LLM).
   * For LLM-based analysis, use ctx.agent.analyze() instead.
   */
  onEvent: async (
    event: PublishedEvent,
    ctx: AgentExecutionContext
  ): Promise<AgentDecision | null> => {
    // Extract customer ID from the stream (orders are keyed by customer)
    const customerId = extractCustomerId(event);
    if (!customerId) {
      return null;
    }

    // Filter events for this customer
    const customerEvents = ctx.history.filter((e) => extractCustomerId(e) === customerId);

    // Check if pattern trigger fires (3+ cancellations)
    const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"], 3);
    if (!trigger(customerEvents)) {
      return null;
    }

    // Calculate confidence based on event count and recency
    const confidence = calculateChurnConfidence(customerEvents);

    // Below threshold - no action needed
    if (confidence < ctx.config.confidenceThreshold) {
      return null;
    }

    // Build decision with full explainability
    return {
      command: "SuggestCustomerOutreach",
      payload: {
        customerId,
        riskLevel: confidence >= 0.9 ? "high" : "medium",
        cancellationCount: customerEvents.filter((e) => e.eventType === "OrderCancelled").length,
        windowDays: 30,
      },
      confidence,
      reason: buildChurnReason(customerEvents, confidence),
      requiresApproval: confidence < 0.9,
      triggeringEvents: customerEvents.map((e) => e.eventId),
    };
  },
};

// ============================================================================
// Re-export utilities for testing
// ============================================================================

// Helper functions are now in ./utils/
// Re-export for backwards compatibility in tests
export { extractCustomerId, calculateChurnConfidence, buildChurnReason } from "./_utils/index.js";
