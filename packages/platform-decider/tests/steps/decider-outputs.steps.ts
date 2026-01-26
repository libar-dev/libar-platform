/**
 * Step Definitions for Decider Output Helpers Feature
 *
 * Reference implementation for PDR-003 behavior feature step definitions.
 *
 * This is a Layer 0 package (pure TypeScript, no Convex dependencies),
 * so tests run without any backend - just pure function testing.
 *
 * @libar-docs-decider
 * @libar-docs-pattern DeciderOutputs
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  success,
  rejected,
  failed,
  isSuccess,
  isRejected,
  isFailed,
  type DeciderOutput,
  type DeciderEvent,
} from "../../src/index.js";

// ============================================================================
// Test Types
// ============================================================================

interface TestPayload {
  testId: string;
}

interface TestEvent extends DeciderEvent<TestPayload> {
  eventType: "TestEvent";
  payload: TestPayload;
}

interface TestData {
  result: string;
}

interface TestStateUpdate {
  status: string;
}

type AnyDeciderOutput = DeciderOutput<TestEvent, TestData, TestStateUpdate, TestEvent>;

// ============================================================================
// Test State
// ============================================================================

interface ScenarioState {
  currentOutput: AnyDeciderOutput | null;
  lastTypeGuardResult: boolean | null;
  outputType: "success" | "rejected" | "failed" | null;
}

let state: ScenarioState | null = null;

function initState(): ScenarioState {
  return {
    currentOutput: null,
    lastTypeGuardResult: null,
    outputType: null,
  };
}

// ============================================================================
// Feature Tests
// ============================================================================

const feature = await loadFeature("tests/features/behavior/decider-outputs.feature");

describeFeature(feature, ({ Scenario, ScenarioOutline, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  // ==========================================================================
  // Background
  // ==========================================================================

  Background(({ Given, And }) => {
    Given("test event types are defined", async () => {
      state = initState();
    });

    And("test data types are defined", async () => {
      // Types are defined at module level
    });

    And("test state update types are defined", async () => {
      // Types are defined at module level
    });
  });

  // ==========================================================================
  // Success Output Scenarios
  // ==========================================================================

  Scenario("success() creates output with correct status", ({ When, Then, And }) => {
    When("creating a success output", async () => {
      state!.currentOutput = success<TestEvent, TestData, TestStateUpdate>({
        data: { result: "ok" },
        event: {
          eventType: "TestEvent",
          payload: { testId: "123" },
        },
        stateUpdate: { status: "completed" },
      });
      state!.outputType = "success";
    });

    Then("the output status should be {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.currentOutput!.status).toBe(expected);
    });

    And("the output data should have result {string}", async (_ctx: unknown, expected: string) => {
      if (isSuccess(state!.currentOutput!)) {
        expect(state!.currentOutput.data.result).toBe(expected);
      } else {
        throw new Error("Expected success output");
      }
    });

    And("the output event should have type {string}", async (_ctx: unknown, expected: string) => {
      if (isSuccess(state!.currentOutput!) || isFailed(state!.currentOutput!)) {
        expect(state!.currentOutput.event.eventType).toBe(expected);
      } else {
        throw new Error("Expected success or failed output");
      }
    });

    And(
      "the output event payload should have testId {string}",
      async (_ctx: unknown, expected: string) => {
        if (isSuccess(state!.currentOutput!) || isFailed(state!.currentOutput!)) {
          expect((state!.currentOutput.event.payload as TestPayload).testId).toBe(expected);
        } else {
          throw new Error("Expected success or failed output");
        }
      }
    );

    And(
      "the output stateUpdate should have status {string}",
      async (_ctx: unknown, expected: string) => {
        if (isSuccess(state!.currentOutput!)) {
          expect(state!.currentOutput.stateUpdate.status).toBe(expected);
        } else {
          throw new Error("Expected success output");
        }
      }
    );
  });

  Scenario("success() includes all required properties", ({ When, Then }) => {
    When("creating a minimal success output", async () => {
      state!.currentOutput = success<TestEvent, TestData, TestStateUpdate>({
        data: { result: "minimal" },
        event: { eventType: "TestEvent", payload: { testId: "min" } },
        stateUpdate: { status: "done" },
      });
      state!.outputType = "success";
    });

    Then(
      "the output should have all required properties:",
      async (_ctx: unknown, table: Array<{ property: string }>) => {
        for (const row of table) {
          expect(state!.currentOutput).toHaveProperty(row.property);
        }
      }
    );
  });

  // ==========================================================================
  // Rejected Output Scenarios
  // ==========================================================================

  Scenario("rejected() creates output with code and message", ({ When, Then, And }) => {
    When(
      "creating a rejected output with code {string} and message {string}",
      async (_ctx: unknown, code: string, message: string) => {
        state!.currentOutput = rejected(code, message) as AnyDeciderOutput;
        state!.outputType = "rejected";
      }
    );

    Then("the output status should be {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.currentOutput!.status).toBe(expected);
    });

    And("the output code should be {string}", async (_ctx: unknown, expected: string) => {
      if (isRejected(state!.currentOutput!)) {
        expect(state!.currentOutput.code).toBe(expected);
      } else {
        throw new Error("Expected rejected output");
      }
    });

    And("the output message should be {string}", async (_ctx: unknown, expected: string) => {
      if (isRejected(state!.currentOutput!)) {
        expect(state!.currentOutput.message).toBe(expected);
      } else {
        throw new Error("Expected rejected output");
      }
    });

    And("the output context should be undefined", async () => {
      if (isRejected(state!.currentOutput!) || isFailed(state!.currentOutput!)) {
        expect(state!.currentOutput.context).toBeUndefined();
      } else {
        throw new Error("Expected rejected or failed output");
      }
    });
  });

  Scenario("rejected() includes context when provided", ({ When, Then, And }) => {
    When(
      "creating a rejected output with code {string} and message {string} and detail {string}",
      async (_ctx: unknown, code: string, message: string, detail: string) => {
        state!.currentOutput = rejected(code, message, { detail }) as AnyDeciderOutput;
        state!.outputType = "rejected";
      }
    );

    Then("the output status should be {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.currentOutput!.status).toBe(expected);
    });

    And(
      "the output context should have detail {string}",
      async (_ctx: unknown, expected: string) => {
        if (isRejected(state!.currentOutput!)) {
          expect((state!.currentOutput.context as Record<string, string>).detail).toBe(expected);
        } else {
          throw new Error("Expected rejected output with context");
        }
      }
    );
  });

  // ==========================================================================
  // Failed Output Scenarios
  // ==========================================================================

  Scenario("failed() creates output with reason and event", ({ When, Then, And }) => {
    When(
      "creating a failed output with reason {string} and eventType {string} and testId {string}",
      async (_ctx: unknown, reason: string, eventType: string, testId: string) => {
        state!.currentOutput = failed<TestEvent>(reason, {
          eventType: eventType as "TestEvent",
          payload: { testId },
        }) as AnyDeciderOutput;
        state!.outputType = "failed";
      }
    );

    Then("the output status should be {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.currentOutput!.status).toBe(expected);
    });

    And("the output reason should be {string}", async (_ctx: unknown, expected: string) => {
      if (isFailed(state!.currentOutput!)) {
        expect(state!.currentOutput.reason).toBe(expected);
      } else {
        throw new Error("Expected failed output");
      }
    });

    And("the output event should have type {string}", async (_ctx: unknown, expected: string) => {
      if (isFailed(state!.currentOutput!)) {
        expect(state!.currentOutput.event.eventType).toBe(expected);
      } else {
        throw new Error("Expected failed output");
      }
    });

    And(
      "the output event payload should have testId {string}",
      async (_ctx: unknown, expected: string) => {
        if (isFailed(state!.currentOutput!)) {
          expect((state!.currentOutput.event.payload as TestPayload).testId).toBe(expected);
        } else {
          throw new Error("Expected failed output");
        }
      }
    );

    And("the output context should be undefined", async () => {
      if (isFailed(state!.currentOutput!)) {
        expect(state!.currentOutput.context).toBeUndefined();
      } else {
        throw new Error("Expected failed output");
      }
    });
  });

  Scenario("failed() includes context when provided", ({ When, Then, And }) => {
    When(
      "creating a failed output with reason {string} and attemptNumber {int}",
      async (_ctx: unknown, reason: string, attemptNumber: number) => {
        state!.currentOutput = failed<TestEvent>(
          reason,
          { eventType: "TestEvent", payload: { testId: "ctx" } },
          { attemptNumber }
        ) as AnyDeciderOutput;
        state!.outputType = "failed";
      }
    );

    Then("the output status should be {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.currentOutput!.status).toBe(expected);
    });

    And(
      "the output context should have attemptNumber {int}",
      async (_ctx: unknown, expected: number) => {
        if (isFailed(state!.currentOutput!)) {
          expect((state!.currentOutput.context as Record<string, number>).attemptNumber).toBe(
            expected
          );
        } else {
          throw new Error("Expected failed output with context");
        }
      }
    );
  });

  // ==========================================================================
  // Type Guard Scenarios - isSuccess
  // ==========================================================================

  Scenario("isSuccess() returns true for success output", ({ Given, When, Then }) => {
    Given("a success output is created", async () => {
      state!.currentOutput = success<TestEvent, TestData, TestStateUpdate>({
        data: { result: "ok" },
        event: { eventType: "TestEvent", payload: { testId: "guard" } },
        stateUpdate: { status: "done" },
      });
      state!.outputType = "success";
    });

    When("checking isSuccess on the output", async () => {
      state!.lastTypeGuardResult = isSuccess(state!.currentOutput!);
    });

    Then("the type guard should return true", async () => {
      expect(state!.lastTypeGuardResult).toBe(true);
    });
  });

  Scenario("isSuccess() returns false for rejected output", ({ Given, When, Then }) => {
    Given("a rejected output is created", async () => {
      state!.currentOutput = rejected("TEST_ERROR", "Test rejection") as AnyDeciderOutput;
      state!.outputType = "rejected";
    });

    When("checking isSuccess on the output", async () => {
      state!.lastTypeGuardResult = isSuccess(state!.currentOutput!);
    });

    Then("the type guard should return false", async () => {
      expect(state!.lastTypeGuardResult).toBe(false);
    });
  });

  Scenario("isSuccess() returns false for failed output", ({ Given, When, Then }) => {
    Given("a failed output is created", async () => {
      state!.currentOutput = failed<TestEvent>("Test failure", {
        eventType: "TestEvent",
        payload: { testId: "fail" },
      }) as AnyDeciderOutput;
      state!.outputType = "failed";
    });

    When("checking isSuccess on the output", async () => {
      state!.lastTypeGuardResult = isSuccess(state!.currentOutput!);
    });

    Then("the type guard should return false", async () => {
      expect(state!.lastTypeGuardResult).toBe(false);
    });
  });

  Scenario("isSuccess() enables type narrowing", ({ Given, When, Then }) => {
    Given("a success output is created", async () => {
      state!.currentOutput = success<TestEvent, TestData, TestStateUpdate>({
        data: { result: "ok" },
        event: { eventType: "TestEvent", payload: { testId: "guard" } },
        stateUpdate: { status: "done" },
      });
      state!.outputType = "success";
    });

    When("checking isSuccess on the output", async () => {
      state!.lastTypeGuardResult = isSuccess(state!.currentOutput!);
    });

    Then("the output data property should be accessible", async () => {
      if (isSuccess(state!.currentOutput!)) {
        expect(state!.currentOutput.data).toBeDefined();
      } else {
        throw new Error("Expected type narrowing to success");
      }
    });
  });

  // ==========================================================================
  // Type Guard Scenarios - isRejected
  // ==========================================================================

  Scenario("isRejected() returns true for rejected output", ({ Given, When, Then }) => {
    Given("a rejected output is created", async () => {
      state!.currentOutput = rejected("TEST_ERROR", "Test rejection") as AnyDeciderOutput;
      state!.outputType = "rejected";
    });

    When("checking isRejected on the output", async () => {
      state!.lastTypeGuardResult = isRejected(state!.currentOutput!);
    });

    Then("the type guard should return true", async () => {
      expect(state!.lastTypeGuardResult).toBe(true);
    });
  });

  Scenario("isRejected() returns false for success output", ({ Given, When, Then }) => {
    Given("a success output is created", async () => {
      state!.currentOutput = success<TestEvent, TestData, TestStateUpdate>({
        data: { result: "ok" },
        event: { eventType: "TestEvent", payload: { testId: "guard" } },
        stateUpdate: { status: "done" },
      });
      state!.outputType = "success";
    });

    When("checking isRejected on the output", async () => {
      state!.lastTypeGuardResult = isRejected(state!.currentOutput!);
    });

    Then("the type guard should return false", async () => {
      expect(state!.lastTypeGuardResult).toBe(false);
    });
  });

  Scenario("isRejected() returns false for failed output", ({ Given, When, Then }) => {
    Given("a failed output is created", async () => {
      state!.currentOutput = failed<TestEvent>("Test failure", {
        eventType: "TestEvent",
        payload: { testId: "fail" },
      }) as AnyDeciderOutput;
      state!.outputType = "failed";
    });

    When("checking isRejected on the output", async () => {
      state!.lastTypeGuardResult = isRejected(state!.currentOutput!);
    });

    Then("the type guard should return false", async () => {
      expect(state!.lastTypeGuardResult).toBe(false);
    });
  });

  Scenario("isRejected() enables type narrowing", ({ Given, When, Then }) => {
    Given("a rejected output is created", async () => {
      state!.currentOutput = rejected("TEST_ERROR", "Test rejection") as AnyDeciderOutput;
      state!.outputType = "rejected";
    });

    When("checking isRejected on the output", async () => {
      state!.lastTypeGuardResult = isRejected(state!.currentOutput!);
    });

    Then("the output code property should be accessible", async () => {
      if (isRejected(state!.currentOutput!)) {
        expect(state!.currentOutput.code).toBeDefined();
      } else {
        throw new Error("Expected type narrowing to rejected");
      }
    });
  });

  // ==========================================================================
  // Type Guard Scenarios - isFailed
  // ==========================================================================

  Scenario("isFailed() returns true for failed output", ({ Given, When, Then }) => {
    Given("a failed output is created", async () => {
      state!.currentOutput = failed<TestEvent>("Test failure", {
        eventType: "TestEvent",
        payload: { testId: "fail" },
      }) as AnyDeciderOutput;
      state!.outputType = "failed";
    });

    When("checking isFailed on the output", async () => {
      state!.lastTypeGuardResult = isFailed(state!.currentOutput!);
    });

    Then("the type guard should return true", async () => {
      expect(state!.lastTypeGuardResult).toBe(true);
    });
  });

  Scenario("isFailed() returns false for success output", ({ Given, When, Then }) => {
    Given("a success output is created", async () => {
      state!.currentOutput = success<TestEvent, TestData, TestStateUpdate>({
        data: { result: "ok" },
        event: { eventType: "TestEvent", payload: { testId: "guard" } },
        stateUpdate: { status: "done" },
      });
      state!.outputType = "success";
    });

    When("checking isFailed on the output", async () => {
      state!.lastTypeGuardResult = isFailed(state!.currentOutput!);
    });

    Then("the type guard should return false", async () => {
      expect(state!.lastTypeGuardResult).toBe(false);
    });
  });

  Scenario("isFailed() returns false for rejected output", ({ Given, When, Then }) => {
    Given("a rejected output is created", async () => {
      state!.currentOutput = rejected("TEST_ERROR", "Test rejection") as AnyDeciderOutput;
      state!.outputType = "rejected";
    });

    When("checking isFailed on the output", async () => {
      state!.lastTypeGuardResult = isFailed(state!.currentOutput!);
    });

    Then("the type guard should return false", async () => {
      expect(state!.lastTypeGuardResult).toBe(false);
    });
  });

  Scenario("isFailed() enables type narrowing", ({ Given, When, Then }) => {
    Given("a failed output is created", async () => {
      state!.currentOutput = failed<TestEvent>("Test failure", {
        eventType: "TestEvent",
        payload: { testId: "fail" },
      }) as AnyDeciderOutput;
      state!.outputType = "failed";
    });

    When("checking isFailed on the output", async () => {
      state!.lastTypeGuardResult = isFailed(state!.currentOutput!);
    });

    Then("the output reason property should be accessible", async () => {
      if (isFailed(state!.currentOutput!)) {
        expect(state!.currentOutput.reason).toBeDefined();
      } else {
        throw new Error("Expected type narrowing to failed");
      }
    });
  });

  // ==========================================================================
  // Edge Case Scenarios
  // ==========================================================================

  ScenarioOutline(
    "Type guards are mutually exclusive",
    ({ Given, Then }, variables: { output_type: string }) => {
      Given('a "<output_type>" output is created', async () => {
        switch (variables.output_type) {
          case "success":
            state!.currentOutput = success<TestEvent, TestData, TestStateUpdate>({
              data: { result: "ok" },
              event: { eventType: "TestEvent", payload: { testId: "guard" } },
              stateUpdate: { status: "done" },
            });
            break;
          case "rejected":
            state!.currentOutput = rejected("TEST_ERROR", "Test rejection") as AnyDeciderOutput;
            break;
          case "failed":
            state!.currentOutput = failed<TestEvent>("Test failure", {
              eventType: "TestEvent",
              payload: { testId: "fail" },
            }) as AnyDeciderOutput;
            break;
          default:
            throw new Error(`Unknown output type: ${variables.output_type}`);
        }
        state!.outputType = variables.output_type as "success" | "rejected" | "failed";
      });

      Then("exactly one type guard should return true", async () => {
        const successResult = isSuccess(state!.currentOutput!);
        const rejectedResult = isRejected(state!.currentOutput!);
        const failedResult = isFailed(state!.currentOutput!);

        const trueCount = [successResult, rejectedResult, failedResult].filter(Boolean).length;
        expect(trueCount).toBe(1);

        // Verify the correct one
        switch (state!.outputType) {
          case "success":
            expect(successResult).toBe(true);
            break;
          case "rejected":
            expect(rejectedResult).toBe(true);
            break;
          case "failed":
            expect(failedResult).toBe(true);
            break;
        }
      });
    }
  );
});
