/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer application
 *
 * Churn Risk Agent Configuration
 *
 * Defines the configuration for the churn risk detection agent.
 * This agent subscribes to order-related events and detects patterns
 * that indicate a customer may be at risk of churning.
 *
 * @module contexts/agent/config
 */

import type { AgentBCConfig } from "@libar-dev/platform-core/agent";
import { churnRiskPattern, highValueChurnPattern } from "./_patterns/churnRisk.js";

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

  patterns: [churnRiskPattern, highValueChurnPattern],
};

// ============================================================================
// Re-export utilities for testing
// ============================================================================

// Helper functions are now in ./utils/
// Re-export for backwards compatibility in tests
export { extractCustomerId, calculateChurnConfidence, buildChurnReason } from "./_utils/index.js";
