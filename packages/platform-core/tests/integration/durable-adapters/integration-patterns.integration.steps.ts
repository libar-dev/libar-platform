/**
 * Integration Patterns - Step Definitions
 *
 * Integration tests for validating adapter integration with
 * middleware pipeline, Workpool infrastructure, and component mounting.
 *
 * @libar-docs
 * @libar-docs-pattern DurableFunctionAdapters
 * @libar-docs-status active
 * @libar-docs-infra
 *
 * @since Phase 18a
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { makeFunctionReference } from "convex/server";
import type { SafeMutationRef, SafeQueryRef } from "../../../src/types/function-references.js";
import { withPrefix, testMutation, testQuery } from "../../../src/testing/index.js";

// =============================================================================
// Test Function References (TS2589 prevention)
//
// Using makeFunctionReference at module level avoids deep type instantiation
// that occurs when accessing api.testing.* at call sites.
// =============================================================================

// integrationPatternsTest functions
const verifyMiddlewareIntegration = makeFunctionReference<"mutation">(
  "testing/integrationPatternsTest:verifyMiddlewareIntegration"
) as SafeMutationRef;

const simulateRateLimitedRejection = makeFunctionReference<"mutation">(
  "testing/integrationPatternsTest:simulateRateLimitedRejection"
) as SafeMutationRef;

const verifyWorkpoolIsolation = makeFunctionReference<"query">(
  "testing/integrationPatternsTest:verifyWorkpoolIsolation"
) as SafeQueryRef;

const verifyOnCompleteSupport = makeFunctionReference<"query">(
  "testing/integrationPatternsTest:verifyOnCompleteSupport"
) as SafeQueryRef;

const verifyExceptionHandling = makeFunctionReference<"query">(
  "testing/integrationPatternsTest:verifyExceptionHandling"
) as SafeQueryRef;

const verifyComponentMounting = makeFunctionReference<"query">(
  "testing/integrationPatternsTest:verifyComponentMounting"
) as SafeQueryRef;

// rateLimitTest function
const consumeRateLimitTokens = makeFunctionReference<"mutation">(
  "testing/rateLimitTest:consumeRateLimitTokens"
) as SafeMutationRef;

// dcbRetryTest function
const simulateConflictRetry = makeFunctionReference<"mutation">(
  "testing/dcbRetryTest:simulateConflictRetry"
) as SafeMutationRef;

// =============================================================================
// Test State
// =============================================================================

interface IntegrationTestState {
  t: ConvexTestingHelper | null;
  currentTestId: string | null;
  lastResult: unknown;
  lastError: Error | null;

  // Rate limit integration results
  rateLimitResult: { allowed: boolean; retryAfterMs?: number } | null;
  middlewareTraceResult: {
    middlewareOrder: number[];
    adapterCalled: boolean;
    checkResult: { allowed: boolean; retryAfterMs?: number };
  } | null;
  rejectionResult: {
    status: string;
    code: string;
    context?: { retryAfterMs?: number };
  } | null;

  // DCB/Workpool integration results
  poolVerificationResult: {
    dcbRetryPoolConfigured: boolean;
    projectionPoolConfigured: boolean;
    areSeparateInstances: boolean;
  } | null;
  retryArgsResult: {
    receivedExpectedVersion: number;
    receivedAttempt: number;
    receivedScopeKey: string;
  } | null;

  // Component mounting results
  mountingResult: {
    rateLimiterAccessible: boolean;
    workpoolsIndependent: boolean;
    dcbPoolAddressable: boolean;
    projPoolAddressable: boolean;
  } | null;
}

let state: IntegrationTestState;

function resetState(): void {
  state = {
    t: null,
    currentTestId: null,
    lastResult: null,
    lastError: null,
    rateLimitResult: null,
    middlewareTraceResult: null,
    rejectionResult: null,
    poolVerificationResult: null,
    retryArgsResult: null,
    mountingResult: null,
  };
}

/**
 * Generate a test-isolated ID with testRunId prefix.
 */
