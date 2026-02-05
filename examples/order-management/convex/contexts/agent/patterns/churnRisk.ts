/**
 * Churn Risk Pattern Definition
 *
 * Defines the pattern detection rules for identifying customers at risk of churning.
 * Uses the PatternDefinition interface from @libar-dev/platform-core/agent.
 *
 * @module contexts/agent/patterns/churnRisk
 */

import {
  definePattern,
  PatternTriggers,
  type PatternDefinition,
  type PatternAnalysisResult,
  type PatternTrigger,
} from "@libar-dev/platform-core/agent";
import type { AgentInterface, PublishedEvent } from "@libar-dev/platform-core";

// ============================================================================
// Pattern Constants
// ============================================================================

/**
 * Pattern name for churn risk detection.
 */
export const CHURN_RISK_PATTERN_NAME = "churn-risk" as const;

/**
 * Minimum cancellations required to trigger pattern detection.
 */
export const MIN_CANCELLATIONS = 3;

/**
 * Pattern window duration for churn risk detection.
 */
export const CHURN_RISK_WINDOW_DURATION = "30d" as const;

// ============================================================================
// Custom Triggers
// ============================================================================

/**
 * Trigger for detecting repeated cancellations from the same customer.
 *
 * This trigger groups events by customer and checks if any customer
 * has cancelled 3 or more orders within the pattern window.
 *
 * @param minCancellations - Minimum cancellations to trigger
 * @returns Pattern trigger function
 */
export function createCustomerCancellationTrigger(
  minCancellations: number
): PatternTrigger {
  return (events: readonly PublishedEvent[]): boolean => {
    // Group cancellations by customer
    const cancellationsByCustomer = new Map<string, number>();

    for (const event of events) {
      if (event.eventType !== "OrderCancelled") {
        continue;
      }

      const customerId = extractCustomerIdFromEvent(event);
      if (customerId) {
        const current = cancellationsByCustomer.get(customerId) ?? 0;
        cancellationsByCustomer.set(customerId, current + 1);
      }
    }

    // Check if any customer exceeds threshold
    for (const count of cancellationsByCustomer.values()) {
      if (count >= minCancellations) {
        return true;
      }
    }

    return false;
  };
}

// ============================================================================
// Pattern Definition
// ============================================================================

/**
 * Churn risk pattern definition.
 *
 * Detects customers at risk of churning based on cancellation patterns:
 * - Trigger: 3+ cancellations from the same customer
 * - Window: 30 days
 * - Analysis: Optional LLM-based deep analysis
 *
 * @example
 * ```typescript
 * import { churnRiskPattern } from "./patterns/churnRisk";
 *
 * // Check if pattern should trigger
 * if (churnRiskPattern.trigger(events)) {
 *   // Run analysis
 *   const result = await churnRiskPattern.analyze?.(events, agent);
 * }
 * ```
 */
