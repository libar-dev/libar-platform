/**
 * InvariantError - Step Definitions
 *
 * BDD step definitions for the base invariant error class:
 * - InvariantError: Base class for domain rule violations
 * - InvariantError.forContext: Factory for context-specific error classes
 * - Type guards: isInvariantError, hasCode
 *
 * Mechanical migration from tests/unit/invariants/InvariantError.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { InvariantError } from "../../../src/invariants/InvariantError.js";

import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  error: InvariantError | null;
  contextError: InstanceType<ReturnType<typeof InvariantError.forContext>> | null;
  contextErrorClasses: Map<string, ReturnType<typeof InvariantError.forContext>>;
  contextErrors: Map<string, InstanceType<ReturnType<typeof InvariantError.forContext>>>;
  regularError: Error | null;
  expectedContext: Record<string, unknown> | null;
}

function createInitialState(): TestState {
  return {
    error: null,
    contextError: null,
    contextErrorClasses: new Map(),
    contextErrors: new Map(),
    regularError: null,
    expectedContext: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/invariants/invariant-error.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: InvariantError constructor creates a properly structured error
  // ==========================================================================

  Rule("InvariantError constructor creates a properly structured error", ({ RuleScenario }) => {
    RuleScenario("Creating an error with code and message", ({ Given, Then, And }) => {
      Given('an InvariantError with code "ORDER_NOT_FOUND" and message "Order not found"', () => {
        state.error = new InvariantError("ORDER_NOT_FOUND", "Order not found");
      });

      Then("the error is an instance of Error", () => {
        expect(state.error).toBeInstanceOf(Error);
      });

      And("the error is an instance of InvariantError", () => {
        expect(state.error).toBeInstanceOf(InvariantError);
      });

      And("the error has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const actual = (state.error as Record<string, unknown>)[row.property];
          expect(actual).toBe(row.value);
        }
      });
    });

    RuleScenario("Including context when provided", ({ Given, Then }) => {
      Given(
        'an InvariantError with code "VALIDATION_ERROR" and message "Invalid quantity" and context:',
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
          const context: Record<string, unknown> = {};
          for (const row of rows) {
            // Parse numeric values
            const numVal = Number(row.value);
            context[row.key] = isNaN(numVal) ? row.value : numVal;
          }
          state.expectedContext = context;
          state.error = new InvariantError("VALIDATION_ERROR", "Invalid quantity", context);
        }
      );

      Then("the error context equals the provided context", () => {
        expect(state.error!.context).toEqual(state.expectedContext);
      });
    });

    RuleScenario("Context is undefined when not provided", ({ Given, Then }) => {
      Given(
        'an InvariantError with code "SOME_ERROR" and message "message" without context',
        () => {
          state.error = new InvariantError("SOME_ERROR", "message");
        }
      );

      Then("the error context is undefined", () => {
        expect(state.error!.context).toBeUndefined();
      });
    });

    RuleScenario("Error has proper stack trace", ({ Given, Then, And }) => {
      Given('an InvariantError with code "ERROR" and message "message" without context', () => {
        state.error = new InvariantError("ERROR", "message");
      });

      Then("the error stack is defined", () => {
        expect(state.error!.stack).toBeDefined();
      });

      And('the error stack contains "InvariantError"', () => {
        expect(state.error!.stack).toContain("InvariantError");
      });
    });
  });

  // ==========================================================================
  // Rule: forContext factory creates context-specific error classes
  // ==========================================================================

  Rule("forContext factory creates context-specific error classes", ({ RuleScenario }) => {
    RuleScenario("Creating a context-specific error class", ({ Given, When, Then, And }) => {
      Given('a context-specific error class for "Order"', () => {
        state.contextErrorClasses.set("Order", InvariantError.forContext("Order"));
      });

      When('I create an error with code "ORDER_NOT_FOUND" and message "Order not found"', () => {
        const OrderError = state.contextErrorClasses.get("Order")!;
        state.contextError = new OrderError("ORDER_NOT_FOUND", "Order not found");
      });

      Then("the error is an instance of InvariantError", () => {
        expect(state.contextError).toBeInstanceOf(InvariantError);
      });

      And("the error has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const actual = (state.contextError as Record<string, unknown>)[row.property];
          expect(actual).toBe(row.value);
        }
      });
    });

    RuleScenario("Different contexts produce different classes", ({ Given, When, Then, And }) => {
      Given('a context-specific error class for "Order"', () => {
        state.contextErrorClasses.set("Order", InvariantError.forContext("Order"));
      });

      And('a context-specific error class for "Inventory"', () => {
        state.contextErrorClasses.set("Inventory", InvariantError.forContext("Inventory"));
      });

      When('I create an Order error with code "ORDER_NOT_FOUND" and message "not found"', () => {
        const OrderError = state.contextErrorClasses.get("Order")!;
        state.contextErrors.set("Order", new OrderError("ORDER_NOT_FOUND", "not found"));
      });

      And(
        'I create an Inventory error with code "PRODUCT_NOT_FOUND" and message "not found"',
        () => {
          const InventoryError = state.contextErrorClasses.get("Inventory")!;
          state.contextErrors.set(
            "Inventory",
            new InventoryError("PRODUCT_NOT_FOUND", "not found")
          );
        }
      );

      Then('the Order error name is "OrderInvariantError"', () => {
        expect(state.contextErrors.get("Order")!.name).toBe("OrderInvariantError");
      });

      And('the Inventory error name is "InventoryInvariantError"', () => {
        expect(state.contextErrors.get("Inventory")!.name).toBe("InventoryInvariantError");
      });

      And("both errors are instances of InvariantError", () => {
        expect(state.contextErrors.get("Order")).toBeInstanceOf(InvariantError);
        expect(state.contextErrors.get("Inventory")).toBeInstanceOf(InvariantError);
      });
    });

    RuleScenario("Typed error codes are supported", ({ Given, When, Then }) => {
      Given('a context-specific error class for "Order" with typed codes', () => {
        const OrderErrorCodes = {
          ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
          ORDER_ALREADY_EXISTS: "ORDER_ALREADY_EXISTS",
          ORDER_NOT_IN_DRAFT: "ORDER_NOT_IN_DRAFT",
        } as const;
        type OrderErrorCode = (typeof OrderErrorCodes)[keyof typeof OrderErrorCodes];

        state.contextErrorClasses.set(
          "OrderTyped",
          InvariantError.forContext<OrderErrorCode>("Order")
        );

        // Store codes for the When step
        (state as Record<string, unknown>)["_typedCodes"] = OrderErrorCodes;
      });

      When("I create errors with each typed code", () => {
        const OrderInvariantError = state.contextErrorClasses.get("OrderTyped")!;
        const codes = (state as Record<string, unknown>)["_typedCodes"] as Record<string, string>;

        // These should compile without error
        new OrderInvariantError(codes.ORDER_NOT_FOUND!, "not found");
        new OrderInvariantError(codes.ORDER_ALREADY_EXISTS!, "exists");
      });

      Then("all errors compile and instantiate successfully", () => {
        // If we got here, the typed codes compiled fine
        expect(true).toBe(true);
      });
    });

    RuleScenario("Context-specific errors include context data", ({ Given, When, Then }) => {
      Given('a context-specific error class for "Product"', () => {
        state.contextErrorClasses.set("Product", InvariantError.forContext("Product"));
      });

      When(
        'I create an error with code "OUT_OF_STOCK" and message "Product out of stock" and context:',
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
          const context: Record<string, unknown> = {};
          for (const row of rows) {
            const numVal = Number(row.value);
            context[row.key] = isNaN(numVal) ? row.value : numVal;
          }
          state.expectedContext = context;
          const ProductError = state.contextErrorClasses.get("Product")!;
          state.contextError = new ProductError("OUT_OF_STOCK", "Product out of stock", context);
        }
      );

      Then("the error context equals the provided context", () => {
        expect(state.contextError!.context).toEqual(state.expectedContext);
      });
    });

    RuleScenario("Context-specific class has proper constructor name", ({ Given, Then }) => {
      Given('a context-specific error class for "Customer"', () => {
        state.contextErrorClasses.set("Customer", InvariantError.forContext("Customer"));
      });

      Then('the class name is "CustomerInvariantError"', () => {
        expect(state.contextErrorClasses.get("Customer")!.name).toBe("CustomerInvariantError");
      });
    });
  });

  // ==========================================================================
  // Rule: isInvariantError type guard identifies InvariantError instances
  // ==========================================================================

  Rule("isInvariantError type guard identifies InvariantError instances", ({ RuleScenario }) => {
    RuleScenario("Returns true for InvariantError instances", ({ Given, Then }) => {
      Given('an InvariantError with code "CODE" and message "message" without context', () => {
        state.error = new InvariantError("CODE", "message");
      });

      Then("isInvariantError returns true", () => {
        expect(InvariantError.isInvariantError(state.error)).toBe(true);
      });
    });

    RuleScenario("Returns true for context-specific error instances", ({ Given, When, Then }) => {
      Given('a context-specific error class for "Order"', () => {
        state.contextErrorClasses.set("Order", InvariantError.forContext("Order"));
      });

      When('I create an error with code "CODE" and message "message"', () => {
        const OrderError = state.contextErrorClasses.get("Order")!;
        state.contextError = new OrderError("CODE", "message");
      });

      Then("isInvariantError returns true for the context error", () => {
        expect(InvariantError.isInvariantError(state.contextError)).toBe(true);
      });
    });

    RuleScenario("Returns false for regular Error instances", ({ Given, Then }) => {
      Given('a regular Error with message "message"', () => {
        state.regularError = new Error("message");
      });

      Then("isInvariantError returns false", () => {
        expect(InvariantError.isInvariantError(state.regularError)).toBe(false);
      });
    });

    RuleScenario("Returns false for non-error values", ({ Then }) => {
      Then("isInvariantError returns false for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        for (const row of rows) {
          let testValue: unknown;
          switch (row.value) {
            case "null":
              testValue = null;
              break;
            case "undefined":
              testValue = undefined;
              break;
            case "string":
              testValue = "error";
              break;
            case "object":
              testValue = { code: "ERROR", message: "msg" };
              break;
            default:
              testValue = row.value;
          }
          expect(InvariantError.isInvariantError(testValue)).toBe(false);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: hasCode type guard checks error codes
  // ==========================================================================

  Rule("hasCode type guard checks error codes", ({ RuleScenario }) => {
    RuleScenario("Returns true when error has the specified code", ({ Given, Then }) => {
      Given(
        'an InvariantError with code "ORDER_NOT_FOUND" and message "message" without context',
        () => {
          state.error = new InvariantError("ORDER_NOT_FOUND", "message");
        }
      );

      Then('hasCode with "ORDER_NOT_FOUND" returns true', () => {
        expect(InvariantError.hasCode(state.error, "ORDER_NOT_FOUND")).toBe(true);
      });
    });

    RuleScenario("Returns false when error has a different code", ({ Given, Then }) => {
      Given(
        'an InvariantError with code "ORDER_NOT_FOUND" and message "message" without context',
        () => {
          state.error = new InvariantError("ORDER_NOT_FOUND", "message");
        }
      );

      Then('hasCode with "ORDER_ALREADY_EXISTS" returns false', () => {
        expect(InvariantError.hasCode(state.error, "ORDER_ALREADY_EXISTS")).toBe(false);
      });
    });

    RuleScenario("Returns false for non-InvariantError values", ({ Then }) => {
      Then("hasCode returns false for all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string; code: string }>(dataTable);
        for (const row of rows) {
          let testValue: unknown;
          switch (row.value) {
            case "regularError":
              testValue = new Error("msg");
              break;
            case "null":
              testValue = null;
              break;
            default:
              testValue = row.value;
          }
          expect(InvariantError.hasCode(testValue, row.code)).toBe(false);
        }
      });
    });

    RuleScenario("Works with context-specific errors", ({ Given, When, Then, And }) => {
      Given('a context-specific error class for "Inventory"', () => {
        state.contextErrorClasses.set("Inventory", InvariantError.forContext("Inventory"));
      });

      When('I create an error with code "OUT_OF_STOCK" and message "message"', () => {
        const InventoryError = state.contextErrorClasses.get("Inventory")!;
        state.contextError = new InventoryError("OUT_OF_STOCK", "message");
      });

      Then('hasCode with "OUT_OF_STOCK" returns true for the context error', () => {
        expect(InvariantError.hasCode(state.contextError, "OUT_OF_STOCK")).toBe(true);
      });

      And('hasCode with "OTHER_CODE" returns false for the context error', () => {
        expect(InvariantError.hasCode(state.contextError, "OTHER_CODE")).toBe(false);
      });
    });
  });
});
