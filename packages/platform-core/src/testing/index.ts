/**
 * Testing utilities for Convex applications.
 *
 * Provides reusable infrastructure for BDD testing with vitest-cucumber,
 * integration testing with ConvexTestingHelper, and test isolation patterns.
 *
 * @module @libar-dev/platform-core/testing
 */

// =============================================================================
// Environment Guards
// =============================================================================

export { ensureTestEnvironment, isTestEnvironment } from "./guards.js";

// =============================================================================
// Test Run ID (Isolation)
// =============================================================================

export { generateTestRunId, testRunId, withPrefix, withCustomPrefix } from "./test-run-id.js";

// =============================================================================
// Polling Utilities
// =============================================================================

export {
  sleep,
  waitUntil,
  waitFor,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  type WaitOptions,
} from "./polling.js";

// =============================================================================
// DataTable Parsing
// =============================================================================

export {
  tableRowsToObject,
  parseTableValue,
  getRequiredField,
  getOptionalField,
  type DataTableRow,
  type GenericTableRow,
} from "./data-table.js";

// =============================================================================
// Integration Test Helpers
// =============================================================================

export { testMutation, testQuery, testAction } from "./integration-helpers.js";

// =============================================================================
// Test World (BDD Scenario State)
// =============================================================================

export {
  createBaseUnitTestWorld,
  createBaseIntegrationTestWorld,
  resetWorldState,
  type BaseTestWorld,
  type BaseUnitTestWorld,
  type BaseIntegrationTestWorld,
  type ConvexTest,
} from "./world.js";

// =============================================================================
// Roadmap Patterns (Phase 19) - To Be Implemented
// =============================================================================

export type { EventBuilder, StateFactory, TestAssertions } from "./bdd-infrastructure.js";
export { createEventBuilder, createStateFactory } from "./bdd-infrastructure.js";
