/**
 * Reservation Domain Functions - Step Definitions
 *
 * BDD step definitions for pure reservation domain helper functions:
 * - calculateReservationItemCount
 * - calculateTotalReservedQuantity
 * - createInitialReservationCMS
 * - isReservationExpired
 * - upcastReservationCMS
 *
 * These are pure unit tests that don't require Convex or mocking.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import {
  calculateReservationItemCount,
  calculateTotalReservedQuantity,
  createInitialReservationCMS,
  isReservationExpired,
  upcastReservationCMS,
  CURRENT_RESERVATION_CMS_VERSION,
  DEFAULT_RESERVATION_TTL_MS,
  type ReservationCMS,
  type ReservationItem,
} from "../../../convex/contexts/inventory/domain/reservation.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  reservation: ReservationCMS | null;
  items: ReservationItem[];
  reservationId: string;
  orderId: string;
  cms: ReservationCMS | null;
  rawCms: unknown;
  upcastResult: ReservationCMS | null;
  upcastError: Error | null;
  itemCount: number | null;
  totalQuantity: number | null;
  isExpired: boolean | null;
  beforeTimestamp: number;
  afterTimestamp: number;
}

function createInitialState(): TestState {
  return {
    reservation: null,
    items: [],
    reservationId: "",
    orderId: "",
    cms: null,
    rawCms: null,
    upcastResult: null,
    upcastError: null,
    itemCount: null,
    totalQuantity: null,
    isExpired: null,
    beforeTimestamp: 0,
    afterTimestamp: 0,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helper: Build a ReservationCMS
// =============================================================================

function buildReservation(overrides: Partial<ReservationCMS> = {}): ReservationCMS {
  return {
    reservationId: "res_1",
    orderId: "ord_1",
    items: [{ productId: "prod_1", quantity: 5 }],
    status: "pending",
    expiresAt: Date.now() + 3600000,
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

const feature = await loadFeature("tests/features/behavior/inventory/reservation-domain.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: calculateReservationItemCount returns the number of line items
  // ==========================================================================

  Rule("calculateReservationItemCount returns the number of line items", ({ RuleScenario }) => {
    RuleScenario("Single item reservation returns count of 1", ({ Given, When, Then }) => {
      Given("a reservation with 1 item", () => {
        state.reservation = buildReservation({
          items: [{ productId: "prod_1", quantity: 5 }],
        });
      });

      When("I calculate the reservation item count", () => {
        state.itemCount = calculateReservationItemCount(state.reservation!);
      });

      Then("the item count is 1", () => {
        expect(state.itemCount).toBe(1);
      });
    });

    RuleScenario("Multiple items reservation returns correct count", ({ Given, When, Then }) => {
      Given("a reservation with 3 items", () => {
        state.reservation = buildReservation({
          items: [
            { productId: "prod_1", quantity: 5 },
            { productId: "prod_2", quantity: 3 },
            { productId: "prod_3", quantity: 10 },
          ],
        });
      });

      When("I calculate the reservation item count", () => {
        state.itemCount = calculateReservationItemCount(state.reservation!);
      });

      Then("the item count is 3", () => {
        expect(state.itemCount).toBe(3);
      });
    });

    RuleScenario("Empty items reservation returns count of 0", ({ Given, When, Then }) => {
      Given("a reservation with 0 items", () => {
        state.reservation = buildReservation({ items: [] });
      });

      When("I calculate the reservation item count", () => {
        state.itemCount = calculateReservationItemCount(state.reservation!);
      });

      Then("the item count is 0", () => {
        expect(state.itemCount).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Rule: calculateTotalReservedQuantity sums all item quantities
  // ==========================================================================

  Rule("calculateTotalReservedQuantity sums all item quantities", ({ RuleScenario }) => {
    RuleScenario("Multiple items returns sum of all quantities", ({ Given, When, Then }) => {
      Given("reservation items with quantities 5, 3, and 10", () => {
        state.items = [
          { productId: "prod_1", quantity: 5 },
          { productId: "prod_2", quantity: 3 },
          { productId: "prod_3", quantity: 10 },
        ];
      });

      When("I calculate the total reserved quantity", () => {
        state.totalQuantity = calculateTotalReservedQuantity(state.items);
      });

      Then("the total reserved quantity is 18", () => {
        expect(state.totalQuantity).toBe(18);
      });
    });

    RuleScenario("Single item returns its quantity", ({ Given, When, Then }) => {
      Given("reservation items with quantity 7", () => {
        state.items = [{ productId: "prod_1", quantity: 7 }];
      });

      When("I calculate the total reserved quantity", () => {
        state.totalQuantity = calculateTotalReservedQuantity(state.items);
      });

      Then("the total reserved quantity is 7", () => {
        expect(state.totalQuantity).toBe(7);
      });
    });

    RuleScenario("Empty items returns 0", ({ Given, When, Then }) => {
      Given("no reservation items", () => {
        state.items = [];
      });

      When("I calculate the total reserved quantity", () => {
        state.totalQuantity = calculateTotalReservedQuantity(state.items);
      });

      Then("the total reserved quantity is 0", () => {
        expect(state.totalQuantity).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Rule: createInitialReservationCMS produces a valid initial state
  // ==========================================================================

  Rule("createInitialReservationCMS produces a valid initial state", ({ RuleScenario }) => {
    RuleScenario("Creates CMS with correct reservationId and orderId", ({ Given, When, Then }) => {
      Given('reservation ID "res_123" and order ID "ord_456"', () => {
        state.reservationId = "res_123";
        state.orderId = "ord_456";
      });

      When("I create an initial reservation CMS with 1 item", () => {
        const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
        state.cms = createInitialReservationCMS(state.reservationId, state.orderId, items);
      });

      Then(
        "the CMS has the following properties:",
        (_ctx: unknown, table: { property: string; value: string }[]) => {
          for (const row of table) {
            expect((state.cms as Record<string, unknown>)[row.property]).toBe(row.value);
          }
        }
      );
    });

    RuleScenario("Initializes items array correctly", ({ Given, When, Then, And }) => {
      Given('reservation ID "res_123" and order ID "ord_456"', () => {
        state.reservationId = "res_123";
        state.orderId = "ord_456";
      });

      When("I create an initial reservation CMS with 2 items", () => {
        state.items = [
          { productId: "prod_1", quantity: 5 },
          { productId: "prod_2", quantity: 3 },
        ];
        state.cms = createInitialReservationCMS(state.reservationId, state.orderId, state.items);
      });

      Then("the CMS items array has length 2", () => {
        expect(state.cms!.items).toHaveLength(2);
      });

      And("the CMS items match the input items", () => {
        expect(state.cms!.items).toEqual(state.items);
      });
    });

    RuleScenario("Sets status to pending", ({ Given, When, Then }) => {
      Given('reservation ID "res_123" and order ID "ord_456"', () => {
        state.reservationId = "res_123";
        state.orderId = "ord_456";
      });

      When("I create an initial reservation CMS with 1 item", () => {
        const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
        state.cms = createInitialReservationCMS(state.reservationId, state.orderId, items);
      });

      Then('the CMS status is "pending"', () => {
        expect(state.cms!.status).toBe("pending");
      });
    });

    RuleScenario("Sets expiresAt with default TTL", ({ Given, And, When, Then }) => {
      Given('reservation ID "res_123" and order ID "ord_456"', () => {
        state.reservationId = "res_123";
        state.orderId = "ord_456";
      });

      And("the current timestamp is captured", () => {
        state.beforeTimestamp = Date.now();
      });

      When("I create an initial reservation CMS with 1 item using default TTL", () => {
        const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
        state.cms = createInitialReservationCMS(state.reservationId, state.orderId, items);
        state.afterTimestamp = Date.now();
      });

      Then("the CMS expiresAt is approximately now plus the default TTL", () => {
        expect(state.cms!.expiresAt).toBeGreaterThanOrEqual(
          state.beforeTimestamp + DEFAULT_RESERVATION_TTL_MS
        );
        expect(state.cms!.expiresAt).toBeLessThanOrEqual(
          state.afterTimestamp + DEFAULT_RESERVATION_TTL_MS
        );
      });
    });

    RuleScenario("Supports custom TTL", ({ Given, And, When, Then }) => {
      Given('reservation ID "res_123" and order ID "ord_456"', () => {
        state.reservationId = "res_123";
        state.orderId = "ord_456";
      });

      And("the current timestamp is captured", () => {
        state.beforeTimestamp = Date.now();
      });

      When("I create an initial reservation CMS with 1 item using custom TTL of 1800000 ms", () => {
        const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
        const customTTL = 1800000; // 30 minutes
        state.cms = createInitialReservationCMS(
          state.reservationId,
          state.orderId,
          items,
          customTTL
        );
        state.afterTimestamp = Date.now();
      });

      Then("the CMS expiresAt is approximately now plus 1800000 ms", () => {
        expect(state.cms!.expiresAt).toBeGreaterThanOrEqual(state.beforeTimestamp + 1800000);
        expect(state.cms!.expiresAt).toBeLessThanOrEqual(state.afterTimestamp + 1800000);
      });
    });

    RuleScenario("Initializes version to 0", ({ Given, When, Then }) => {
      Given('reservation ID "res_123" and order ID "ord_456"', () => {
        state.reservationId = "res_123";
        state.orderId = "ord_456";
      });

      When("I create an initial reservation CMS with 1 item", () => {
        const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
        state.cms = createInitialReservationCMS(state.reservationId, state.orderId, items);
      });

      Then("the CMS version is 0", () => {
        expect(state.cms!.version).toBe(0);
      });
    });

    RuleScenario("Initializes with current state version", ({ Given, When, Then }) => {
      Given('reservation ID "res_123" and order ID "ord_456"', () => {
        state.reservationId = "res_123";
        state.orderId = "ord_456";
      });

      When("I create an initial reservation CMS with 1 item", () => {
        const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
        state.cms = createInitialReservationCMS(state.reservationId, state.orderId, items);
      });

      Then("the CMS stateVersion equals the current reservation CMS version constant", () => {
        expect(state.cms!.stateVersion).toBe(CURRENT_RESERVATION_CMS_VERSION);
      });
    });

    RuleScenario(
      "Sets createdAt and updatedAt to current timestamp",
      ({ Given, And, When, Then }) => {
        Given('reservation ID "res_123" and order ID "ord_456"', () => {
          state.reservationId = "res_123";
          state.orderId = "ord_456";
        });

        And("the current timestamp is captured", () => {
          state.beforeTimestamp = Date.now();
        });

        When("I create an initial reservation CMS with 1 item", () => {
          const items: ReservationItem[] = [{ productId: "prod_1", quantity: 5 }];
          state.cms = createInitialReservationCMS(state.reservationId, state.orderId, items);
          state.afterTimestamp = Date.now();
        });

        Then("the CMS createdAt is between the before and after timestamps", () => {
          expect(state.cms!.createdAt).toBeGreaterThanOrEqual(state.beforeTimestamp);
          expect(state.cms!.createdAt).toBeLessThanOrEqual(state.afterTimestamp);
        });

        And("the CMS updatedAt equals createdAt", () => {
          expect(state.cms!.updatedAt).toBe(state.cms!.createdAt);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: isReservationExpired checks pending reservations against current time
  // ==========================================================================

  Rule(
    "isReservationExpired checks pending reservations against current time",
    ({ RuleScenario }) => {
      RuleScenario("Returns false when reservation has not expired", ({ Given, When, Then }) => {
        Given("a pending reservation expiring 1 hour in the future", () => {
          state.reservation = buildReservation({
            status: "pending",
            expiresAt: Date.now() + 60 * 60 * 1000,
          });
        });

        When("I check if the reservation is expired", () => {
          state.isExpired = isReservationExpired(state.reservation!);
        });

        Then("the reservation is not expired", () => {
          expect(state.isExpired).toBe(false);
        });
      });

      RuleScenario("Returns true when reservation has expired", ({ Given, When, Then }) => {
        Given("a pending reservation that expired 1 second ago", () => {
          state.reservation = buildReservation({
            status: "pending",
            expiresAt: Date.now() - 1000,
          });
        });

        When("I check if the reservation is expired", () => {
          state.isExpired = isReservationExpired(state.reservation!);
        });

        Then("the reservation is expired", () => {
          expect(state.isExpired).toBe(true);
        });
      });

      RuleScenario(
        "Returns false when reservation is confirmed regardless of expiry",
        ({ Given, When, Then }) => {
          Given("a confirmed reservation that expired 1 hour ago", () => {
            state.reservation = buildReservation({
              status: "confirmed",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I check if the reservation is expired", () => {
            state.isExpired = isReservationExpired(state.reservation!);
          });

          Then("the reservation is not expired", () => {
            expect(state.isExpired).toBe(false);
          });
        }
      );

      RuleScenario(
        "Returns false when reservation is released regardless of expiry",
        ({ Given, When, Then }) => {
          Given("a released reservation that expired 1 hour ago", () => {
            state.reservation = buildReservation({
              status: "released",
              expiresAt: Date.now() - 60 * 60 * 1000,
            });
          });

          When("I check if the reservation is expired", () => {
            state.isExpired = isReservationExpired(state.reservation!);
          });

          Then("the reservation is not expired", () => {
            expect(state.isExpired).toBe(false);
          });
        }
      );

      RuleScenario("Handles exact expiry boundary correctly", ({ Given, When, Then, But }) => {
        Given("a pending reservation expiring at exactly the current time", () => {
          vi.useFakeTimers();
          const now = 1000000000000;
          vi.setSystemTime(now);
          state.reservation = buildReservation({
            status: "pending",
            expiresAt: now,
          });
        });

        When("I check if the reservation is expired", () => {
          state.isExpired = isReservationExpired(state.reservation!);
        });

        Then("the reservation is not expired", () => {
          expect(state.isExpired).toBe(false);
        });

        But("when 1 millisecond passes and I check again", () => {
          vi.setSystemTime(1000000000001);
          state.isExpired = isReservationExpired(state.reservation!);
        });

        Then("the reservation is expired", () => {
          expect(state.isExpired).toBe(true);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: upcastReservationCMS migrates old CMS versions to current
  // ==========================================================================

  Rule("upcastReservationCMS migrates old CMS versions to current", ({ RuleScenario }) => {
    RuleScenario(
      "Returns unchanged CMS when already at current version",
      ({ Given, When, Then, And }) => {
        Given("a reservation CMS at the current state version", () => {
          state.rawCms = {
            reservationId: "res_123",
            orderId: "ord_456",
            items: [{ productId: "prod_1", quantity: 5 }],
            status: "pending",
            expiresAt: 9999999999999,
            version: 2,
            stateVersion: CURRENT_RESERVATION_CMS_VERSION,
            createdAt: 1000,
            updatedAt: 2000,
          };
        });

        When("I upcast the reservation CMS", () => {
          state.upcastResult = upcastReservationCMS(state.rawCms);
        });

        Then("the result equals the original CMS", () => {
          expect(state.upcastResult).toEqual(state.rawCms);
        });

        And("the result stateVersion equals the current version constant", () => {
          expect(state.upcastResult!.stateVersion).toBe(CURRENT_RESERVATION_CMS_VERSION);
        });
      }
    );

    RuleScenario(
      "Upgrades CMS with missing stateVersion to current version",
      ({ Given, When, Then, And }) => {
        Given("a reservation CMS with missing stateVersion", () => {
          state.rawCms = {
            reservationId: "res_123",
            orderId: "ord_456",
            items: [{ productId: "prod_1", quantity: 5 }],
            status: "pending",
            expiresAt: 9999999999999,
            version: 2,
            // stateVersion missing
            createdAt: 1000,
            updatedAt: 2000,
          };
        });

        When("I upcast the reservation CMS", () => {
          state.upcastResult = upcastReservationCMS(state.rawCms);
        });

        Then("the result stateVersion equals the current version constant", () => {
          expect(state.upcastResult!.stateVersion).toBe(CURRENT_RESERVATION_CMS_VERSION);
        });

        And("the result preserves the original reservationId and items", () => {
          expect(state.upcastResult!.reservationId).toBe("res_123");
          expect(state.upcastResult!.items).toHaveLength(1);
        });
      }
    );

    RuleScenario("Throws error for future versions", ({ Given, When, Then }) => {
      Given("a reservation CMS with stateVersion far above current", () => {
        state.rawCms = {
          reservationId: "res_123",
          orderId: "ord_456",
          items: [{ productId: "prod_1", quantity: 5 }],
          status: "pending",
          expiresAt: 9999999999999,
          version: 2,
          stateVersion: CURRENT_RESERVATION_CMS_VERSION + 10,
          createdAt: 1000,
          updatedAt: 2000,
        };
      });

      When("I attempt to upcast the reservation CMS", () => {
        try {
          state.upcastResult = upcastReservationCMS(state.rawCms);
        } catch (e) {
          state.upcastError = e as Error;
        }
      });

      Then('an error is thrown matching "newer than supported version"', () => {
        expect(state.upcastError).not.toBeNull();
        expect(state.upcastError!.message).toMatch(/newer than supported version/);
      });
    });

    RuleScenario("Preserves all fields during upcast", ({ Given, When, Then, And }) => {
      Given("a reservation CMS at state version 0 with specific field values", () => {
        state.items = [
          { productId: "prod_1", quantity: 5 },
          { productId: "prod_2", quantity: 3 },
        ];
        state.rawCms = {
          reservationId: "res_abc",
          orderId: "ord_xyz",
          items: state.items,
          status: "confirmed" as const,
          expiresAt: 8888888888888,
          version: 5,
          stateVersion: 0,
          createdAt: 5000,
          updatedAt: 6000,
        };
      });

      When("I upcast the reservation CMS", () => {
        state.upcastResult = upcastReservationCMS(state.rawCms);
      });

      Then(
        "all original fields are preserved in the result:",
        (_ctx: unknown, table: { field: string; value: string }[]) => {
          for (const row of table) {
            const actual = (state.upcastResult as Record<string, unknown>)[row.field];
            // Compare as string since table values are strings
            const expected = isNaN(Number(row.value)) ? row.value : Number(row.value);
            expect(actual).toBe(expected);
          }
        }
      );

      And("the result items match the original items", () => {
        expect(state.upcastResult!.items).toEqual(state.items);
      });
    });
  });
});
