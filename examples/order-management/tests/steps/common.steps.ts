/**
 * Common Step Definitions
 *
 * Shared steps that can be used across multiple test contexts.
 * These steps work with both unit tests (convex-test) and integration tests (ConvexTestingHelper).
 *
 * Note: Uses namespace-based isolation via testRunId prefix instead of clearAll.
 */
import type { ConvexTestingHelper } from "convex-helpers/testing";

/**
 * State interface that test contexts must provide.
 * Both unit and integration tests can implement this.
 */
export interface TestContext {
  /**
   * For integration tests: ConvexTestingHelper instance
   * For unit tests: This may be undefined (convex-test auto-isolates)
   */
  integrationHelper?: ConvexTestingHelper;
}

/**
 * Gherkin Step: Given the deployment state is clean
 *
 * No-op with namespace-based isolation.
 * Each test run's entities have unique testRunId-prefixed IDs, providing
 * logical isolation without needing database cleanup.
 *
 * Usage in step definitions:
 * ```typescript
 * Given("the deployment state is clean", async () => {
 *   await ensureDeploymentStateIsClean(scenarioState);
 * });
 * ```
 *
 * For unit tests (convex-test): Fresh state is automatic.
 * For integration tests: Namespace isolation via testRunId prefix.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter kept for API compatibility
export async function ensureDeploymentStateIsClean(context: TestContext): Promise<void> {
  // No-op with namespace isolation - each test run has unique IDs via testRunId prefix
}

/**
 * Gherkin Step: Given the system is ready
 *
 * Verifies the test environment is properly configured.
 * This is typically used in Background sections.
 *
 * For unit tests: Verifies convex-test instance is initialized.
 * For integration tests: Verifies backend is reachable and in test mode.
 */
export function ensureSystemIsReady(_context: TestContext): void {
  // Validation is handled by test setup
  // This step serves as documentation and explicit intent
}

/**
 * Helper to create a step definition handler for "the deployment state is clean".
 *
 * Use this in your step definition file:
 * ```typescript
 * import { createCleanStateStepHandler } from './common.steps';
 *
 * Background(({ Given }) => {
 *   Given("the deployment state is clean", createCleanStateStepHandler(() => scenarioState));
 * });
 * ```
 */
export function createCleanStateStepHandler(
  getContext: () => TestContext | null
): () => Promise<void> {
  return async () => {
    const context = getContext();
    if (!context) {
      throw new Error(
        "Test context not initialized - ensure Given 'the system is ready' runs first"
      );
    }
    await ensureDeploymentStateIsClean(context);
  };
}
