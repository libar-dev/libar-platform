/**
 * Agent Command Router - Step Definitions
 *
 * BDD step definitions for getRoute(), validateRoutes(), and COMMAND_ROUTING_ERROR_CODES including:
 * - getRoute returns route when exists
 * - getRoute returns undefined when route does not exist
 * - validateRoutes produces success results for valid routes
 * - validateRoutes detects missing commandType (COMMAND_NOT_REGISTERED)
 * - validateRoutes detects missing boundedContext (UNKNOWN_ROUTE)
 * - validateRoutes detects missing toOrchestratorArgs (INVALID_TRANSFORM)
 * - validateRoutes returns empty array for empty route map
 * - COMMAND_ROUTING_ERROR_CODES contains all expected codes
 *
 * Mechanical migration from tests/unit/agent/command-router.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  getRoute,
  validateRoutes,
  COMMAND_ROUTING_ERROR_CODES,
  type AgentCommandRouteMap,
  type AgentCommandRoute,
} from "../../../src/agent/command-router.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createValidRoute(overrides?: Partial<AgentCommandRoute>): AgentCommandRoute {
  return {
    commandType: "CancelOrder",
    boundedContext: "orders",
    toOrchestratorArgs: (cmd, ctx) => ({
      orderId: "order-123",
      agentId: ctx.agentId,
      correlationId: ctx.correlationId,
    }),
    ...overrides,
  };
}

function createValidRouteMap(): AgentCommandRouteMap {
  return {
    SuggestCustomerOutreach: {
      commandType: "SuggestCustomerOutreach",
      boundedContext: "agent",
      toOrchestratorArgs: (cmd, ctx) => ({
        customerId: "cust-123",
        agentId: ctx.agentId,
        correlationId: ctx.correlationId,
      }),
    },
    CancelOrder: {
      commandType: "CancelOrder",
      boundedContext: "orders",
      toOrchestratorArgs: (cmd, _ctx) => ({
        orderId: "ord-456",
        reason: cmd.reason,
      }),
    },
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  routes: AgentCommandRouteMap;
  routeResult: AgentCommandRoute | undefined;
  validationResults: Array<{
    success: boolean;
    commandType?: string;
    code?: string;
    message?: string;
  }>;
}

function createInitialState(): TestState {
  return {
    routes: {},
    routeResult: undefined,
    validationResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/command-router.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Rule: getRoute returns matching route or undefined
  // ===========================================================================

  Rule("getRoute returns matching route or undefined", ({ RuleScenario }) => {
    RuleScenario(
      "Returns the route when commandType exists in the map",
      ({ Given, When, Then, And }) => {
        Given('a valid route map with "CancelOrder" and "SuggestCustomerOutreach" routes', () => {
          state.routes = createValidRouteMap();
        });

        When('I get the route for "CancelOrder"', () => {
          state.routeResult = getRoute(state.routes, "CancelOrder");
        });

        Then("the route is defined", () => {
          expect(state.routeResult).toBeDefined();
        });

        And("the route has the following properties:", (_ctx: unknown, table: unknown) => {
          const rows = getDataTableRows<{ property: string; value: string }>(table);
          for (const row of rows) {
            const prop = row["property"];
            const expected = row["value"];
            if (prop === "commandType") {
              expect(state.routeResult!.commandType).toBe(expected);
            } else if (prop === "boundedContext") {
              expect(state.routeResult!.boundedContext).toBe(expected);
            }
          }
        });

        And("the route toOrchestratorArgs is a function", () => {
          expect(typeof state.routeResult!.toOrchestratorArgs).toBe("function");
        });
      }
    );

    RuleScenario(
      "Returns undefined when commandType does not exist in the map",
      ({ Given, When, Then }) => {
        Given('a valid route map with "CancelOrder" and "SuggestCustomerOutreach" routes', () => {
          state.routes = createValidRouteMap();
        });

        When('I get the route for "NonExistentCommand"', () => {
          state.routeResult = getRoute(state.routes, "NonExistentCommand");
        });

        Then("the route is undefined", () => {
          expect(state.routeResult).toBeUndefined();
        });
      }
    );

    RuleScenario("Returns undefined for empty route map", ({ Given, When, Then }) => {
      Given("an empty route map", () => {
        state.routes = {};
      });

      When('I get the route for "AnyCommand"', () => {
        state.routeResult = getRoute(state.routes, "AnyCommand");
      });

      Then("the route is undefined", () => {
        expect(state.routeResult).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // Rule: validateRoutes produces success or error results per route
  // ===========================================================================

  Rule("validateRoutes produces success or error results per route", ({ RuleScenario }) => {
    RuleScenario("Produces success results for valid routes", ({ Given, When, Then, And }) => {
      Given('a valid route map with "CancelOrder" and "SuggestCustomerOutreach" routes', () => {
        state.routes = createValidRouteMap();
      });

      When("I validate the routes", () => {
        state.validationResults = validateRoutes(state.routes) as Array<{
          success: boolean;
          commandType?: string;
          code?: string;
          message?: string;
        }>;
      });

      Then("the validation results count is 2", () => {
        expect(state.validationResults).toHaveLength(2);
      });

      And("all results are successful", () => {
        for (const result of state.validationResults) {
          expect(result.success).toBe(true);
        }
      });

      And("the successful command types include:", (_ctx: unknown, table: unknown) => {
        const rows = getDataTableRows<{ commandType: string }>(table);
        const successResults = state.validationResults.filter((r) => r.success === true);
        const commandTypes = successResults.map(
          (r) => (r as { success: true; commandType: string }).commandType
        );
        for (const row of rows) {
          expect(commandTypes).toContain(row["commandType"]);
        }
      });
    });

    RuleScenario(
      "Returns COMMAND_NOT_REGISTERED error for missing commandType",
      ({ Given, When, Then, And }) => {
        Given('a route map with a "BadRoute" entry that has empty commandType', () => {
          state.routes = {
            BadRoute: createValidRoute({ commandType: "" }),
          };
        });

        When("I validate the routes", () => {
          state.validationResults = validateRoutes(state.routes) as Array<{
            success: boolean;
            commandType?: string;
            code?: string;
            message?: string;
          }>;
        });

        Then("the validation results count is 1", () => {
          expect(state.validationResults).toHaveLength(1);
        });

        And('the first result is a failure with code "COMMAND_NOT_REGISTERED"', () => {
          expect(state.validationResults[0].success).toBe(false);
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.code).toBe(COMMAND_ROUTING_ERROR_CODES.COMMAND_NOT_REGISTERED);
        });

        And('the failure message contains "BadRoute"', () => {
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.message).toContain("BadRoute");
        });

        And('the failure message contains "missing commandType"', () => {
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.message).toContain("missing commandType");
        });
      }
    );

    RuleScenario(
      "Returns UNKNOWN_ROUTE error for missing boundedContext",
      ({ Given, When, Then, And }) => {
        Given('a route map with a "NoBCRoute" entry that has empty boundedContext', () => {
          state.routes = {
            NoBCRoute: createValidRoute({ boundedContext: "" }),
          };
        });

        When("I validate the routes", () => {
          state.validationResults = validateRoutes(state.routes) as Array<{
            success: boolean;
            commandType?: string;
            code?: string;
            message?: string;
          }>;
        });

        Then("the validation results count is 1", () => {
          expect(state.validationResults).toHaveLength(1);
        });

        And('the first result is a failure with code "UNKNOWN_ROUTE"', () => {
          expect(state.validationResults[0].success).toBe(false);
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.code).toBe(COMMAND_ROUTING_ERROR_CODES.UNKNOWN_ROUTE);
        });

        And('the failure message contains "NoBCRoute"', () => {
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.message).toContain("NoBCRoute");
        });

        And('the failure message contains "missing boundedContext"', () => {
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.message).toContain("missing boundedContext");
        });
      }
    );

    RuleScenario(
      "Returns INVALID_TRANSFORM error for missing toOrchestratorArgs",
      ({ Given, When, Then, And }) => {
        Given(
          'a route map with a "NoTransformRoute" entry that has undefined toOrchestratorArgs',
          () => {
            state.routes = {
              NoTransformRoute: {
                commandType: "SomeCommand",
                boundedContext: "someContext",
                toOrchestratorArgs: undefined as unknown as AgentCommandRoute["toOrchestratorArgs"],
              },
            };
          }
        );

        When("I validate the routes", () => {
          state.validationResults = validateRoutes(state.routes) as Array<{
            success: boolean;
            commandType?: string;
            code?: string;
            message?: string;
          }>;
        });

        Then("the validation results count is 1", () => {
          expect(state.validationResults).toHaveLength(1);
        });

        And('the first result is a failure with code "INVALID_TRANSFORM"', () => {
          expect(state.validationResults[0].success).toBe(false);
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.code).toBe(COMMAND_ROUTING_ERROR_CODES.INVALID_TRANSFORM);
        });

        And('the failure message contains "NoTransformRoute"', () => {
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.message).toContain("NoTransformRoute");
        });

        And('the failure message contains "missing toOrchestratorArgs"', () => {
          const failure = state.validationResults[0] as {
            success: false;
            code: string;
            message: string;
          };
          expect(failure.message).toContain("missing toOrchestratorArgs");
        });
      }
    );

    RuleScenario("Returns empty array for empty route map", ({ Given, When, Then }) => {
      Given("an empty route map", () => {
        state.routes = {};
      });

      When("I validate the routes", () => {
        state.validationResults = validateRoutes(state.routes) as Array<{
          success: boolean;
          commandType?: string;
          code?: string;
          message?: string;
        }>;
      });

      Then("the validation results are empty", () => {
        expect(state.validationResults).toEqual([]);
      });
    });

    RuleScenario(
      "Validates mixed valid and invalid routes independently",
      ({ Given, When, Then, And }) => {
        Given(
          'a route map with a valid "ValidRoute" and an invalid "InvalidRoute" with empty commandType',
          () => {
            state.routes = {
              ValidRoute: createValidRoute(),
              InvalidRoute: createValidRoute({ commandType: "" }),
            };
          }
        );

        When("I validate the routes", () => {
          state.validationResults = validateRoutes(state.routes) as Array<{
            success: boolean;
            commandType?: string;
            code?: string;
            message?: string;
          }>;
        });

        Then("the validation results count is 2", () => {
          expect(state.validationResults).toHaveLength(2);
        });

        And("the success count is 1", () => {
          const successCount = state.validationResults.filter((r) => r.success === true).length;
          expect(successCount).toBe(1);
        });

        And("the failure count is 1", () => {
          const failureCount = state.validationResults.filter((r) => r.success === false).length;
          expect(failureCount).toBe(1);
        });
      }
    );
  });

  // ===========================================================================
  // Rule: COMMAND_ROUTING_ERROR_CODES contains all expected codes
  // ===========================================================================

  Rule("COMMAND_ROUTING_ERROR_CODES contains all expected codes", ({ RuleScenario }) => {
    RuleScenario("Contains all expected error codes", ({ Then }) => {
      Then(
        "COMMAND_ROUTING_ERROR_CODES contains the following codes:",
        (_ctx: unknown, table: unknown) => {
          const rows = getDataTableRows<{ code: string }>(table);
          for (const row of rows) {
            const code = row["code"];
            expect(
              COMMAND_ROUTING_ERROR_CODES[code as keyof typeof COMMAND_ROUTING_ERROR_CODES]
            ).toBe(code);
          }
        }
      );
    });

    RuleScenario("Has exactly 4 error codes", ({ Then }) => {
      Then("COMMAND_ROUTING_ERROR_CODES has exactly 4 entries", () => {
        expect(Object.keys(COMMAND_ROUTING_ERROR_CODES)).toHaveLength(4);
      });
    });

    RuleScenario("Values are string constants matching their keys", ({ Then }) => {
      Then("every COMMAND_ROUTING_ERROR_CODES value is a non-empty string matching its key", () => {
        for (const [key, value] of Object.entries(COMMAND_ROUTING_ERROR_CODES)) {
          expect(typeof value).toBe("string");
          expect(value.length).toBeGreaterThan(0);
          expect(value).toBe(key);
        }
      });
    });
  });
});
