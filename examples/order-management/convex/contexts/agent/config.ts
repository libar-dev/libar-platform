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
    const customerEvents = ctx.history.filter(
      (e) => extractCustomerId(e) === customerId
    );

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
        cancellationCount: customerEvents.filter(
          (e) => e.eventType === "OrderCancelled"
        ).length,
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
// Helper Functions
// ============================================================================

/**
 * Extract customer ID from an event payload.
 *
 * @param event - Published event
 * @returns Customer ID or null if not found
 */
function extractCustomerId(event: PublishedEvent): string | null {
  const payload = event.payload as Record<string, unknown>;

  // OrderCancelled has orderId in payload, customerId might be in metadata
  // For this demo, we use the streamId which typically includes the customer
  if (typeof payload["customerId"] === "string") {
    return payload["customerId"];
  }

  // Fall back to extracting from orderId pattern (e.g., "cust_123_ord_456")
  const orderId = payload["orderId"];
  if (typeof orderId === "string" && orderId.includes("_")) {
    const parts = orderId.split("_");
    if (parts[0] === "cust" && parts[1]) {
      return `cust_${parts[1]}`;
    }
  }

  return null;
}

/**
 * Calculate churn confidence based on event patterns.
 *
 * Factors:
 * - Number of cancellations (more = higher risk)
 * - Recency of cancellations (recent = higher risk)
 * - Frequency (clustered = higher risk)
 *
 * @param events - Customer events within the window
 * @returns Confidence score between 0 and 1
 */
function calculateChurnConfidence(events: readonly PublishedEvent[]): number {
  const cancellations = events.filter((e) => e.eventType === "OrderCancelled");
  const count = cancellations.length;

  if (count < 3) {
    return 0;
  }

  // Base confidence from count (3=0.6, 4=0.7, 5=0.8, 6+=0.85)
  let confidence = Math.min(0.85, 0.5 + count * 0.1);

  // Boost for recency (events in last 7 days)
  const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = cancellations.filter(
    (e) => e.timestamp >= recentThreshold
  ).length;
  if (recentCount >= 2) {
    confidence = Math.min(1, confidence + 0.1);
  }

  return Math.round(confidence * 100) / 100;
}

/**
 * Build a human-readable reason for the churn risk decision.
 *
 * @param events - Customer events within the window
 * @param confidence - Calculated confidence score
 * @returns Human-readable explanation
 */
function buildChurnReason(
  events: readonly PublishedEvent[],
  confidence: number
): string {
  const cancellations = events.filter((e) => e.eventType === "OrderCancelled");
  const count = cancellations.length;

  const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = cancellations.filter(
    (e) => e.timestamp >= recentThreshold
  ).length;

  const parts = [
    `Customer has ${count} order cancellations in the last 30 days`,
  ];

  if (recentCount > 0) {
    parts.push(`with ${recentCount} in the last 7 days`);
  }

  parts.push(
    `indicating ${confidence >= 0.9 ? "high" : "medium"} churn risk (confidence: ${(confidence * 100).toFixed(0)}%)`
  );

  return parts.join(", ") + ".";
}

// ============================================================================
// Exports for Testing
// ============================================================================

export const __testing = {
  extractCustomerId,
  calculateChurnConfidence,
  buildChurnReason,
};
