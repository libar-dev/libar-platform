/**
 * Agent Pattern Definitions (Stub)
 *
 * PLANNING ARTIFACT: Example pattern definitions for Phase 22 Agent as Bounded Context.
 * Patterns define what event sequences the agent looks for and how to analyze them.
 *
 * When implementing:
 * 1. Import definePattern from @libar-dev/platform-core
 * 2. Implement actual trigger logic
 * 3. Configure LLM analysis prompts
 */

// =============================================================================
// Types (Stub)
// =============================================================================

export interface PatternDefinition {
  /** Pattern name (e.g., 'ChurnRisk') */
  name: string;

  /** Pattern description */
  description: string;

  /** Window constraints for event collection */
  window: {
    /** Time window duration */
    duration: string;
    /** Minimum events required */
    minEvents: number;
  };

  /**
   * Rule-based trigger function.
   * Returns true if pattern criteria are met.
   */
  trigger: (events: PatternEvent[]) => boolean;

  /**
   * LLM analysis prompt for deeper insight.
   * Used when trigger returns true.
   */
  analysisPrompt: string;

  /** Suggested action when pattern is detected */
  suggestedAction: string;
}

export interface PatternEvent {
  type: string;
  streamId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// Pattern Definitions (Stub)
// =============================================================================

/**
 * Churn Risk Pattern
 *
 * Detects customers at risk of churning based on:
 * - Multiple order cancellations
 * - Declining order frequency
 * - Payment failures
 */
export const churnRiskPattern: PatternDefinition = {
  name: "ChurnRisk",
  description: "Customer shows signs of potential churn",

  window: {
    duration: "30d",
    minEvents: 3,
  },

  trigger: (events: PatternEvent[]) => {
    const cancellations = events.filter((e) => e.type === "OrderCancelled");
    const refunds = events.filter((e) => e.type === "OrderRefunded");
    return cancellations.length >= 3 || refunds.length >= 2;
  },

  analysisPrompt: `Analyze the following customer events for churn risk.
Consider:
- Frequency and recency of cancellations
- Reasons provided for cancellations
- Historical order patterns
- Customer segment value

Provide:
1. Churn risk assessment (0-1 confidence)
2. Key contributing factors
3. Recommended outreach strategy`,

  suggestedAction: "SuggestCustomerOutreach",
};

/**
 * Fraud Risk Pattern
 *
 * Detects suspicious activity based on:
 * - Unusual order frequency
 * - Multiple shipping address changes
 * - Payment failures followed by different payment methods
 */
export const fraudRiskPattern: PatternDefinition = {
  name: "FraudRisk",
  description: "Activity shows signs of potential fraud",

  window: {
    duration: "24h",
    minEvents: 5,
  },

  trigger: (events: PatternEvent[]) => {
    const orders = events.filter((e) => e.type === "OrderSubmitted");
    const addressChanges = events.filter((e) => e.type === "ShippingAddressChanged");

    // Unusual order frequency (> 10 in 24h)
    if (orders.length > 10) return true;

    // Multiple address changes
    if (addressChanges.length >= 3) return true;

    return false;
  },

  analysisPrompt: `Analyze the following events for fraud indicators.
Consider:
- Order velocity compared to customer history
- Geographic patterns in shipping addresses
- Payment method changes
- IP address patterns (if available)

Provide:
1. Fraud risk assessment (0-1 confidence)
2. Specific suspicious indicators
3. Recommended action (flag/block/investigate)`,

  suggestedAction: "FlagForInvestigation",
};

/**
 * Inventory Alert Pattern
 *
 * Detects when inventory action is needed based on:
 * - Low stock events
 * - High demand (many orders for same product)
 */
export const inventoryAlertPattern: PatternDefinition = {
  name: "InventoryAlert",
  description: "Product may need restocking",

  window: {
    duration: "7d",
    minEvents: 10,
  },

  trigger: (events: PatternEvent[]) => {
    // Group orders by product
    const productOrders = new Map<string, number>();
    events
      .filter((e) => e.type === "OrderSubmitted")
      .forEach((e) => {
        const items = (e.payload.items as Array<{ productId: string }>) || [];
        items.forEach((item) => {
          const count = productOrders.get(item.productId) || 0;
          productOrders.set(item.productId, count + 1);
        });
      });

    // High demand: > 20 orders for same product in a week
    for (const count of productOrders.values()) {
      if (count > 20) return true;
    }

    return false;
  },

  analysisPrompt: `Analyze the following order events for inventory implications.
Consider:
- Current stock levels (if available)
- Historical sales velocity
- Seasonal patterns
- Lead time for restocking

Provide:
1. Products needing attention
2. Urgency level (low/medium/high)
3. Recommended reorder quantity`,

  suggestedAction: "SuggestReorder",
};

// =============================================================================
// Pattern Registry (Stub)
// =============================================================================

/**
 * All registered patterns for the churn detector agent.
 */
export const churnDetectorPatterns: PatternDefinition[] = [churnRiskPattern];

/**
 * All registered patterns for the fraud detector agent.
 */
export const fraudDetectorPatterns: PatternDefinition[] = [fraudRiskPattern];

/**
 * All registered patterns for inventory monitoring.
 */
export const inventoryPatterns: PatternDefinition[] = [inventoryAlertPattern];
