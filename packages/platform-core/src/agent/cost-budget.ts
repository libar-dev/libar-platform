/**
 * Agent Cost Budget — Daily Spend Tracking and Enforcement
 *
 * Provides pure functions for checking LLM cost budgets and
 * estimating call costs. Reuses wouldExceedBudget and isAtAlertThreshold
 * from rate-limit.ts for budget checking logic.
 *
 * All functions are pure (no side effects) — the actual spend tracking
 * and persistence is handled at the app level.
 *
 * @module agent/cost-budget
 */

import { wouldExceedBudget, isAtAlertThreshold } from "./rate-limit.js";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Cost budget configuration for an agent.
 */
export interface CostBudgetConfig {
  /** Daily budget in USD */
  readonly dailyBudget: number;
  /** Alert threshold as percentage (0-1) */
  readonly alertThreshold: number;
}

/**
 * Tracks current spend against a budget.
 */
export interface CostTracker {
  /** Current daily spend in USD */
  readonly currentSpend: number;
  /** Budget configuration */
  readonly budget: CostBudgetConfig;
}

// ============================================================================
// Budget Check Result
// ============================================================================

/**
 * Result of a budget check.
 *
 * Either the operation is allowed (with remaining budget info),
 * or it is denied because the budget would be exceeded.
 */
export type BudgetCheckResult =
  | {
      readonly allowed: true;
      readonly remainingBudget: number;
      readonly atAlertThreshold: boolean;
    }
  | {
      readonly allowed: false;
      readonly reason: "budget_exceeded";
      readonly currentSpend: number;
      readonly dailyBudget: number;
    };

// ============================================================================
// Budget Checking (Pure Functions)
// ============================================================================

/**
 * Check if an LLM call is within budget.
 *
 * Pure function — no side effects. Uses wouldExceedBudget and
 * isAtAlertThreshold from rate-limit.ts for consistent budget logic.
 *
 * @param tracker - Current spend tracker
 * @param estimatedCost - Estimated cost of the next LLM call in USD
 * @returns Budget check result
 *
 * @example
 * ```typescript
 * const tracker: CostTracker = {
 *   currentSpend: 7.50,
 *   budget: { dailyBudget: 10.00, alertThreshold: 0.8 },
 * };
 *
 * const result = checkBudget(tracker, 1.00);
 * if (result.allowed) {
 *   // Proceed — remaining: $1.50, atAlertThreshold: true
 * } else {
 *   // Budget exceeded
 * }
 * ```
 */
export function checkBudget(tracker: CostTracker, estimatedCost: number): BudgetCheckResult {
  const budgetParams = {
    daily: tracker.budget.dailyBudget,
    alertThreshold: tracker.budget.alertThreshold,
  };

  if (wouldExceedBudget(tracker.currentSpend, estimatedCost, budgetParams)) {
    return {
      allowed: false,
      reason: "budget_exceeded",
      currentSpend: tracker.currentSpend,
      dailyBudget: tracker.budget.dailyBudget,
    };
  }

  return {
    allowed: true,
    remainingBudget: tracker.budget.dailyBudget - tracker.currentSpend - estimatedCost,
    atAlertThreshold: isAtAlertThreshold(tracker.currentSpend, budgetParams),
  };
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate LLM call cost from token count.
 *
 * Uses a simple per-token pricing model. For mixed input/output
 * estimation, call this separately for each and sum the results.
 *
 * @param tokens - Number of tokens
 * @param costPerToken - Cost per token in USD
 * @returns Estimated cost in USD
 *
 * @example
 * ```typescript
 * const inputCost = estimateCost(1000, DEFAULT_MODEL_COSTS["openai/gpt-4o"].input);
 * const outputCost = estimateCost(500, DEFAULT_MODEL_COSTS["openai/gpt-4o"].output);
 * const totalCost = inputCost + outputCost;
 * ```
 */
export function estimateCost(tokens: number, costPerToken: number): number {
  return tokens * costPerToken;
}

// ============================================================================
// Default Model Costs
// ============================================================================

/**
 * Default cost-per-token estimates for common models.
 *
 * These are approximate and should be overridden by the app
 * with current pricing from the LLM provider.
 *
 * Costs are in USD per token.
 */
export const DEFAULT_MODEL_COSTS: Readonly<
  Record<string, { readonly input: number; readonly output: number }>
> = {
  "anthropic/claude-sonnet-4-5-20250929": {
    input: 0.000003,
    output: 0.000015,
  },
  "openai/gpt-4o": {
    input: 0.0000025,
    output: 0.00001,
  },
  "openai/gpt-4o-mini": {
    input: 0.00000015,
    output: 0.0000006,
  },
};
