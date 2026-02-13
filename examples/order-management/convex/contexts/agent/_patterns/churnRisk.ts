/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role decider
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer domain
 *
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

// Import shared utilities
import { groupEventsByCustomer } from "../_utils/customer.js";
import { countRecentEvents } from "../_utils/confidence.js";

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

/** Minimum confidence for pattern detection (separate from auto-execution threshold in config) */
export const CHURN_RISK_DETECTION_THRESHOLD = 0.7;

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
export function createCustomerCancellationTrigger(minCancellations: number): PatternTrigger {
  return (events: readonly PublishedEvent[]): boolean => {
    // Filter to cancellations and group by customer using shared utility
    const cancellations = events.filter((e) => e.eventType === "OrderCancelled");
    const grouped = groupEventsByCustomer(cancellations);

    // Check if any customer exceeds threshold
    for (const customerEvents of grouped.values()) {
      if (customerEvents.length >= minCancellations) {
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

  description: "Detect customers at risk of churning based on repeated order cancellations",

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
      const customerId = extractCustomerIdFromEvents(cancellations);

      return {
        detected: result.confidence >= CHURN_RISK_DETECTION_THRESHOLD,
        confidence: result.confidence,
        reasoning: result.reasoning,
        matchingEventIds: cancellations.map((e) => e.eventId),
        data: {
          patternsFound: result.patterns,
        },
        // Command suggestion for routing via command bridge
        ...(result.confidence >= CHURN_RISK_DETECTION_THRESHOLD && customerId !== null
          ? {
              command: {
                type: "SuggestCustomerOutreach",
                payload: {
                  customerId,
                  riskLevel: result.confidence >= 0.9 ? "high" : "medium",
                  cancellationCount: cancellations.length,
                  windowDays: 30,
                },
              },
            }
          : {}),
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

// extractCustomerId is now imported from ../utils/customer.js

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
 * Uses shared confidence calculation from ../utils/confidence.js
 *
 * @param cancellations - Cancellation events
 * @returns Pattern analysis result
 */
function createRuleBasedAnalysis(cancellations: readonly PublishedEvent[]): PatternAnalysisResult {
  const count = cancellations.length;
  const confidence = Math.min(0.85, 0.5 + count * 0.1);

  // Use shared utility for recent count
  const recentCount = countRecentEvents(cancellations);

  const adjustedConfidence = recentCount >= 2 ? Math.min(1, confidence + 0.1) : confidence;
  const customerId = extractCustomerIdFromEvents(cancellations);

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
    // Command suggestion for routing via command bridge (only when customerId is known)
    ...(customerId !== null
      ? {
          command: {
            type: "SuggestCustomerOutreach",
            payload: {
              customerId,
              riskLevel: adjustedConfidence >= 0.9 ? "high" : "medium",
              cancellationCount: count,
              windowDays: 30,
            },
          },
        }
      : {}),
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

  description: "Detect high-value customers at risk based on cancellation patterns",

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
// Internal Helpers
// ============================================================================

/**
 * Extract the customerId with the most events meeting the cancellation threshold.
 *
 * Groups events by customer and selects the customer with the highest count,
 * only returning a customerId if that count meets MIN_CANCELLATIONS.
 */
function extractCustomerIdFromEvents(events: readonly PublishedEvent[]): string | null {
  const grouped = groupEventsByCustomer(events);
  let bestCustomerId: string | null = null;
  let maxCount = 0;
  for (const [customerId, customerEvents] of grouped.entries()) {
    if (customerEvents.length > maxCount) {
      maxCount = customerEvents.length;
      bestCustomerId = customerId;
    }
  }
  return maxCount >= MIN_CANCELLATIONS ? bestCustomerId : null;
}

// ============================================================================
// Exports
// ============================================================================

export const __testing = {
  buildAnalysisPrompt,
  createRuleBasedAnalysis,
};
