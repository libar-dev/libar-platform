/**
 * Cost Budget Unit Tests
 *
 * Tests for checkBudget(), estimateCost(), and DEFAULT_MODEL_COSTS including:
 * - Budget allowed when under budget
 * - Budget denied when would exceed
 * - Alert threshold flag
 * - Below alert threshold
 * - Cost estimation arithmetic
 * - Default model costs entries
 */

import { describe, it, expect } from "vitest";
import {
  checkBudget,
  estimateCost,
  DEFAULT_MODEL_COSTS,
  type CostTracker,
} from "../../../src/agent/cost-budget.js";

// ============================================================================
// checkBudget Tests
// ============================================================================

describe("checkBudget", () => {
  it("allows when current spend plus estimated cost is under budget", () => {
    const tracker: CostTracker = {
      currentSpend: 5,
      budget: { dailyBudget: 10, alertThreshold: 0.8 },
    };

    const result = checkBudget(tracker, 1);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remainingBudget).toBe(4); // 10 - 5 - 1
    }
  });

  it("denies when estimated cost would exceed budget", () => {
    const tracker: CostTracker = {
      currentSpend: 9.5,
      budget: { dailyBudget: 10, alertThreshold: 0.8 },
    };

    const result = checkBudget(tracker, 1);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("budget_exceeded");
      expect(result.currentSpend).toBe(9.5);
      expect(result.dailyBudget).toBe(10);
    }
  });

  it("sets atAlertThreshold when spend reaches alert threshold", () => {
    const tracker: CostTracker = {
      currentSpend: 8.5, // 85% of 10 budget, above 80% threshold
      budget: { dailyBudget: 10, alertThreshold: 0.8 },
    };

    const result = checkBudget(tracker, 0.5);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.atAlertThreshold).toBe(true);
    }
  });

  it("does not set atAlertThreshold when below threshold", () => {
    const tracker: CostTracker = {
      currentSpend: 5, // 50% of 10 budget, below 80% threshold
      budget: { dailyBudget: 10, alertThreshold: 0.8 },
    };

    const result = checkBudget(tracker, 1);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.atAlertThreshold).toBe(false);
    }
  });

  it("denies when current spend already equals budget", () => {
    const tracker: CostTracker = {
      currentSpend: 10,
      budget: { dailyBudget: 10, alertThreshold: 0.8 },
    };

    const result = checkBudget(tracker, 0.01);

    expect(result.allowed).toBe(false);
  });

  it("allows when estimated cost exactly reaches budget", () => {
    const tracker: CostTracker = {
      currentSpend: 5,
      budget: { dailyBudget: 10, alertThreshold: 0.8 },
    };

    // 5 + 5 = 10, which is NOT > 10, so it should be allowed
    const result = checkBudget(tracker, 5);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remainingBudget).toBe(0);
    }
  });

  it("sets atAlertThreshold at exact threshold boundary", () => {
    const tracker: CostTracker = {
      currentSpend: 8, // Exactly 80% of 10
      budget: { dailyBudget: 10, alertThreshold: 0.8 },
    };

    const result = checkBudget(tracker, 0.5);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.atAlertThreshold).toBe(true);
    }
  });
});

// ============================================================================
// estimateCost Tests
// ============================================================================

describe("estimateCost", () => {
  it("performs simple multiplication of tokens and cost per token", () => {
    const cost = estimateCost(1000, 0.000003);
    expect(cost).toBe(0.003);
  });

  it("returns 0 for 0 tokens", () => {
    const cost = estimateCost(0, 0.000003);
    expect(cost).toBe(0);
  });

  it("handles large token counts", () => {
    const cost = estimateCost(1_000_000, 0.000003);
    expect(cost).toBeCloseTo(3.0);
  });

  it("handles very small cost per token", () => {
    const cost = estimateCost(100, 0.00000015);
    expect(cost).toBeCloseTo(0.000015);
  });
});

// ============================================================================
// DEFAULT_MODEL_COSTS Tests
// ============================================================================

describe("DEFAULT_MODEL_COSTS", () => {
  it("has claude model entry with input and output costs", () => {
    const claude = DEFAULT_MODEL_COSTS["anthropic/claude-sonnet-4-5-20250929"];
    expect(claude).toBeDefined();
    expect(claude.input).toBeGreaterThan(0);
    expect(claude.output).toBeGreaterThan(0);
    expect(claude.output).toBeGreaterThan(claude.input); // Output typically costs more
  });

  it("has gpt-4o model entry with input and output costs", () => {
    const gpt4o = DEFAULT_MODEL_COSTS["openai/gpt-4o"];
    expect(gpt4o).toBeDefined();
    expect(gpt4o.input).toBeGreaterThan(0);
    expect(gpt4o.output).toBeGreaterThan(0);
  });

  it("has gpt-4o-mini model entry", () => {
    const gpt4oMini = DEFAULT_MODEL_COSTS["openai/gpt-4o-mini"];
    expect(gpt4oMini).toBeDefined();
    expect(gpt4oMini.input).toBeGreaterThan(0);
    expect(gpt4oMini.output).toBeGreaterThan(0);
    // Mini should be cheaper than full gpt-4o
    expect(gpt4oMini.input).toBeLessThan(DEFAULT_MODEL_COSTS["openai/gpt-4o"].input);
  });
});
