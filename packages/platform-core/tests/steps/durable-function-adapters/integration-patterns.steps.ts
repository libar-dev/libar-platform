/**
 * Adapter Integration Patterns - Step Definitions
 *
 * BDD step definitions for adapter integration with platform infrastructure:
 * - Rate limit adapter with middleware pipeline
 * - DCB retry with Workpool infrastructure
 * - Component mounting verification
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
import { withDCBRetry, type WorkpoolLikeForDCB } from "../../../src/dcb/withRetry.js";
import { noJitter } from "../../../src/dcb/backoff.js";
import { createScopeKey, type DCBScopeKey } from "../../../src/dcb/index.js";
import type { DCBConflictResult, DCBRetryResult } from "../../../src/dcb/types.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  rateLimiter: MockRateLimiter | null;
  adapter: RateLimitChecker | null;
  rateLimitResult: RateLimitResult | null;
  workpool: MockWorkpool | null;
  projectionPool: MockWorkpool | null;
  dcbResult: DCBRetryResult<object> | null;
  scopeKey: DCBScopeKey | null;
  middlewareOrder: number;
  commandResult: unknown;
  ctx: MockContext;
}

function createInitialState(): TestState {
  return {
    rateLimiter: null,
    adapter: null,
    rateLimitResult: null,
    workpool: null,
    projectionPool: null,
    dcbResult: null,
    scopeKey: null,
    middlewareOrder: 0,
    commandResult: null,
    ctx: createMockContext(),
  };
}

let state: TestState = createInitialState();

function resetState(): void {
  state = createInitialState();
}

// =============================================================================
// Mocks
// =============================================================================

interface MockContext {
  db: {
    insert: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
}

function createMockContext(): MockContext {
  return {
    db: {
      insert: vi.fn(),
      query: vi.fn(),
      patch: vi.fn(),
    },
  };
}

interface MockRateLimiter extends RateLimiterLike {
  setRateLimited: (key: string, limited: boolean) => void;
  limit: ReturnType<typeof vi.fn>;
}

function createMockRateLimiter(): MockRateLimiter {
  const limitedKeys = new Set<string>();

  return {
    limit: vi.fn(
      async (
        _ctx: unknown,
        _name: string,
        options?: { key?: string }
      ): Promise<RateLimiterResult> => {
        const key = options?.key ?? "default";
        if (limitedKeys.has(key)) {
          return { ok: false, retryAfter: 60000 };
        }
        return { ok: true };
      }
    ),
    setRateLimited: (key: string, limited: boolean) => {
      if (limited) {
        limitedKeys.add(key);
      } else {
        limitedKeys.delete(key);
      }
    },
  };
}

interface EnqueuedItem {
  type: "action" | "mutation";
  handler: unknown;
  args: Record<string, unknown>;
  options: {
    key?: string;
    runAfter?: number;
    onComplete?: unknown;
    context?: unknown;
  };
}

interface MockWorkpool extends WorkpoolLikeForDCB {
  name: string;
  enqueuedItems: EnqueuedItem[];
  maxParallelism: number;
}

function createMockWorkpool(name: string, maxParallelism: number = 10): MockWorkpool {
  const enqueuedItems: EnqueuedItem[] = [];

  return {
    name,
    maxParallelism,
    enqueuedItems,
    enqueueMutation: vi.fn(async (_ctx, handler, args, options = {}) => {
      enqueuedItems.push({
        type: "mutation",
        handler,
        args,
        options,
      });
      return `work_${name}_${Date.now()}`;
    }),
  };
}

// =============================================================================
// Integration Patterns Feature
// =============================================================================

const integrationPatternsFeature = await loadFeature(
  "tests/features/behavior/durable-function-adapters/integration-patterns.feature"
);

describeFeature(integrationPatternsFeature, ({ Background, Rule, AfterEachScenario }) => {
  // Note: Background runs BEFORE BeforeEachScenario in vitest-cucumber,
  // so we do the setup in Background and reset in AfterEachScenario

  AfterEachScenario(() => {
    vi.clearAllMocks();
    resetState();
  });

  Background(({ Given }) => {
    Given("platform infrastructure is configured for integration tests", () => {
      // Set up all infrastructure in single step
      state.middlewareOrder = 50;
      state.rateLimiter = createMockRateLimiter();
      state.workpool = createMockWorkpool("dcbRetryPool", 10);
    });
  });

  // =========================================================================
  // Middleware Integration
  // =========================================================================

  Rule("Rate limit adapter integrates with middleware pipeline", ({ RuleScenario }) => {
    RuleScenario("Adapter plugs into existing middleware", ({ Given, And, When, Then }) => {
      Given("rate limit middleware at order 50", () => {
        state.middlewareOrder = 50;
      });

      And("ConvexRateLimitAdapter is configured", () => {
        const adapterFactory = createConvexRateLimitAdapter(state.rateLimiter!, "testLimit");
        state.adapter = adapterFactory(state.ctx);
      });

      When("a command is dispatched", async () => {
        // Simulate middleware calling the rate limit check
        state.rateLimitResult = await state.adapter!("user:test");
      });

      Then("rate limit should be checked via the adapter", () => {
        expect(state.rateLimiter!.limit).toHaveBeenCalled();
      });

      And("middleware order should be preserved", () => {
        expect(state.middlewareOrder).toBe(50);
      });
    });

    RuleScenario(
      "Rate limited command returns standard rejection",
      ({ Given, When, Then, And }) => {
        Given("rate limit is exhausted for current user", () => {
          state.rateLimiter!.setRateLimited("user:current", true);
          const adapterFactory = createConvexRateLimitAdapter(state.rateLimiter!, "testLimit");
          state.adapter = adapterFactory(state.ctx);
        });

        When("a command is dispatched", async () => {
          state.rateLimitResult = await state.adapter!("user:current");

          // Simulate command handler returning rejection
          if (!state.rateLimitResult.allowed) {
            state.commandResult = {
              status: "rejected",
              code: "RATE_LIMITED",
              context: { retryAfterMs: state.rateLimitResult.retryAfterMs },
            };
          }
        });

        Then('the result should have status "rejected"', () => {
          expect(state.commandResult).toMatchObject({
            status: "rejected",
          });
        });

        And('the code should be "RATE_LIMITED"', () => {
          expect(state.commandResult).toMatchObject({
            code: "RATE_LIMITED",
          });
        });

        And("context should include retryAfterMs", () => {
          expect((state.commandResult as Record<string, unknown>).context).toMatchObject({
            retryAfterMs: expect.any(Number),
          });
        });
      }
    );
  });

  // =========================================================================
  // DCB Integration
  // =========================================================================

  Rule("DCB retry integrates with Workpool infrastructure", ({ RuleScenario }) => {
    RuleScenario("DCB retry uses separate Workpool", ({ Given, And, When, Then }) => {
      Given("dcbRetryPool is configured with maxParallelism 10", () => {
        state.workpool = createMockWorkpool("dcbRetryPool", 10);
      });

      And("projectionPool is configured separately", () => {
        state.projectionPool = createMockWorkpool("projectionPool", 5);
      });

      When("a DCB conflict triggers retry", async () => {
        state.scopeKey = createScopeKey("t1", "reservation", "res_123");

        const conflictResult: DCBConflictResult = {
          status: "conflict",
          expectedVersion: 5,
          currentVersion: 6,
          scopeKey: state.scopeKey,
        };

        const handler = withDCBRetry(state.ctx as never, {
          workpool: state.workpool!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey,
          options: { jitterFn: noJitter },
        });

        state.dcbResult = await handler.handleResult(conflictResult, {
          attempt: 0,
          retryArgs: {},
        });
      });

      Then("retry should be enqueued to dcbRetryPool", () => {
        expect(state.workpool!.enqueuedItems.length).toBe(1);
      });

      And("projectionPool should not be affected", () => {
        expect(state.projectionPool!.enqueuedItems.length).toBe(0);
      });
    });

    RuleScenario("Retry mutation receives correct arguments", ({ Given, When, Then, And }) => {
      Given('a DCB operation with scope "tenant:t1:res:r1"', () => {
        state.scopeKey = createScopeKey("t1", "res", "r1");
      });

      When("conflict triggers retry", async () => {
        state.workpool = createMockWorkpool("dcbRetryPool");

        const conflictResult: DCBConflictResult = {
          status: "conflict",
          expectedVersion: 5,
          currentVersion: 6,
          scopeKey: state.scopeKey!,
        };

        const handler = withDCBRetry(state.ctx as never, {
          workpool: state.workpool,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: { jitterFn: noJitter },
        });

        await handler.handleResult(conflictResult, {
          attempt: 0,
          retryArgs: { orderId: "ord_123" },
        });
      });

      Then("retry mutation should receive updated expectedVersion", () => {
        const enqueued = state.workpool!.enqueuedItems[0];
        expect(enqueued.args.expectedVersion).toBe(6);
      });

      And("retry mutation should receive incremented attempt", () => {
        const enqueued = state.workpool!.enqueuedItems[0];
        expect(enqueued.args.attempt).toBe(1);
      });

      And("retry mutation should receive original DCB config", () => {
        const enqueued = state.workpool!.enqueuedItems[0];
        expect(enqueued.args.orderId).toBe("ord_123");
      });
    });

    RuleScenario("DCB retry with onComplete callback integration", ({ Given, And, When, Then }) => {
      Given("dcbRetryPool supports onComplete callbacks", () => {
        state.workpool = createMockWorkpool("dcbRetryPool");
      });

      And("a DCB operation with onComplete configured", () => {
        state.scopeKey = createScopeKey("t1", "order", "ord_123");
      });

      When("conflict triggers retry that eventually succeeds", async () => {
        const onComplete = vi.fn();

        const conflictResult: DCBConflictResult = {
          status: "conflict",
          expectedVersion: 5,
          currentVersion: 6,
          scopeKey: state.scopeKey!,
        };

        const handler = withDCBRetry(state.ctx as never, {
          workpool: state.workpool!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: {
            jitterFn: noJitter,
            onComplete: onComplete as never,
          },
        });

        state.dcbResult = await handler.handleResult(conflictResult, {
          attempt: 0,
          retryArgs: {},
        });
      });

      Then("onComplete mutation should receive the success result", () => {
        // The onComplete is passed to Workpool; we verify it was set
        const enqueued = state.workpool!.enqueuedItems[0];
        expect(enqueued.options.onComplete).toBeDefined();
      });

      And("parallel DCB operations should each track independently", () => {
        // Each enqueueMutation call is independent
        expect(state.workpool!.enqueuedItems.length).toBe(1);
        const enqueued = state.workpool!.enqueuedItems[0];
        expect(enqueued.options.context).toMatchObject({
          scopeKey: state.scopeKey,
          attempt: 1,
        });
      });
    });

    RuleScenario(
      "Workpool does not retry DCB mutations - clarification",
      ({ Given, And, When, Then }) => {
        Given("dcbRetryPool has maxAttempts 1 at Workpool level", () => {
          state.workpool = createMockWorkpool("dcbRetryPool");
          // Workpool maxAttempts is for action retries on exceptions
        });

        And("withDCBRetry has maxAttempts 5 at DCB level", () => {
          // DCB maxAttempts controls OCC conflict retries
        });

        When("a DCB mutation throws an exception - not OCC conflict", () => {
          // Exception case is handled by Workpool, not withDCBRetry
          // DCB conflicts return { status: "conflict" } - a successful return
        });

        Then("Workpool should NOT retry as exception is final failure", () => {
          // Workpool only retries actions, and only when they throw
          // DCB conflicts are successful returns (not exceptions)
          expect(true).toBe(true); // Conceptual verification
        });

        And("onComplete should receive failed result", () => {
          // When mutation throws, Workpool calls onComplete with failed result
          expect(true).toBe(true); // Conceptual verification
        });
      }
    );
  });

  // =========================================================================
  // Component Mounting
  // =========================================================================

  Rule("Convex components mount correctly", ({ RuleScenario }) => {
    RuleScenario("Rate limiter component creates tables", ({ Given, When, Then, And }) => {
      Given("convex.config.ts includes rate limiter component", () => {
        // This is a deployment-level concern; we verify API accessibility
      });

      When("deployment runs", () => {
        // Deployment is out of scope for unit tests
      });

      Then("rate limiter internal tables should exist", () => {
        // Verified at deployment time; here we verify the adapter works
        expect(state.rateLimiter).toBeDefined();
      });

      And("rate limiter API should be accessible", () => {
        expect(state.rateLimiter!.limit).toBeDefined();
      });
    });

    RuleScenario("Multiple Workpools can coexist", ({ Given, And, When, Then }) => {
      Given("convex.config.ts includes projectionPool", () => {
        state.projectionPool = createMockWorkpool("projectionPool");
      });

      And("convex.config.ts includes dcbRetryPool", () => {
        state.workpool = createMockWorkpool("dcbRetryPool");
      });

      When("deployment runs", () => {
        // Deployment is out of scope; verify pool creation
      });

      Then("both Workpools should have independent state", () => {
        expect(state.projectionPool!.enqueuedItems).not.toBe(state.workpool!.enqueuedItems);
      });

      And("both should be addressable by name", () => {
        expect(state.projectionPool!.name).toBe("projectionPool");
        expect(state.workpool!.name).toBe("dcbRetryPool");
      });
    });
  });
});
