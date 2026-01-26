/**
 * Rate Limit Adapter - Step Definitions
 *
 * Integration test steps for validating the ConvexRateLimitAdapter
 * that bridges the RateLimitChecker interface to @convex-dev/rate-limiter.
 *
 * @libar-docs
 * @libar-docs-pattern DurableFunctionAdapters
 * @libar-docs-status active
 * @libar-docs-infra
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { makeFunctionReference } from "convex/server";
import type { SafeMutationRef } from "../../../src/types/function-references.js";
import { testRunId, withPrefix, testMutation } from "../../../src/testing/index.js";

// =============================================================================
// Test Function References (TS2589 prevention)
//
// Using makeFunctionReference at module level avoids deep type instantiation
// that occurs when accessing api.testing.rateLimitTest.* at call sites.
// =============================================================================

const checkRateLimit = makeFunctionReference<"mutation">(
  "testing/rateLimitTest:checkRateLimit"
) as SafeMutationRef;

const consumeRateLimitTokens = makeFunctionReference<"mutation">(
  "testing/rateLimitTest:consumeRateLimitTokens"
) as SafeMutationRef;

// =============================================================================
// Test State
// =============================================================================

interface RateLimitTestState {
  t: ConvexTestingHelper | null;
  lastResult: { allowed: boolean; retryAfterMs?: number } | null;
  lastError: Error | null;
  currentKey: string | null;
  consumeResult: {
    consumed: number;
    finalResult: { allowed: boolean; retryAfterMs?: number };
    allAllowed: boolean;
  } | null;
}

let state: RateLimitTestState;

function resetState(): void {
  state = {
    t: null,
    lastResult: null,
    lastError: null,
    currentKey: null,
    consumeResult: null,
  };
}

/**
 * Generate a test-isolated key with testRunId prefix.
 * Ensures rate limit state doesn't collide between test runs.
 */
function generateTestKey(baseKey: string): string {
  return withPrefix(baseKey);
}

// =============================================================================
// Feature Loading
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/durable-function-adapters/rate-limit-adapter.feature"
);

// =============================================================================
// Feature Implementation
// =============================================================================

