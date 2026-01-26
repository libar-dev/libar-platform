/**
 * Unit Tests for Built-in Middlewares
 *
 * Tests all 5 built-in middlewares:
 * - Structure validation (order: 10)
 * - Domain validation (order: 20)
 * - Authorization (order: 30)
 * - Logging (order: 40)
 * - Rate limiting (order: 50)
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createStructureValidationMiddleware,
  createRegistryValidationMiddleware,
  STRUCTURE_VALIDATION_ORDER,
} from "../../../src/middleware/structureValidation";
import {
  createDomainValidationMiddleware,
  combineDomainValidators,
  CommonValidators,
  DOMAIN_VALIDATION_ORDER,
} from "../../../src/middleware/domainValidation";
import {
  createAuthorizationMiddleware,
  createRoleBasedChecker,
  AUTHORIZATION_ORDER,
} from "../../../src/middleware/authorization";
import {
  createLoggingMiddleware,
  createNoOpLogger,
  createJsonLogger,
  LOGGING_ORDER,
} from "../../../src/middleware/logging";
import { createMockLogger } from "../../../src/logging/testing";
import {
  createRateLimitMiddleware,
  RateLimitKeys,
  RATE_LIMIT_ORDER,
} from "../../../src/middleware/rateLimit";
import type { MiddlewareContext, MiddlewareCommandInfo } from "../../../src/middleware/types";

// Helper to create a mock context
function createMockContext(
  overrides: Partial<MiddlewareCommandInfo> = {},
  custom: Record<string, unknown> = {}
): MiddlewareContext {
  return {
    command: {
      type: "CreateOrder",
      boundedContext: "orders",
      category: "aggregate",
      args: { orderId: "ord_123", customerId: "cust_456" },
      commandId: "cmd_001",
      correlationId: "corr_001",
      ...overrides,
    },
    custom,
    startedAt: Date.now(),
  };
}

describe("Structure Validation Middleware", () => {
  it("has correct order", () => {
    expect(STRUCTURE_VALIDATION_ORDER).toBe(10);
  });

  it("validates against provided schema", async () => {
    const middleware = createStructureValidationMiddleware({
      schemas: {
        CreateOrder: z.object({
          orderId: z.string(),
          customerId: z.string(),
        }),
      },
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });

  it("rejects invalid payload", async () => {
    const middleware = createStructureValidationMiddleware({
      schemas: {
        CreateOrder: z.object({
          orderId: z.string(),
          customerId: z.string(),
          amount: z.number(), // Required but missing
        }),
      },
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(false);
    if (!result.continue) {
      expect(result.result.status).toBe("rejected");
    }
  });

  it("skips validation for unregistered commands", async () => {
    const middleware = createStructureValidationMiddleware({
      schemas: {}, // No schemas
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });
});

describe("Registry Validation Middleware", () => {
  it("uses schemas from registry", async () => {
    const mockRegistry = {
      getRegistration: (type: string) => {
        if (type === "CreateOrder") {
          return {
            argsSchema: z.object({
              orderId: z.string(),
              customerId: z.string(),
            }),
          };
        }
        return undefined;
      },
    };

    const middleware = createRegistryValidationMiddleware(mockRegistry);
    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });

  it("skips unregistered commands", async () => {
    const mockRegistry = {
      getRegistration: () => undefined,
    };

    const middleware = createRegistryValidationMiddleware(mockRegistry);
    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });
});

describe("Domain Validation Middleware", () => {
  it("has correct order", () => {
    expect(DOMAIN_VALIDATION_ORDER).toBe(20);
  });

  it("passes when validator returns undefined", async () => {
    const middleware = createDomainValidationMiddleware({
      validators: {
        CreateOrder: async () => undefined,
      },
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });

  it("rejects when validator returns error message", async () => {
    const middleware = createDomainValidationMiddleware({
      validators: {
        CreateOrder: async () => "Order already exists",
      },
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(false);
    if (!result.continue) {
      expect(result.result.status).toBe("rejected");
      if (result.result.status === "rejected") {
        expect(result.result.reason).toBe("Order already exists");
      }
    }
  });

  it("skips commands without validators", async () => {
    const middleware = createDomainValidationMiddleware({
      validators: {},
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });
});

describe("combineDomainValidators", () => {
  it("runs all validators and returns first error", async () => {
    const combined = combineDomainValidators([
      async () => undefined,
      async () => "Error from second",
      async () => "Error from third",
    ]);

    const error = await combined({}, createMockContext());
    expect(error).toBe("Error from second");
  });

  it("returns undefined when all pass", async () => {
    const combined = combineDomainValidators([async () => undefined, async () => undefined]);

    const error = await combined({}, createMockContext());
    expect(error).toBeUndefined();
  });
});

describe("CommonValidators", () => {
  it("requiredString validates non-empty strings", async () => {
    const validator = CommonValidators.requiredString("name");

    expect(await validator({ name: "test" }, createMockContext())).toBeUndefined();
    expect(await validator({ name: "" }, createMockContext())).toBe("name is required");
    expect(await validator({ name: 123 }, createMockContext())).toBe("name is required");
  });

  it("positiveNumber validates positive numbers", async () => {
    const validator = CommonValidators.positiveNumber("quantity");

    expect(await validator({ quantity: 5 }, createMockContext())).toBeUndefined();
    expect(await validator({ quantity: 0 }, createMockContext())).toBe(
      "quantity must be a positive number"
    );
    expect(await validator({ quantity: -1 }, createMockContext())).toBe(
      "quantity must be a positive number"
    );
  });

  it("numberRange validates within range", async () => {
    const validator = CommonValidators.numberRange("score", 0, 100);

    expect(await validator({ score: 50 }, createMockContext())).toBeUndefined();
    expect(await validator({ score: -1 }, createMockContext())).toBe(
      "score must be between 0 and 100"
    );
    expect(await validator({ score: 101 }, createMockContext())).toBe(
      "score must be between 0 and 100"
    );
  });

  it("startsWithPrefix validates prefix", async () => {
    const validator = CommonValidators.startsWithPrefix("orderId", "ord_");

    expect(await validator({ orderId: "ord_123" }, createMockContext())).toBeUndefined();
    expect(await validator({ orderId: "123" }, createMockContext())).toBe(
      "orderId must start with 'ord_'"
    );
  });
});

describe("Authorization Middleware", () => {
  it("has correct order", () => {
    expect(AUTHORIZATION_ORDER).toBe(30);
  });

  it("allows when checker returns allowed: true", async () => {
    const middleware = createAuthorizationMiddleware({
      checker: async () => ({ allowed: true }),
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });

  it("rejects when checker returns allowed: false", async () => {
    const middleware = createAuthorizationMiddleware({
      checker: async () => ({ allowed: false, reason: "Access denied" }),
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(false);
    if (!result.continue) {
      expect(result.result.status).toBe("rejected");
      if (result.result.status === "rejected") {
        expect(result.result.code).toBe("UNAUTHORIZED");
        expect(result.result.reason).toBe("Access denied");
      }
    }
  });

  it("skips configured commands", async () => {
    let checkerCalled = false;
    const middleware = createAuthorizationMiddleware({
      checker: async () => {
        checkerCalled = true;
        return { allowed: false };
      },
      skipFor: ["CreateOrder"],
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
    expect(checkerCalled).toBe(false);
  });
});

describe("createRoleBasedChecker", () => {
  it("allows users with required role", async () => {
    const checker = createRoleBasedChecker(
      { CreateOrder: ["user", "admin"] },
      (ctx) => (ctx.custom as Record<string, unknown>)["userRole"] as string
    );

    const result = await checker(createMockContext({}, { userRole: "user" }));
    expect(result.allowed).toBe(true);
  });

  it("rejects users without required role", async () => {
    const checker = createRoleBasedChecker(
      { CreateOrder: ["admin"] },
      (ctx) => (ctx.custom as Record<string, unknown>)["userRole"] as string
    );

    const result = await checker(createMockContext({}, { userRole: "user" }));
    expect(result.allowed).toBe(false);
  });

  it("requires authentication when no user role", async () => {
    const checker = createRoleBasedChecker({ CreateOrder: ["user"] }, () => undefined);

    const result = await checker(createMockContext());
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Authentication required");
  });

  it("allows when no roles specified", async () => {
    const checker = createRoleBasedChecker({}, () => "user");

    const result = await checker(createMockContext());
    expect(result.allowed).toBe(true);
  });
});

describe("Logging Middleware", () => {
  it("has correct order", () => {
    expect(LOGGING_ORDER).toBe(40);
  });

  it("logs before and after execution", async () => {
    const logger = createMockLogger();

    const middleware = createLoggingMiddleware({ logger });

    // Before hook
    await middleware.before!(createMockContext());

    // After hook
    await middleware.after!(createMockContext(), {
      status: "success",
      data: {},
      version: 1,
      event: {
        eventId: "evt_001",
        eventType: "OrderCreated",
        streamType: "order",
        streamId: "ord_123",
        payload: {},
        metadata: { correlationId: "corr_001", causationId: "cmd_001" },
      },
    });

    expect(logger.hasLoggedMessage("Command started: CreateOrder")).toBe(true);
    expect(logger.hasLoggedMessage("Command succeeded: CreateOrder")).toBe(true);
  });

  it("logs errors for failed commands", async () => {
    const logger = createMockLogger();

    const middleware = createLoggingMiddleware({ logger });

    await middleware.after!(createMockContext(), {
      status: "failed",
      reason: "Business failure",
      event: {
        eventId: "evt_001",
        eventType: "OrderFailed",
        streamType: "order",
        streamId: "ord_123",
        payload: {},
        metadata: { correlationId: "corr_001", causationId: "cmd_001" },
      },
    });

    expect(logger.getCallsAtLevel("ERROR").length).toBeGreaterThan(0);
  });
});

describe("createNoOpLogger", () => {
  it("creates a logger that does nothing", () => {
    const logger = createNoOpLogger();
    // Should not throw - all 6 levels are now required
    logger.debug("test");
    logger.trace("test");
    logger.info("test");
    logger.report("test");
    logger.warn("test");
    logger.error("test");
  });
});

describe("createJsonLogger", () => {
  it("outputs JSON formatted logs", () => {
    const outputs: string[] = [];
    const logger = createJsonLogger({
      output: (json) => outputs.push(json),
      includeTimestamp: false,
    });

    logger.info("test message", { key: "value" });

    const parsed = JSON.parse(outputs[0]!);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("test message");
    expect(parsed.key).toBe("value");
  });

  it("includes timestamp when configured", () => {
    const outputs: string[] = [];
    const logger = createJsonLogger({
      output: (json) => outputs.push(json),
      includeTimestamp: true,
    });

    logger.info("test");

    const parsed = JSON.parse(outputs[0]!);
    expect(parsed.timestamp).toBeDefined();
  });
});

describe("Rate Limit Middleware", () => {
  it("has correct order", () => {
    expect(RATE_LIMIT_ORDER).toBe(50);
  });

  it("allows when rate limit not exceeded", async () => {
    const middleware = createRateLimitMiddleware({
      checkerFactory: () => async () => ({ allowed: true }),
      getKey: (ctx) => ctx.command.type,
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
  });

  it("rejects when rate limit exceeded", async () => {
    const middleware = createRateLimitMiddleware({
      checkerFactory: () => async () => ({ allowed: false, retryAfterMs: 1000 }),
      getKey: (ctx) => ctx.command.type,
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(false);
    if (!result.continue) {
      expect(result.result.status).toBe("rejected");
      if (result.result.status === "rejected") {
        expect(result.result.code).toBe("RATE_LIMITED");
      }
    }
  });

  it("skips configured commands", async () => {
    let checkerCalled = false;
    const middleware = createRateLimitMiddleware({
      checkerFactory: () => async () => {
        checkerCalled = true;
        return { allowed: false };
      },
      getKey: (ctx) => ctx.command.type,
      skipFor: ["CreateOrder"],
    });

    const result = await middleware.before!(createMockContext());
    expect(result.continue).toBe(true);
    expect(checkerCalled).toBe(false);
  });
});

describe("RateLimitKeys", () => {
  it("byUserId generates correct key", () => {
    const getKey = RateLimitKeys.byUserId(
      (ctx) => (ctx.custom as Record<string, unknown>)["userId"] as string
    );
    const key = getKey(createMockContext({}, { userId: "user_123" }));
    expect(key).toBe("user:user_123");
  });

  it("byUserId handles anonymous", () => {
    const getKey = RateLimitKeys.byUserId(() => undefined);
    const key = getKey(createMockContext());
    expect(key).toBe("user:anonymous");
  });

  it("byCommandType generates correct key", () => {
    const getKey = RateLimitKeys.byCommandType();
    const key = getKey(createMockContext({ type: "CreateOrder" }));
    expect(key).toBe("command:CreateOrder");
  });

  it("byUserAndCommand generates correct key", () => {
    const getKey = RateLimitKeys.byUserAndCommand(
      (ctx) => (ctx.custom as Record<string, unknown>)["userId"] as string
    );
    const key = getKey(createMockContext({ type: "CreateOrder" }, { userId: "user_123" }));
    expect(key).toBe("user:user_123:CreateOrder");
  });
});

describe("Middleware Orders", () => {
  it("middlewares have correct relative ordering", () => {
    expect(STRUCTURE_VALIDATION_ORDER).toBeLessThan(DOMAIN_VALIDATION_ORDER);
    expect(DOMAIN_VALIDATION_ORDER).toBeLessThan(AUTHORIZATION_ORDER);
    expect(AUTHORIZATION_ORDER).toBeLessThan(LOGGING_ORDER);
    expect(LOGGING_ORDER).toBeLessThan(RATE_LIMIT_ORDER);
  });
});
