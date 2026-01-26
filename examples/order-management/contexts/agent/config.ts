/**
 * Agent BC Configuration (Stub)
 *
 * PLANNING ARTIFACT: Example configuration for Phase 22 Agent as Bounded Context.
 * This file demonstrates how to configure an agent BC with subscriptions,
 * pattern windows, and human-in-loop settings.
 *
 * When implementing:
 * 1. Import real createAgentBC from @libar-dev/platform-core
 * 2. Define actual event subscriptions
 * 3. Configure LLM integration (@convex-dev/agent)
 */

// =============================================================================
// Types (Stub)
// =============================================================================

export interface AgentBCConfig {
  /** Agent BC identifier */
  id: string;

  /** Event types to subscribe to */
  subscriptions: string[];

  /** Pattern detection window configuration */
  patternWindow: {
    /** Time window duration (e.g., '7d', '30d') */
    duration: string;
    /** Maximum events to consider */
    eventLimit: number;
  };

  /** Minimum confidence for auto-execution */
  confidenceThreshold: number;

  /** Human-in-loop configuration */
  humanInLoop: {
    /** Actions that always require approval */
    requiresApproval: string[];
    /** Actions that always auto-execute */
    autoApprove: string[];
    /** Approval timeout */
    approvalTimeout: string;
  };
}

// =============================================================================
// Configuration (Stub)
// =============================================================================

/**
 * Churn Detection Agent Configuration
 *
 * This agent monitors order patterns to detect potential customer churn
 * and suggests proactive outreach.
 */
export const churnDetectorConfig: AgentBCConfig = {
  id: "churn-detector",

  subscriptions: ["OrderSubmitted", "OrderCancelled", "OrderRefunded", "PaymentFailed"],

  patternWindow: {
    duration: "30d",
    eventLimit: 100,
  },

  confidenceThreshold: 0.8,

  humanInLoop: {
    requiresApproval: [
      "OfferDiscount", // Requires approval for financial impact
      "EscalateToManager", // Requires approval for escalation
    ],
    autoApprove: [
      "SuggestCustomerOutreach", // Safe to auto-execute
      "NotifyTeam", // Safe to auto-execute
    ],
    approvalTimeout: "24h",
  },
};

/**
 * Fraud Detection Agent Configuration
 *
 * This agent monitors order patterns to detect potential fraud
 * and flags suspicious activity.
 */
export const fraudDetectorConfig: AgentBCConfig = {
  id: "fraud-detector",

  subscriptions: ["OrderSubmitted", "PaymentReceived", "PaymentFailed", "ShippingAddressChanged"],

  patternWindow: {
    duration: "24h",
    eventLimit: 50,
  },

  confidenceThreshold: 0.9, // Higher threshold for fraud detection

  humanInLoop: {
    requiresApproval: [
      "BlockAccount", // Always requires approval
      "FlagForInvestigation",
    ],
    autoApprove: [
      "NotifySecurityTeam", // Safe to auto-notify
    ],
    approvalTimeout: "1h", // Shorter timeout for fraud alerts
  },
};

// =============================================================================
// Factory (Stub)
// =============================================================================

/**
 * Create an Agent BC instance from configuration.
 *
 * @param config - Agent BC configuration
 * @returns Agent BC instance (not implemented)
 *
 * When implementing:
 * - Import createAgentBC from @libar-dev/platform-core
 * - Configure EventBus subscriptions
 * - Initialize pattern detection with LLM
 * - Set up audit trail recording
 */
export function createAgentBCFromConfig(_config: AgentBCConfig): unknown {
  throw new Error(
    "Not implemented: createAgentBCFromConfig. " +
      "This is a planning stub for Phase 22 Agent as Bounded Context."
  );
}
