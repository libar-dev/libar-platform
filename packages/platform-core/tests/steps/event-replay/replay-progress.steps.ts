/**
 * Replay Progress - Step Definitions
 *
 * BDD step definitions for replay progress calculator:
 * - calculatePercentComplete
 * - estimateRemainingTime
 * - calculateProgress
 * - isActiveReplay
 * - isTerminalReplayStatus
 *
 * @libar-docs
 * @libar-docs-implements EventReplayInfrastructure
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  calculateProgress,
  estimateRemainingTime,
  calculatePercentComplete,
  isActiveReplay,
  isTerminalReplayStatus,
} from "../../../src/projections/replay/progress.js";
import type {
  ReplayCheckpoint,
  ReplayProgress,
  ReplayStatus,
} from "../../../src/projections/replay/types.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Input values
  eventsProcessed: number;
  totalEvents: number;
  elapsedMs: number;
  status: ReplayStatus;
  error?: string;
  startedAt: number;

  // Mock checkpoint
  checkpoint: ReplayCheckpoint | null;

  // Results
  percentResult: number | null;
  estimateResult: number | undefined;
  progressResult: ReplayProgress | null;
  isActiveResult: boolean | null;
  isTerminalResult: boolean | null;
}

let state: TestState;

function resetState(): void {
  state = {
    eventsProcessed: 0,
    totalEvents: 0,
    elapsedMs: 0,
    status: "running",
    error: undefined,
    startedAt: Date.now(),
    checkpoint: null,
    percentResult: null,
    estimateResult: undefined,
    progressResult: null,
    isActiveResult: null,
    isTerminalResult: null,
  };
}

function createCheckpoint(overrides: Partial<ReplayCheckpoint> = {}): ReplayCheckpoint {
  return {
    _id: "cp_123",
    replayId: "replay_123",
    projection: "orderSummary",
    lastPosition: state.eventsProcessed,
    status: state.status,
    eventsProcessed: state.eventsProcessed,
    chunksCompleted: Math.floor(state.eventsProcessed / 100),
    startedAt: state.startedAt,
    updatedAt: Date.now(),
    error: state.error,
    ...overrides,
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/event-replay/replay-progress.feature");

describeFeature(feature, ({ Scenario, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // calculatePercentComplete
  // ===========================================================================

  Scenario("Percentage is 50 when half events processed", ({ Given, When, Then }) => {
    Given("500 events processed out of 1000 total", () => {
      state.eventsProcessed = 500;
      state.totalEvents = 1000;
    });

    When("calculating percent complete", () => {
      state.percentResult = calculatePercentComplete(state.eventsProcessed, state.totalEvents);
    });

    Then("the result should be 50", () => {
      expect(state.percentResult).toBe(50);
    });
  });

  Scenario("Percentage is 100 when all events processed", ({ Given, When, Then }) => {
    Given("1000 events processed out of 1000 total", () => {
      state.eventsProcessed = 1000;
      state.totalEvents = 1000;
    });

    When("calculating percent complete", () => {
      state.percentResult = calculatePercentComplete(state.eventsProcessed, state.totalEvents);
    });

    Then("the result should be 100", () => {
      expect(state.percentResult).toBe(100);
    });
  });

  Scenario("Percentage is 100 when total events is zero", ({ Given, When, Then }) => {
    Given("0 events processed out of 0 total", () => {
      state.eventsProcessed = 0;
      state.totalEvents = 0;
    });

    When("calculating percent complete", () => {
      state.percentResult = calculatePercentComplete(state.eventsProcessed, state.totalEvents);
    });

    Then("the result should be 100", () => {
      expect(state.percentResult).toBe(100);
    });
  });

  Scenario("Percentage has one decimal place precision", ({ Given, When, Then }) => {
    Given("333 events processed out of 1000 total", () => {
      state.eventsProcessed = 333;
      state.totalEvents = 1000;
    });

    When("calculating percent complete", () => {
      state.percentResult = calculatePercentComplete(state.eventsProcessed, state.totalEvents);
    });

    Then("the result should be 33.3", () => {
      expect(state.percentResult).toBe(33.3);
    });
  });

  // ===========================================================================
  // estimateRemainingTime
  // ===========================================================================

  Scenario("Remaining time estimated from throughput", ({ Given, When, Then }) => {
    Given("100 events processed in 10000ms with 1000 total events", () => {
      state.eventsProcessed = 100;
      state.elapsedMs = 10000;
      state.totalEvents = 1000;
    });

    When("estimating remaining time", () => {
      state.estimateResult = estimateRemainingTime(
        state.eventsProcessed,
        state.elapsedMs,
        state.totalEvents
      );
    });

    Then("the estimated time should be 90000ms", () => {
      expect(state.estimateResult).toBe(90000);
    });
  });

  Scenario("Remaining time is undefined when no events processed", ({ Given, When, Then }) => {
    Given("0 events processed in 5000ms with 1000 total events", () => {
      state.eventsProcessed = 0;
      state.elapsedMs = 5000;
      state.totalEvents = 1000;
    });

    When("estimating remaining time", () => {
      state.estimateResult = estimateRemainingTime(
        state.eventsProcessed,
        state.elapsedMs,
        state.totalEvents
      );
    });

    Then("the estimated time should be undefined", () => {
      expect(state.estimateResult).toBeUndefined();
    });
  });

  Scenario("Remaining time is undefined when elapsed time is zero", ({ Given, When, Then }) => {
    Given("100 events processed in 0ms with 1000 total events", () => {
      state.eventsProcessed = 100;
      state.elapsedMs = 0;
      state.totalEvents = 1000;
    });

    When("estimating remaining time", () => {
      state.estimateResult = estimateRemainingTime(
        state.eventsProcessed,
        state.elapsedMs,
        state.totalEvents
      );
    });

    Then("the estimated time should be undefined", () => {
      expect(state.estimateResult).toBeUndefined();
    });
  });

  Scenario("Remaining time is zero when all events processed", ({ Given, When, Then }) => {
    Given("1000 events processed in 10000ms with 1000 total events", () => {
      state.eventsProcessed = 1000;
      state.elapsedMs = 10000;
      state.totalEvents = 1000;
    });

    When("estimating remaining time", () => {
      state.estimateResult = estimateRemainingTime(
        state.eventsProcessed,
        state.elapsedMs,
        state.totalEvents
      );
    });

    Then("the estimated time should be 0", () => {
      expect(state.estimateResult).toBe(0);
    });
  });

  // ===========================================================================
  // calculateProgress (combined)
  // ===========================================================================

  Scenario("Calculate progress for running replay", ({ Given, When, Then, And }) => {
    Given("a running checkpoint with 500 of 1000 events processed", () => {
      state.eventsProcessed = 500;
      state.totalEvents = 1000;
      state.status = "running";
    });

    And("the replay started 10 seconds ago", () => {
      state.startedAt = Date.now() - 10000;
      state.checkpoint = createCheckpoint();
    });

    When("calculating full progress", () => {
      state.progressResult = calculateProgress(state.checkpoint!, state.totalEvents);
    });

    Then('the progress status should be "running"', () => {
      expect(state.progressResult?.status).toBe("running");
    });

    And("the progress percentComplete should be 50", () => {
      expect(state.progressResult?.percentComplete).toBe(50);
    });

    And("the progress should have an estimatedRemainingMs value", () => {
      expect(state.progressResult?.estimatedRemainingMs).toBeDefined();
      expect(typeof state.progressResult?.estimatedRemainingMs).toBe("number");
    });
  });

  Scenario("Calculate progress for completed replay", ({ Given, When, Then, And }) => {
    Given("a completed checkpoint with 1000 of 1000 events processed", () => {
      state.eventsProcessed = 1000;
      state.totalEvents = 1000;
      state.status = "completed";
      state.checkpoint = createCheckpoint({
        completedAt: Date.now(),
      });
    });

    When("calculating full progress", () => {
      state.progressResult = calculateProgress(state.checkpoint!, state.totalEvents);
    });

    Then('the progress status should be "completed"', () => {
      expect(state.progressResult?.status).toBe("completed");
    });

    And("the progress percentComplete should be 100", () => {
      expect(state.progressResult?.percentComplete).toBe(100);
    });

    And("the progress should NOT have an estimatedRemainingMs value", () => {
      expect(state.progressResult?.estimatedRemainingMs).toBeUndefined();
    });
  });

  Scenario("Calculate progress includes error for failed replay", ({ Given, When, Then, And }) => {
    Given('a failed checkpoint with error "Projection handler threw exception"', () => {
      state.eventsProcessed = 250;
      state.totalEvents = 1000;
      state.status = "failed";
      state.error = "Projection handler threw exception";
      state.checkpoint = createCheckpoint();
    });

    When("calculating full progress", () => {
      state.progressResult = calculateProgress(state.checkpoint!, state.totalEvents);
    });

    Then('the progress status should be "failed"', () => {
      expect(state.progressResult?.status).toBe("failed");
    });

    And('the progress error should be "Projection handler threw exception"', () => {
      expect(state.progressResult?.error).toBe("Projection handler threw exception");
    });
  });

  // ===========================================================================
  // isActiveReplay
  // ===========================================================================

  Scenario("Running status is active", ({ Given, When, Then }) => {
    Given('a replay with status "running"', () => {
      state.status = "running";
    });

    When("checking if replay is active", () => {
      state.isActiveResult = isActiveReplay(state.status);
    });

    Then("the result should be true", () => {
      expect(state.isActiveResult).toBe(true);
    });
  });

  Scenario("Paused status is active", ({ Given, When, Then }) => {
    Given('a replay with status "paused"', () => {
      state.status = "paused";
    });

    When("checking if replay is active", () => {
      state.isActiveResult = isActiveReplay(state.status);
    });

    Then("the result should be true", () => {
      expect(state.isActiveResult).toBe(true);
    });
  });

  Scenario("Completed status is not active", ({ Given, When, Then }) => {
    Given('a replay with status "completed"', () => {
      state.status = "completed";
    });

    When("checking if replay is active", () => {
      state.isActiveResult = isActiveReplay(state.status);
    });

    Then("the result should be false", () => {
      expect(state.isActiveResult).toBe(false);
    });
  });

  Scenario("Failed status is not active", ({ Given, When, Then }) => {
    Given('a replay with status "failed"', () => {
      state.status = "failed";
    });

    When("checking if replay is active", () => {
      state.isActiveResult = isActiveReplay(state.status);
    });

    Then("the result should be false", () => {
      expect(state.isActiveResult).toBe(false);
    });
  });

  // ===========================================================================
  // isTerminalReplayStatus
  // ===========================================================================

  Scenario("Completed status is terminal", ({ Given, When, Then }) => {
    Given('a replay with status "completed"', () => {
      state.status = "completed";
    });

    When("checking if status is terminal", () => {
      state.isTerminalResult = isTerminalReplayStatus(state.status);
    });

    Then("the result should be true", () => {
      expect(state.isTerminalResult).toBe(true);
    });
  });

  Scenario("Failed status is terminal", ({ Given, When, Then }) => {
    Given('a replay with status "failed"', () => {
      state.status = "failed";
    });

    When("checking if status is terminal", () => {
      state.isTerminalResult = isTerminalReplayStatus(state.status);
    });

    Then("the result should be true", () => {
      expect(state.isTerminalResult).toBe(true);
    });
  });

  Scenario("Cancelled status is terminal", ({ Given, When, Then }) => {
    Given('a replay with status "cancelled"', () => {
      state.status = "cancelled";
    });

    When("checking if status is terminal", () => {
      state.isTerminalResult = isTerminalReplayStatus(state.status);
    });

    Then("the result should be true", () => {
      expect(state.isTerminalResult).toBe(true);
    });
  });

  Scenario("Running status is not terminal", ({ Given, When, Then }) => {
    Given('a replay with status "running"', () => {
      state.status = "running";
    });

    When("checking if status is terminal", () => {
      state.isTerminalResult = isTerminalReplayStatus(state.status);
    });

    Then("the result should be false", () => {
      expect(state.isTerminalResult).toBe(false);
    });
  });

  Scenario("Paused status is not terminal", ({ Given, When, Then }) => {
    Given('a replay with status "paused"', () => {
      state.status = "paused";
    });

    When("checking if status is terminal", () => {
      state.isTerminalResult = isTerminalReplayStatus(state.status);
    });

    Then("the result should be false", () => {
      expect(state.isTerminalResult).toBe(false);
    });
  });
});
