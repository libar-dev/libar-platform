/**
 * Confidence Calculation Utilities for Agent BC
 *
 * Shared utilities for calculating churn risk confidence scores.
 *
 * @module contexts/agent/utils/confidence
 */

import type { PublishedEvent } from "@libar-dev/platform-core";

/**
 * Days in milliseconds for recency calculations.
 */
const DAYS_MS = 24 * 60 * 60 * 1000;

/**
 * Recency threshold in milliseconds (7 days).
 */
const RECENT_THRESHOLD_MS = 7 * DAYS_MS;

/**
 * Calculate churn confidence based on event patterns.
 *
 * Factors:
 * - Number of cancellations (more = higher risk)
 * - Recency of cancellations (recent = higher risk)
 * - Frequency (clustered = higher risk)
 *
 * @param events - Customer events within the window
 * @param options - Optional configuration
 * @returns Confidence score between 0 and 1
 *
 * @example
 * ```typescript
 * const cancellations = events.filter(e => e.eventType === "OrderCancelled");
 * const confidence = calculateChurnConfidence(cancellations);
 * ```
 */
export function calculateChurnConfidence(
  events: readonly PublishedEvent[],
  options?: {
    /** Minimum cancellations for non-zero confidence */
    minCancellations?: number;
    /** Base confidence value */
    baseConfidence?: number;
    /** Confidence increment per cancellation */
    incrementPerCancellation?: number;
    /** Maximum base confidence */
    maxBaseConfidence?: number;
    /** Recency boost (added if recent events threshold met) */
    recencyBoost?: number;
    /** Minimum recent events to trigger boost */
    minRecentEvents?: number;
    /** Recency threshold in days */
    recencyDays?: number;
  }
): number {
  const {
    minCancellations = 3,
    baseConfidence = 0.5,
    incrementPerCancellation = 0.1,
    maxBaseConfidence = 0.85,
    recencyBoost = 0.1,
    minRecentEvents = 2,
    recencyDays = 7,
  } = options ?? {};

  const cancellations = events.filter((e) => e.eventType === "OrderCancelled");
  const count = cancellations.length;

  if (count < minCancellations) {
    return 0;
  }

  // Base confidence from count
  let confidence = Math.min(maxBaseConfidence, baseConfidence + count * incrementPerCancellation);

  // Boost for recency
  const recentThreshold = Date.now() - recencyDays * DAYS_MS;
  const recentCount = cancellations.filter((e) => e.timestamp >= recentThreshold).length;

  if (recentCount >= minRecentEvents) {
    confidence = Math.min(1, confidence + recencyBoost);
  }

  return Math.round(confidence * 100) / 100;
}

/**
 * Count recent events within a time window.
 *
 * @param events - Events to count
 * @param thresholdMs - Time threshold in milliseconds (default: 7 days)
 * @returns Number of events within threshold
 */
export function countRecentEvents(
  events: readonly PublishedEvent[],
  thresholdMs: number = RECENT_THRESHOLD_MS
): number {
  const threshold = Date.now() - thresholdMs;
  return events.filter((e) => e.timestamp >= threshold).length;
}

/**
 * Build a human-readable reason for a churn risk decision.
 *
 * @param events - Customer events within the window
 * @param confidence - Calculated confidence score
 * @returns Human-readable explanation
 *
 * @example
 * ```typescript
 * const reason = buildChurnReason(cancellations, confidence);
 * // "Customer has 4 cancellations in 30 days (3 recent). Confidence: 0.85"
 * ```
 */
export function buildChurnReason(events: readonly PublishedEvent[], confidence: number): string {
  const cancellations = events.filter((e) => e.eventType === "OrderCancelled");
  const count = cancellations.length;

  const recentCount = countRecentEvents(cancellations);

  const parts = [`Customer has ${count} cancellation${count !== 1 ? "s" : ""} in 30 days`];

  if (recentCount > 0) {
    parts[0] += ` (${recentCount} recent)`;
  }

  parts.push(`Confidence: ${confidence}`);

  return parts.join(". ");
}
