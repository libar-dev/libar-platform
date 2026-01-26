/**
 * Step Definitions for Bounded Context Contract Helper Functions
 *
 * Tests the define* helper functions and category validators from @libar-dev/platform-bc.
 * This is a Layer 0 package (pure TypeScript, no Convex dependencies),
 * so tests run without any backend - just pure function testing.
 *
 * @libar-docs
 * @libar-docs-pattern BddTestingInfrastructure
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  defineCommand,
  defineEvent,
  defineProjection,
  defineProcessManager,
  isProjectionCategory,
  isLogicProjection,
  isViewProjection,
  isClientExposed,
  type CommandDefinition,
  type EventDefinition,
  type ProjectionDefinition,
  type ProjectionCategory,
} from "../../src/index.js";

// ============================================================================
// Test State
// ============================================================================

interface ScenarioState {
  commandDefinition: CommandDefinition<string> | null;
  eventDefinition: EventDefinition<string> | null;
  projectionDefinition: ProjectionDefinition<string> | null;
  projectionCategory: ProjectionCategory | null;
  validatorResult: boolean | null;
  thrownError: Error | null;
}

let state: ScenarioState | null = null;

function initState(): ScenarioState {
  return {
    commandDefinition: null,
    eventDefinition: null,
    projectionDefinition: null,
    projectionCategory: null,
    validatorResult: null,
    thrownError: null,
  };
}

// ============================================================================
// Feature Tests
// ============================================================================

const feature = await loadFeature("tests/features/behavior/bc-contracts.feature");

describeFeature(feature, ({ Scenario, ScenarioOutline, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  // ==========================================================================
  // defineCommand Scenarios
  // ==========================================================================

  Scenario("defineCommand preserves literal commandType", ({ Given, When, Then, And }) => {
    Given('a command definition with commandType "CreateOrder"', async () => {
      state = initState();
    });

    When("I call defineCommand with the definition", async () => {
      state!.commandDefinition = defineCommand({
        commandType: "CreateOrder",
        description: "Creates a new order",
        targetAggregate: "Order",
        createsAggregate: true,
        producesEvents: ["OrderCreated"],
      });
    });

    Then('the result commandType should be "CreateOrder"', async () => {
      expect(state!.commandDefinition!.commandType).toBe("CreateOrder");
    });

    And("the result should preserve the createsAggregate flag as true", async () => {
      expect(state!.commandDefinition!.createsAggregate).toBe(true);
    });
  });

  Scenario("defineCommand includes all metadata fields", ({ Given, When, Then, And }) => {
    Given("a command definition with multiple producesEvents", async () => {
      state = initState();
    });

    When("I call defineCommand with the definition", async () => {
      state!.commandDefinition = defineCommand({
        commandType: "ProcessOrder",
        description: "Processes an order with multiple outcomes",
        targetAggregate: "Order",
        createsAggregate: false,
        producesEvents: ["OrderProcessed", "OrderFailed"],
        errorCodes: ["ORDER_NOT_FOUND"],
      });
    });

    Then("the result should have producesEvents with 2 items", async () => {
      expect(state!.commandDefinition!.producesEvents).toHaveLength(2);
    });

    And("the result should have errorCodes with 1 item", async () => {
      expect(state!.commandDefinition!.errorCodes).toHaveLength(1);
    });
  });

  // ==========================================================================
  // defineEvent Scenarios
  // ==========================================================================

  Scenario("defineEvent preserves literal eventType", ({ Given, When, Then, And }) => {
    Given('an event definition with eventType "OrderCreated"', async () => {
      state = initState();
    });

    When("I call defineEvent with the definition", async () => {
      state!.eventDefinition = defineEvent({
        eventType: "OrderCreated",
        description: "Emitted when an order is created",
        sourceAggregate: "Order",
        category: "domain",
        schemaVersion: 1,
        producedBy: ["CreateOrder"],
      });
    });

    Then('the result eventType should be "OrderCreated"', async () => {
      expect(state!.eventDefinition!.eventType).toBe("OrderCreated");
    });

    And('the result category should be "domain"', async () => {
      expect(state!.eventDefinition!.category).toBe("domain");
    });
  });

  Scenario("defineEvent supports all event categories", ({ Given, When, Then }) => {
    Given('an event definition with category "integration"', async () => {
      state = initState();
    });

    When("I call defineEvent with the definition", async () => {
      state!.eventDefinition = defineEvent({
        eventType: "OrderCompletedIntegration",
        description: "Integration event for cross-context communication",
        sourceAggregate: "Order",
        category: "integration",
        schemaVersion: 1,
        producedBy: ["CompleteOrder"],
      });
    });

    Then('the result category should be "integration"', async () => {
      expect(state!.eventDefinition!.category).toBe("integration");
    });
  });

  // ==========================================================================
  // defineProjection Scenarios
  // ==========================================================================

  Scenario("defineProjection preserves literal projectionName", ({ Given, When, Then, And }) => {
    Given('a projection definition with projectionName "orderSummary"', async () => {
      state = initState();
    });

    When("I call defineProjection with the definition", async () => {
      state!.projectionDefinition = defineProjection({
        projectionName: "orderSummary",
        description: "Order summary for listing views",
        targetTable: "orderSummaries",
        partitionKeyField: "orderId",
        eventSubscriptions: ["OrderCreated"] as const,
        context: "orders",
        type: "primary",
      });
    });

    Then('the result projectionName should be "orderSummary"', async () => {
      expect(state!.projectionDefinition!.projectionName).toBe("orderSummary");
    });

    And('the result type should be "primary"', async () => {
      expect(state!.projectionDefinition!.type).toBe("primary");
    });
  });

  Scenario("defineProjection preserves eventSubscriptions tuple", ({ Given, When, Then }) => {
    Given("a projection definition with 3 event subscriptions", async () => {
      state = initState();
    });

    When("I call defineProjection with the definition", async () => {
      state!.projectionDefinition = defineProjection({
        projectionName: "orderDetail",
        description: "Detailed order view",
        targetTable: "orderDetails",
        partitionKeyField: "orderId",
        eventSubscriptions: ["OrderCreated", "OrderSubmitted", "OrderConfirmed"] as const,
        context: "orders",
        type: "primary",
      });
    });

    Then("the result should have eventSubscriptions with 3 items", async () => {
      expect(state!.projectionDefinition!.eventSubscriptions).toHaveLength(3);
    });
  });

  // ==========================================================================
  // isProjectionCategory Scenarios
  // ==========================================================================

  ScenarioOutline(
    "isProjectionCategory validates category strings",
    ({ When, Then }, variables: { value: string; expected: string }) => {
      When('I check isProjectionCategory with value "<value>"', async () => {
        state = initState();
        state!.validatorResult = isProjectionCategory(variables.value);
      });

      Then("the result should be <expected>", async () => {
        const expectedBool = variables.expected === "true";
        expect(state!.validatorResult).toBe(expectedBool);
      });
    }
  );

  // ==========================================================================
  // Category-Specific Validator Scenarios
  // ==========================================================================

  Scenario("isLogicProjection returns true only for logic category", ({ Given, When, Then }) => {
    Given('a projection category "logic"', async () => {
      state = initState();
      state!.projectionCategory = "logic";
    });

    When("I check isLogicProjection", async () => {
      state!.validatorResult = isLogicProjection(state!.projectionCategory!);
    });

    Then("the result should be true", async () => {
      expect(state!.validatorResult).toBe(true);
    });
  });

  Scenario("isViewProjection returns true only for view category", ({ Given, When, Then }) => {
    Given('a projection category "view"', async () => {
      state = initState();
      state!.projectionCategory = "view";
    });

    When("I check isViewProjection", async () => {
      state!.validatorResult = isViewProjection(state!.projectionCategory!);
    });

    Then("the result should be true", async () => {
      expect(state!.validatorResult).toBe(true);
    });
  });

  Scenario("isClientExposed returns true only for view category", ({ Given, When, Then }) => {
    Given('a projection category "view"', async () => {
      state = initState();
      state!.projectionCategory = "view";
    });

    When("I check isClientExposed", async () => {
      state!.validatorResult = isClientExposed(state!.projectionCategory!);
    });

    Then("the result should be true", async () => {
      expect(state!.validatorResult).toBe(true);
    });
  });

  Scenario("isClientExposed returns false for non-view categories", ({ Given, When, Then }) => {
    Given('a projection category "reporting"', async () => {
      state = initState();
      state!.projectionCategory = "reporting";
    });

    When("I check isClientExposed", async () => {
      state!.validatorResult = isClientExposed(state!.projectionCategory!);
    });

    Then("the result should be false", async () => {
      expect(state!.validatorResult).toBe(false);
    });
  });

  // ==========================================================================
  // defineProcessManager Validation Scenarios
  // ==========================================================================

  Scenario(
    "defineProcessManager validates time-triggered requires cronConfig",
    ({ Given, When, Then }) => {
      Given('a process manager definition with triggerType "time" without cronConfig', async () => {
        state = initState();
      });

      When("I call defineProcessManager expecting an error", async () => {
        try {
          defineProcessManager({
            processManagerName: "invalidTimePM",
            description: "Time PM without cronConfig",
            triggerType: "time",
            eventSubscriptions: [] as const,
            emitsCommands: ["TestCommand"],
            context: "test",
            // Missing cronConfig
          });
        } catch (error) {
          state!.thrownError = error as Error;
        }
      });

      Then('it should throw an error containing "requires cronConfig"', async () => {
        expect(state!.thrownError).not.toBeNull();
        expect(state!.thrownError!.message).toContain("requires cronConfig");
      });
    }
  );

  Scenario(
    "defineProcessManager validates event-triggered requires subscriptions",
    ({ Given, When, Then }) => {
      Given(
        'a process manager definition with triggerType "event" without subscriptions',
        async () => {
          state = initState();
        }
      );

      When("I call defineProcessManager expecting an error", async () => {
        try {
          defineProcessManager({
            processManagerName: "invalidEventPM",
            description: "Event PM without subscriptions",
            triggerType: "event",
            eventSubscriptions: [] as const, // Empty
            emitsCommands: ["TestCommand"],
            context: "test",
          });
        } catch (error) {
          state!.thrownError = error as Error;
        }
      });

      Then(
        'it should throw an error containing "requires at least one event subscription"',
        async () => {
          expect(state!.thrownError).not.toBeNull();
          expect(state!.thrownError!.message).toContain("requires at least one event subscription");
        }
      );
    }
  );
});