export const churnRiskPattern: PatternDefinition = definePattern({
  name: CHURN_RISK_PATTERN_NAME,

  description:
    "Detect customers at risk of churning based on repeated order cancellations",

  window: {
    duration: CHURN_RISK_WINDOW_DURATION,
    minEvents: MIN_CANCELLATIONS,
    eventLimit: 100,
    loadBatchSize: 50,
  },

  // Use compound trigger: basic count threshold AND customer-specific check
  trigger: PatternTriggers.all(
    PatternTriggers.eventTypePresent(["OrderCancelled"], MIN_CANCELLATIONS),
    createCustomerCancellationTrigger(MIN_CANCELLATIONS)
  ),

  /**
   * Optional LLM-based analysis for deeper pattern detection.
   *
   * This analyzer uses the agent's LLM capabilities to:
   * 1. Analyze cancellation reasons for common themes
   * 2. Detect sentiment patterns in cancellation reasons
   * 3. Identify temporal patterns (e.g., weekend cancellations)
   *
   * For rule-only agents, this analyzer can be omitted.
   */
  analyze: async (
    events: readonly PublishedEvent[],
    agent: AgentInterface
  ): Promise<PatternAnalysisResult> => {
    // Filter to cancellation events only
    const cancellations = events.filter((e) => e.eventType === "OrderCancelled");

    if (cancellations.length < MIN_CANCELLATIONS) {
      return {
        detected: false,
        confidence: 0,
        reasoning: "Insufficient cancellation events for analysis",
        matchingEventIds: [],
      };
    }

    // Build analysis prompt
    const prompt = buildAnalysisPrompt(cancellations);

    try {
      // Use agent's LLM analysis capability
      const result = await agent.analyze(prompt, cancellations);

      return {
        detected: result.confidence >= 0.7,
        confidence: result.confidence,
        reasoning: result.reasoning,
        matchingEventIds: cancellations.map((e) => e.eventId),
        data: {
          patternsFound: result.patterns,
          suggestedAction: result.suggestedAction,
        },
      };
    } catch {
      // Fallback to rule-based analysis if LLM fails
      return createRuleBasedAnalysis(cancellations);
    }
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract customer ID from an event.
 *
 * @param event - Published event
 * @returns Customer ID or null
 */
function extractCustomerIdFromEvent(event: PublishedEvent): string | null {
  const payload = event.payload as Record<string, unknown>;

  if (typeof payload["customerId"] === "string") {
    return payload["customerId"];
  }

  // Extract from orderId pattern
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
 * Build the LLM analysis prompt for churn risk detection.
 *
 * @param cancellations - Cancellation events to analyze
 * @returns Analysis prompt
 */
function buildAnalysisPrompt(cancellations: readonly PublishedEvent[]): string {
  const reasons = cancellations
    .map((e) => {
      const payload = e.payload as Record<string, unknown>;
      return typeof payload["reason"] === "string" ? payload["reason"] : "No reason provided";
    })
    .join("\n- ");

  return `Analyze these order cancellation events for churn risk patterns:

Cancellation Reasons:
- ${reasons}

Consider:
1. Are there common themes in the cancellation reasons?
2. Do the timestamps suggest a pattern (e.g., repeated issues)?
3. What is the overall churn risk level (low/medium/high)?

Provide a confidence score (0-1) and brief reasoning.`;
}

/**
 * Create a rule-based analysis result when LLM is unavailable.
 *
 * @param cancellations - Cancellation events
 * @returns Pattern analysis result
 */
function createRuleBasedAnalysis(
  cancellations: readonly PublishedEvent[]
): PatternAnalysisResult {
  const count = cancellations.length;
  const confidence = Math.min(0.85, 0.5 + count * 0.1);

  // Check for recency boost
  const recentThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = cancellations.filter(
    (e) => e.timestamp >= recentThreshold
  ).length;

  const adjustedConfidence = recentCount >= 2
    ? Math.min(1, confidence + 0.1)
    : confidence;

  return {
    detected: true,
    confidence: Math.round(adjustedConfidence * 100) / 100,
    reasoning: `Rule-based analysis: ${count} cancellations detected (${recentCount} recent). Using fallback confidence calculation.`,
    matchingEventIds: cancellations.map((e) => e.eventId),
    data: {
      analysisType: "rule-based",
      cancellationCount: count,
      recentCount,
    },
  };
}

// ============================================================================
// Additional Pattern Definitions
// ============================================================================

/**
 * High-value customer churn pattern.
 *
 * Variant that specifically targets high-value customers with lower thresholds.
 * Requires only 2 cancellations but filters for customers with high order values.
 */
export const highValueChurnPattern: PatternDefinition = definePattern({
  name: "high-value-churn-risk",

  description:
    "Detect high-value customers at risk based on cancellation patterns",

  window: {
    duration: "14d", // Shorter window for faster detection
    minEvents: 2, // Lower threshold for high-value customers
    eventLimit: 50,
  },

  trigger: PatternTriggers.all(
    PatternTriggers.eventTypePresent(["OrderCancelled"], 2),
    createCustomerCancellationTrigger(2)
  ),

  // No LLM analysis for this variant - rule-only
});

// ============================================================================
// Exports
// ============================================================================

export const __testing = {
  extractCustomerIdFromEvent,
  buildAnalysisPrompt,
  createRuleBasedAnalysis,
  createCustomerCancellationTrigger,
};