function generateTestId(baseName: string): string {
  return withPrefix(baseName);
}

// =============================================================================
// Feature Loading
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/durable-function-adapters/integration-patterns.feature"
);

// =============================================================================
// Feature Implementation
// =============================================================================

describeFeature(
  feature,
  ({ Background, Rule, BeforeAllScenarios, AfterAllScenarios, BeforeEachScenario }) => {
    BeforeAllScenarios(async () => {
      resetState();
      // Initialize ConvexTestingHelper with the integration test backend
      const backendUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
      state.t = new ConvexTestingHelper({ backendUrl });
    });

    BeforeEachScenario(() => {
      // Reset per-scenario state while preserving the ConvexTestingHelper connection
      const t = state.t;
      resetState();
      state.t = t;
    });

    AfterAllScenarios(async () => {
      if (state.t) {
        await state.t.close();
      }
      resetState();
    });

    // ===========================================================================
    // Background - shared setup for all scenarios
    // ===========================================================================

    Background(({ Given }) => {
      Given("platform infrastructure is configured for integration tests", () => {
        // Combined check - all infrastructure is configured:
        // - Middleware pipeline with standard order (Structure, Domain, Auth, Logging, RateLimit)
        // - Rate limiter component mounted in convex.config.ts
        // - dcbRetryPool mounted in convex.config.ts and initialized in infrastructure.ts
        expect(state.t).not.toBeNull();
      });
    });

    // ===========================================================================
    // Rule: Rate limit adapter integrates with middleware pipeline
    // ===========================================================================

    Rule("Rate limit adapter integrates with middleware pipeline", ({ RuleScenario }) => {
      RuleScenario("Adapter plugs into existing middleware", ({ Given, And, When, Then }) => {
        Given("rate limit middleware at order 50", () => {
          // Rate limit middleware is configured at order 50 (RATE_LIMIT_ORDER constant)
          // This documents the standard ordering
        });

        And("ConvexRateLimitAdapter is configured", () => {
          // The adapter is configured in rateLimits.ts with testLimit
          state.currentTestId = generateTestId(`adapter-plug-${Date.now()}`);
        });

        When("a command is dispatched", async () => {
          // Test that the adapter integrates correctly with the middleware
          // Note: Must use testMutation because rateLimiter.limit requires runMutation capability
          state.middlewareTraceResult = await testMutation(state.t!, verifyMiddlewareIntegration, {
            testKey: state.currentTestId!,
          });
        });

        Then("rate limit should be checked via the adapter", () => {
          expect(state.middlewareTraceResult).not.toBeNull();
          expect(state.middlewareTraceResult!.adapterCalled).toBe(true);
        });

        And("middleware order should be preserved", () => {
          // Rate limit is at order 50, which should be last in standard pipeline
          const { middlewareOrder } = state.middlewareTraceResult!;
          expect(middlewareOrder.includes(50)).toBe(true);
        });
      });

      RuleScenario(
        "Rate limited command returns standard rejection",
        ({ Given, When, Then, And }) => {
          Given("rate limit is exhausted for current user", async () => {
            const testKey = generateTestId(`exhaust-${Date.now()}`);
            state.currentTestId = testKey;

            // Exhaust the rate limit
            await testMutation(state.t!, consumeRateLimitTokens, {
              limitName: "testLimit",
              key: testKey,
              count: 10, // Exactly at limit
            });
          });

          When("a command is dispatched", async () => {
            // This would normally go through the middleware pipeline
            // For this test, we verify the rejection format directly
            // Note: Must use testMutation because rateLimiter.limit requires runMutation capability
            state.rejectionResult = await testMutation(state.t!, simulateRateLimitedRejection, {
              testKey: state.currentTestId!,
            });
          });

          Then('the result should have status "rejected"', () => {
            expect(state.rejectionResult).not.toBeNull();
            expect(state.rejectionResult!.status).toBe("rejected");
          });

          And('the code should be "RATE_LIMITED"', () => {
            expect(state.rejectionResult!.code).toBe("RATE_LIMITED");
          });

          And("context should include retryAfterMs", () => {
            expect(state.rejectionResult!.context).toBeDefined();
            expect(state.rejectionResult!.context!.retryAfterMs).toBeGreaterThan(0);
          });
        }
      );
    });

    // ===========================================================================
    // Rule: DCB retry integrates with Workpool infrastructure
    // ===========================================================================

    Rule("DCB retry integrates with Workpool infrastructure", ({ RuleScenario }) => {
      RuleScenario("DCB retry uses separate Workpool", ({ Given, And, When, Then }) => {
        Given(
          "dcbRetryPool is configured with maxParallelism {int}",
          (_ctx: unknown, parallelism: number) => {
            // dcbRetryPool is configured in infrastructure.ts
            // In integration tests, parallelism is 3; in production, 10
            expect(parallelism).toBeGreaterThan(0);
            state.currentTestId = generateTestId(`pool-isolation-${Date.now()}`);
          }
        );

        And("projectionPool is configured separately", () => {
          // projectionPool is a separate Workpool instance
        });

        When("a DCB conflict triggers retry", async () => {
          state.poolVerificationResult = await testQuery(state.t!, verifyWorkpoolIsolation, {});
        });

        Then("retry should be enqueued to dcbRetryPool", () => {
          expect(state.poolVerificationResult).not.toBeNull();
          expect(state.poolVerificationResult!.dcbRetryPoolConfigured).toBe(true);
        });

        And("projectionPool should not be affected", () => {
          expect(state.poolVerificationResult!.areSeparateInstances).toBe(true);
        });
      });

      RuleScenario("Retry mutation receives correct arguments", ({ Given, When, Then, And }) => {
        Given("a DCB operation with scope {string}", (_ctx: unknown, scopeKey: string) => {
          // Parse scope key: tenant:t1:res:r1
          const parts = scopeKey.split(":");
          expect(parts.length).toBe(4);
          state.currentTestId = parts[3]; // Just the scopeId
        });

        When("conflict triggers retry", async () => {
          state.retryArgsResult = await testMutation(state.t!, simulateConflictRetry, {
            scopeId: state.currentTestId!,
            currentVersion: 10, // Conflict version
            attempt: 0,
            maxAttempts: 5,
            useNoJitter: true,
          });
        });

        Then("retry mutation should receive updated expectedVersion", () => {
          expect(
            (state.retryArgsResult as { wouldEnqueue?: { expectedVersion: number } }).wouldEnqueue
              ?.expectedVersion
          ).toBe(10);
        });

        And("retry mutation should receive incremented attempt", () => {
          expect(
            (state.retryArgsResult as { wouldEnqueue?: { retryAttempt: number } }).wouldEnqueue
              ?.retryAttempt
          ).toBe(1);
        });

        And("retry mutation should receive original DCB config", () => {
          // Scope key is included in partition key
          expect(
            (state.retryArgsResult as { wouldEnqueue?: { partitionKey: string } }).wouldEnqueue
              ?.partitionKey
          ).toContain("dcb:");
        });
      });

      RuleScenario(
        "DCB retry with onComplete callback integration",
        ({ Given, And, When, Then }) => {
          Given("dcbRetryPool supports onComplete callbacks", () => {
            // dcbRetryPool is configured to accept onComplete
            state.currentTestId = generateTestId(`oncomplete-${Date.now()}`);
          });

          And("a DCB operation with onComplete configured", () => {
            // The onComplete is passed via withDCBRetry options
          });

          When("conflict triggers retry that eventually succeeds", async () => {
            // Test that onComplete option is properly passed through
            state.lastResult = await testQuery(state.t!, verifyOnCompleteSupport, {
              testId: state.currentTestId!,
            });
          });

          Then("onComplete mutation should receive the success result", () => {
            expect((state.lastResult as { onCompleteSupported: boolean }).onCompleteSupported).toBe(
              true
            );
          });

          And("parallel DCB operations should each track independently", () => {
            // Each operation's onComplete is independent - verified by structure
            expect((state.lastResult as { independentTracking: boolean }).independentTracking).toBe(
              true
            );
          });
        }
      );

      RuleScenario(
        "Workpool does not retry DCB mutations - clarification",
        ({ Given, And, When, Then }) => {
          Given("dcbRetryPool has maxAttempts 1 at Workpool level", () => {
            // dcbRetryPool is configured with maxAttempts: 1 in infrastructure.ts
            // withDCBRetry handles the actual retry logic
            state.currentTestId = generateTestId(`workpool-no-retry-${Date.now()}`);
          });

          And("withDCBRetry has maxAttempts 5 at DCB level", () => {
            // Default DCB retry config has maxAttempts: 5
          });

          When("a DCB mutation throws an exception - not OCC conflict", async () => {
            // DCB conflicts return { status: "conflict" } - a successful return
            // Workpool only retries on exceptions
            state.lastResult = await testQuery(state.t!, verifyExceptionHandling, {
              testId: state.currentTestId!,
            });
          });

          Then("Workpool should NOT retry as exception is final failure", () => {
            expect((state.lastResult as { workpoolMaxAttempts: number }).workpoolMaxAttempts).toBe(
              1
            );
            expect((state.lastResult as { dcbHandlesRetry: boolean }).dcbHandlesRetry).toBe(true);
          });

          And("onComplete should receive failed result", () => {
            // When exception occurs, onComplete receives failure info
            expect(
              (state.lastResult as { onCompleteReceivesFailure: boolean }).onCompleteReceivesFailure
            ).toBe(true);
          });
        }
      );
    });

    // ===========================================================================
    // Rule: Convex components mount correctly
    // ===========================================================================

    Rule("Convex components mount correctly", ({ RuleScenario }) => {
      RuleScenario("Rate limiter component creates tables", ({ Given, When, Then, And }) => {
        Given("convex.config.ts includes rate limiter component", () => {
          // The rate limiter component is mounted in convex.config.ts
          state.currentTestId = generateTestId(`mount-ratelimiter-${Date.now()}`);
        });

        When("deployment runs", async () => {
          // Deployment already happened - test by accessing the API
          state.mountingResult = await testQuery(state.t!, verifyComponentMounting, {});
        });

        Then("rate limiter internal tables should exist", () => {
          expect(state.mountingResult).not.toBeNull();
          // If we can access the rate limiter API, tables exist
          expect(state.mountingResult!.rateLimiterAccessible).toBe(true);
        });

        And("rate limiter API should be accessible", () => {
          expect(state.mountingResult!.rateLimiterAccessible).toBe(true);
        });
      });

      RuleScenario("Multiple Workpools can coexist", ({ Given, And, When, Then }) => {
        Given("convex.config.ts includes projectionPool", () => {
          // projectionPool is mounted in convex.config.ts
        });

        And("convex.config.ts includes dcbRetryPool", () => {
          // dcbRetryPool is mounted in convex.config.ts
          state.currentTestId = generateTestId(`multi-workpool-${Date.now()}`);
        });

        When("deployment runs", async () => {
          state.mountingResult = await testQuery(state.t!, verifyComponentMounting, {});
        });

        Then("both Workpools should have independent state", () => {
          expect(state.mountingResult!.workpoolsIndependent).toBe(true);
        });

        And("both should be addressable by name", () => {
          expect(state.mountingResult!.dcbPoolAddressable).toBe(true);
          expect(state.mountingResult!.projPoolAddressable).toBe(true);
        });
      });
    });
  }
);
