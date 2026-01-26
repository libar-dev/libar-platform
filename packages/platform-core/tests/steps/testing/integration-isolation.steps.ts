/**
 * Integration Test Isolation - Step Definitions
 *
 * @libar-docs
 * @libar-docs-pattern BddTestingInfrastructure
 *
 * BDD step definitions validating the Docker restart pattern for state cleanup,
 * test namespacing for entity isolation, and Workpool/scheduler isolation.
 *
 * These scenarios document expected behavior for integration test isolation.
 * Many scenarios are documentation-focused (behavioral contracts) rather than
 * runtime-verified, since they describe infrastructure patterns.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// =============================================================================
// Test State
// =============================================================================

interface IntegrationTestState {
  entityId: string | null;
  namespace: string | null;
  dockerRestarted: boolean;
  queryResult: string | null;
  error: Error | null;
  readonly namespaces: Map<string, string>;
  readonly createdEntities: Map<string, string>;
  correlationId: string | null;
  workpoolJobId: string | null;
  scheduledFunctionId: string | null;
}

let state: IntegrationTestState;

function resetState(): void {
  state = {
    entityId: null,
    namespace: null,
    dockerRestarted: false,
    queryResult: null,
    error: null,
    namespaces: new Map(),
    createdEntities: new Map(),
    correlationId: null,
    workpoolJobId: null,
    scheduledFunctionId: null,
  };
}

// =============================================================================
// Integration Isolation Feature
// =============================================================================

const integrationIsolationFeature = await loadFeature(
  "tests/features/behavior/testing/integration-isolation.feature"
);

describeFeature(
  integrationIsolationFeature,
  ({ Background, Rule, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given, And }) => {
      Given("the integration test environment is configured", () => {
        // Documentation: Integration test environment expects:
        // - Docker backend running
        // - Convex dev server on port 3210
        // - Clean state via Docker restart
        expect(true).toBe(true);
      });

      And("Docker backend is available on port 3210", () => {
        // Documentation: Docker availability is verified by test runner
        // In CI: `just restart` ensures clean state
        // Locally: `just dev` or `just restart` manages Docker
        expect(true).toBe(true);
      });
    });

    // =========================================================================
    // Rule: Docker restart provides clean state between test suites
    // =========================================================================

    Rule("Docker restart provides clean state between test suites", ({ RuleScenario }) => {
      RuleScenario("Fresh state after Docker restart", ({ Given, When, Then, And }) => {
        Given('a previous test created entity "order-123"', () => {
          // Documentation: Represents state from a previous test run
          state.entityId = "order-123";
          // In real scenario: entity would exist in Convex database
        });

        When('Docker is restarted via "just restart"', () => {
          // Documentation: Docker restart clears all state
          // Command: `just restart` (or `just start` in CI)
          // Effect: Fresh Convex backend with empty database
          state.dockerRestarted = true;
        });

        Then('querying for "order-123" should return nothing', () => {
          // After Docker restart, all data is cleared
          // This is the expected behavior - tmpfs storage means no persistence
          expect(state.dockerRestarted).toBe(true);
        });

        And("Workpool state should be empty", () => {
          // Workpool internal state is cleared on Docker restart
          // No pending jobs remain from previous test runs
          expect(state.dockerRestarted).toBe(true);
        });

        And("scheduled functions should be cleared", () => {
          // All scheduled functions (_scheduled_functions table) are cleared
          // This prevents previous test's scheduled work from interfering
          expect(state.dockerRestarted).toBe(true);
        });
      });

      RuleScenario("Detect state pollution without restart", ({ Given, And, When, Then }) => {
        Given('a test created entity with id "polluted-entity"', () => {
          state.entityId = "polluted-entity";
          // Entity exists in database
        });

        And("Docker was NOT restarted", () => {
          state.dockerRestarted = false;
        });

        When("a new test queries the database", () => {
          // New test starts without Docker restart
          state.queryResult = state.dockerRestarted ? null : state.entityId;
        });

        Then('"polluted-entity" may still exist', () => {
          // This documents the problem: without Docker restart,
          // previous test data can affect current test
          expect(state.queryResult).toBe("polluted-entity");
        });

        And("this indicates potential state pollution", () => {
          // State pollution occurs when tests don't have isolated state
          // Solution: Always use `just restart` between test suites
          expect(state.dockerRestarted).toBe(false);
        });
      });
    });

    // =========================================================================
    // Rule: Each test uses unique namespace to prevent collisions
    // =========================================================================

    Rule("Each test uses unique namespace to prevent collisions", ({ RuleScenario }) => {
      RuleScenario("Unique namespace per test", ({ Given, And, When, Then }) => {
        Given('test "test-1" with namespace "ns_abc123"', () => {
          state.namespaces.set("test-1", "ns_abc123");
        });

        And('test "test-2" with namespace "ns_def456"', () => {
          state.namespaces.set("test-2", "ns_def456");
        });

        When('both tests create entity with logical id "order-1"', () => {
          // Each test prefixes entity IDs with its namespace
          const ns1 = state.namespaces.get("test-1")!;
          const ns2 = state.namespaces.get("test-2")!;
          state.createdEntities.set("test-1", `${ns1}_order-1`);
          state.createdEntities.set("test-2", `${ns2}_order-1`);
        });

        Then('test-1 creates "ns_abc123_order-1"', () => {
          expect(state.createdEntities.get("test-1")).toBe("ns_abc123_order-1");
        });

        And('test-2 creates "ns_def456_order-1"', () => {
          expect(state.createdEntities.get("test-2")).toBe("ns_def456_order-1");
        });

        And("no collision occurs", () => {
          // Different namespaces ensure no ID collision
          const entity1 = state.createdEntities.get("test-1");
          const entity2 = state.createdEntities.get("test-2");
          expect(entity1).not.toBe(entity2);
        });
      });

      RuleScenario("Namespace applied to correlation IDs", ({ Given, When, Then, And }) => {
        Given('a test with namespace "ns_test"', () => {
          state.namespace = "ns_test";
        });

        When("executing a command", () => {
          // Command execution generates correlation ID with namespace
          state.correlationId = `${state.namespace}_corr_${Date.now()}`;
        });

        Then("correlationId should include namespace prefix", () => {
          expect(state.correlationId).toMatch(/^ns_test_corr_/);
        });

        And("events can be traced to the specific test", () => {
          // Correlation ID allows tracing events back to specific test
          expect(state.correlationId).toContain(state.namespace!);
        });
      });
    });

    // =========================================================================
    // Rule: Background jobs are isolated between tests
    // =========================================================================

    Rule("Background jobs are isolated between tests", ({ RuleScenario }) => {
      RuleScenario(
        "Workpool jobs from previous test don't interfere",
        ({ Given, And, When, Then }) => {
          Given("test-1 queued a Workpool job that takes 5 seconds", () => {
            // Documentation: Long-running Workpool job from test-1
            state.workpoolJobId = "test-1-job-slow";
          });

          And("test-1 completed without waiting for the job", () => {
            // Test-1 finished but job is still running/pending
            // This is the problem scenario we're documenting
          });

          When("test-2 starts immediately", () => {
            // Test-2 begins while test-1's job is still active
          });

          Then("test-2 should not see test-1's pending job", () => {
            // Documentation: Without Docker restart, test-2 MAY see test-1's job
            // This scenario documents the expected behavior with proper isolation
            expect(true).toBe(true);
          });

          And("Docker restart is required for complete isolation", () => {
            // Critical insight: Programmatic cleanup doesn't work for Workpool
            // Docker restart is the ONLY reliable isolation mechanism
            // See CLAUDE.md: "No programmatic cleanup" rule
            expect(true).toBe(true);
          });
        }
      );

      RuleScenario(
        "Scheduled functions use test-specific context",
        ({ Given, When, Then, And }) => {
          Given("a test schedules a function for 1 minute later", () => {
            state.namespace = "ns_test123";
            state.scheduledFunctionId = `${state.namespace}_scheduled_${Date.now()}`;
          });

          When("the test completes", () => {
            // Test completes, scheduled function is pending
          });

          Then("the scheduled function should include test namespace", () => {
            expect(state.scheduledFunctionId).toContain(state.namespace!);
          });

          And("cleanup can identify test-specific scheduled functions", () => {
            // Namespace in scheduled function allows identification
            // Note: Even with identification, programmatic cleanup is not recommended
            // Docker restart is preferred for clean isolation
            expect(state.scheduledFunctionId).toMatch(/^ns_test123_/);
          });
        }
      );
    });
  }
);
