/**
 * Order Step Definitions for Unit Tests
 *
 * Uses convex-test for mock backend testing.
 * These steps test command behavior only - no projection verification.
 *
 * Projection verification is done in integration tests with real backend.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import { generateCustomerId, generateCommandId } from "../fixtures/orders";
import { createUnitTestContext } from "../support/setup";
import type { OrderItem } from "../support/world";

// Type for vitest-cucumber DataTable rows (field/value pairs)
type DataTableRow = { field: string; value: string };

/**
 * Convert vitest-cucumber DataTable rows to a key-value object.
 */
function tableRowsToObject(rows: DataTableRow[]): Record<string, string> {
  return rows.reduce(
    (acc, row) => {
      acc[row.field] = row.value;
      return acc;
    },
    {} as Record<string, string>
  );
}

// Type for convex-test instance
type ConvexTestInstance = ReturnType<typeof createUnitTestContext>;

// State interface for each scenario
interface ScenarioState {
  t: ConvexTestInstance;
  lastResult: unknown;
  lastError: Error | null;
  scenario: {
    orderId?: string;
    customerId?: string;
    items?: OrderItem[];
    commandId?: string;
  };
}

// Module-level state shared across steps within a scenario
let scenarioState: ScenarioState | null = null;

// Initialize state for a scenario
function initState(): ScenarioState {
  return {
    t: createUnitTestContext(),
    lastResult: null,
    lastError: null,
    scenario: {},
  };
}

// Load the create-order feature
const createOrderFeature = await loadFeature("tests/features/behavior/orders/create-order.feature");

describeFeature(createOrderFeature, ({ Scenario, Background, AfterEachScenario }) => {
  // Clean up after each scenario
  AfterEachScenario(() => {
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the system is ready", async () => {
      // Initialize fresh state for each scenario
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  Scenario("Successfully create a new order", ({ Given, When, Then }) => {
    Given("no order exists with ID {string}", async (_ctx: unknown, orderId: string) => {
      scenarioState!.scenario.orderId = orderId;
      // In a fresh test, no orders exist - nothing to verify
    });

    When("I send a CreateOrder command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);
      const orderId = data.orderId || scenarioState!.scenario.orderId;
      const customerId = data.customerId || generateCustomerId();

      scenarioState!.scenario.orderId = orderId;
      scenarioState!.scenario.customerId = customerId;

      try {
        scenarioState!.lastResult = await scenarioState!.t.mutation(api.orders.createOrder, {
          orderId,
          customerId,
        });
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then("the command should succeed", () => {
      // Check if there was an error - fail fast with the error message
      if (scenarioState!.lastError) {
        throw new Error(`Command failed with error: ${scenarioState!.lastError.message}`);
      }
      expect(scenarioState!.lastResult).toBeDefined();
      const result = scenarioState!.lastResult as { status: string };
      expect(result.status).toBe("success");
    });
  });

  Scenario("Cannot create order with existing ID", ({ Given, When, Then }) => {
    Given("an order {string} already exists", async (_ctx: unknown, orderId: string) => {
      scenarioState!.scenario.orderId = orderId;
      scenarioState!.scenario.customerId = generateCustomerId();

      // Create the order first
      await scenarioState!.t.mutation(api.orders.createOrder, {
        orderId,
        customerId: scenarioState!.scenario.customerId,
      });
    });

    When("I send a CreateOrder command with:", async (_ctx: unknown, table: DataTableRow[]) => {
      const data = tableRowsToObject(table);

      try {
        scenarioState!.lastResult = await scenarioState!.t.mutation(api.orders.createOrder, {
          orderId: data.orderId,
          customerId: data.customerId,
        });
        scenarioState!.lastError = null;
      } catch (error) {
        scenarioState!.lastError = error as Error;
        scenarioState!.lastResult = null;
      }
    });

    Then(
      "the command should be rejected with code {string}",
      (_ctx: unknown, expectedCode: string) => {
        // Command was either rejected or threw an error
        if (scenarioState!.lastResult) {
          const result = scenarioState!.lastResult as { status: string; code?: string };
          expect(result.status).toBe("rejected");
          expect(result.code).toBe(expectedCode);
        } else {
          expect(scenarioState!.lastError).toBeDefined();
          expect(scenarioState!.lastError?.message).toContain(expectedCode);
        }
      }
    );
  });

  Scenario("CreateOrder is idempotent with same commandId", ({ Given, When, Then }) => {
    Given("no order exists with ID {string}", async (_ctx: unknown, orderId: string) => {
      scenarioState!.scenario.orderId = orderId;
      scenarioState!.scenario.customerId = generateCustomerId();
    });

    When(
      "I send a CreateOrder command twice with the same commandId for order {string}",
      async (_ctx: unknown, orderId: string) => {
        const commandId = generateCommandId();
        const customerId = scenarioState!.scenario.customerId || generateCustomerId();

        // First call
        const result1 = await scenarioState!.t.mutation(api.orders.createOrder, {
          orderId,
          customerId,
          commandId,
        });

        // Second call with same commandId
        const result2 = await scenarioState!.t.mutation(api.orders.createOrder, {
          orderId,
          customerId,
          commandId,
        });

        scenarioState!.lastResult = { first: result1, second: result2 };
      }
    );

    Then("the second command should return duplicate status", () => {
      const results = scenarioState!.lastResult as { first: unknown; second: { status: string } };
      expect(results.second.status).toBe("duplicate");
    });
  });
});
