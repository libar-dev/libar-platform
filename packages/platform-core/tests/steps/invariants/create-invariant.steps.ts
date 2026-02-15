/**
 * createInvariant - Step Definitions
 *
 * BDD step definitions for the invariant factory function:
 * - Creates invariants with correct name/code
 * - check() returns boolean based on predicate
 * - assert() throws or does nothing
 * - validate() returns structured results
 * - Parameterized invariants work correctly
 * - Context is optional and handled correctly
 *
 * Mechanical migration from tests/unit/invariants/createInvariant.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { createInvariant } from "../../../src/invariants/createInvariant.js";
import { InvariantError } from "../../../src/invariants/InvariantError.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Domain Types (from original test)
// =============================================================================

interface OrderTestState {
  status: "draft" | "submitted" | "confirmed";
  items: Array<{ productId: string; quantity: number }>;
  orderId: string;
}

const TestErrorCodes = {
  NOT_DRAFT: "NOT_DRAFT",
  NO_ITEMS: "NO_ITEMS",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
} as const;
type TestErrorCode = (typeof TestErrorCodes)[keyof typeof TestErrorCodes];

const TestInvariantError = InvariantError.forContext<TestErrorCode>("Test");

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // The isDraft invariant (reused across rules)
  isDraftInvariant: ReturnType<typeof createInvariant<OrderTestState, TestErrorCode>> | null;
  // The hasItems invariant (no context)
  hasItemsInvariant: ReturnType<typeof createInvariant<OrderTestState, TestErrorCode>> | null;
  // The parameterized invariant
  itemExistsInvariant: ReturnType<
    typeof createInvariant<OrderTestState, TestErrorCode, [string]>
  > | null;
  // Custom error class invariant
  customInvariant: ReturnType<typeof createInvariant<{ valid: boolean }, "ORDER_ERROR">> | null;
  customErrorClass: ReturnType<typeof InvariantError.forContext> | null;
  // Current order state for operations
  orderState: OrderTestState;
  // Results
  checkResult: boolean | null;
  thrownError: unknown;
  validationResult: unknown;
  noErrorThrown: boolean;
}

function createInitialState(): TestState {
  return {
    isDraftInvariant: null,
    hasItemsInvariant: null,
    itemExistsInvariant: null,
    customInvariant: null,
    customErrorClass: null,
    orderState: { status: "draft", items: [], orderId: "order-1" },
    checkResult: null,
    thrownError: null,
    validationResult: null,
    noErrorThrown: false,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Invariant Factories (lazily created per scenario)
// =============================================================================

function makeDraftInvariant() {
  return createInvariant<OrderTestState, TestErrorCode>(
    {
      name: "isDraft",
      code: TestErrorCodes.NOT_DRAFT,
      check: (s) => s.status === "draft",
      message: (s) => `Expected draft status, got ${s.status}`,
      context: (s) => ({ orderId: s.orderId, currentStatus: s.status }),
    },
    TestInvariantError
  );
}

function makeHasItemsInvariant() {
  return createInvariant<OrderTestState, TestErrorCode>(
    {
      name: "hasItems",
      code: TestErrorCodes.NO_ITEMS,
      check: (s) => s.items.length > 0,
      message: () => "Order must have at least one item",
    },
    TestInvariantError
  );
}

function makeItemExistsInvariant() {
  return createInvariant<OrderTestState, TestErrorCode, [string]>(
    {
      name: "itemExists",
      code: TestErrorCodes.ITEM_NOT_FOUND,
      check: (s, productId) => s.items.some((i) => i.productId === productId),
      message: (s, productId) => `Item ${productId} not found in order ${s.orderId}`,
      context: (s, productId) => ({ orderId: s.orderId, productId }),
    },
    TestInvariantError
  );
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/invariants/create-invariant.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: createInvariant produces an invariant with correct name, code, and methods
  // ==========================================================================

  Rule(
    "createInvariant produces an invariant with correct name, code, and methods",
    ({ RuleScenario }) => {
      RuleScenario("Invariant has correct name and code", ({ Given, Then }) => {
        Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
          state.isDraftInvariant = makeDraftInvariant();
        });

        Then("the invariant has the following identity:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          for (const row of rows) {
            const actual = (state.isDraftInvariant as Record<string, unknown>)[row.property];
            expect(actual).toBe(row.value);
          }
        });
      });

      RuleScenario(
        "check returns true when state satisfies the predicate",
        ({ Given, When, Then }) => {
          Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
            state.isDraftInvariant = makeDraftInvariant();
          });

          When('I check a state with status "draft"', () => {
            state.orderState = {
              status: "draft",
              items: [],
              orderId: "order-1",
            };
            state.checkResult = state.isDraftInvariant!.check(state.orderState);
          });

          Then("the check result is true", () => {
            expect(state.checkResult).toBe(true);
          });
        }
      );

      RuleScenario(
        "check returns false when state violates the predicate",
        ({ Given, When, Then }) => {
          Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
            state.isDraftInvariant = makeDraftInvariant();
          });

          When('I check a state with status "submitted"', () => {
            state.orderState = {
              status: "submitted",
              items: [],
              orderId: "order-1",
            };
            state.checkResult = state.isDraftInvariant!.check(state.orderState);
          });

          Then("the check result is false", () => {
            expect(state.checkResult).toBe(false);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: assert does not throw for valid state and throws InvariantError for invalid state
  // ==========================================================================

  Rule(
    "assert does not throw for valid state and throws InvariantError for invalid state",
    ({ RuleScenario }) => {
      RuleScenario("assert does not throw when state is valid", ({ Given, When, Then }) => {
        Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
          state.isDraftInvariant = makeDraftInvariant();
        });

        When('I assert a state with status "draft"', () => {
          state.orderState = {
            status: "draft",
            items: [],
            orderId: "order-1",
          };
          try {
            state.isDraftInvariant!.assert(state.orderState);
            state.noErrorThrown = true;
          } catch (e) {
            state.thrownError = e;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.thrownError).toBeNull();
        });
      });

      RuleScenario(
        "assert throws InvariantError when state is invalid",
        ({ Given, When, Then }) => {
          Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
            state.isDraftInvariant = makeDraftInvariant();
          });

          When('I assert a state with status "submitted"', () => {
            state.orderState = {
              status: "submitted",
              items: [],
              orderId: "order-1",
            };
            try {
              state.isDraftInvariant!.assert(state.orderState);
              state.noErrorThrown = true;
            } catch (e) {
              state.thrownError = e;
            }
          });

          Then("an InvariantError is thrown", () => {
            expect(state.thrownError).toBeInstanceOf(TestInvariantError);
          });
        }
      );

      RuleScenario("assert error has correct code for invalid state", ({ Given, When, Then }) => {
        Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
          state.isDraftInvariant = makeDraftInvariant();
        });

        When('I assert a state with status "confirmed"', () => {
          state.orderState = {
            status: "confirmed",
            items: [],
            orderId: "order-1",
          };
          try {
            state.isDraftInvariant!.assert(state.orderState);
          } catch (e) {
            state.thrownError = e;
          }
        });

        Then('the thrown error has code "NOT_DRAFT"', () => {
          expect(state.thrownError).toBeInstanceOf(InvariantError);
          expect((state.thrownError as InvariantError).code).toBe("NOT_DRAFT");
        });
      });

      RuleScenario(
        "assert error has correct message for invalid state",
        ({ Given, When, Then }) => {
          Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
            state.isDraftInvariant = makeDraftInvariant();
          });

          When('I assert a state with status "confirmed"', () => {
            state.orderState = {
              status: "confirmed",
              items: [],
              orderId: "order-1",
            };
            try {
              state.isDraftInvariant!.assert(state.orderState);
            } catch (e) {
              state.thrownError = e;
            }
          });

          Then('the thrown error has message "Expected draft status, got confirmed"', () => {
            expect((state.thrownError as Error).message).toBe(
              "Expected draft status, got confirmed"
            );
          });
        }
      );

      RuleScenario(
        "assert error has correct context for invalid state",
        ({ Given, When, Then }) => {
          Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
            state.isDraftInvariant = makeDraftInvariant();
          });

          When('I assert a state with orderId "order-123" and status "submitted"', () => {
            state.orderState = {
              status: "submitted",
              items: [],
              orderId: "order-123",
            };
            try {
              state.isDraftInvariant!.assert(state.orderState);
            } catch (e) {
              state.thrownError = e;
            }
          });

          Then("the thrown error has context:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
            const expectedContext: Record<string, string> = {};
            for (const row of rows) {
              expectedContext[row.key] = row.value;
            }
            expect((state.thrownError as InvariantError).context).toEqual(expectedContext);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: validate returns structured result without throwing
  // ==========================================================================

  Rule("validate returns structured result without throwing", ({ RuleScenario }) => {
    RuleScenario("validate returns valid result for valid state", ({ Given, When, Then }) => {
      Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
        state.isDraftInvariant = makeDraftInvariant();
      });

      When('I validate a state with status "draft"', () => {
        state.orderState = {
          status: "draft",
          items: [],
          orderId: "order-1",
        };
        state.validationResult = state.isDraftInvariant!.validate(state.orderState);
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult).toEqual({ valid: true });
      });
    });

    RuleScenario(
      "validate returns violation details for invalid state",
      ({ Given, When, Then }) => {
        Given('a "isDraft" invariant with code "NOT_DRAFT" for draft status', () => {
          state.isDraftInvariant = makeDraftInvariant();
        });

        When('I validate a state with orderId "order-123" and status "submitted"', () => {
          state.orderState = {
            status: "submitted",
            items: [],
            orderId: "order-123",
          };
          state.validationResult = state.isDraftInvariant!.validate(state.orderState);
        });

        Then("the validation result is invalid with:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          const result = state.validationResult as Record<string, unknown>;
          expect(result.valid).toBe(false);
          for (const row of rows) {
            expect(result[row.property]).toBe(row.value);
          }
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Invariant without context function omits context from errors and results
  // ==========================================================================

  Rule(
    "Invariant without context function omits context from errors and results",
    ({ RuleScenario }) => {
      RuleScenario(
        "assert error has undefined context when no context function",
        ({ Given, When, Then }) => {
          Given('a "hasItems" invariant with code "NO_ITEMS" without context function', () => {
            state.hasItemsInvariant = makeHasItemsInvariant();
          });

          When("I assert the hasItems invariant with an empty items state", () => {
            state.orderState = {
              status: "draft",
              items: [],
              orderId: "order-1",
            };
            try {
              state.hasItemsInvariant!.assert(state.orderState);
            } catch (e) {
              state.thrownError = e;
            }
          });

          Then("the thrown error has undefined context", () => {
            expect((state.thrownError as InvariantError).context).toBeUndefined();
          });
        }
      );

      RuleScenario(
        "validate result has undefined context when no context function",
        ({ Given, When, Then }) => {
          Given('a "hasItems" invariant with code "NO_ITEMS" without context function', () => {
            state.hasItemsInvariant = makeHasItemsInvariant();
          });

          When("I validate the hasItems invariant with an empty items state", () => {
            state.orderState = {
              status: "draft",
              items: [],
              orderId: "order-1",
            };
            state.validationResult = state.hasItemsInvariant!.validate(state.orderState);
          });

          Then(
            "the validation result is invalid without context with:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{
                property: string;
                value: string;
              }>(dataTable);
              const result = state.validationResult as Record<string, unknown>;
              expect(result.valid).toBe(false);
              for (const row of rows) {
                expect(result[row.property]).toBe(row.value);
              }
              expect(result.context).toBeUndefined();
            }
          );
        }
      );
    }
  );

  // ==========================================================================
  // Rule: Parameterized invariants pass extra arguments to check, message, and context
  // ==========================================================================

  Rule(
    "Parameterized invariants pass extra arguments to check, message, and context",
    ({ RuleScenario }) => {
      RuleScenario("check uses parameter to find matching item", ({ Given, When, Then, And }) => {
        Given('a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"', () => {
          state.itemExistsInvariant = makeItemExistsInvariant();
        });

        And("a state with items:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            productId: string;
            quantity: string;
          }>(dataTable);
          state.orderState = {
            status: "draft",
            items: rows.map((r) => ({
              productId: r.productId,
              quantity: Number(r.quantity),
            })),
            orderId: "order-1",
          };
        });

        When('I check the parameterized invariant with parameter "prod-1"', () => {
          state.checkResult = state.itemExistsInvariant!.check(state.orderState, "prod-1");
        });

        Then("the check result is true", () => {
          expect(state.checkResult).toBe(true);
        });
      });

      RuleScenario(
        "check returns false when parameter does not match",
        ({ Given, When, Then, And }) => {
          Given('a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"', () => {
            state.itemExistsInvariant = makeItemExistsInvariant();
          });

          And("a state with items:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              productId: string;
              quantity: string;
            }>(dataTable);
            state.orderState = {
              status: "draft",
              items: rows.map((r) => ({
                productId: r.productId,
                quantity: Number(r.quantity),
              })),
              orderId: "order-1",
            };
          });

          When('I check the parameterized invariant with parameter "prod-2"', () => {
            state.checkResult = state.itemExistsInvariant!.check(state.orderState, "prod-2");
          });

          Then("the check result is false", () => {
            expect(state.checkResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "assert uses parameter in error message and context",
        ({ Given, When, Then, And }) => {
          Given('a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"', () => {
            state.itemExistsInvariant = makeItemExistsInvariant();
          });

          And(
            'a state with orderId "order-123" and items:',
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{
                productId: string;
                quantity: string;
              }>(dataTable);
              state.orderState = {
                status: "draft",
                items: rows.map((r) => ({
                  productId: r.productId,
                  quantity: Number(r.quantity),
                })),
                orderId: "order-123",
              };
            }
          );

          When('I assert the parameterized invariant with parameter "prod-missing"', () => {
            try {
              state.itemExistsInvariant!.assert(state.orderState, "prod-missing");
            } catch (e) {
              state.thrownError = e;
            }
          });

          Then(
            'the thrown error has message "Item prod-missing not found in order order-123"',
            () => {
              expect((state.thrownError as Error).message).toBe(
                "Item prod-missing not found in order order-123"
              );
            }
          );

          And("the thrown error has context:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
            const expectedContext: Record<string, string> = {};
            for (const row of rows) {
              expectedContext[row.key] = row.value;
            }
            expect((state.thrownError as InvariantError).context).toEqual(expectedContext);
          });
        }
      );

      RuleScenario("validate uses parameter in result", ({ Given, When, Then, And }) => {
        Given('a parameterized "itemExists" invariant with code "ITEM_NOT_FOUND"', () => {
          state.itemExistsInvariant = makeItemExistsInvariant();
        });

        And('a state with orderId "order-456" and no items', () => {
          state.orderState = {
            status: "draft",
            items: [],
            orderId: "order-456",
          };
        });

        When('I validate the parameterized invariant with parameter "prod-xyz"', () => {
          state.validationResult = state.itemExistsInvariant!.validate(
            state.orderState,
            "prod-xyz"
          );
        });

        Then("the validation result is invalid with:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          const result = state.validationResult as Record<string, unknown>;
          expect(result.valid).toBe(false);
          for (const row of rows) {
            expect(result[row.property]).toBe(row.value);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: createInvariant uses the provided error class for thrown errors
  // ==========================================================================

  Rule("createInvariant uses the provided error class for thrown errors", ({ RuleScenario }) => {
    RuleScenario(
      "assert throws error of the correct custom class",
      ({ Given, When, Then, And }) => {
        Given('an invariant using a custom "Order" error class', () => {
          state.customErrorClass = InvariantError.forContext<"ORDER_ERROR">("Order");
          state.customInvariant = createInvariant<{ valid: boolean }, "ORDER_ERROR">(
            {
              name: "isValid",
              code: "ORDER_ERROR",
              check: (s) => s.valid,
              message: () => "Order is invalid",
            },
            state.customErrorClass
          );
        });

        When("I assert the custom invariant with invalid state", () => {
          try {
            state.customInvariant!.assert({ valid: false });
          } catch (e) {
            state.thrownError = e;
          }
        });

        Then("the thrown error is an instance of the custom error class", () => {
          expect(state.thrownError).toBeInstanceOf(state.customErrorClass!);
        });

        And("the thrown error is an instance of InvariantError", () => {
          expect(state.thrownError).toBeInstanceOf(InvariantError);
        });

        And('the thrown error has name "OrderInvariantError"', () => {
          expect((state.thrownError as Error).name).toBe("OrderInvariantError");
        });
      }
    );
  });
});
