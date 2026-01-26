/**
 * Rate Limit Adapter - Step Definitions
 *
 * BDD step definitions for rate limit adapter behavior:
 * - Convex rate limiter integration
 * - Request allowance within limits
 * - Request rejection when exceeded
 * - Key isolation for independent limits
 *
 * @since Phase 18a (DurableFunctionAdapters)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// Import modules under test
import {
  createConvexRateLimitAdapter,
  type RateLimiterLike,
  type RateLimiterResult,
} from "../../../src/middleware/rateLimitAdapter.js";
import type { RateLimitChecker, RateLimitResult } from "../../../src/middleware/types.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  rateLimiter: MockRateLimiter | null;
  adapter: RateLimitChecker | null;
  adapterFactory: ((ctx: unknown) => RateLimitChecker) | null;
  result: RateLimitResult | null;
  requestCounts: Map<string, number>;
  limitName: string;
  limitConfig: {
    requestsPerMinute: number;
  };
  ctx: unknown;
}

function createInitialState(): TestState {
  return {
    rateLimiter: null,
    adapter: null,
    adapterFactory: null,
    result: null,
    requestCounts: new Map(),
    limitName: "testLimit",
    limitConfig: {
      requestsPerMinute: 10,
    },
    ctx: {},
  };
}

let state: TestState = createInitialState();

function resetState(): void {
  state = createInitialState();
}

// =============================================================================
// Mocks
// =============================================================================

interface MockRateLimiter extends RateLimiterLike {
  setRequestCount: (key: string, count: number) => void;
  getRequestCount: (key: string) => number;
  limit: ReturnType<typeof vi.fn>;
}

function createMockRateLimiter(requestsPerMinute: number): MockRateLimiter {
  const requestCounts = new Map<string, number>();

  const limitFn = vi.fn(
    async (
      _ctx: unknown,
      _name: string,
      options?: { key?: string }
    ): Promise<RateLimiterResult> => {
      const key = options?.key ?? "default";
      const currentCount = requestCounts.get(key) ?? 0;

      // Increment count (simulating a request)
      requestCounts.set(key, currentCount + 1);

      if (currentCount >= requestsPerMinute) {
        // Rate limited
        return {
          ok: false,
          retryAfter: 60000, // 1 minute in ms
        };
      }

      // Allowed
      return { ok: true };
    }
  );

  return {
    limit: limitFn,
    setRequestCount: (key: string, count: number) => {
      requestCounts.set(key, count);
    },
    getRequestCount: (key: string) => requestCounts.get(key) ?? 0,
  };
}

// =============================================================================
// Rate Limit Adapter Feature
// =============================================================================

const rateLimitAdapterFeature = await loadFeature(
  "tests/features/behavior/durable-function-adapters/rate-limit-adapter.feature"
);

describeFeature(rateLimitAdapterFeature, ({ Rule, Background, AfterEachScenario }) => {
  // Note: Background runs BEFORE BeforeEachScenario in vitest-cucumber,
  // so we do the setup in Background and reset in AfterEachScenario

  AfterEachScenario(() => {
    vi.clearAllMocks();
    resetState();
  });

  Background(({ Given }) => {
    Given('rate limit "testLimit" is configured with 10 requests per minute', () => {
      // Create rate limiter and adapter in single step
      // Note: vitest-cucumber has issues with {int} params in Background with Rules
      const requestsPerMinute = 10;
      state.limitConfig.requestsPerMinute = requestsPerMinute;
      state.rateLimiter = createMockRateLimiter(requestsPerMinute);
      state.adapterFactory = createConvexRateLimitAdapter(state.rateLimiter, state.limitName);
      state.adapter = state.adapterFactory(state.ctx);
    });
  });

  // =========================================================================
  // Happy Path - Adapter implements RateLimitChecker interface
  // =========================================================================

  Rule("Adapter implements RateLimitChecker interface", ({ RuleScenario }) => {
    RuleScenario("Adapter allows request within rate limit", ({ Given, When, Then, And }) => {
      Given('5 requests have been made for key "user:alice"', () => {
        state.rateLimiter!.setRequestCount("user:alice", 5);
      });

      When('checking rate limit for key "user:alice"', async () => {
        state.result = await state.adapter!("user:alice");
      });

      Then("the result should have allowed = true", () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.allowed).toBe(true);
      });

      And("retryAfterMs should be undefined", () => {
        expect(state.result!.retryAfterMs).toBeUndefined();
      });
    });

    RuleScenario("Adapter rejects request exceeding rate limit", ({ Given, When, Then, And }) => {
      Given('10 requests have been made for key "user:alice"', () => {
        state.rateLimiter!.setRequestCount("user:alice", 10);
      });

      When('checking rate limit for key "user:alice"', async () => {
        state.result = await state.adapter!("user:alice");
      });

      Then("the result should have allowed = false", () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.allowed).toBe(false);
      });

      And("retryAfterMs should be greater than 0", () => {
        expect(state.result!.retryAfterMs).toBeDefined();
        expect(state.result!.retryAfterMs).toBeGreaterThan(0);
      });
    });
  });

  // =========================================================================
  // Key Isolation - Rate limits are isolated by key
  // =========================================================================

  Rule("Rate limits are isolated by key", ({ RuleScenario }) => {
    RuleScenario("Different keys have independent limits", ({ Given, When, Then }) => {
      Given('user "alice" has exhausted her rate limit', () => {
        // Set alice's count at the limit
        state.rateLimiter!.setRequestCount("user:alice", state.limitConfig.requestsPerMinute);
      });

      When('checking rate limit for key "user:bob"', async () => {
        state.result = await state.adapter!("user:bob");
      });

      Then("the result should have allowed = true", () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.allowed).toBe(true);
      });
    });

    RuleScenario(
      "Same user different command types have independent limits",
      ({ Given, When, Then }) => {
        Given('user "alice" has exhausted limit for "commandA"', () => {
          // Set alice's count for commandA at the limit
          state.rateLimiter!.setRequestCount(
            "user:alice:commandA",
            state.limitConfig.requestsPerMinute
          );
        });

        When('checking rate limit for "user:alice:commandB"', async () => {
          state.result = await state.adapter!("user:alice:commandB");
        });

        Then("the result should have allowed = true", () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.allowed).toBe(true);
        });
      }
    );
  });
});