describeFeature(feature, ({ Background, Rule, BeforeAllScenarios, AfterAllScenarios }) => {
  BeforeAllScenarios(async () => {
    resetState();
    // Initialize ConvexTestingHelper with the integration test backend
    // Uses port 3210 (app integration tests) by default
    const backendUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
    state.t = new ConvexTestingHelper({ backendUrl });
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
    Given(
      "rate limit {string} is configured with {int} requests per minute",
      (_ctx: unknown, limitName: string, rate: number) => {
        // The rate limiter is mounted in convex.config.ts
        // testLimit is configured in rateLimits.ts with 10 requests per minute
        expect(state.t).not.toBeNull();
        expect(limitName).toBe("testLimit");
        expect(rate).toBe(10);
      }
    );
  });

  // ===========================================================================
  // Rule: Adapter implements RateLimitChecker interface
  // ===========================================================================

  Rule("Adapter implements RateLimitChecker interface", ({ RuleScenario }) => {
    RuleScenario("Adapter allows request within rate limit", ({ Given, When, Then, And }) => {
      Given(
        "{int} requests have been made for key {string}",
        async (_ctx: unknown, count: number, key: string) => {
          const testKey = generateTestKey(key);
          state.currentKey = testKey;

          // Consume some tokens (but stay under the limit)
          if (count > 0) {
            state.consumeResult = await testMutation(state.t!, consumeRateLimitTokens, {
              limitName: "testLimit",
              key: testKey,
              count,
            });
            // All requests should be allowed when under limit
            expect(state.consumeResult.allAllowed).toBe(true);
          }
        }
      );

      When("checking rate limit for key {string}", async (_ctx: unknown, key: string) => {
        const testKey = key.startsWith(testRunId) ? key : generateTestKey(key);
        state.currentKey = testKey;

        try {
          state.lastResult = await testMutation(state.t!, checkRateLimit, {
            limitName: "testLimit",
            key: testKey,
          });
          state.lastError = null;
        } catch (error) {
          state.lastError = error as Error;
          state.lastResult = null;
        }
      });

      Then("the result should have allowed = true", () => {
        expect(state.lastError).toBeNull();
        expect(state.lastResult).not.toBeNull();
        expect(state.lastResult!.allowed).toBe(true);
      });

      And("retryAfterMs should be undefined", () => {
        expect(state.lastResult!.retryAfterMs).toBeUndefined();
      });
    });

    RuleScenario("Adapter rejects request exceeding rate limit", ({ Given, When, Then, And }) => {
      Given(
        "{int} requests have been made for key {string}",
        async (_ctx: unknown, count: number, key: string) => {
          const testKey = generateTestKey(key);
          state.currentKey = testKey;

          // Consume all available tokens (exactly at the limit)
          state.consumeResult = await testMutation(state.t!, consumeRateLimitTokens, {
            limitName: "testLimit",
            key: testKey,
            count,
          });
          // All tokens should be consumed by exactly hitting the limit
          // Note: The last request might already be rejected depending on timing
        }
      );

      When("checking rate limit for key {string}", async (_ctx: unknown, key: string) => {
        const testKey = key.startsWith(testRunId) ? key : generateTestKey(key);
        state.currentKey = testKey;

        try {
          state.lastResult = await testMutation(state.t!, checkRateLimit, {
            limitName: "testLimit",
            key: testKey,
          });
          state.lastError = null;
        } catch (error) {
          state.lastError = error as Error;
          state.lastResult = null;
        }
      });

      Then("the result should have allowed = false", () => {
        expect(state.lastError).toBeNull();
        expect(state.lastResult).not.toBeNull();
        expect(state.lastResult!.allowed).toBe(false);
      });

      And("retryAfterMs should be greater than 0", () => {
        expect(state.lastResult!.retryAfterMs).toBeDefined();
        expect(state.lastResult!.retryAfterMs).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================================================
  // Rule: Rate limits are isolated by key
  // ===========================================================================

  Rule("Rate limits are isolated by key", ({ RuleScenario }) => {
    RuleScenario("Different keys have independent limits", ({ Given, When, Then }) => {
      Given(
        "user {string} has exhausted her rate limit",
        async (_ctx: unknown, username: string) => {
          const testKey = generateTestKey(`user:${username}`);
          state.currentKey = testKey;

          // Exhaust the limit for this user
          state.consumeResult = await testMutation(state.t!, consumeRateLimitTokens, {
            limitName: "testLimit",
            key: testKey,
            count: 10, // Exactly at limit
          });

          // Verify the limit is exhausted by making one more request
          const checkResult = await testMutation(state.t!, checkRateLimit, {
            limitName: "testLimit",
            key: testKey,
          });
          expect(checkResult.allowed).toBe(false);
        }
      );

      When("checking rate limit for key {string}", async (_ctx: unknown, key: string) => {
        const testKey = generateTestKey(key);
        state.currentKey = testKey;

        try {
          state.lastResult = await testMutation(state.t!, checkRateLimit, {
            limitName: "testLimit",
            key: testKey,
          });
          state.lastError = null;
        } catch (error) {
          state.lastError = error as Error;
          state.lastResult = null;
        }
      });

      Then("the result should have allowed = true", () => {
        expect(state.lastError).toBeNull();
        expect(state.lastResult).not.toBeNull();
        expect(state.lastResult!.allowed).toBe(true);
      });
    });

    RuleScenario(
      "Same user different command types have independent limits",
      ({ Given, When, Then }) => {
        Given(
          "user {string} has exhausted limit for {string}",
          async (_ctx: unknown, username: string, commandType: string) => {
            // Use a composite key: user:username:commandType
            const testKey = generateTestKey(`user:${username}:${commandType}`);
            state.currentKey = testKey;

            // Exhaust the limit for this user + command combination
            state.consumeResult = await testMutation(state.t!, consumeRateLimitTokens, {
              limitName: "testLimit",
              key: testKey,
              count: 10, // Exactly at limit
            });

            // Verify the limit is exhausted
            const checkResult = await testMutation(state.t!, checkRateLimit, {
              limitName: "testLimit",
              key: testKey,
            });
            expect(checkResult.allowed).toBe(false);
          }
        );

        When("checking rate limit for {string}", async (_ctx: unknown, key: string) => {
          const testKey = generateTestKey(key);
          state.currentKey = testKey;

          try {
            state.lastResult = await testMutation(state.t!, checkRateLimit, {
              limitName: "testLimit",
              key: testKey,
            });
            state.lastError = null;
          } catch (error) {
            state.lastError = error as Error;
            state.lastResult = null;
          }
        });

        Then("the result should have allowed = true", () => {
          expect(state.lastError).toBeNull();
          expect(state.lastResult).not.toBeNull();
          expect(state.lastResult!.allowed).toBe(true);
        });
      }
    );
  });
});
