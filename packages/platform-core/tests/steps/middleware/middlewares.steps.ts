/**
 * Built-in Middlewares - Step Definitions
 *
 * BDD step definitions for all 5 built-in middlewares:
 * - Structure validation (order: 10)
 * - Domain validation (order: 20)
 * - Authorization (order: 30)
 * - Logging (order: 40)
 * - Rate limiting (order: 50)
 *
 * Mechanical migration from tests/unit/middleware/middlewares.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { z } from "zod";

import {
  createStructureValidationMiddleware,
  createRegistryValidationMiddleware,
  STRUCTURE_VALIDATION_ORDER,
} from "../../../src/middleware/structureValidation.js";
import {
  createDomainValidationMiddleware,
  combineDomainValidators,
  CommonValidators,
  DOMAIN_VALIDATION_ORDER,
} from "../../../src/middleware/domainValidation.js";
import {
  createAuthorizationMiddleware,
  createRoleBasedChecker,
  AUTHORIZATION_ORDER,
} from "../../../src/middleware/authorization.js";
import {
  createLoggingMiddleware,
  createNoOpLogger,
  createJsonLogger,
  LOGGING_ORDER,
} from "../../../src/middleware/logging.js";
import { createMockLogger } from "../../../src/logging/testing.js";
import {
  createRateLimitMiddleware,
  RateLimitKeys,
  RATE_LIMIT_ORDER,
} from "../../../src/middleware/rateLimit.js";
import {
  toCausationId,
  toCommandId,
  toCorrelationId,
  toEventId,
  toStreamId,
} from "../../../src/ids/index.js";
import type {
  MiddlewareContext,
  MiddlewareCommandInfo,
  Middleware,
} from "../../../src/middleware/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Helpers
// =============================================================================

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
      commandId: toCommandId("cmd_001"),
      correlationId: toCorrelationId("corr_001"),
      ...overrides,
    },
    custom,
    startedAt: Date.now(),
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  orderValue: number | null;
  middleware: Middleware | null;
  beforeResult: {
    continue: boolean;
    result?: { status: string; reason?: string; code?: string };
  } | null;
  checkerCalled: boolean;
  rateLimitCheckerCalled: boolean;
  combinedResult: string | undefined | null;
  combinedValidator:
    | ((args: Record<string, unknown>, ctx: MiddlewareContext) => Promise<string | undefined>)
    | null;
  fieldValidator:
    | ((args: Record<string, unknown>, ctx: MiddlewareContext) => Promise<string | undefined>)
    | null;
  authResult: { allowed: boolean; reason?: string } | null;
  generatedKey: string | null;
  mockLogger: ReturnType<typeof createMockLogger> | null;
  jsonOutputs: string[];
  noOpLogger: ReturnType<typeof createNoOpLogger> | null;
}

function createInitialState(): TestState {
  return {
    orderValue: null,
    middleware: null,
    beforeResult: null,
    checkerCalled: false,
    rateLimitCheckerCalled: false,
    combinedResult: null,
    combinedValidator: null,
    fieldValidator: null,
    authResult: null,
    generatedKey: null,
    mockLogger: null,
    jsonOutputs: [],
    noOpLogger: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/middleware/middlewares.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: Structure validation middleware
  // ==========================================================================

  Rule(
    "Structure validation middleware validates command args against Zod schemas",
    ({ RuleScenario }) => {
      RuleScenario("Structure validation has correct order", ({ Given, Then }) => {
        Given("the structure validation order constant", () => {
          state.orderValue = STRUCTURE_VALIDATION_ORDER;
        });

        Then("the order value is 10", () => {
          expect(state.orderValue).toBe(10);
        });
      });

      RuleScenario("Valid payload passes structure validation", ({ Given, When, Then }) => {
        Given(
          "a structure validation middleware with a CreateOrder schema requiring orderId and customerId",
          () => {
            state.middleware = createStructureValidationMiddleware({
              schemas: {
                CreateOrder: z.object({
                  orderId: z.string(),
                  customerId: z.string(),
                }),
              },
            });
          }
        );

        When("the middleware processes a valid CreateOrder command", async () => {
          state.beforeResult = (await state.middleware!.before!(
            createMockContext()
          )) as TestState["beforeResult"];
        });

        Then("the before hook returns continue true", () => {
          expect(state.beforeResult!.continue).toBe(true);
        });
      });

      RuleScenario(
        "Invalid payload is rejected by structure validation",
        ({ Given, When, Then, And }) => {
          Given(
            "a structure validation middleware with a CreateOrder schema requiring orderId, customerId, and amount",
            () => {
              state.middleware = createStructureValidationMiddleware({
                schemas: {
                  CreateOrder: z.object({
                    orderId: z.string(),
                    customerId: z.string(),
                    amount: z.number(),
                  }),
                },
              });
            }
          );

          When(
            "the middleware processes a CreateOrder command missing the amount field",
            async () => {
              state.beforeResult = (await state.middleware!.before!(
                createMockContext()
              )) as TestState["beforeResult"];
            }
          );

          Then("the before hook returns continue false", () => {
            expect(state.beforeResult!.continue).toBe(false);
          });

          And('the result status is "rejected"', () => {
            expect(state.beforeResult!.result!.status).toBe("rejected");
          });
        }
      );

      RuleScenario("Unregistered command skips structure validation", ({ Given, When, Then }) => {
        Given("a structure validation middleware with no schemas", () => {
          state.middleware = createStructureValidationMiddleware({
            schemas: {},
          });
        });

        When("the middleware processes a valid CreateOrder command", async () => {
          state.beforeResult = (await state.middleware!.before!(
            createMockContext()
          )) as TestState["beforeResult"];
        });

        Then("the before hook returns continue true", () => {
          expect(state.beforeResult!.continue).toBe(true);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: Registry validation middleware
  // ==========================================================================

  Rule(
    "Registry validation middleware uses schemas from a command registry",
    ({ RuleScenario }) => {
      RuleScenario(
        "Registry validation validates against registry schema",
        ({ Given, When, Then }) => {
          Given("a registry validation middleware with a CreateOrder registration", () => {
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
            state.middleware = createRegistryValidationMiddleware(mockRegistry);
          });

          When("the middleware processes a valid CreateOrder command", async () => {
            state.beforeResult = (await state.middleware!.before!(
              createMockContext()
            )) as TestState["beforeResult"];
          });

          Then("the before hook returns continue true", () => {
            expect(state.beforeResult!.continue).toBe(true);
          });
        }
      );

      RuleScenario("Registry validation skips unregistered commands", ({ Given, When, Then }) => {
        Given("a registry validation middleware with no registrations", () => {
          const mockRegistry = {
            getRegistration: () => undefined,
          };
          state.middleware = createRegistryValidationMiddleware(mockRegistry);
        });

        When("the middleware processes a valid CreateOrder command", async () => {
          state.beforeResult = (await state.middleware!.before!(
            createMockContext()
          )) as TestState["beforeResult"];
        });

        Then("the before hook returns continue true", () => {
          expect(state.beforeResult!.continue).toBe(true);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: Domain validation middleware
  // ==========================================================================

  Rule(
    "Domain validation middleware runs async validators and rejects on error messages",
    ({ RuleScenario }) => {
      RuleScenario("Domain validation has correct order", ({ Given, Then }) => {
        Given("the domain validation order constant", () => {
          state.orderValue = DOMAIN_VALIDATION_ORDER;
        });

        Then("the order value is 20", () => {
          expect(state.orderValue).toBe(20);
        });
      });

      RuleScenario(
        "Domain validation passes when validator returns undefined",
        ({ Given, When, Then }) => {
          Given(
            "a domain validation middleware where CreateOrder validator returns undefined",
            () => {
              state.middleware = createDomainValidationMiddleware({
                validators: {
                  CreateOrder: async () => undefined,
                },
              });
            }
          );

          When("the middleware processes a valid CreateOrder command", async () => {
            state.beforeResult = (await state.middleware!.before!(
              createMockContext()
            )) as TestState["beforeResult"];
          });

          Then("the before hook returns continue true", () => {
            expect(state.beforeResult!.continue).toBe(true);
          });
        }
      );

      RuleScenario(
        "Domain validation rejects when validator returns error message",
        ({ Given, When, Then, And }) => {
          Given(
            'a domain validation middleware where CreateOrder validator returns "Order already exists"',
            () => {
              state.middleware = createDomainValidationMiddleware({
                validators: {
                  CreateOrder: async () => "Order already exists",
                },
              });
            }
          );

          When("the middleware processes a valid CreateOrder command", async () => {
            state.beforeResult = (await state.middleware!.before!(
              createMockContext()
            )) as TestState["beforeResult"];
          });

          Then("the before hook returns continue false", () => {
            expect(state.beforeResult!.continue).toBe(false);
          });

          And('the result status is "rejected"', () => {
            expect(state.beforeResult!.result!.status).toBe("rejected");
          });

          And('the result reason is "Order already exists"', () => {
            expect(state.beforeResult!.result!.reason).toBe("Order already exists");
          });
        }
      );

      RuleScenario(
        "Domain validation skips commands without validators",
        ({ Given, When, Then }) => {
          Given("a domain validation middleware with no validators", () => {
            state.middleware = createDomainValidationMiddleware({
              validators: {},
            });
          });

          When("the middleware processes a valid CreateOrder command", async () => {
            state.beforeResult = (await state.middleware!.before!(
              createMockContext()
            )) as TestState["beforeResult"];
          });

          Then("the before hook returns continue true", () => {
            expect(state.beforeResult!.continue).toBe(true);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: combineDomainValidators
  // ==========================================================================

  Rule(
    "combineDomainValidators runs all validators and returns first error",
    ({ RuleScenario }) => {
      RuleScenario("Combined validators return first error", ({ Given, When, Then }) => {
        Given(
          'a combined validator with validators returning undefined, "Error from second", "Error from third"',
          () => {
            state.combinedValidator = combineDomainValidators([
              async () => undefined,
              async () => "Error from second",
              async () => "Error from third",
            ]);
          }
        );

        When("the combined validator runs", async () => {
          state.combinedResult = await state.combinedValidator!({}, createMockContext());
        });

        Then('the combined result is "Error from second"', () => {
          expect(state.combinedResult).toBe("Error from second");
        });
      });

      RuleScenario(
        "Combined validators return undefined when all pass",
        ({ Given, When, Then }) => {
          Given("a combined validator with all validators returning undefined", () => {
            state.combinedValidator = combineDomainValidators([
              async () => undefined,
              async () => undefined,
            ]);
          });

          When("the combined validator runs", async () => {
            state.combinedResult = await state.combinedValidator!({}, createMockContext());
          });

          Then("the combined result is undefined", () => {
            expect(state.combinedResult).toBeUndefined();
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: CommonValidators
  // ==========================================================================

  Rule("CommonValidators provide reusable field-level validation helpers", ({ RuleScenario }) => {
    RuleScenario("requiredString validates non-empty strings", ({ Given, Then }) => {
      Given('a requiredString validator for field "name"', () => {
        state.fieldValidator = CommonValidators.requiredString("name");
      });

      Then(
        "validating the field produces expected results:",
        async (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            fieldValue: string;
            expectedResult: string;
          }>(dataTable);
          for (const row of rows) {
            let args: Record<string, unknown>;
            if (row.fieldValue === "empty") {
              args = { name: "" };
            } else if (row.fieldValue === "number") {
              args = { name: 123 };
            } else {
              args = { name: row.fieldValue };
            }
            const result = await state.fieldValidator!(args, createMockContext());
            if (row.expectedResult === "undefined") {
              expect(result).toBeUndefined();
            } else {
              expect(result).toBe(row.expectedResult);
            }
          }
        }
      );
    });

    RuleScenario("positiveNumber validates positive numbers", ({ Given, Then }) => {
      Given('a positiveNumber validator for field "quantity"', () => {
        state.fieldValidator = CommonValidators.positiveNumber("quantity");
      });

      Then(
        "validating the number field produces expected results:",
        async (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            fieldValue: string;
            expectedResult: string;
          }>(dataTable);
          for (const row of rows) {
            const result = await state.fieldValidator!(
              { quantity: Number(row.fieldValue) },
              createMockContext()
            );
            if (row.expectedResult === "undefined") {
              expect(result).toBeUndefined();
            } else {
              expect(result).toBe(row.expectedResult);
            }
          }
        }
      );
    });

    RuleScenario("numberRange validates within range", ({ Given, Then }) => {
      Given('a numberRange validator for field "score" with min 0 and max 100', () => {
        state.fieldValidator = CommonValidators.numberRange("score", 0, 100);
      });

      Then(
        "validating the number field in range produces expected results:",
        async (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            fieldValue: string;
            expectedResult: string;
          }>(dataTable);
          for (const row of rows) {
            const result = await state.fieldValidator!(
              { score: Number(row.fieldValue) },
              createMockContext()
            );
            if (row.expectedResult === "undefined") {
              expect(result).toBeUndefined();
            } else {
              expect(result).toBe(row.expectedResult);
            }
          }
        }
      );
    });

    RuleScenario("startsWithPrefix validates prefix", ({ Given, Then }) => {
      Given('a startsWithPrefix validator for field "orderId" with prefix "ord_"', () => {
        state.fieldValidator = CommonValidators.startsWithPrefix("orderId", "ord_");
      });

      Then(
        "validating the prefix field produces expected results:",
        async (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            fieldValue: string;
            expectedResult: string;
          }>(dataTable);
          for (const row of rows) {
            const result = await state.fieldValidator!(
              { orderId: row.fieldValue },
              createMockContext()
            );
            if (row.expectedResult === "undefined") {
              expect(result).toBeUndefined();
            } else {
              expect(result).toBe(row.expectedResult);
            }
          }
        }
      );
    });
  });

  // ==========================================================================
  // Rule: Authorization middleware
  // ==========================================================================

  Rule("Authorization middleware checks permissions and supports skipping", ({ RuleScenario }) => {
    RuleScenario("Authorization has correct order", ({ Given, Then }) => {
      Given("the authorization order constant", () => {
        state.orderValue = AUTHORIZATION_ORDER;
      });

      Then("the order value is 30", () => {
        expect(state.orderValue).toBe(30);
      });
    });

    RuleScenario(
      "Authorization allows when checker returns allowed true",
      ({ Given, When, Then }) => {
        Given("an authorization middleware that always allows", () => {
          state.middleware = createAuthorizationMiddleware({
            checker: async () => ({ allowed: true }),
          });
        });

        When("the middleware processes a valid CreateOrder command", async () => {
          state.beforeResult = (await state.middleware!.before!(
            createMockContext()
          )) as TestState["beforeResult"];
        });

        Then("the before hook returns continue true", () => {
          expect(state.beforeResult!.continue).toBe(true);
        });
      }
    );

    RuleScenario(
      "Authorization rejects when checker returns allowed false",
      ({ Given, When, Then, And }) => {
        Given('an authorization middleware that denies with reason "Access denied"', () => {
          state.middleware = createAuthorizationMiddleware({
            checker: async () => ({
              allowed: false,
              reason: "Access denied",
            }),
          });
        });

        When("the middleware processes a valid CreateOrder command", async () => {
          state.beforeResult = (await state.middleware!.before!(
            createMockContext()
          )) as TestState["beforeResult"];
        });

        Then("the before hook returns continue false", () => {
          expect(state.beforeResult!.continue).toBe(false);
        });

        And('the result status is "rejected"', () => {
          expect(state.beforeResult!.result!.status).toBe("rejected");
        });

        And('the result code is "UNAUTHORIZED"', () => {
          expect(state.beforeResult!.result!.code).toBe("UNAUTHORIZED");
        });

        And('the result reason is "Access denied"', () => {
          expect(state.beforeResult!.result!.reason).toBe("Access denied");
        });
      }
    );

    RuleScenario("Authorization skips configured commands", ({ Given, When, Then, And }) => {
      Given("an authorization middleware that denies but skips CreateOrder", () => {
        state.checkerCalled = false;
        state.middleware = createAuthorizationMiddleware({
          checker: async () => {
            state.checkerCalled = true;
            return { allowed: false };
          },
          skipFor: ["CreateOrder"],
        });
      });

      When("the middleware processes a valid CreateOrder command", async () => {
        state.beforeResult = (await state.middleware!.before!(
          createMockContext()
        )) as TestState["beforeResult"];
      });

      Then("the before hook returns continue true", () => {
        expect(state.beforeResult!.continue).toBe(true);
      });

      And("the checker was not called", () => {
        expect(state.checkerCalled).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: createRoleBasedChecker
  // ==========================================================================

  Rule("createRoleBasedChecker creates role-based authorization checkers", ({ RuleScenario }) => {
    RuleScenario("Role-based checker allows user with required role", ({ Given, When, Then }) => {
      let checker: (ctx: MiddlewareContext) => Promise<{ allowed: boolean; reason?: string }>;

      Given('a role-based checker requiring "user" or "admin" for CreateOrder', () => {
        checker = createRoleBasedChecker(
          { CreateOrder: ["user", "admin"] },
          (ctx) => (ctx.custom as Record<string, unknown>)["userRole"] as string
        );
      });

      When('checking authorization for a user with role "user"', async () => {
        state.authResult = await checker(createMockContext({}, { userRole: "user" }));
      });

      Then("the authorization result is allowed", () => {
        expect(state.authResult!.allowed).toBe(true);
      });
    });

    RuleScenario(
      "Role-based checker rejects user without required role",
      ({ Given, When, Then }) => {
        let checker: (ctx: MiddlewareContext) => Promise<{ allowed: boolean; reason?: string }>;

        Given('a role-based checker requiring "admin" for CreateOrder', () => {
          checker = createRoleBasedChecker(
            { CreateOrder: ["admin"] },
            (ctx) => (ctx.custom as Record<string, unknown>)["userRole"] as string
          );
        });

        When('checking authorization for a user with role "user"', async () => {
          state.authResult = await checker(createMockContext({}, { userRole: "user" }));
        });

        Then("the authorization result is not allowed", () => {
          expect(state.authResult!.allowed).toBe(false);
        });
      }
    );

    RuleScenario("Role-based checker requires authentication", ({ Given, When, Then, And }) => {
      let checker: (ctx: MiddlewareContext) => Promise<{ allowed: boolean; reason?: string }>;

      Given('a role-based checker requiring "user" for CreateOrder', () => {
        checker = createRoleBasedChecker({ CreateOrder: ["user"] }, () => undefined);
      });

      When("checking authorization with no user role", async () => {
        state.authResult = await checker(createMockContext());
      });

      Then("the authorization result is not allowed", () => {
        expect(state.authResult!.allowed).toBe(false);
      });

      And('the authorization reason is "Authentication required"', () => {
        expect(state.authResult!.reason).toBe("Authentication required");
      });
    });

    RuleScenario("Role-based checker allows when no roles specified", ({ Given, When, Then }) => {
      let checker: (ctx: MiddlewareContext) => Promise<{ allowed: boolean; reason?: string }>;

      Given("a role-based checker with no role requirements", () => {
        checker = createRoleBasedChecker({}, () => "user");
      });

      When('checking authorization for a user with role "user"', async () => {
        state.authResult = await checker(createMockContext());
      });

      Then("the authorization result is allowed", () => {
        expect(state.authResult!.allowed).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Rule: Logging middleware
  // ==========================================================================

  Rule("Logging middleware logs command lifecycle events", ({ RuleScenario }) => {
    RuleScenario("Logging has correct order", ({ Given, Then }) => {
      Given("the logging order constant", () => {
        state.orderValue = LOGGING_ORDER;
      });

      Then("the order value is 40", () => {
        expect(state.orderValue).toBe(40);
      });
    });

    RuleScenario(
      "Logging middleware logs before and after execution",
      ({ Given, When, And, Then }) => {
        Given("a logging middleware with a mock logger", () => {
          state.mockLogger = createMockLogger();
          state.middleware = createLoggingMiddleware({
            logger: state.mockLogger,
          });
        });

        When("the before hook runs for a CreateOrder command", async () => {
          await state.middleware!.before!(createMockContext());
        });

        And("the after hook runs with a success result", async () => {
          await state.middleware!.after!(createMockContext(), {
            status: "success",
            data: {},
            version: 1,
            event: {
              eventId: toEventId("evt_001"),
              eventType: "OrderCreated",
              streamType: "order",
              streamId: toStreamId("ord_123"),
              payload: {},
              metadata: {
                correlationId: toCorrelationId("corr_001"),
                causationId: toCausationId("cmd_001"),
              },
            },
          });
        });

        Then('the logger contains message "Command started: CreateOrder"', () => {
          expect(state.mockLogger!.hasLoggedMessage("Command started: CreateOrder")).toBe(true);
        });

        And('the logger contains message "Command succeeded: CreateOrder"', () => {
          expect(state.mockLogger!.hasLoggedMessage("Command succeeded: CreateOrder")).toBe(true);
        });
      }
    );

    RuleScenario("Logging middleware logs errors for failed commands", ({ Given, When, Then }) => {
      Given("a logging middleware with a mock logger", () => {
        state.mockLogger = createMockLogger();
        state.middleware = createLoggingMiddleware({
          logger: state.mockLogger,
        });
      });

      When("the after hook runs with a failed result", async () => {
        await state.middleware!.after!(createMockContext(), {
          status: "failed",
          reason: "Business failure",
          event: {
            eventId: toEventId("evt_001"),
            eventType: "OrderFailed",
            streamType: "order",
            streamId: toStreamId("ord_123"),
            payload: {},
            metadata: {
              correlationId: toCorrelationId("corr_001"),
              causationId: toCausationId("cmd_001"),
            },
          },
        });
      });

      Then("the logger has error-level entries", () => {
        expect(state.mockLogger!.getCallsAtLevel("ERROR").length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // Rule: createNoOpLogger
  // ==========================================================================

  Rule("createNoOpLogger creates a silent logger", ({ RuleScenario }) => {
    RuleScenario("NoOp logger does not throw on any level", ({ Given, Then }) => {
      Given("a no-op logger", () => {
        state.noOpLogger = createNoOpLogger();
      });

      Then("calling all log levels does not throw", () => {
        const logger = state.noOpLogger!;
        expect(() => {
          logger.debug("test");
          logger.trace("test");
          logger.info("test");
          logger.report("test");
          logger.warn("test");
          logger.error("test");
        }).not.toThrow();
      });
    });
  });

  // ==========================================================================
  // Rule: createJsonLogger
  // ==========================================================================

  Rule("createJsonLogger outputs structured JSON logs", ({ RuleScenario }) => {
    RuleScenario("JSON logger outputs correctly formatted logs", ({ Given, When, Then }) => {
      Given("a JSON logger without timestamps", () => {
        state.jsonOutputs = [];
        // stored as closure; just need to log and check outputs
      });

      When('logging an info message "test message" with context key "value"', () => {
        const logger = createJsonLogger({
          output: (json) => state.jsonOutputs.push(json),
          includeTimestamp: false,
        });
        logger.info("test message", { key: "value" });
      });

      Then('the JSON output has level "info" and message "test message" and key "value"', () => {
        const parsed = JSON.parse(state.jsonOutputs[0]!);
        expect(parsed.level).toBe("info");
        expect(parsed.message).toBe("test message");
        expect(parsed.key).toBe("value");
      });
    });

    RuleScenario("JSON logger includes timestamp when configured", ({ Given, When, Then }) => {
      Given("a JSON logger with timestamps", () => {
        state.jsonOutputs = [];
      });

      When('logging an info message "test"', () => {
        const logger = createJsonLogger({
          output: (json) => state.jsonOutputs.push(json),
          includeTimestamp: true,
        });
        logger.info("test");
      });

      Then("the JSON output has a timestamp field", () => {
        const parsed = JSON.parse(state.jsonOutputs[0]!);
        expect(parsed.timestamp).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Rule: Rate limit middleware
  // ==========================================================================

  Rule("Rate limit middleware enforces rate limits and supports skipping", ({ RuleScenario }) => {
    RuleScenario("Rate limit has correct order", ({ Given, Then }) => {
      Given("the rate limit order constant", () => {
        state.orderValue = RATE_LIMIT_ORDER;
      });

      Then("the order value is 50", () => {
        expect(state.orderValue).toBe(50);
      });
    });

    RuleScenario("Rate limit allows when not exceeded", ({ Given, When, Then }) => {
      Given("a rate limit middleware that always allows", () => {
        state.middleware = createRateLimitMiddleware({
          checkerFactory: () => async () => ({ allowed: true }),
          getKey: (ctx) => ctx.command.type,
        });
      });

      When("the middleware processes a valid CreateOrder command", async () => {
        state.beforeResult = (await state.middleware!.before!(
          createMockContext()
        )) as TestState["beforeResult"];
      });

      Then("the before hook returns continue true", () => {
        expect(state.beforeResult!.continue).toBe(true);
      });
    });

    RuleScenario("Rate limit rejects when exceeded", ({ Given, When, Then, And }) => {
      Given("a rate limit middleware that always denies with retryAfterMs 1000", () => {
        state.middleware = createRateLimitMiddleware({
          checkerFactory: () => async () => ({ allowed: false, retryAfterMs: 1000 }),
          getKey: (ctx) => ctx.command.type,
        });
      });

      When("the middleware processes a valid CreateOrder command", async () => {
        state.beforeResult = (await state.middleware!.before!(
          createMockContext()
        )) as TestState["beforeResult"];
      });

      Then("the before hook returns continue false", () => {
        expect(state.beforeResult!.continue).toBe(false);
      });

      And('the result status is "rejected"', () => {
        expect(state.beforeResult!.result!.status).toBe("rejected");
      });

      And('the result code is "RATE_LIMITED"', () => {
        expect(state.beforeResult!.result!.code).toBe("RATE_LIMITED");
      });
    });

    RuleScenario("Rate limit skips configured commands", ({ Given, When, Then, And }) => {
      Given("a rate limit middleware that denies but skips CreateOrder", () => {
        state.rateLimitCheckerCalled = false;
        state.middleware = createRateLimitMiddleware({
          checkerFactory: () => async () => {
            state.rateLimitCheckerCalled = true;
            return { allowed: false };
          },
          getKey: (ctx) => ctx.command.type,
          skipFor: ["CreateOrder"],
        });
      });

      When("the middleware processes a valid CreateOrder command", async () => {
        state.beforeResult = (await state.middleware!.before!(
          createMockContext()
        )) as TestState["beforeResult"];
      });

      Then("the before hook returns continue true", () => {
        expect(state.beforeResult!.continue).toBe(true);
      });

      And("the rate limit checker was not called", () => {
        expect(state.rateLimitCheckerCalled).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: RateLimitKeys
  // ==========================================================================

  Rule("RateLimitKeys provides key generation strategies", ({ RuleScenario }) => {
    RuleScenario("byUserId generates correct key", ({ Given, When, Then }) => {
      let getKey: (ctx: MiddlewareContext) => string;

      Given("a byUserId key generator", () => {
        getKey = RateLimitKeys.byUserId(
          (ctx) => (ctx.custom as Record<string, unknown>)["userId"] as string
        );
      });

      When('generating a key for user "user_123"', () => {
        state.generatedKey = getKey(createMockContext({}, { userId: "user_123" }));
      });

      Then('the generated key is "user:user_123"', () => {
        expect(state.generatedKey).toBe("user:user_123");
      });
    });

    RuleScenario("byUserId handles anonymous users", ({ Given, When, Then }) => {
      let getKey: (ctx: MiddlewareContext) => string;

      Given("a byUserId key generator for anonymous users", () => {
        getKey = RateLimitKeys.byUserId(() => undefined);
      });

      When("generating a key with no user", () => {
        state.generatedKey = getKey(createMockContext());
      });

      Then('the generated key is "user:anonymous"', () => {
        expect(state.generatedKey).toBe("user:anonymous");
      });
    });

    RuleScenario("byCommandType generates correct key", ({ Given, When, Then }) => {
      let getKey: (ctx: MiddlewareContext) => string;

      Given("a byCommandType key generator", () => {
        getKey = RateLimitKeys.byCommandType();
      });

      When('generating a key for command type "CreateOrder"', () => {
        state.generatedKey = getKey(createMockContext({ type: "CreateOrder" }));
      });

      Then('the generated key is "command:CreateOrder"', () => {
        expect(state.generatedKey).toBe("command:CreateOrder");
      });
    });

    RuleScenario("byUserAndCommand generates composite key", ({ Given, When, Then }) => {
      let getKey: (ctx: MiddlewareContext) => string;

      Given("a byUserAndCommand key generator", () => {
        getKey = RateLimitKeys.byUserAndCommand(
          (ctx) => (ctx.custom as Record<string, unknown>)["userId"] as string
        );
      });

      When('generating a key for user "user_123" and command "CreateOrder"', () => {
        state.generatedKey = getKey(
          createMockContext({ type: "CreateOrder" }, { userId: "user_123" })
        );
      });

      Then('the generated key is "user:user_123:CreateOrder"', () => {
        expect(state.generatedKey).toBe("user:user_123:CreateOrder");
      });
    });
  });

  // ==========================================================================
  // Rule: Middleware ordering constants
  // ==========================================================================

  Rule("Middleware ordering constants follow the correct pipeline sequence", ({ RuleScenario }) => {
    RuleScenario("All middleware orders follow correct sequence", ({ Given, Then }) => {
      Given("all middleware order constants", () => {
        // Constants are imported at module level
      });

      Then("the orders follow the sequence:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          middleware: string;
          order: string;
        }>(dataTable);

        const orderMap: Record<string, number> = {
          structureValidation: STRUCTURE_VALIDATION_ORDER,
          domainValidation: DOMAIN_VALIDATION_ORDER,
          authorization: AUTHORIZATION_ORDER,
          logging: LOGGING_ORDER,
          rateLimit: RATE_LIMIT_ORDER,
        };

        for (const row of rows) {
          expect(orderMap[row.middleware]).toBe(Number(row.order));
        }

        // Also verify relative ordering
        expect(STRUCTURE_VALIDATION_ORDER).toBeLessThan(DOMAIN_VALIDATION_ORDER);
        expect(DOMAIN_VALIDATION_ORDER).toBeLessThan(AUTHORIZATION_ORDER);
        expect(AUTHORIZATION_ORDER).toBeLessThan(LOGGING_ORDER);
        expect(LOGGING_ORDER).toBeLessThan(RATE_LIMIT_ORDER);
      });
    });
  });
});
