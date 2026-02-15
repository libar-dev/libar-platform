/**
 * MiddlewarePipeline - Step Definitions
 *
 * BDD step definitions for middleware pipeline orchestration:
 * - Registration, removal, existence checks
 * - Before/after hook execution ordering
 * - Short-circuiting and context passing
 * - Error handling for hooks and handlers
 * - Lifecycle operations (clear, clone)
 * - Factory function
 *
 * Mechanical migration from tests/unit/middleware/MiddlewarePipeline.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  MiddlewarePipeline,
  createMiddlewarePipeline,
} from "../../../src/middleware/MiddlewarePipeline.js";
import type { MiddlewareContext } from "../../../src/middleware/types.js";
import type { CommandHandlerResult } from "../../../src/orchestration/types.js";
import type { MiddlewareCommandInfo } from "../../../src/middleware/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Helpers
// =============================================================================

function createMockCommandInfo(
  overrides: Partial<MiddlewareCommandInfo> = {}
): MiddlewareCommandInfo {
  return {
    type: "CreateOrder",
    boundedContext: "orders",
    category: "aggregate",
    args: { orderId: "ord_123" },
    commandId: "cmd_456",
    correlationId: "corr_789",
    ...overrides,
  };
}

function createSuccessResult(): CommandHandlerResult<unknown> {
  return {
    status: "success",
    data: { orderId: "ord_123" },
    version: 1,
    event: {
      eventId: "evt_001",
      eventType: "OrderCreated",
      streamType: "order",
      streamId: "ord_123",
      payload: {},
      metadata: { correlationId: "corr_789", causationId: "cmd_456" },
    },
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  pipeline: MiddlewarePipeline;
  clonedPipeline: MiddlewarePipeline | null;
  factoryResult: MiddlewarePipeline | null;
  executionResult: CommandHandlerResult<unknown> | null;
  removeResult: boolean | null;
  executionOrder: string[];
  capturedContext: MiddlewareContext | null;
  afterHook1Called: boolean;
  afterHook2Called: boolean;
  afterHooksCalled: string[];
  useReturnValue: MiddlewarePipeline | null;
}

function createInitialState(): TestState {
  return {
    pipeline: new MiddlewarePipeline(),
    clonedPipeline: null,
    factoryResult: null,
    executionResult: null,
    removeResult: null,
    executionOrder: [],
    capturedContext: null,
    afterHook1Called: false,
    afterHook2Called: false,
    afterHooksCalled: [],
    useReturnValue: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/middleware/middleware-pipeline.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: use() adds middleware and supports chaining
  // ==========================================================================

  Rule("use() adds middleware and supports chaining", ({ RuleScenario }) => {
    RuleScenario(
      "Adding middleware increases size and returns pipeline for chaining",
      ({ Given, When, Then, And }) => {
        Given("a new middleware pipeline", () => {
          state.pipeline = new MiddlewarePipeline();
        });

        When('I add a middleware named "a" with order 10', () => {
          state.pipeline.use({ name: "a", order: 10 });
        });

        Then("the pipeline size is 1", () => {
          expect(state.pipeline.size()).toBe(1);
        });

        When('I chain a middleware named "b" with order 20', () => {
          state.useReturnValue = state.pipeline.use({ name: "b", order: 20 });
        });

        Then("use returns the pipeline instance", () => {
          expect(state.useReturnValue).toBe(state.pipeline);
        });

        And("the pipeline size is 2", () => {
          expect(state.pipeline.size()).toBe(2);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: remove() removes middleware by name
  // ==========================================================================

  Rule("remove() removes middleware by name", ({ RuleScenario }) => {
    RuleScenario(
      "Removing an existing middleware returns true and decreases size",
      ({ Given, And, When, Then }) => {
        Given("a new middleware pipeline", () => {
          state.pipeline = new MiddlewarePipeline();
        });

        And('middleware "a" with order 10 is registered', () => {
          state.pipeline.use({ name: "a", order: 10 });
        });

        And('middleware "b" with order 20 is registered', () => {
          state.pipeline.use({ name: "b", order: 20 });
        });

        When('I remove the middleware named "a"', () => {
          state.removeResult = state.pipeline.remove("a");
        });

        Then("the remove result is true", () => {
          expect(state.removeResult).toBe(true);
        });

        And("the pipeline size is 1", () => {
          expect(state.pipeline.size()).toBe(1);
        });
      }
    );

    RuleScenario("Removing a non-existent middleware returns false", ({ Given, When, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      When('I remove the middleware named "nonexistent"', () => {
        state.removeResult = state.pipeline.remove("nonexistent");
      });

      Then("the remove result is false", () => {
        expect(state.removeResult).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: has() checks middleware existence
  // ==========================================================================

  Rule("has() checks middleware existence", ({ RuleScenario }) => {
    RuleScenario("has returns true for existing middleware", ({ Given, And, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      And('middleware "test" with order 10 is registered', () => {
        state.pipeline.use({ name: "test", order: 10 });
      });

      Then('has "test" returns true', () => {
        expect(state.pipeline.has("test")).toBe(true);
      });
    });

    RuleScenario("has returns false for non-existent middleware", ({ Given, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      Then('has "nonexistent" returns false', () => {
        expect(state.pipeline.has("nonexistent")).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: getMiddlewareNames returns names sorted by order
  // ==========================================================================

  Rule("getMiddlewareNames returns names sorted by order", ({ RuleScenario }) => {
    RuleScenario("Names are returned sorted by order", ({ Given, And, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      And('middleware "c" with order 30 is registered', () => {
        state.pipeline.use({ name: "c", order: 30 });
      });

      And('middleware "a" with order 10 is registered', () => {
        state.pipeline.use({ name: "a", order: 10 });
      });

      And('middleware "b" with order 20 is registered', () => {
        state.pipeline.use({ name: "b", order: 20 });
      });

      Then("getMiddlewareNames returns:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ name: string }>(dataTable);
        const expectedNames = rows.map((r) => r.name);
        expect(state.pipeline.getMiddlewareNames()).toEqual(expectedNames);
      });
    });
  });

  // ==========================================================================
  // Rule: execute() runs handler when no middlewares are registered
  // ==========================================================================

  Rule("execute() runs handler when no middlewares are registered", ({ RuleScenario }) => {
    RuleScenario("Handler executes directly with empty pipeline", ({ Given, When, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      When("I execute with no middlewares and a success handler", async () => {
        state.executionResult = await state.pipeline.execute(
          createMockCommandInfo(),
          {},
          async () => createSuccessResult()
        );
      });

      Then('the execution result status is "success"', () => {
        expect(state.executionResult!.status).toBe("success");
      });
    });
  });

  // ==========================================================================
  // Rule: Before hooks execute in ascending order
  // ==========================================================================

  Rule("Before hooks execute in ascending order", ({ RuleScenario }) => {
    RuleScenario("Before hooks run in order 10 then 20", ({ Given, And, When, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      And('a before-hook middleware "first" with order 10 that records its name', () => {
        state.pipeline.use({
          name: "first",
          order: 10,
          before: async (ctx) => {
            state.executionOrder.push("first");
            return { continue: true, ctx };
          },
        });
      });

      And('a before-hook middleware "second" with order 20 that records its name', () => {
        state.pipeline.use({
          name: "second",
          order: 20,
          before: async (ctx) => {
            state.executionOrder.push("second");
            return { continue: true, ctx };
          },
        });
      });

      When("I execute the pipeline with a success handler", async () => {
        state.executionResult = await state.pipeline.execute(
          createMockCommandInfo(),
          {},
          async () => createSuccessResult()
        );
      });

      Then("the recorded execution order is:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ name: string }>(dataTable);
        const expectedOrder = rows.map((r) => r.name);
        expect(state.executionOrder).toEqual(expectedOrder);
      });
    });
  });

  // ==========================================================================
  // Rule: After hooks execute in reverse order
  // ==========================================================================

  Rule("After hooks execute in reverse order", ({ RuleScenario }) => {
    RuleScenario("After hooks run in order 20 then 10", ({ Given, And, When, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      And('an after-hook middleware "first" with order 10 that records its name', () => {
        state.pipeline.use({
          name: "first",
          order: 10,
          after: async (_afterCtx, result) => {
            state.executionOrder.push("first");
            return result;
          },
        });
      });

      And('an after-hook middleware "second" with order 20 that records its name', () => {
        state.pipeline.use({
          name: "second",
          order: 20,
          after: async (_afterCtx, result) => {
            state.executionOrder.push("second");
            return result;
          },
        });
      });

      When("I execute the pipeline with a success handler", async () => {
        state.executionResult = await state.pipeline.execute(
          createMockCommandInfo(),
          {},
          async () => createSuccessResult()
        );
      });

      Then("the recorded execution order is:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ name: string }>(dataTable);
        const expectedOrder = rows.map((r) => r.name);
        expect(state.executionOrder).toEqual(expectedOrder);
      });
    });
  });

  // ==========================================================================
  // Rule: Before hook short-circuits on continue false
  // ==========================================================================

  Rule("Before hook short-circuits on continue false", ({ RuleScenario }) => {
    RuleScenario(
      "Short-circuit prevents subsequent middleware execution",
      ({ Given, And, When, Then }) => {
        Given("a new middleware pipeline", () => {
          state.pipeline = new MiddlewarePipeline();
        });

        And(
          'a before-hook middleware "validator" with order 10 that short-circuits with VALIDATION_ERROR',
          () => {
            state.pipeline.use({
              name: "validator",
              order: 10,
              before: async () => {
                state.executionOrder.push("validator");
                return {
                  continue: false,
                  result: {
                    status: "rejected" as const,
                    code: "VALIDATION_ERROR",
                    reason: "Invalid input",
                  },
                };
              },
            });
          }
        );

        And('a before-hook middleware "auth" with order 20 that records its name', () => {
          state.pipeline.use({
            name: "auth",
            order: 20,
            before: async (ctx) => {
              state.executionOrder.push("auth");
              return { continue: true, ctx };
            },
          });
        });

        When("I execute the pipeline with a success handler", async () => {
          state.executionResult = await state.pipeline.execute(
            createMockCommandInfo(),
            {},
            async () => createSuccessResult()
          );
        });

        Then('the execution result status is "rejected"', () => {
          expect(state.executionResult!.status).toBe("rejected");
        });

        And("the recorded execution order contains only:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string }>(dataTable);
          const expectedOrder = rows.map((r) => r.name);
          expect(state.executionOrder).toEqual(expectedOrder);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Context passes between before hooks
  // ==========================================================================

  Rule("Context passes between before hooks", ({ RuleScenario }) => {
    RuleScenario(
      "Enricher middleware passes custom context to subsequent middleware",
      ({ Given, And, When, Then }) => {
        Given("a new middleware pipeline", () => {
          state.pipeline = new MiddlewarePipeline();
        });

        And(
          'a before-hook middleware "enricher" with order 10 that sets custom.enriched to true',
          () => {
            state.pipeline.use({
              name: "enricher",
              order: 10,
              before: async (ctx) => {
                return {
                  continue: true,
                  ctx: {
                    ...ctx,
                    custom: { ...ctx.custom, enriched: true },
                  },
                };
              },
            });
          }
        );

        And('a before-hook middleware "checker" with order 20 that captures the context', () => {
          state.pipeline.use({
            name: "checker",
            order: 20,
            before: async (ctx) => {
              state.capturedContext = ctx;
              return { continue: true, ctx };
            },
          });
        });

        When("I execute the pipeline with a success handler", async () => {
          state.executionResult = await state.pipeline.execute(
            createMockCommandInfo(),
            {},
            async () => createSuccessResult()
          );
        });

        Then("the captured context has custom.enriched set to true", () => {
          expect((state.capturedContext?.custom as Record<string, unknown>)["enriched"]).toBe(true);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Before hook errors produce MIDDLEWARE_ERROR rejection
  // ==========================================================================

  Rule("Before hook errors produce MIDDLEWARE_ERROR rejection", ({ RuleScenario }) => {
    RuleScenario("Throwing before hook produces middleware error", ({ Given, And, When, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      And(
        'a before-hook middleware "failing" with order 10 that throws "Middleware failed"',
        () => {
          state.pipeline.use({
            name: "failing",
            order: 10,
            before: async () => {
              throw new Error("Middleware failed");
            },
          });
        }
      );

      When("I execute the pipeline with a success handler", async () => {
        state.executionResult = await state.pipeline.execute(
          createMockCommandInfo(),
          {},
          async () => createSuccessResult()
        );
      });

      Then('the execution result status is "rejected"', () => {
        expect(state.executionResult!.status).toBe("rejected");
      });

      And('the rejection code is "MIDDLEWARE_ERROR"', () => {
        if (state.executionResult!.status === "rejected") {
          expect(state.executionResult!.code).toBe("MIDDLEWARE_ERROR");
        }
      });

      And('the rejection reason is "Middleware failed"', () => {
        if (state.executionResult!.status === "rejected") {
          expect(state.executionResult!.reason).toBe("Middleware failed");
        }
      });
    });
  });

  // ==========================================================================
  // Rule: Handler errors produce HANDLER_ERROR rejection
  // ==========================================================================

  Rule("Handler errors produce HANDLER_ERROR rejection", ({ RuleScenario }) => {
    RuleScenario("Throwing handler produces handler error", ({ Given, When, Then, And }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      When('I execute the pipeline with a handler that throws "Handler failed"', async () => {
        state.executionResult = await state.pipeline.execute(
          createMockCommandInfo(),
          {},
          async () => {
            throw new Error("Handler failed");
          }
        );
      });

      Then('the execution result status is "rejected"', () => {
        expect(state.executionResult!.status).toBe("rejected");
      });

      And('the rejection code is "HANDLER_ERROR"', () => {
        if (state.executionResult!.status === "rejected") {
          expect(state.executionResult!.code).toBe("HANDLER_ERROR");
        }
      });

      And('the rejection reason is "Handler failed"', () => {
        if (state.executionResult!.status === "rejected") {
          expect(state.executionResult!.reason).toBe("Handler failed");
        }
      });
    });
  });

  // ==========================================================================
  // Rule: After hook errors do not prevent other after hooks or change result
  // ==========================================================================

  Rule(
    "After hook errors do not prevent other after hooks or change result",
    ({ RuleScenario }) => {
      RuleScenario(
        "Failing after hook does not prevent other after hooks",
        ({ Given, And, When, Then }) => {
          Given("a new middleware pipeline", () => {
            state.pipeline = new MiddlewarePipeline();
          });

          And('an after-hook middleware "failing" with order 10 that throws in after', () => {
            state.pipeline.use({
              name: "failing",
              order: 10,
              after: async (_afterCtx, _result) => {
                state.afterHook1Called = true;
                throw new Error("After hook failed");
              },
            });
          });

          And(
            'an after-hook middleware "succeeding" with order 20 that records its name in after',
            () => {
              state.pipeline.use({
                name: "succeeding",
                order: 20,
                after: async (_afterCtx, result) => {
                  state.afterHook2Called = true;
                  return result;
                },
              });
            }
          );

          When("I execute the pipeline with a success handler", async () => {
            state.executionResult = await state.pipeline.execute(
              createMockCommandInfo(),
              {},
              async () => createSuccessResult()
            );
          });

          Then("both after hooks were called", () => {
            expect(state.afterHook2Called).toBe(true);
            expect(state.afterHook1Called).toBe(true);
          });

          And('the execution result status is "success"', () => {
            expect(state.executionResult!.status).toBe("success");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: Short-circuit runs after hooks only for already-executed middlewares
  // ==========================================================================

  Rule(
    "Short-circuit runs after hooks only for already-executed middlewares",
    ({ RuleScenario }) => {
      RuleScenario(
        "Only pre-short-circuit middleware after hooks run",
        ({ Given, And, When, Then }) => {
          Given("a new middleware pipeline", () => {
            state.pipeline = new MiddlewarePipeline();
          });

          And('a middleware "first" with order 10 and both hooks that records in after', () => {
            state.pipeline.use({
              name: "first",
              order: 10,
              before: async (ctx) => ({ continue: true, ctx }),
              after: async (_afterCtx, result) => {
                state.afterHooksCalled.push("first");
                return result;
              },
            });
          });

          And(
            'a middleware "shortcircuit" with order 20 that short-circuits and records in after',
            () => {
              state.pipeline.use({
                name: "shortcircuit",
                order: 20,
                before: async () => ({
                  continue: false,
                  result: {
                    status: "rejected" as const,
                    code: "TEST",
                    reason: "test",
                  },
                }),
                after: async (_afterCtx, result) => {
                  state.afterHooksCalled.push("shortcircuit");
                  return result;
                },
              });
            }
          );

          And('a middleware "third" with order 30 and both hooks that records in after', () => {
            state.pipeline.use({
              name: "third",
              order: 30,
              before: async (ctx) => ({ continue: true, ctx }),
              after: async (_afterCtx, result) => {
                state.afterHooksCalled.push("third");
                return result;
              },
            });
          });

          When("I execute the pipeline with a success handler", async () => {
            state.executionResult = await state.pipeline.execute(
              createMockCommandInfo(),
              {},
              async () => createSuccessResult()
            );
          });

          Then("the after hooks called are only:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ name: string }>(dataTable);
            const expectedNames = rows.map((r) => r.name);
            expect(state.afterHooksCalled).toEqual(expectedNames);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: clear() removes all middlewares
  // ==========================================================================

  Rule("clear() removes all middlewares", ({ RuleScenario }) => {
    RuleScenario("Clear empties the pipeline", ({ Given, And, When, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      And('middleware "a" with order 10 is registered', () => {
        state.pipeline.use({ name: "a", order: 10 });
      });

      And('middleware "b" with order 20 is registered', () => {
        state.pipeline.use({ name: "b", order: 20 });
      });

      When("I clear the pipeline", () => {
        state.pipeline.clear();
      });

      Then("the pipeline size is 0", () => {
        expect(state.pipeline.size()).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Rule: clone() creates an independent copy
  // ==========================================================================

  Rule("clone() creates an independent copy", ({ RuleScenario }) => {
    RuleScenario("Clone has same middlewares but is independent", ({ Given, And, When, Then }) => {
      Given("a new middleware pipeline", () => {
        state.pipeline = new MiddlewarePipeline();
      });

      And('middleware "a" with order 10 is registered', () => {
        state.pipeline.use({ name: "a", order: 10 });
      });

      And('middleware "b" with order 20 is registered', () => {
        state.pipeline.use({ name: "b", order: 20 });
      });

      When("I clone the pipeline", () => {
        state.clonedPipeline = state.pipeline.clone();
      });

      Then("the cloned pipeline size is 2", () => {
        expect(state.clonedPipeline!.size()).toBe(2);
      });

      And("the cloned pipeline middleware names are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ name: string }>(dataTable);
        const expectedNames = rows.map((r) => r.name);
        expect(state.clonedPipeline!.getMiddlewareNames()).toEqual(expectedNames);
      });

      When('I add a middleware named "c" with order 30 to the clone', () => {
        state.clonedPipeline!.use({ name: "c", order: 30 });
      });

      Then("the original pipeline size is 2", () => {
        expect(state.pipeline.size()).toBe(2);
      });

      And("the cloned pipeline size is 3", () => {
        expect(state.clonedPipeline!.size()).toBe(3);
      });
    });
  });

  // ==========================================================================
  // Rule: createMiddlewarePipeline factory creates instances
  // ==========================================================================

  Rule("createMiddlewarePipeline factory creates instances", ({ RuleScenario }) => {
    RuleScenario("Factory creates pipeline without options", ({ When, Then }) => {
      When("I create a pipeline via factory", () => {
        state.factoryResult = createMiddlewarePipeline();
      });

      Then("the result is a MiddlewarePipeline instance", () => {
        expect(state.factoryResult).toBeInstanceOf(MiddlewarePipeline);
      });
    });

    RuleScenario("Factory creates pipeline with debug option", ({ When, Then }) => {
      When("I create a pipeline via factory with debug true", () => {
        state.factoryResult = createMiddlewarePipeline({ debug: true });
      });

      Then("the result is a MiddlewarePipeline instance", () => {
        expect(state.factoryResult).toBeInstanceOf(MiddlewarePipeline);
      });
    });
  });
});
