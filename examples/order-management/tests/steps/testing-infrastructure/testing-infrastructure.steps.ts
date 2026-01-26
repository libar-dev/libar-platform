/**
 * Testing Infrastructure Step Definitions
 *
 * BDD step definitions that exercise the platform testing utilities.
 * This is a "dogfooding" approach - testing our testing utilities with BDD.
 *
 * Tests cover:
 * - Test isolation (testRunId, withPrefix)
 * - Decider assertions (assertDecisionSuccess, etc.)
 * - FSM assertions (assertCanTransition, etc.)
 * - DataTable parsing (tableRowsToObject, etc.)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Platform testing utilities under test
import {
  generateTestRunId,
  testRunId,
  withPrefix,
  withCustomPrefix,
  tableRowsToObject,
  parseTableValue,
  getRequiredField,
  getOptionalField,
  type DataTableRow,
} from "@libar-dev/platform-core/testing";

import {
  assertDecisionSuccess,
  assertDecisionRejected,
  assertDecisionFailed,
  getSuccessEvent,
  getSuccessData,
  getSuccessStateUpdate,
  assertEventType,
  assertEventPayload,
  assertStateUpdate,
  assertRejectionCode,
  assertRejectionMessage,
  assertFailureReason,
} from "@libar-dev/platform-decider/testing";

import {
  assertCanTransition,
  assertCannotTransition,
  assertIsTerminalState,
  assertIsNotTerminalState,
  assertIsInitialState,
  assertIsValidState,
  assertValidTransitionsFrom,
  getAllValidTransitions,
  getAllStates,
  getTerminalStates,
  getNonTerminalStates,
} from "@libar-dev/platform-fsm/testing";

import { defineFSM, type FSM } from "@libar-dev/platform-fsm";
import type { DeciderOutput } from "@libar-dev/platform-decider";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  generatedIds: string[];
  result: unknown;
  error: Error | null;
  parsedObject: Record<string, string>;
  deciderOutput: DeciderOutput<unknown, unknown, unknown> | null;
  fsm: FSM<string> | null;
  transitionList: Array<[string, string]>;
  stateList: string[];
}

let state: TestState;

function resetState(): void {
  state = {
    generatedIds: [],
    result: undefined,
    error: null,
    parsedObject: {},
    deciderOutput: null,
    fsm: null,
    transitionList: [],
    stateList: [],
  };
}

// =============================================================================
// Test Isolation Feature
// =============================================================================

const testIsolationFeature = await loadFeature(
  "tests/features/behavior/testing-infrastructure/test-isolation.feature"
);

describeFeature(testIsolationFeature, ({ Scenario, Background, AfterEachScenario }) => {
  Background(({ Given }) => {
    Given("the platform-core testing module is imported", () => {
      resetState();
      // Module is already imported at the top of this file
      // This step confirms the testing infrastructure is available
    });
  });

  AfterEachScenario(() => {
    resetState();
  });

  Scenario("Generate unique test run ID", ({ When, Then, And }) => {
    When("I call generateTestRunId()", () => {
      state.generatedIds.push(generateTestRunId());
    });

    Then("I receive a unique string identifier", () => {
      expect(state.generatedIds[0]).toBeDefined();
      expect(typeof state.generatedIds[0]).toBe("string");
      expect(state.generatedIds[0].length).toBeGreaterThan(0);
    });

    And("subsequent calls return different IDs", () => {
      const secondId = generateTestRunId();
      expect(secondId).not.toBe(state.generatedIds[0]);
    });
  });

  Scenario("Module-level testRunId is stable within a test run", ({ Given, When, Then }) => {
    Given("a test run has started", () => {
      // testRunId is already initialized when the module loads
      expect(testRunId).toBeDefined();
    });

    When("I access testRunId multiple times", () => {
      state.generatedIds.push(testRunId);
      state.generatedIds.push(testRunId);
      state.generatedIds.push(testRunId);
    });

    Then("the same value is returned each time", () => {
      expect(state.generatedIds[0]).toBe(state.generatedIds[1]);
      expect(state.generatedIds[1]).toBe(state.generatedIds[2]);
    });
  });

  Scenario("Prefix entity IDs with test run namespace", ({ Given, When, Then, And }) => {
    Given("a testRunId has been generated", () => {
      expect(testRunId).toBeDefined();
    });

    When('I call withPrefix("order-123")', () => {
      state.result = withPrefix("order-123");
    });

    Then("the result contains the testRunId prefix", () => {
      expect(state.result).toContain(testRunId);
    });

    And("the original ID is preserved after the prefix", () => {
      expect(state.result).toContain("order-123");
    });

    And('the format is "{testRunId}_order-123"', () => {
      expect(state.result).toBe(`${testRunId}_order-123`);
    });
  });

  Scenario("Custom prefix for specific isolation", ({ When, Then }) => {
    When('I call withCustomPrefix("mytest", "order-123")', () => {
      state.result = withCustomPrefix("mytest", "order-123");
    });

    Then('the result is "mytest_order-123"', () => {
      expect(state.result).toBe("mytest_order-123");
    });
  });

  Scenario("Test isolation prevents cross-test pollution", ({ Given, And, When, Then }) => {
    let testAEntity: string;
    let testBPrefix: string;

    Given('test A creates an entity with withPrefix("entity-1")', () => {
      testAEntity = withPrefix("entity-1");
    });

    And("test B has a different testRunId", () => {
      testBPrefix = generateTestRunId();
      expect(testBPrefix).not.toBe(testRunId);
    });

    When("test B queries for entities", () => {
      // Simulate test B's namespace
      const testBEntity = withCustomPrefix(testBPrefix, "entity-1");
      state.result = testBEntity;
    });

    Then("test B does not see test A's entity", () => {
      // Test B's entity has a different prefix than test A's
      expect(state.result).not.toBe(testAEntity);
    });
  });
});

// =============================================================================
// Decider Assertions Feature
// =============================================================================

const deciderAssertionsFeature = await loadFeature(
  "tests/features/behavior/testing-infrastructure/decider-assertions.feature"
);

describeFeature(deciderAssertionsFeature, ({ Scenario, Background, AfterEachScenario }) => {
  Background(({ Given }) => {
    Given("the platform-decider testing module is imported", () => {
      resetState();
      // Module is already imported at the top of this file
    });
  });

  AfterEachScenario(() => {
    resetState();
  });

  // Success Assertions
  Scenario("Assert decision success", ({ Given, When, Then }) => {
    Given('a DeciderOutput with status "success"', () => {
      state.deciderOutput = {
        status: "success",
        event: { eventType: "TestEvent", payload: {} },
        data: {},
        stateUpdate: {},
      };
    });

    When("I call assertDecisionSuccess(result)", () => {
      try {
        assertDecisionSuccess(state.deciderOutput);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert decision success fails for rejected result", ({ Given, When, Then, And }) => {
    Given('a DeciderOutput with status "rejected" and code "INVALID_STATE"', () => {
      state.deciderOutput = {
        status: "rejected",
        code: "INVALID_STATE",
        message: "Invalid state for operation",
      };
    });

    When("I call assertDecisionSuccess(result)", () => {
      try {
        assertDecisionSuccess(state.deciderOutput);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion fails", () => {
      expect(state.error).not.toBeNull();
    });

    And('the error message contains "success"', () => {
      expect(state.error?.message.toLowerCase()).toContain("success");
    });

    And('the error message indicates the actual status was "rejected"', () => {
      expect(state.error?.message.toLowerCase()).toContain("rejected");
    });
  });

  Scenario("Extract success event from result", ({ Given, When, Then, And }) => {
    Given('a DeciderOutput with status "success" and event type "OrderCreated"', () => {
      state.deciderOutput = {
        status: "success",
        event: { eventType: "OrderCreated", payload: { orderId: "123" } },
        data: {},
        stateUpdate: {},
      };
    });

    When("I call getSuccessEvent(result)", () => {
      state.result = getSuccessEvent(state.deciderOutput);
    });

    Then("I receive the event object", () => {
      expect(state.result).toBeDefined();
    });

    And('the event type is "OrderCreated"', () => {
      expect((state.result as { eventType: string }).eventType).toBe("OrderCreated");
    });
  });

  Scenario("Extract success data from result", ({ Given, When, Then }) => {
    Given('a DeciderOutput with status "success" and data containing orderId "ord-123"', () => {
      state.deciderOutput = {
        status: "success",
        event: { eventType: "TestEvent", payload: {} },
        data: { orderId: "ord-123" },
        stateUpdate: {},
      };
    });

    When("I call getSuccessData(result)", () => {
      state.result = getSuccessData(state.deciderOutput);
    });

    Then('I receive an object with orderId "ord-123"', () => {
      expect((state.result as { orderId: string }).orderId).toBe("ord-123");
    });
  });

  Scenario("Extract state update from result", ({ Given, When, Then, And }) => {
    Given(
      'a DeciderOutput with status "success" and state update setting status to "submitted"',
      () => {
        state.deciderOutput = {
          status: "success",
          event: { eventType: "TestEvent", payload: {} },
          data: {},
          stateUpdate: { status: "submitted" },
        };
      }
    );

    When("I call getSuccessStateUpdate(result)", () => {
      state.result = getSuccessStateUpdate(state.deciderOutput);
    });

    Then("I receive the state update object", () => {
      expect(state.result).toBeDefined();
    });

    And('the status field is "submitted"', () => {
      expect((state.result as { status: string }).status).toBe("submitted");
    });
  });

  // Event Assertions
  Scenario("Assert event type matches", ({ Given, When, Then }) => {
    Given('a DeciderOutput with status "success" and event type "OrderCreated"', () => {
      state.deciderOutput = {
        status: "success",
        event: { eventType: "OrderCreated", payload: {} },
        data: {},
        stateUpdate: {},
      };
    });

    When('I call assertEventType(result, "OrderCreated")', () => {
      try {
        assertEventType(state.deciderOutput, "OrderCreated");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert event type fails for wrong type", ({ Given, When, Then, And }) => {
    Given('a DeciderOutput with status "success" and event type "OrderCreated"', () => {
      state.deciderOutput = {
        status: "success",
        event: { eventType: "OrderCreated", payload: {} },
        data: {},
        stateUpdate: {},
      };
    });

    When('I call assertEventType(result, "OrderSubmitted")', () => {
      try {
        assertEventType(state.deciderOutput, "OrderSubmitted");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion fails", () => {
      expect(state.error).not.toBeNull();
    });

    And('the error message contains "OrderSubmitted"', () => {
      expect(state.error?.message).toContain("OrderSubmitted");
    });
  });

  Scenario("Assert event payload field", ({ Given, When, Then }) => {
    Given('a DeciderOutput with success event containing customerId "cust-456"', () => {
      state.deciderOutput = {
        status: "success",
        event: { eventType: "OrderCreated", payload: { customerId: "cust-456" } },
        data: {},
        stateUpdate: {},
      };
    });

    When('I call assertEventPayload(result, "customerId", "cust-456")', () => {
      try {
        assertEventPayload(state.deciderOutput, "customerId", "cust-456");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  // State Update Assertions
  Scenario("Assert state update field", ({ Given, When, Then }) => {
    Given(
      'a DeciderOutput with status "success" and state update setting status to "confirmed"',
      () => {
        state.deciderOutput = {
          status: "success",
          event: { eventType: "TestEvent", payload: {} },
          data: {},
          stateUpdate: { status: "confirmed" },
        };
      }
    );

    When('I call assertStateUpdate(result, "status", "confirmed")', () => {
      try {
        assertStateUpdate(state.deciderOutput, "status", "confirmed");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  // Rejection Assertions
  Scenario("Assert decision rejected", ({ Given, When, Then }) => {
    Given('a DeciderOutput with status "rejected" and code "ORDER_NOT_FOUND"', () => {
      state.deciderOutput = {
        status: "rejected",
        code: "ORDER_NOT_FOUND",
        message: "Order not found",
      };
    });

    When("I call assertDecisionRejected(result)", () => {
      try {
        assertDecisionRejected(state.deciderOutput);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert rejection code matches", ({ Given, When, Then }) => {
    Given('a DeciderOutput with status "rejected" and code "INVALID_STATE"', () => {
      state.deciderOutput = {
        status: "rejected",
        code: "INVALID_STATE",
        message: "Invalid state",
      };
    });

    When('I call assertRejectionCode(result, "INVALID_STATE")', () => {
      try {
        assertRejectionCode(state.deciderOutput, "INVALID_STATE");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert rejection code fails for wrong code", ({ Given, When, Then, And }) => {
    Given('a DeciderOutput with status "rejected" and code "INVALID_STATE"', () => {
      state.deciderOutput = {
        status: "rejected",
        code: "INVALID_STATE",
        message: "Invalid state",
      };
    });

    When('I call assertRejectionCode(result, "NOT_FOUND")', () => {
      try {
        assertRejectionCode(state.deciderOutput, "NOT_FOUND");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion fails", () => {
      expect(state.error).not.toBeNull();
    });

    And('the error message contains "INVALID_STATE"', () => {
      expect(state.error?.message).toContain("INVALID_STATE");
    });
  });

  Scenario("Assert rejection message contains text", ({ Given, When, Then }) => {
    Given(
      'a DeciderOutput with status "rejected" and message "Order must be in draft status"',
      () => {
        state.deciderOutput = {
          status: "rejected",
          code: "INVALID_STATE",
          message: "Order must be in draft status",
        };
      }
    );

    When('I call assertRejectionMessage(result, "draft status")', () => {
      try {
        assertRejectionMessage(state.deciderOutput, "draft status");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  // Failure Assertions
  Scenario("Assert decision failed", ({ Given, When, Then }) => {
    Given('a DeciderOutput with status "failed" and reason "Database connection error"', () => {
      state.deciderOutput = {
        status: "failed",
        reason: "Database connection error",
        event: { eventType: "OperationFailed", payload: {} },
      };
    });

    When("I call assertDecisionFailed(result)", () => {
      try {
        assertDecisionFailed(state.deciderOutput);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert failure reason matches", ({ Given, When, Then }) => {
    Given('a DeciderOutput with status "failed" and reason "Validation failed"', () => {
      state.deciderOutput = {
        status: "failed",
        reason: "Validation failed",
        event: { eventType: "ValidationFailed", payload: {} },
      };
    });

    When('I call assertFailureReason(result, "Validation")', () => {
      try {
        assertFailureReason(state.deciderOutput, "Validation");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });
});

// =============================================================================
// FSM Assertions Feature
// =============================================================================

const fsmAssertionsFeature = await loadFeature(
  "tests/features/behavior/testing-infrastructure/fsm-assertions.feature"
);

describeFeature(fsmAssertionsFeature, ({ Scenario, Background, BeforeEachScenario }) => {
  // Helper to set up the FSM - called before each scenario
  // FSMDefinition uses a transitions record mapping each state to its allowed target states
  const setupFSM = () => {
    state.fsm = defineFSM<"draft" | "submitted" | "confirmed" | "cancelled">({
      initial: "draft",
      transitions: {
        draft: ["submitted"],
        submitted: ["confirmed", "cancelled"],
        confirmed: ["cancelled"],
        cancelled: [], // terminal state
      },
    });
  };

  BeforeEachScenario(() => {
    resetState();
    setupFSM();
  });

  Background(({ Given, And }) => {
    Given("the platform-fsm testing module is imported", () => {
      // Module is already imported at the top of this file
      // FSM setup is done in BeforeEachScenario
    });

    And("an OrderStatus FSM with the following transitions:", () => {
      // FSM is already set up in BeforeEachScenario
      // This step exists to match the feature file's Background
    });
  });

  // Transition Assertions
  Scenario("Assert valid transition", ({ When, Then }) => {
    When('I call assertCanTransition(fsm, "draft", "submitted")', () => {
      try {
        assertCanTransition(state.fsm!, "draft", "submitted");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert invalid transition fails", ({ When, Then, And }) => {
    When('I call assertCanTransition(fsm, "cancelled", "confirmed")', () => {
      try {
        assertCanTransition(state.fsm!, "cancelled", "confirmed");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion fails", () => {
      expect(state.error).not.toBeNull();
    });

    And("the error message indicates the transition is not allowed", () => {
      expect(state.error?.message).toBeDefined();
    });
  });

  Scenario("Assert transition is not allowed", ({ When, Then }) => {
    When('I call assertCannotTransition(fsm, "draft", "confirmed")', () => {
      try {
        assertCannotTransition(state.fsm!, "draft", "confirmed");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert cannot transition fails for valid transition", ({ When, Then, And }) => {
    When('I call assertCannotTransition(fsm, "draft", "submitted")', () => {
      try {
        assertCannotTransition(state.fsm!, "draft", "submitted");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion fails", () => {
      expect(state.error).not.toBeNull();
    });

    And("the error message indicates the transition IS allowed", () => {
      expect(state.error?.message).toBeDefined();
    });
  });

  // State Property Assertions
  Scenario("Assert terminal state", ({ When, Then }) => {
    When('I call assertIsTerminalState(fsm, "cancelled")', () => {
      try {
        assertIsTerminalState(state.fsm!, "cancelled");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert terminal state fails for non-terminal", ({ When, Then, And }) => {
    When('I call assertIsTerminalState(fsm, "submitted")', () => {
      try {
        assertIsTerminalState(state.fsm!, "submitted");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion fails", () => {
      expect(state.error).not.toBeNull();
    });

    And('the error message indicates "submitted" is not terminal', () => {
      expect(state.error?.message).toBeDefined();
    });
  });

  Scenario("Assert non-terminal state", ({ When, Then }) => {
    When('I call assertIsNotTerminalState(fsm, "draft")', () => {
      try {
        assertIsNotTerminalState(state.fsm!, "draft");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert initial state", ({ When, Then }) => {
    When('I call assertIsInitialState(fsm, "draft")', () => {
      try {
        assertIsInitialState(state.fsm!, "draft");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert valid state", ({ When, Then }) => {
    When('I call assertIsValidState(fsm, "submitted")', () => {
      try {
        assertIsValidState(state.fsm!, "submitted");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Assert invalid state fails", ({ When, Then }) => {
    When('I call assertIsValidState(fsm, "nonexistent")', () => {
      try {
        assertIsValidState(state.fsm!, "nonexistent");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion fails", () => {
      expect(state.error).not.toBeNull();
    });
  });

  // Utility Functions
  Scenario("Get all valid transitions", ({ When, Then, And }) => {
    When("I call getAllValidTransitions(fsm)", () => {
      state.transitionList = getAllValidTransitions(state.fsm!);
    });

    Then("I receive a list of [from, to] state pairs", () => {
      expect(Array.isArray(state.transitionList)).toBe(true);
      expect(state.transitionList.length).toBeGreaterThan(0);
    });

    And('the list includes ["draft", "submitted"]', () => {
      const hasTransition = state.transitionList.some(
        ([from, to]) => from === "draft" && to === "submitted"
      );
      expect(hasTransition).toBe(true);
    });

    And('the list includes ["submitted", "confirmed"]', () => {
      const hasTransition = state.transitionList.some(
        ([from, to]) => from === "submitted" && to === "confirmed"
      );
      expect(hasTransition).toBe(true);
    });

    And('the list includes ["submitted", "cancelled"]', () => {
      const hasTransition = state.transitionList.some(
        ([from, to]) => from === "submitted" && to === "cancelled"
      );
      expect(hasTransition).toBe(true);
    });

    And('the list includes ["confirmed", "cancelled"]', () => {
      const hasTransition = state.transitionList.some(
        ([from, to]) => from === "confirmed" && to === "cancelled"
      );
      expect(hasTransition).toBe(true);
    });
  });

  Scenario("Get all states", ({ When, Then }) => {
    When("I call getAllStates(fsm)", () => {
      state.stateList = getAllStates(state.fsm!);
    });

    Then('I receive a list containing "draft", "submitted", "confirmed", "cancelled"', () => {
      expect(state.stateList).toContain("draft");
      expect(state.stateList).toContain("submitted");
      expect(state.stateList).toContain("confirmed");
      expect(state.stateList).toContain("cancelled");
    });
  });

  Scenario("Get terminal states", ({ When, Then }) => {
    When("I call getTerminalStates(fsm)", () => {
      state.stateList = getTerminalStates(state.fsm!);
    });

    Then('I receive a list containing only "cancelled"', () => {
      expect(state.stateList).toEqual(["cancelled"]);
    });
  });

  Scenario("Get non-terminal states", ({ When, Then, And }) => {
    When("I call getNonTerminalStates(fsm)", () => {
      state.stateList = getNonTerminalStates(state.fsm!);
    });

    Then('I receive a list containing "draft", "submitted", "confirmed"', () => {
      expect(state.stateList).toContain("draft");
      expect(state.stateList).toContain("submitted");
      expect(state.stateList).toContain("confirmed");
    });

    And('the list does not contain "cancelled"', () => {
      expect(state.stateList).not.toContain("cancelled");
    });
  });

  Scenario("Assert valid transitions from a state", ({ When, Then }) => {
    When('I call assertValidTransitionsFrom(fsm, "submitted", ["confirmed", "cancelled"])', () => {
      try {
        assertValidTransitionsFrom(state.fsm!, "submitted", ["confirmed", "cancelled"]);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("the assertion passes", () => {
      expect(state.error).toBeNull();
    });
  });
});

// =============================================================================
// DataTable Parsing Feature
// =============================================================================

const dataTableParsingFeature = await loadFeature(
  "tests/features/behavior/testing-infrastructure/data-table-parsing.feature"
);

describeFeature(dataTableParsingFeature, ({ Scenario, Background, AfterEachScenario }) => {
  Background(({ Given }) => {
    Given("the platform-core testing module is imported", () => {
      resetState();
      // Module is already imported at the top of this file
    });
  });

  AfterEachScenario(() => {
    resetState();
  });

  Scenario("Parse vertical DataTable to object", ({ Given, When, Then }) => {
    let rows: DataTableRow[];

    Given("a DataTable with field-value rows", () => {
      // Create sample DataTable rows in field/value format
      rows = [
        { field: "orderId", value: "order-123" },
        { field: "status", value: "draft" },
        { field: "quantity", value: "5" },
      ];
    });

    When("I call tableRowsToObject(rows)", () => {
      state.parsedObject = tableRowsToObject(rows);
    });

    Then("I receive an object with keys from field column and values from value column", () => {
      expect(state.parsedObject.orderId).toBe("order-123");
      expect(state.parsedObject.status).toBe("draft");
      expect(state.parsedObject.quantity).toBe("5");
    });
  });

  Scenario("Parse DataTable preserves all string values", ({ Given, When, Then, And }) => {
    let rows: DataTableRow[];

    Given('a DataTable with field-value rows including "isActive" as "true"', () => {
      rows = [
        { field: "name", value: "Test Order" },
        { field: "createdAt", value: "2024-01-15" },
        { field: "isActive", value: "true" },
      ];
    });

    When("I call tableRowsToObject(rows)", () => {
      state.parsedObject = tableRowsToObject(rows);
    });

    Then("all values are strings", () => {
      for (const value of Object.values(state.parsedObject)) {
        expect(typeof value).toBe("string");
      }
    });

    And('isActive is the string "true" not boolean true', () => {
      expect(state.parsedObject.isActive).toBe("true");
      expect(state.parsedObject.isActive).not.toBe(true);
    });
  });

  // Type Conversion
  Scenario("Parse integer value from string", ({ When, Then }) => {
    When('I call parseTableValue("42", "int")', () => {
      state.result = parseTableValue("42", "int");
    });

    Then("I receive the number 42", () => {
      expect(state.result).toBe(42);
      expect(typeof state.result).toBe("number");
    });
  });

  Scenario("Parse float value from string", ({ When, Then }) => {
    When('I call parseTableValue("3.14", "float")', () => {
      state.result = parseTableValue("3.14", "float");
    });

    Then("I receive the number 3.14", () => {
      expect(state.result).toBeCloseTo(3.14);
    });
  });

  Scenario("Parse boolean true from string", ({ When, Then }) => {
    When('I call parseTableValue("true", "boolean")', () => {
      state.result = parseTableValue("true", "boolean");
    });

    Then("I receive the boolean true", () => {
      expect(state.result).toBe(true);
    });
  });

  Scenario("Parse boolean false from string", ({ When, Then }) => {
    When('I call parseTableValue("false", "boolean")', () => {
      state.result = parseTableValue("false", "boolean");
    });

    Then("I receive the boolean false", () => {
      expect(state.result).toBe(false);
    });
  });

  Scenario("Parse invalid integer throws error", ({ When, Then }) => {
    When('I call parseTableValue("not-a-number", "int")', () => {
      try {
        state.result = parseTableValue("not-a-number", "int");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error is thrown with message containing "Invalid integer"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("Invalid integer");
    });
  });

  // Field Extraction
  Scenario("Get required field succeeds when present", ({ Given, When, Then }) => {
    Given('a parsed object with orderId "order-123" and status "draft"', () => {
      state.parsedObject = { orderId: "order-123", status: "draft" };
    });

    When('I call getRequiredField(obj, "orderId")', () => {
      state.result = getRequiredField(state.parsedObject, "orderId");
    });

    Then('I receive "order-123"', () => {
      expect(state.result).toBe("order-123");
    });
  });

  Scenario("Get required field throws for missing field", ({ Given, When, Then, And }) => {
    Given('a parsed object with only status "draft"', () => {
      state.parsedObject = { status: "draft" };
    });

    When('I call getRequiredField(obj, "orderId")', () => {
      try {
        state.result = getRequiredField(state.parsedObject, "orderId");
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error is thrown with message containing "orderId"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("orderId");
    });

    And("the error message indicates the field is required", () => {
      expect(state.error?.message.toLowerCase()).toContain("required");
    });
  });

  Scenario("Get optional field returns value when present", ({ Given, When, Then }) => {
    Given('a parsed object with notes "Some notes"', () => {
      state.parsedObject = { notes: "Some notes" };
    });

    When('I call getOptionalField(obj, "notes")', () => {
      state.result = getOptionalField(state.parsedObject, "notes");
    });

    Then('I receive "Some notes"', () => {
      expect(state.result).toBe("Some notes");
    });
  });

  Scenario("Get optional field returns undefined for missing", ({ Given, When, Then }) => {
    Given('a parsed object with only status "draft"', () => {
      state.parsedObject = { status: "draft" };
    });

    When('I call getOptionalField(obj, "notes")', () => {
      state.result = getOptionalField(state.parsedObject, "notes");
    });

    Then("I receive undefined", () => {
      expect(state.result).toBeUndefined();
    });
  });

  Scenario("Get optional field with default value", ({ Given, When, Then }) => {
    Given('a parsed object with only status "draft"', () => {
      state.parsedObject = { status: "draft" };
    });

    When('I call getOptionalField(obj, "priority", "normal")', () => {
      state.result = getOptionalField(state.parsedObject, "priority", "normal");
    });

    Then('I receive "normal"', () => {
      expect(state.result).toBe("normal");
    });
  });
});
