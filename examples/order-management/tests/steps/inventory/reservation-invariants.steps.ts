/**
 * Reservation Invariants - Step Definitions
 *
 * BDD step definitions for pure reservation invariant functions:
 * - assertReservationExists / assertReservationDoesNotExist
 * - assertReservationHasItems / validateReservationItem / validateReservationItems
 * - InventoryInvariantError
 * - reservationIsPending / reservationNotExpired / reservationHasExpired
 * - confirmReservationInvariants / expireReservationInvariants
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  assertReservationExists,
  assertReservationDoesNotExist,
  assertReservationHasItems,
  validateReservationItem,
  validateReservationItems,
  reservationIsPending,
  reservationNotExpired,
  reservationHasExpired,
  confirmReservationInvariants,
  expireReservationInvariants,
  InventoryInvariantError,
  InventoryErrorCodes,
} from "../../../convex/contexts/inventory/domain/invariants.js";
import type {
  ReservationCMS,
  ReservationItem,
} from "../../../convex/contexts/inventory/domain/reservation.js";

// =============================================================================
// Types
// =============================================================================

interface ValidateResult {
  valid: boolean;
  code?: string;
  message?: string;
  context?: Record<string, unknown>;
}

interface ValidateAllResult {
  valid: boolean;
  violations?: Array<{ code: string; message: string; context?: Record<string, unknown> }>;
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  reservation: ReservationCMS | null | undefined;
  items: ReservationItem[];
  item: ReservationItem | null;
  checkResult: boolean | null;
  checkAllResult: boolean | null;
  error: InstanceType<typeof InventoryInvariantError> | null;
  errorInstance: InstanceType<typeof InventoryInvariantError> | null;
  noErrorThrown: boolean;
  validateResult: ValidateResult | null;
  validateAllResult: ValidateAllResult | null;
}

function createInitialState(): TestState {
  return {
    reservation: null,
    items: [],
    item: null,
    checkResult: null,
    checkAllResult: null,
    error: null,
    errorInstance: null,
    noErrorThrown: false,
    validateResult: null,
    validateAllResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Factories
// =============================================================================

function createTestReservationCMS(overrides: Partial<ReservationCMS> = {}): ReservationCMS {
  return {
    reservationId: "res_test",
    orderId: "ord_test",
    items: [{ productId: "prod_test", quantity: 5 }],
    status: "pending",
    expiresAt: Date.now() + 60 * 60 * 1000,
    version: 1,
    stateVersion: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/inventory/reservation-invariants.feature"
);

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: assertReservationExists
  // ==========================================================================

  Rule(
    "assertReservationExists throws when reservation is null or undefined",
    ({ RuleScenario }) => {
      RuleScenario("Does not throw when reservation exists", ({ Given, When, Then }) => {
        Given("a valid reservation CMS", () => {
          state.reservation = createTestReservationCMS();
        });

        When("I call assertReservationExists", () => {
          try {
            assertReservationExists(state.reservation);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.error).toBeNull();
        });
      });

      RuleScenario(
        "Throws RESERVATION_NOT_FOUND when reservation is null",
        ({ Given, When, Then }) => {
          Given("a null reservation reference", () => {
            state.reservation = null;
          });

          When("I call assertReservationExists", () => {
            try {
              assertReservationExists(state.reservation);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_FOUND"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_FOUND);
          });
        }
      );

      RuleScenario(
        "Throws RESERVATION_NOT_FOUND when reservation is undefined",
        ({ Given, When, Then }) => {
          Given("an undefined reservation reference", () => {
            state.reservation = undefined;
          });

          When("I call assertReservationExists", () => {
            try {
              assertReservationExists(state.reservation);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_FOUND"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_FOUND);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: assertReservationDoesNotExist
  // ==========================================================================

  Rule(
    "assertReservationDoesNotExist throws when reservation already exists",
    ({ RuleScenario }) => {
      RuleScenario("Does not throw when reservation is null", ({ Given, When, Then }) => {
        Given("a null reservation reference", () => {
          state.reservation = null;
        });

        When("I call assertReservationDoesNotExist", () => {
          try {
            assertReservationDoesNotExist(state.reservation);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.error).toBeNull();
        });
      });

      RuleScenario("Does not throw when reservation is undefined", ({ Given, When, Then }) => {
        Given("an undefined reservation reference", () => {
          state.reservation = undefined;
        });

        When("I call assertReservationDoesNotExist", () => {
          try {
            assertReservationDoesNotExist(state.reservation);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.error).toBeNull();
        });
      });

      RuleScenario(
        "Throws RESERVATION_ALREADY_EXISTS when reservation exists",
        ({ Given, When, Then, And }) => {
          Given('a valid reservation CMS with reservationId "res_existing"', () => {
            state.reservation = createTestReservationCMS({
              reservationId: "res_existing",
            });
          });

          When("I call assertReservationDoesNotExist", () => {
            try {
              assertReservationDoesNotExist(state.reservation);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then(
            'an InventoryInvariantError is thrown with code "RESERVATION_ALREADY_EXISTS"',
            () => {
              expect(state.error).toBeInstanceOf(InventoryInvariantError);
              expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_ALREADY_EXISTS);
            }
          );

          And('the error context reservationId is "res_existing"', () => {
            expect(state.error!.context?.reservationId).toBe("res_existing");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: assertReservationHasItems
  // ==========================================================================

  Rule("assertReservationHasItems throws when items array is empty", ({ RuleScenario }) => {
    RuleScenario("Does not throw when items has one item", ({ Given, When, Then }) => {
      Given("reservation items with 1 item", () => {
        state.items = [{ productId: "prod_1", quantity: 5 }];
      });

      When("I call assertReservationHasItems", () => {
        try {
          assertReservationHasItems(state.items);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InstanceType<typeof InventoryInvariantError>;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
        expect(state.error).toBeNull();
      });
    });

    RuleScenario("Does not throw when items has multiple items", ({ Given, When, Then }) => {
      Given("reservation items with 2 items", () => {
        state.items = [
          { productId: "prod_1", quantity: 5 },
          { productId: "prod_2", quantity: 3 },
        ];
      });

      When("I call assertReservationHasItems", () => {
        try {
          assertReservationHasItems(state.items);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InstanceType<typeof InventoryInvariantError>;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
        expect(state.error).toBeNull();
      });
    });

    RuleScenario("Throws EMPTY_RESERVATION when items array is empty", ({ Given, When, Then }) => {
      Given("an empty reservation items array", () => {
        state.items = [];
      });

      When("I call assertReservationHasItems", () => {
        try {
          assertReservationHasItems(state.items);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InstanceType<typeof InventoryInvariantError>;
        }
      });

      Then('an InventoryInvariantError is thrown with code "EMPTY_RESERVATION"', () => {
        expect(state.error).toBeInstanceOf(InventoryInvariantError);
        expect(state.error!.code).toBe(InventoryErrorCodes.EMPTY_RESERVATION);
      });
    });
  });

  // ==========================================================================
  // Rule: validateReservationItem
  // ==========================================================================

  Rule(
    "validateReservationItem validates individual item data via Zod schema",
    ({ RuleScenario }) => {
      RuleScenario("Does not throw for valid item with quantity 5", ({ Given, When, Then }) => {
        Given('a reservation item with productId "prod_1" and quantity 5', () => {
          state.item = { productId: "prod_1", quantity: 5 };
        });

        When("I call validateReservationItem", () => {
          try {
            validateReservationItem(state.item!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.error).toBeNull();
        });
      });

      RuleScenario("Does not throw for item with quantity 1", ({ Given, When, Then }) => {
        Given('a reservation item with productId "prod_1" and quantity 1', () => {
          state.item = { productId: "prod_1", quantity: 1 };
        });

        When("I call validateReservationItem", () => {
          try {
            validateReservationItem(state.item!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then("no error is thrown", () => {
          expect(state.noErrorThrown).toBe(true);
          expect(state.error).toBeNull();
        });
      });

      RuleScenario("Throws INVALID_QUANTITY for zero quantity", ({ Given, When, Then }) => {
        Given('a reservation item with productId "prod_1" and quantity 0', () => {
          state.item = { productId: "prod_1", quantity: 0 };
        });

        When("I call validateReservationItem", () => {
          try {
            validateReservationItem(state.item!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_QUANTITY"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_QUANTITY);
        });
      });

      RuleScenario("Throws INVALID_QUANTITY for negative quantity", ({ Given, When, Then }) => {
        Given('a reservation item with productId "prod_1" and quantity -5', () => {
          state.item = { productId: "prod_1", quantity: -5 };
        });

        When("I call validateReservationItem", () => {
          try {
            validateReservationItem(state.item!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_QUANTITY"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_QUANTITY);
        });
      });

      RuleScenario("Throws INVALID_QUANTITY for non-integer quantity", ({ Given, When, Then }) => {
        Given('a reservation item with productId "prod_1" and quantity 1.5', () => {
          state.item = { productId: "prod_1", quantity: 1.5 };
        });

        When("I call validateReservationItem", () => {
          try {
            validateReservationItem(state.item!);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_QUANTITY"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_QUANTITY);
        });
      });

      RuleScenario(
        "Throws INVALID_RESERVATION_ITEM for empty productId",
        ({ Given, When, Then }) => {
          Given('a reservation item with productId "" and quantity 5', () => {
            state.item = { productId: "", quantity: 5 };
          });

          When("I call validateReservationItem", () => {
            try {
              validateReservationItem(state.item!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "INVALID_RESERVATION_ITEM"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_RESERVATION_ITEM);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: validateReservationItems
  // ==========================================================================

  Rule("validateReservationItems validates the full items array", ({ RuleScenario }) => {
    RuleScenario("Does not throw for valid items array", ({ Given, When, Then }) => {
      Given("a reservation items array with 2 valid items", () => {
        state.items = [
          { productId: "prod_1", quantity: 5 },
          { productId: "prod_2", quantity: 3 },
        ];
      });

      When("I call validateReservationItems", () => {
        try {
          validateReservationItems(state.items);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InstanceType<typeof InventoryInvariantError>;
        }
      });

      Then("no error is thrown", () => {
        expect(state.noErrorThrown).toBe(true);
        expect(state.error).toBeNull();
      });
    });

    RuleScenario("Throws EMPTY_RESERVATION for empty array", ({ Given, When, Then }) => {
      Given("an empty reservation items array", () => {
        state.items = [];
      });

      When("I call validateReservationItems", () => {
        try {
          validateReservationItems(state.items);
          state.noErrorThrown = true;
        } catch (e) {
          state.error = e as InstanceType<typeof InventoryInvariantError>;
        }
      });

      Then('an InventoryInvariantError is thrown with code "EMPTY_RESERVATION"', () => {
        expect(state.error).toBeInstanceOf(InventoryInvariantError);
        expect(state.error!.code).toBe(InventoryErrorCodes.EMPTY_RESERVATION);
      });
    });

    RuleScenario(
      "Throws INVALID_QUANTITY when one item has invalid quantity",
      ({ Given, When, Then }) => {
        Given("a reservation items array where the second item has quantity 0", () => {
          state.items = [
            { productId: "prod_1", quantity: 5 },
            { productId: "prod_2", quantity: 0 },
          ];
        });

        When("I call validateReservationItems", () => {
          try {
            validateReservationItems(state.items);
            state.noErrorThrown = true;
          } catch (e) {
            state.error = e as InstanceType<typeof InventoryInvariantError>;
          }
        });

        Then('an InventoryInvariantError is thrown with code "INVALID_QUANTITY"', () => {
          expect(state.error).toBeInstanceOf(InventoryInvariantError);
          expect(state.error!.code).toBe(InventoryErrorCodes.INVALID_QUANTITY);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: InventoryInvariantError
  // ==========================================================================

  Rule("InventoryInvariantError carries structured error information", ({ RuleScenario }) => {
    RuleScenario("Has correct name property", ({ Given, Then }) => {
      Given(
        'an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"',
        () => {
          state.errorInstance = new InventoryInvariantError(
            InventoryErrorCodes.INSUFFICIENT_STOCK,
            "Custom message"
          );
        }
      );

      Then('the error name is "InventoryInvariantError"', () => {
        expect(state.errorInstance!.name).toBe("InventoryInvariantError");
      });
    });

    RuleScenario("Has correct code property", ({ Given, Then }) => {
      Given(
        'an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"',
        () => {
          state.errorInstance = new InventoryInvariantError(
            InventoryErrorCodes.INSUFFICIENT_STOCK,
            "Custom message"
          );
        }
      );

      Then('the error code is "INSUFFICIENT_STOCK"', () => {
        expect(state.errorInstance!.code).toBe(InventoryErrorCodes.INSUFFICIENT_STOCK);
      });
    });

    RuleScenario("Has correct message property", ({ Given, Then }) => {
      Given(
        'an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"',
        () => {
          state.errorInstance = new InventoryInvariantError(
            InventoryErrorCodes.INSUFFICIENT_STOCK,
            "Custom message"
          );
        }
      );

      Then('the error message is "Custom message"', () => {
        expect(state.errorInstance!.message).toBe("Custom message");
      });
    });

    RuleScenario("Has correct context property", ({ Given, Then, And }) => {
      Given('an InventoryInvariantError with code "INSUFFICIENT_STOCK" and context', () => {
        state.errorInstance = new InventoryInvariantError(
          InventoryErrorCodes.INSUFFICIENT_STOCK,
          "Custom message",
          { productId: "prod_123", extra: "data" }
        );
      });

      Then('the error context contains productId "prod_123"', () => {
        expect(state.errorInstance!.context?.productId).toBe("prod_123");
      });

      And('the error context contains extra "data"', () => {
        expect(state.errorInstance!.context?.extra).toBe("data");
      });
    });

    RuleScenario("Can have undefined context", ({ Given, Then }) => {
      Given('an InventoryInvariantError with code "INSUFFICIENT_STOCK" and no context', () => {
        state.errorInstance = new InventoryInvariantError(
          InventoryErrorCodes.INSUFFICIENT_STOCK,
          "No context"
        );
      });

      Then("the error context is undefined", () => {
        expect(state.errorInstance!.context).toBeUndefined();
      });
    });

    RuleScenario("Is instance of Error", ({ Given, Then }) => {
      Given(
        'an InventoryInvariantError with code "INSUFFICIENT_STOCK" and message "Custom message"',
        () => {
          state.errorInstance = new InventoryInvariantError(
            InventoryErrorCodes.INSUFFICIENT_STOCK,
            "Custom message"
          );
        }
      );

      Then("the error is an instance of Error", () => {
        expect(state.errorInstance).toBeInstanceOf(Error);
      });
    });
  });

  // ==========================================================================
  // Rule: reservationIsPending
  // ==========================================================================

  Rule(
    "reservationIsPending validates that reservation status is pending",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenario(
        "reservationIsPending.check returns true for pending status",
        ({ Given, When, Then }) => {
          Given('a reservation in "pending" status', () => {
            state.reservation = createTestReservationCMS({ status: "pending" });
          });

          When("I call reservationIsPending.check", () => {
            state.checkResult = reservationIsPending.check(state.reservation!);
          });

          Then("the check result is true", () => {
            expect(state.checkResult).toBe(true);
          });
        }
      );

      RuleScenarioOutline(
        "reservationIsPending.check returns false for non-pending statuses",
        ({ Given, When, Then }, variables: { status: string }) => {
          Given('a reservation in "<status>" status', () => {
            state.reservation = createTestReservationCMS({
              status: variables.status as ReservationCMS["status"],
            });
          });

          When("I call reservationIsPending.check", () => {
            state.checkResult = reservationIsPending.check(state.reservation!);
          });

          Then("the check result is false", () => {
            expect(state.checkResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "reservationIsPending.assert passes for pending status",
        ({ Given, When, Then }) => {
          Given('a reservation in "pending" status', () => {
            state.reservation = createTestReservationCMS({ status: "pending" });
          });

          When("I call reservationIsPending.assert", () => {
            try {
              reservationIsPending.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
            expect(state.error).toBeNull();
          });
        }
      );

      RuleScenario(
        "reservationIsPending.assert throws RESERVATION_NOT_PENDING for confirmed",
        ({ Given, When, Then, And }) => {
          Given('a reservation in "confirmed" status with reservationId "res_test"', () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              reservationId: "res_test",
            });
          });

          When("I call reservationIsPending.assert", () => {
            try {
              reservationIsPending.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_PENDING);
          });

          And('the error context reservationId is "res_test"', () => {
            expect(state.error!.context?.reservationId).toBe("res_test");
          });

          And('the error context currentStatus is "confirmed"', () => {
            expect(state.error!.context?.currentStatus).toBe("confirmed");
          });
        }
      );

      RuleScenario(
        "reservationIsPending.assert throws RESERVATION_NOT_PENDING for released",
        ({ Given, When, Then }) => {
          Given('a reservation in "released" status', () => {
            state.reservation = createTestReservationCMS({ status: "released" });
          });

          When("I call reservationIsPending.assert", () => {
            try {
              reservationIsPending.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_PENDING);
          });
        }
      );

      RuleScenario(
        "reservationIsPending.validate returns valid for pending",
        ({ Given, When, Then }) => {
          Given('a reservation in "pending" status', () => {
            state.reservation = createTestReservationCMS({ status: "pending" });
          });

          When("I call reservationIsPending.validate", () => {
            state.validateResult = reservationIsPending.validate(
              state.reservation!
            ) as ValidateResult;
          });

          Then("the validate result is valid", () => {
            expect(state.validateResult!.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "reservationIsPending.validate returns invalid for released",
        ({ Given, When, Then, And }) => {
          Given('a reservation in "released" status', () => {
            state.reservation = createTestReservationCMS({ status: "released" });
          });

          When("I call reservationIsPending.validate", () => {
            state.validateResult = reservationIsPending.validate(
              state.reservation!
            ) as ValidateResult;
          });

          Then('the validate result is invalid with code "RESERVATION_NOT_PENDING"', () => {
            expect(state.validateResult!.valid).toBe(false);
            expect(state.validateResult!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_PENDING);
          });

          And('the validate result context currentStatus is "released"', () => {
            expect(state.validateResult!.context?.currentStatus).toBe("released");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: reservationNotExpired
  // ==========================================================================

  Rule(
    "reservationNotExpired validates that a pending reservation has not passed its expiry",
    ({ RuleScenario }) => {
      RuleScenario(
        "reservationNotExpired.check returns true for pending with future expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call reservationNotExpired.check", () => {
            state.checkResult = reservationNotExpired.check(state.reservation!);
          });

          Then("the check result is true", () => {
            expect(state.checkResult).toBe(true);
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.check returns true for confirmed with past expiry",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation with past expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I call reservationNotExpired.check", () => {
            state.checkResult = reservationNotExpired.check(state.reservation!);
          });

          Then("the check result is true", () => {
            expect(state.checkResult).toBe(true);
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.check returns true for released with past expiry",
        ({ Given, When, Then }) => {
          Given("a released reservation with past expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "released",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I call reservationNotExpired.check", () => {
            state.checkResult = reservationNotExpired.check(state.reservation!);
          });

          Then("the check result is true", () => {
            expect(state.checkResult).toBe(true);
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.check returns false for pending with past expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call reservationNotExpired.check", () => {
            state.checkResult = reservationNotExpired.check(state.reservation!);
          });

          Then("the check result is false", () => {
            expect(state.checkResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.assert passes for pending with future expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call reservationNotExpired.assert", () => {
            try {
              reservationNotExpired.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
            expect(state.error).toBeNull();
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.assert passes for confirmed with past expiry",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation with past expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I call reservationNotExpired.assert", () => {
            try {
              reservationNotExpired.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
            expect(state.error).toBeNull();
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.assert throws RESERVATION_EXPIRED for pending with past expiry",
        ({ Given, When, Then, And }) => {
          Given(
            'a pending reservation that expired 1 second ago with reservationId "res_expired"',
            () => {
              state.reservation = createTestReservationCMS({
                status: "pending",
                expiresAt: Date.now() - 1000,
                reservationId: "res_expired",
              });
            }
          );

          When("I call reservationNotExpired.assert", () => {
            try {
              reservationNotExpired.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_EXPIRED"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_EXPIRED);
          });

          And('the error context reservationId is "res_expired"', () => {
            expect(state.error!.context?.reservationId).toBe("res_expired");
          });

          And("the error context includes expiresAt", () => {
            expect(state.error!.context?.expiresAt).toBeDefined();
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.validate returns valid for pending with future expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call reservationNotExpired.validate", () => {
            state.validateResult = reservationNotExpired.validate(
              state.reservation!
            ) as ValidateResult;
          });

          Then("the validate result is valid", () => {
            expect(state.validateResult!.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "reservationNotExpired.validate returns invalid for pending with past expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call reservationNotExpired.validate", () => {
            state.validateResult = reservationNotExpired.validate(
              state.reservation!
            ) as ValidateResult;
          });

          Then('the validate result is invalid with code "RESERVATION_EXPIRED"', () => {
            expect(state.validateResult!.valid).toBe(false);
            expect(state.validateResult!.code).toBe(InventoryErrorCodes.RESERVATION_EXPIRED);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: reservationHasExpired
  // ==========================================================================

  Rule(
    "reservationHasExpired validates that a reservation has passed its expiry time",
    ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenario(
        "reservationHasExpired.check returns true for pending with past expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call reservationHasExpired.check", () => {
            state.checkResult = reservationHasExpired.check(state.reservation!);
          });

          Then("the check result is true", () => {
            expect(state.checkResult).toBe(true);
          });
        }
      );

      RuleScenarioOutline(
        "reservationHasExpired.check returns true for non-pending statuses",
        ({ Given, When, Then }, variables: { status: string }) => {
          Given('a "<status>" reservation with future expiry', () => {
            state.reservation = createTestReservationCMS({
              status: variables.status as ReservationCMS["status"],
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call reservationHasExpired.check", () => {
            state.checkResult = reservationHasExpired.check(state.reservation!);
          });

          Then("the check result is true", () => {
            expect(state.checkResult).toBe(true);
          });
        }
      );

      RuleScenario(
        "reservationHasExpired.check returns false for pending with future expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call reservationHasExpired.check", () => {
            state.checkResult = reservationHasExpired.check(state.reservation!);
          });

          Then("the check result is false", () => {
            expect(state.checkResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "reservationHasExpired.assert passes for pending with past expiry",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call reservationHasExpired.assert", () => {
            try {
              reservationHasExpired.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
            expect(state.error).toBeNull();
          });
        }
      );

      RuleScenario(
        "reservationHasExpired.assert passes for confirmed regardless of expiry",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation with future expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call reservationHasExpired.assert", () => {
            try {
              reservationHasExpired.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
            expect(state.error).toBeNull();
          });
        }
      );

      RuleScenario(
        "reservationHasExpired.assert throws RESERVATION_NOT_EXPIRED for pending with future expiry",
        ({ Given, When, Then, And }) => {
          Given(
            'a pending reservation expiring 1 hour from now with reservationId "res_active"',
            () => {
              state.reservation = createTestReservationCMS({
                status: "pending",
                expiresAt: Date.now() + 60 * 60 * 1000,
                reservationId: "res_active",
              });
            }
          );

          When("I call reservationHasExpired.assert", () => {
            try {
              reservationHasExpired.assert(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_EXPIRED"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_EXPIRED);
          });

          And('the error context reservationId is "res_active"', () => {
            expect(state.error!.context?.reservationId).toBe("res_active");
          });

          And("the error context includes expiresAt", () => {
            expect(state.error!.context?.expiresAt).toBeDefined();
          });

          And("the error context includes currentTime", () => {
            expect(state.error!.context?.currentTime).toBeDefined();
          });
        }
      );

      RuleScenario(
        "reservationHasExpired.validate returns valid for expired reservation",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call reservationHasExpired.validate", () => {
            state.validateResult = reservationHasExpired.validate(
              state.reservation!
            ) as ValidateResult;
          });

          Then("the validate result is valid", () => {
            expect(state.validateResult!.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "reservationHasExpired.validate returns invalid for pending with future expiry",
        ({ Given, When, Then, And }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call reservationHasExpired.validate", () => {
            state.validateResult = reservationHasExpired.validate(
              state.reservation!
            ) as ValidateResult;
          });

          Then('the validate result is invalid with code "RESERVATION_NOT_EXPIRED"', () => {
            expect(state.validateResult!.valid).toBe(false);
            expect(state.validateResult!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_EXPIRED);
          });

          And("the validate result context includes expiresAt", () => {
            expect(state.validateResult!.context?.expiresAt).toBeDefined();
          });

          And("the validate result context includes currentTime", () => {
            expect(state.validateResult!.context?.currentTime).toBeDefined();
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: confirmReservationInvariants
  // ==========================================================================

  Rule(
    "confirmReservationInvariants validates pending + not expired for confirmation",
    ({ RuleScenario }) => {
      RuleScenario(
        "confirmReservationInvariants.checkAll returns true for pending and not expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call confirmReservationInvariants.checkAll", () => {
            state.checkAllResult = confirmReservationInvariants.checkAll(state.reservation!);
          });

          Then("the checkAll result is true", () => {
            expect(state.checkAllResult).toBe(true);
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.checkAll returns false for confirmed and not expired",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation with future expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call confirmReservationInvariants.checkAll", () => {
            state.checkAllResult = confirmReservationInvariants.checkAll(state.reservation!);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.checkAll returns false for pending and expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call confirmReservationInvariants.checkAll", () => {
            state.checkAllResult = confirmReservationInvariants.checkAll(state.reservation!);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.assertAll passes for pending and not expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call confirmReservationInvariants.assertAll", () => {
            try {
              confirmReservationInvariants.assertAll(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
            expect(state.error).toBeNull();
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.assertAll throws RESERVATION_NOT_PENDING for confirmed",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation with future expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call confirmReservationInvariants.assertAll", () => {
            try {
              confirmReservationInvariants.assertAll(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_PENDING);
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.assertAll throws RESERVATION_EXPIRED for pending and expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call confirmReservationInvariants.assertAll", () => {
            try {
              confirmReservationInvariants.assertAll(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_EXPIRED"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_EXPIRED);
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.validateAll returns valid for pending and not expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call confirmReservationInvariants.validateAll", () => {
            state.validateAllResult = confirmReservationInvariants.validateAll(
              state.reservation!
            ) as ValidateAllResult;
          });

          Then("the validateAll result is valid", () => {
            expect(state.validateAllResult!.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.validateAll returns single violation for confirmed and not expired",
        ({ Given, When, Then, And }) => {
          Given("a confirmed reservation with future expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call confirmReservationInvariants.validateAll", () => {
            state.validateAllResult = confirmReservationInvariants.validateAll(
              state.reservation!
            ) as ValidateAllResult;
          });

          Then("the validateAll result is invalid", () => {
            expect(state.validateAllResult!.valid).toBe(false);
          });

          And('the violations include code "RESERVATION_NOT_PENDING"', () => {
            const codes = state.validateAllResult!.violations!.map((v) => v.code);
            expect(codes).toContain(InventoryErrorCodes.RESERVATION_NOT_PENDING);
          });
        }
      );

      RuleScenario(
        "confirmReservationInvariants.validateAll returns violation for pending and expired",
        ({ Given, When, Then, And }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call confirmReservationInvariants.validateAll", () => {
            state.validateAllResult = confirmReservationInvariants.validateAll(
              state.reservation!
            ) as ValidateAllResult;
          });

          Then("the validateAll result is invalid", () => {
            expect(state.validateAllResult!.valid).toBe(false);
          });

          And('the violations include code "RESERVATION_EXPIRED"', () => {
            const codes = state.validateAllResult!.violations!.map((v) => v.code);
            expect(codes).toContain(InventoryErrorCodes.RESERVATION_EXPIRED);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: expireReservationInvariants
  // ==========================================================================

  Rule(
    "expireReservationInvariants validates pending + has expired for expiration processing",
    ({ RuleScenario }) => {
      RuleScenario(
        "expireReservationInvariants.checkAll returns true for pending and expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call expireReservationInvariants.checkAll", () => {
            state.checkAllResult = expireReservationInvariants.checkAll(state.reservation!);
          });

          Then("the checkAll result is true", () => {
            expect(state.checkAllResult).toBe(true);
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.checkAll returns false for confirmed and expired",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation with past expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I call expireReservationInvariants.checkAll", () => {
            state.checkAllResult = expireReservationInvariants.checkAll(state.reservation!);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.checkAll returns false for pending and not expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call expireReservationInvariants.checkAll", () => {
            state.checkAllResult = expireReservationInvariants.checkAll(state.reservation!);
          });

          Then("the checkAll result is false", () => {
            expect(state.checkAllResult).toBe(false);
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.assertAll passes for pending and expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call expireReservationInvariants.assertAll", () => {
            try {
              expireReservationInvariants.assertAll(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then("no error is thrown", () => {
            expect(state.noErrorThrown).toBe(true);
            expect(state.error).toBeNull();
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.assertAll throws RESERVATION_NOT_PENDING for confirmed",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation with past expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "confirmed",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I call expireReservationInvariants.assertAll", () => {
            try {
              expireReservationInvariants.assertAll(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_PENDING"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_PENDING);
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.assertAll throws RESERVATION_NOT_EXPIRED for pending and not expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call expireReservationInvariants.assertAll", () => {
            try {
              expireReservationInvariants.assertAll(state.reservation!);
              state.noErrorThrown = true;
            } catch (e) {
              state.error = e as InstanceType<typeof InventoryInvariantError>;
            }
          });

          Then('an InventoryInvariantError is thrown with code "RESERVATION_NOT_EXPIRED"', () => {
            expect(state.error).toBeInstanceOf(InventoryInvariantError);
            expect(state.error!.code).toBe(InventoryErrorCodes.RESERVATION_NOT_EXPIRED);
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.validateAll returns valid for pending and expired",
        ({ Given, When, Then }) => {
          Given("a pending reservation that expired 1 second ago", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() - 1000,
            });
          });

          When("I call expireReservationInvariants.validateAll", () => {
            state.validateAllResult = expireReservationInvariants.validateAll(
              state.reservation!
            ) as ValidateAllResult;
          });

          Then("the validateAll result is valid", () => {
            expect(state.validateAllResult!.valid).toBe(true);
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.validateAll returns single violation for released and expired",
        ({ Given, When, Then, And }) => {
          Given("a released reservation with past expiry", () => {
            state.reservation = createTestReservationCMS({
              status: "released",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I call expireReservationInvariants.validateAll", () => {
            state.validateAllResult = expireReservationInvariants.validateAll(
              state.reservation!
            ) as ValidateAllResult;
          });

          Then("the validateAll result is invalid", () => {
            expect(state.validateAllResult!.valid).toBe(false);
          });

          And('the violations include code "RESERVATION_NOT_PENDING"', () => {
            const codes = state.validateAllResult!.violations!.map((v) => v.code);
            expect(codes).toContain(InventoryErrorCodes.RESERVATION_NOT_PENDING);
          });
        }
      );

      RuleScenario(
        "expireReservationInvariants.validateAll returns single violation for pending and not expired",
        ({ Given, When, Then, And }) => {
          Given("a pending reservation expiring 1 hour from now", () => {
            state.reservation = createTestReservationCMS({
              status: "pending",
              expiresAt: Date.now() + 60 * 60 * 1000,
            });
          });

          When("I call expireReservationInvariants.validateAll", () => {
            state.validateAllResult = expireReservationInvariants.validateAll(
              state.reservation!
            ) as ValidateAllResult;
          });

          Then("the validateAll result is invalid", () => {
            expect(state.validateAllResult!.valid).toBe(false);
          });

          And('the violations include code "RESERVATION_NOT_EXPIRED"', () => {
            const codes = state.validateAllResult!.violations!.map((v) => v.code);
            expect(codes).toContain(InventoryErrorCodes.RESERVATION_NOT_EXPIRED);
          });
        }
      );
    }
  );
});
