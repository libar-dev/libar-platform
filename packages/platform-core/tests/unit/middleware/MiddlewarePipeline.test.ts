/**
 * Unit Tests for MiddlewarePipeline
 *
 * Tests the middleware pipeline orchestration:
 * - Middleware ordering
 * - Before/after hook execution
 * - Short-circuiting
 * - Error handling
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  MiddlewarePipeline,
  createMiddlewarePipeline,
} from "../../../src/middleware/MiddlewarePipeline";
import type {
  Middleware,
  MiddlewareContext,
  MiddlewareCommandInfo,
} from "../../../src/middleware/types";
import type { CommandHandlerResult } from "../../../src/orchestration/types";

// Helper to create a mock command info
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

// Helper to create a success result
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

describe("MiddlewarePipeline", () => {
  let pipeline: MiddlewarePipeline;

  beforeEach(() => {
    pipeline = new MiddlewarePipeline();
  });

  describe("use", () => {
    it("adds middleware to pipeline", () => {
      const middleware: Middleware = {
        name: "test",
        order: 10,
      };
      pipeline.use(middleware);
      expect(pipeline.size()).toBe(1);
    });

    it("supports chaining", () => {
      const result = pipeline.use({ name: "a", order: 10 }).use({ name: "b", order: 20 });
      expect(result).toBe(pipeline);
      expect(pipeline.size()).toBe(2);
    });
  });

  describe("remove", () => {
    it("removes middleware by name", () => {
      pipeline.use({ name: "a", order: 10 });
      pipeline.use({ name: "b", order: 20 });
      expect(pipeline.remove("a")).toBe(true);
      expect(pipeline.size()).toBe(1);
    });

    it("returns false for non-existent middleware", () => {
      expect(pipeline.remove("nonexistent")).toBe(false);
    });
  });

  describe("has", () => {
    it("returns true for existing middleware", () => {
      pipeline.use({ name: "test", order: 10 });
      expect(pipeline.has("test")).toBe(true);
    });

    it("returns false for non-existent middleware", () => {
      expect(pipeline.has("nonexistent")).toBe(false);
    });
  });

  describe("getMiddlewareNames", () => {
    it("returns names in order", () => {
      pipeline.use({ name: "c", order: 30 });
      pipeline.use({ name: "a", order: 10 });
      pipeline.use({ name: "b", order: 20 });
      expect(pipeline.getMiddlewareNames()).toEqual(["a", "b", "c"]);
    });
  });

  describe("execute", () => {
    it("executes handler when no middlewares", async () => {
      const result = await pipeline.execute(createMockCommandInfo(), {}, async () =>
        createSuccessResult()
      );
      expect(result.status).toBe("success");
    });

    it("executes before hooks in order", async () => {
      const order: string[] = [];

      pipeline.use({
        name: "first",
        order: 10,
        before: async (ctx) => {
          order.push("first");
          return { continue: true, ctx };
        },
      });

      pipeline.use({
        name: "second",
        order: 20,
        before: async (ctx) => {
          order.push("second");
          return { continue: true, ctx };
        },
      });

      await pipeline.execute(createMockCommandInfo(), {}, async () => createSuccessResult());

      expect(order).toEqual(["first", "second"]);
    });

    it("executes after hooks in reverse order", async () => {
      const order: string[] = [];

      pipeline.use({
        name: "first",
        order: 10,
        after: async (_ctx, result) => {
          order.push("first");
          return result;
        },
      });

      pipeline.use({
        name: "second",
        order: 20,
        after: async (_ctx, result) => {
          order.push("second");
          return result;
        },
      });

      await pipeline.execute(createMockCommandInfo(), {}, async () => createSuccessResult());

      expect(order).toEqual(["second", "first"]);
    });

    it("short-circuits on before hook returning continue: false", async () => {
      const executedMiddlewares: string[] = [];

      pipeline.use({
        name: "validator",
        order: 10,
        before: async (_ctx) => {
          executedMiddlewares.push("validator");
          return {
            continue: false,
            result: {
              status: "rejected",
              code: "VALIDATION_ERROR",
              reason: "Invalid input",
            },
          };
        },
      });

      pipeline.use({
        name: "auth",
        order: 20,
        before: async (ctx) => {
          executedMiddlewares.push("auth");
          return { continue: true, ctx };
        },
      });

      const result = await pipeline.execute(createMockCommandInfo(), {}, async () =>
        createSuccessResult()
      );

      expect(result.status).toBe("rejected");
      expect(executedMiddlewares).toEqual(["validator"]);
      expect(executedMiddlewares).not.toContain("auth");
    });

    it("passes context between before hooks", async () => {
      pipeline.use({
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

      let receivedContext: MiddlewareContext | undefined;
      pipeline.use({
        name: "checker",
        order: 20,
        before: async (ctx) => {
          receivedContext = ctx;
          return { continue: true, ctx };
        },
      });

      await pipeline.execute(createMockCommandInfo(), {}, async () => createSuccessResult());

      expect((receivedContext?.custom as Record<string, unknown>)["enriched"]).toBe(true);
    });

    it("handles middleware before hook errors", async () => {
      pipeline.use({
        name: "failing",
        order: 10,
        before: async () => {
          throw new Error("Middleware failed");
        },
      });

      const result = await pipeline.execute(createMockCommandInfo(), {}, async () =>
        createSuccessResult()
      );

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("MIDDLEWARE_ERROR");
        expect(result.reason).toBe("Middleware failed");
      }
    });

    it("handles handler errors", async () => {
      const result = await pipeline.execute(createMockCommandInfo(), {}, async () => {
        throw new Error("Handler failed");
      });

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("HANDLER_ERROR");
        expect(result.reason).toBe("Handler failed");
      }
    });

    it("continues after after-hook errors", async () => {
      let afterHook1Called = false;
      let afterHook2Called = false;

      pipeline.use({
        name: "failing",
        order: 10,
        after: async (_ctx, _result) => {
          afterHook1Called = true;
          throw new Error("After hook failed");
        },
      });

      pipeline.use({
        name: "succeeding",
        order: 20,
        after: async (_ctx, result) => {
          afterHook2Called = true;
          return result;
        },
      });

      const result = await pipeline.execute(createMockCommandInfo(), {}, async () =>
        createSuccessResult()
      );

      // After hooks run in reverse order, so succeeding runs first
      expect(afterHook2Called).toBe(true);
      // Then failing runs (and errors, but we continue)
      expect(afterHook1Called).toBe(true);
      // Result should still be success
      expect(result.status).toBe("success");
    });

    it("runs after hooks for executed middlewares on short-circuit", async () => {
      const afterHooksCalled: string[] = [];

      pipeline.use({
        name: "first",
        order: 10,
        before: async (ctx) => ({ continue: true, ctx }),
        after: async (_ctx, result) => {
          afterHooksCalled.push("first");
          return result;
        },
      });

      pipeline.use({
        name: "shortcircuit",
        order: 20,
        before: async () => ({
          continue: false,
          result: { status: "rejected", code: "TEST", reason: "test" },
        }),
        after: async (_ctx, result) => {
          afterHooksCalled.push("shortcircuit");
          return result;
        },
      });

      pipeline.use({
        name: "third",
        order: 30,
        before: async (ctx) => ({ continue: true, ctx }),
        after: async (_ctx, result) => {
          afterHooksCalled.push("third");
          return result;
        },
      });

      await pipeline.execute(createMockCommandInfo(), {}, async () => createSuccessResult());

      // Only first middleware's after hook should run (executed before short-circuit)
      // shortcircuit and third should not have their after hooks called
      expect(afterHooksCalled).toEqual(["first"]);
    });
  });

  describe("clear", () => {
    it("removes all middlewares", () => {
      pipeline.use({ name: "a", order: 10 });
      pipeline.use({ name: "b", order: 20 });
      pipeline.clear();
      expect(pipeline.size()).toBe(0);
    });
  });

  describe("clone", () => {
    it("creates a copy with same middlewares", () => {
      pipeline.use({ name: "a", order: 10 });
      pipeline.use({ name: "b", order: 20 });

      const cloned = pipeline.clone();
      expect(cloned.size()).toBe(2);
      expect(cloned.getMiddlewareNames()).toEqual(["a", "b"]);
    });

    it("modifications to clone don't affect original", () => {
      pipeline.use({ name: "a", order: 10 });
      const cloned = pipeline.clone();
      cloned.use({ name: "b", order: 20 });

      expect(pipeline.size()).toBe(1);
      expect(cloned.size()).toBe(2);
    });
  });
});

describe("createMiddlewarePipeline", () => {
  it("creates a new pipeline instance", () => {
    const pipeline = createMiddlewarePipeline();
    expect(pipeline).toBeInstanceOf(MiddlewarePipeline);
  });

  it("accepts options", () => {
    const pipeline = createMiddlewarePipeline({ debug: true });
    expect(pipeline).toBeInstanceOf(MiddlewarePipeline);
  });
});
