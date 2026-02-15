/**
 * createInvariantSet - Step Definitions
 *
 * BDD step definitions for the invariant set builder:
 * - Creates set with all invariants accessible and immutable
 * - checkAll() returns true/false appropriately
 * - assertAll() throws on first failure (fail-fast)
 * - validateAll() collects all violations
 * - Empty set always passes
 * - Single invariant set works correctly
 *
 * Mechanical migration from tests/unit/invariants/createInvariantSet.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { createInvariant } from "../../../src/invariants/createInvariant.js";
import { createInvariantSet } from "../../../src/invariants/createInvariantSet.js";
import { InvariantError } from "../../../src/invariants/InvariantError.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Domain Types (from original test)
// =============================================================================

interface OrderTestState {
  status: "draft" | "submitted" | "confirmed";
  items: Array<{ productId: string }>;
  orderId: string;
}

const TestErrorCodes = {
  NOT_DRAFT: "NOT_DRAFT",
  NO_ITEMS: "NO_ITEMS",
  TOO_MANY_ITEMS: "TOO_MANY_ITEMS",
} as const;
type TestErrorCode = (typeof TestErrorCodes)[keyof typeof TestErrorCodes];

const TestInvariantError = InvariantError.forContext<TestErrorCode>("Test");

// =============================================================================
// Invariant Factories
// =============================================================================

function makeIsDraft() {
  return createInvariant<OrderTestState, TestErrorCode>(
    {
      name: "isDraft",
      code: TestErrorCodes.NOT_DRAFT,
      check: (state) => state.status === "draft",
      message: (state) => `Expected draft, got ${state.status}`,
      context: (state) => ({ orderId: state.orderId }),
    },
    TestInvariantError
  );
}

function makeHasItems() {
  return createInvariant<OrderTestState, TestErrorCode>(
    {
      name: "hasItems",
      code: TestErrorCodes.NO_ITEMS,
      check: (state) => state.items.length > 0,
      message: () => "Order must have at least one item",
    },
    TestInvariantError
  );
}

function makeNotTooManyItems() {
  return createInvariant<OrderTestState, TestErrorCode>(
    {
      name: "notTooManyItems",
      code: TestErrorCodes.TOO_MANY_ITEMS,
      check: (state) => state.items.length <= 10,
      message: (state) => `Too many items: ${state.items.length}`,
      context: (state) => ({ count: state.items.length }),
    },
    TestInvariantError
  );
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  set: ReturnType<typeof createInvariantSet> | null;
  originalArray: ReturnType<typeof makeIsDraft>[] | null;
  checkAllResult: boolean | null;
  assertAllError: unknown;
  noAssertAllError: boolean;
  validateAllResult: unknown;
  // Single set results
  singleCheckResult: boolean | null;
  singleAssertNoError: boolean;
  singleValidateResult: unknown;
}

function createInitialState(): TestState {
  return {
    set: null,
    originalArray: null,
    checkAllResult: null,
    assertAllError: null,
    noAssertAllError: false,
    validateAllResult: null,
    singleCheckResult: null,
    singleAssertNoError: false,
    singleValidateResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helpers
// =============================================================================

function makeItems(count: number): Array<{ productId: string }> {
  return Array.from({ length: count }, (_, i) => ({ productId: `prod-${i}` }));
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/invariants/create-invariant-set.feature"
);

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: createInvariantSet creates a set with all invariants accessible and immutable
  // ==========================================================================

  Rule(
    "createInvariantSet creates a set with all invariants accessible and immutable",
    ({ RuleScenario }) => {
      RuleScenario("Set contains all provided invariants", ({ Given, Then }) => {
        Given('an invariant set with "isDraft" and "hasItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems()]);
        });

        Then("the set has the following invariant names:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ name: string }>(dataTable);
          expect(state.set!.invariants).toHaveLength(rows.length);
          for (let i = 0; i < rows.length; i++) {
            expect(state.set!.invariants[i].name).toBe(rows[i].name);
          }
        });
      });

      RuleScenario("Invariants array is immutable and a frozen copy", ({ Given, Then, And }) => {
        Given('an invariant set with "isDraft" and "hasItems" from a mutable array', () => {
          state.originalArray = [makeIsDraft(), makeHasItems()];
          state.set = createInvariantSet(state.originalArray);
        });

        Then("the invariants array is frozen", () => {
          expect(Object.isFrozen(state.set!.invariants)).toBe(true);
        });

        And("mutating the original array does not affect the set", () => {
          state.originalArray!.push(makeNotTooManyItems());
          expect(state.set!.invariants).toHaveLength(2);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: checkAll returns true when all invariants pass and false when any fail
  // ==========================================================================

  Rule(
    "checkAll returns true when all invariants pass and false when any fail",
    ({ RuleScenario }) => {
      RuleScenario("checkAll returns true when all invariants pass", ({ Given, When, Then }) => {
        Given('an invariant set with "isDraft" and "hasItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems()]);
        });

        When('I checkAll with status "draft" and 1 item', () => {
          const orderState: OrderTestState = {
            status: "draft",
            items: [{ productId: "prod-1" }],
            orderId: "order-1",
          };
          state.checkAllResult = state.set!.checkAll(orderState);
        });

        Then("the checkAll result is true", () => {
          expect(state.checkAllResult).toBe(true);
        });
      });

      RuleScenario("checkAll returns false when first invariant fails", ({ Given, When, Then }) => {
        Given('an invariant set with "isDraft" and "hasItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems()]);
        });

        When('I checkAll with status "submitted" and 1 item', () => {
          const orderState: OrderTestState = {
            status: "submitted",
            items: [{ productId: "prod-1" }],
            orderId: "order-1",
          };
          state.checkAllResult = state.set!.checkAll(orderState);
        });

        Then("the checkAll result is false", () => {
          expect(state.checkAllResult).toBe(false);
        });
      });

      RuleScenario(
        "checkAll returns false when second invariant fails",
        ({ Given, When, Then }) => {
          Given('an invariant set with "isDraft" and "hasItems"', () => {
            state.set = createInvariantSet([makeIsDraft(), makeHasItems()]);
          });

          When('I checkAll with status "draft" and 0 items', () => {
            const orderState: OrderTestState = {
              status: "draft",
              items: [],
              orderId: "order-1",
            };
            state.checkAllResult = state.set!.checkAll(orderState);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      RuleScenario("checkAll returns false when all invariants fail", ({ Given, When, Then }) => {
        Given('an invariant set with "isDraft" and "hasItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems()]);
        });

        When('I checkAll with status "submitted" and 0 items', () => {
          const orderState: OrderTestState = {
            status: "submitted",
            items: [],
            orderId: "order-1",
          };
          state.checkAllResult = state.set!.checkAll(orderState);
        });

        Then("the checkAll result is false", () => {
          expect(state.checkAllResult).toBe(false);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: assertAll does not throw when all pass and throws on first failure with fail-fast
  // ==========================================================================

  Rule(
    "assertAll does not throw when all pass and throws on first failure with fail-fast",
    ({ RuleScenario }) => {
      RuleScenario("assertAll does not throw when all invariants pass", ({ Given, When, Then }) => {
        Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
        });

        When('I assertAll with status "draft" and 1 item', () => {
          const orderState: OrderTestState = {
            status: "draft",
            items: [{ productId: "prod-1" }],
            orderId: "order-1",
          };
          try {
            state.set!.assertAll(orderState);
            state.noAssertAllError = true;
          } catch (e) {
            state.assertAllError = e;
          }
        });

        Then("no assertAll error is thrown", () => {
          expect(state.noAssertAllError).toBe(true);
          expect(state.assertAllError).toBeNull();
        });
      });

      RuleScenario("assertAll throws on first failure with fail-fast", ({ Given, When, Then }) => {
        Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
        });

        When('I assertAll with status "submitted" and 0 items', () => {
          const orderState: OrderTestState = {
            status: "submitted",
            items: [],
            orderId: "order-1",
          };
          try {
            state.set!.assertAll(orderState);
          } catch (e) {
            state.assertAllError = e;
          }
        });

        Then('the assertAll error has code "NOT_DRAFT"', () => {
          expect((state.assertAllError as InvariantError).code).toBe("NOT_DRAFT");
        });
      });

      RuleScenario("assertAll throws correct error class", ({ Given, When, Then }) => {
        Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
        });

        When('I assertAll with status "confirmed" and 1 item', () => {
          const orderState: OrderTestState = {
            status: "confirmed",
            items: [{ productId: "prod-1" }],
            orderId: "order-1",
          };
          try {
            state.set!.assertAll(orderState);
          } catch (e) {
            state.assertAllError = e;
          }
        });

        Then("the assertAll error is an instance of TestInvariantError and InvariantError", () => {
          expect(state.assertAllError).toBeInstanceOf(TestInvariantError);
          expect(state.assertAllError).toBeInstanceOf(InvariantError);
        });
      });

      RuleScenario("assertAll throws error with context when provided", ({ Given, When, Then }) => {
        Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
        });

        When('I assertAll with orderId "order-123" and status "submitted" and 1 item', () => {
          const orderState: OrderTestState = {
            status: "submitted",
            items: [{ productId: "prod-1" }],
            orderId: "order-123",
          };
          try {
            state.set!.assertAll(orderState);
          } catch (e) {
            state.assertAllError = e;
          }
        });

        Then('the assertAll error has context with orderId "order-123"', () => {
          expect((state.assertAllError as InvariantError).context).toEqual({
            orderId: "order-123",
          });
        });
      });
    }
  );

  // ==========================================================================
  // Rule: validateAll collects all violations without short-circuiting
  // ==========================================================================

  Rule("validateAll collects all violations without short-circuiting", ({ RuleScenario }) => {
    RuleScenario("validateAll returns valid when all invariants pass", ({ Given, When, Then }) => {
      Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
        state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
      });

      When('I validateAll with status "draft" and 1 item', () => {
        const orderState: OrderTestState = {
          status: "draft",
          items: [{ productId: "prod-1" }],
          orderId: "order-1",
        };
        state.validateAllResult = state.set!.validateAll(orderState);
      });

      Then("the validateAll result is valid", () => {
        expect(state.validateAllResult).toEqual({ valid: true });
      });
    });

    RuleScenario("validateAll collects single violation", ({ Given, When, Then, And }) => {
      Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
        state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
      });

      When('I validateAll with orderId "order-123" and status "submitted" and 1 item', () => {
        const orderState: OrderTestState = {
          status: "submitted",
          items: [{ productId: "prod-1" }],
          orderId: "order-123",
        };
        state.validateAllResult = state.set!.validateAll(orderState);
      });

      Then("the validateAll result is invalid with 1 violation", () => {
        const result = state.validateAllResult as {
          valid: boolean;
          violations: Array<{ code: string; message: string }>;
        };
        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
      });

      And("the validateAll violation 0 has:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        const result = state.validateAllResult as {
          violations: Array<Record<string, unknown>>;
        };
        for (const row of rows) {
          expect(result.violations[0][row.property]).toBe(row.value);
        }
      });
    });

    RuleScenario(
      "validateAll collects multiple violations without short-circuiting",
      ({ Given, When, Then, And }) => {
        Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
        });

        When('I validateAll with status "submitted" and 0 items', () => {
          const orderState: OrderTestState = {
            status: "submitted",
            items: [],
            orderId: "order-1",
          };
          state.validateAllResult = state.set!.validateAll(orderState);
        });

        Then("the validateAll result is invalid with 2 violations", () => {
          const result = state.validateAllResult as {
            valid: boolean;
            violations: Array<{ code: string }>;
          };
          expect(result.valid).toBe(false);
          expect(result.violations).toHaveLength(2);
        });

        And("the validateAll violation codes include:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string }>(dataTable);
          const result = state.validateAllResult as {
            violations: Array<{ code: string }>;
          };
          const codes = result.violations.map((v) => v.code);
          for (const row of rows) {
            expect(codes).toContain(row.code);
          }
        });
      }
    );

    RuleScenario(
      "validateAll collects violations from non-adjacent invariants",
      ({ Given, When, Then, And }) => {
        Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
        });

        When('I validateAll with status "submitted" and 15 items', () => {
          const orderState: OrderTestState = {
            status: "submitted",
            items: makeItems(15),
            orderId: "order-1",
          };
          state.validateAllResult = state.set!.validateAll(orderState);
        });

        Then("the validateAll result is invalid with 2 violations", () => {
          const result = state.validateAllResult as {
            valid: boolean;
            violations: Array<{ code: string }>;
          };
          expect(result.valid).toBe(false);
          expect(result.violations).toHaveLength(2);
        });

        And("the validateAll violation codes include:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string }>(dataTable);
          const result = state.validateAllResult as {
            violations: Array<{ code: string }>;
          };
          const codes = result.violations.map((v) => v.code);
          for (const row of rows) {
            expect(codes).toContain(row.code);
          }
        });
      }
    );

    RuleScenario(
      "validateAll omits context when invariant has no context function",
      ({ Given, When, Then, And }) => {
        Given('an invariant set with "isDraft", "hasItems", and "notTooManyItems"', () => {
          state.set = createInvariantSet([makeIsDraft(), makeHasItems(), makeNotTooManyItems()]);
        });

        When('I validateAll with status "draft" and 0 items', () => {
          const orderState: OrderTestState = {
            status: "draft",
            items: [],
            orderId: "order-1",
          };
          state.validateAllResult = state.set!.validateAll(orderState);
        });

        Then("the validateAll result is invalid with 1 violation", () => {
          const result = state.validateAllResult as {
            valid: boolean;
            violations: Array<{ code: string }>;
          };
          expect(result.valid).toBe(false);
          expect(result.violations).toHaveLength(1);
        });

        And('the validateAll violation 0 has code "NO_ITEMS" and undefined context', () => {
          const result = state.validateAllResult as {
            violations: Array<{
              code: string;
              context: unknown;
            }>;
          };
          expect(result.violations[0].code).toBe("NO_ITEMS");
          expect(result.violations[0].context).toBeUndefined();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Empty invariant set always passes all operations
  // ==========================================================================

  Rule("Empty invariant set always passes all operations", ({ RuleScenario }) => {
    RuleScenario("Empty set passes all operations", ({ Given, Then, And }) => {
      Given("an empty invariant set", () => {
        state.set = createInvariantSet<OrderTestState, TestErrorCode>([]);
      });

      Then("checkAll returns true for the empty set", () => {
        const orderState: OrderTestState = {
          status: "submitted",
          items: [],
          orderId: "order-1",
        };
        expect(state.set!.checkAll(orderState)).toBe(true);
      });

      And("assertAll does not throw for the empty set", () => {
        const orderState: OrderTestState = {
          status: "submitted",
          items: [],
          orderId: "order-1",
        };
        expect(() => state.set!.assertAll(orderState)).not.toThrow();
      });

      And("validateAll returns valid for the empty set", () => {
        const orderState: OrderTestState = {
          status: "submitted",
          items: [],
          orderId: "order-1",
        };
        expect(state.set!.validateAll(orderState)).toEqual({ valid: true });
      });
    });
  });

  // ==========================================================================
  // Rule: Single invariant set works correctly
  // ==========================================================================

  Rule("Single invariant set works correctly", ({ RuleScenario }) => {
    RuleScenario(
      "Single invariant set passes all operations with valid state",
      ({ Given, When, Then, And }) => {
        Given('a single invariant set with "isDraft"', () => {
          state.set = createInvariantSet([makeIsDraft()]);
        });

        When('I operate on the single set with status "draft"', () => {
          const validState: OrderTestState = {
            status: "draft",
            items: [],
            orderId: "order-1",
          };
          state.singleCheckResult = state.set!.checkAll(validState);
          try {
            state.set!.assertAll(validState);
            state.singleAssertNoError = true;
          } catch {
            // ignore
          }
          state.singleValidateResult = state.set!.validateAll(validState);
        });

        Then("the single set checkAll result is true", () => {
          expect(state.singleCheckResult).toBe(true);
        });

        And("the single set assertAll does not throw", () => {
          expect(state.singleAssertNoError).toBe(true);
        });

        And("the single set validateAll returns valid", () => {
          expect(state.singleValidateResult).toEqual({ valid: true });
        });
      }
    );
  });
});
