/**
 * Testing utilities for Decider pattern.
 *
 * Provides reusable infrastructure for BDD testing of pure decider functions.
 *
 * @module @libar-dev/platform-decider/testing
 */

// =============================================================================
// Scenario State
// =============================================================================

export {
  initDeciderState,
  createDeciderContext,
  type DeciderScenarioState,
} from "./scenario-state.js";

// =============================================================================
// Assertions
// =============================================================================

export {
  // Status assertions
  assertDecisionSuccess,
  assertDecisionRejected,
  assertDecisionFailed,
  // Success extractors
  getSuccessData,
  getSuccessEvent,
  getSuccessStateUpdate,
  // Event assertions
  assertEventType,
  assertEventPayload,
  // State update assertions
  assertStateUpdate,
  // Rejection assertions
  assertRejectionCode,
  assertRejectionMessage,
  // Failure assertions
  assertFailureReason,
  assertFailureEventType,
} from "./assertions.js";
