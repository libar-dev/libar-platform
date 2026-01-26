/**
 * Confirm Operation - Step Definitions
 *
 * BDD step definitions for confirm() function behavior:
 * - Basic confirmation with entity linking
 * - Validation (expired, already confirmed)
 * - Entity association requirements
 *
 * @since Phase 20 (ReservationPattern)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  reserve,
  confirm,
  createReservationKey,
  type ConfirmResult,
} from "../../../src/reservations/index.js";

import { createMockRepository, type MockCtx } from "./mock-repository.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  activeReservationId: string | null;
  confirmResult: ConfirmResult | null;
  error: Error | null;
  mockRepo: ReturnType<typeof createMockRepository>;
  baseTime: number;
}

function createInitialState(): TestState {
  return {
    activeReservationId: null,
    confirmResult: null,
    error: null,
    mockRepo: createMockRepository(),
    baseTime: Date.now(),
  };
}

// Initialize state immediately to avoid undefined errors in Background
let state: TestState = createInitialState();

function resetState(): void {
  state = createInitialState();
}

/**
 * Helper to create an active reservation for testing.
 */
async function setupActiveReservation(email: string = "alice@example.com"): Promise<string> {
  const ctx = {} as MockCtx;
  const result = await reserve(
    ctx,
    { type: "email", value: email, ttl: 300000 },
    { repository: state.mockRepo.repository, now: state.baseTime }
  );
  if (result.status === "success") {
    return result.reservationId;
  }
  throw new Error(`Failed to create reservation: ${JSON.stringify(result)}`);
}

// =============================================================================
// Confirm Operation Feature
// =============================================================================

const confirmOperationFeature = await loadFeature(
  "tests/features/behavior/reservation/confirm-operation.feature"
);

describeFeature(
  confirmOperationFeature,
  ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given, And }) => {
      Given("the reservation module is imported from platform-core", () => {
        expect(reserve).toBeDefined();
        expect(confirm).toBeDefined();
      });

      And('an active reservation exists for "alice@example.com"', () => {
        // Background is used for documentation - actual setup in each scenario
        // This ensures each scenario has isolated state
      });
    });

    // ==========================================================================
    // Rule: confirm() links reservation to created entity
    // ==========================================================================

    Rule("confirm() links reservation to created entity", ({ RuleScenario }) => {
      RuleScenario("Confirm reservation with entity ID", ({ Given, When, Then, And }) => {
        Given('an active reservation with id "res_123" for "alice@example.com"', async () => {
          // Create fresh reservation for this scenario
          state.activeReservationId = await setupActiveReservation("alice@example.com");
        });

        When("I call confirm({ reservationId: 'res_123', entityId: 'user_456' })", async () => {
          const ctx = {} as MockCtx;
          state.confirmResult = await confirm(
            ctx,
            { reservationId: state.activeReservationId!, entityId: "user_456" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then("confirmation succeeds", () => {
          expect(state.confirmResult?.status).toBe("success");
        });

        And('reservation.status equals "confirmed"', () => {
          const doc = state.mockRepo.getById(state.activeReservationId!);
          expect(doc?.status).toBe("confirmed");
        });

        And('reservation.entityId equals "user_456"', () => {
          const doc = state.mockRepo.getById(state.activeReservationId!);
          expect(doc?.entityId).toBe("user_456");
        });

        And("reservation.confirmedAt is set", () => {
          const doc = state.mockRepo.getById(state.activeReservationId!);
          expect(doc?.confirmedAt).not.toBeNull();
          expect(doc?.confirmedAt).toBeGreaterThan(0);
        });
      });

      RuleScenario("Confirmed reservation is permanent", ({ Given, When, Then, And }) => {
        Given('a confirmed reservation for "alice@example.com"', async () => {
          // Create and confirm a reservation
          state.activeReservationId = await setupActiveReservation("alice@example.com");
          const ctx = {} as MockCtx;
          await confirm(
            ctx,
            { reservationId: state.activeReservationId, entityId: "user_123" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        When("I query the reservation", () => {
          // Query is implicit - we'll check the doc
        });

        Then("expiresAt is null (no expiration)", () => {
          const doc = state.mockRepo.getById(state.activeReservationId!);
          // Confirmed reservations are permanent - expiresAt is null
          expect(doc?.expiresAt).toBeNull();
        });

        And('status equals "confirmed"', () => {
          const doc = state.mockRepo.getById(state.activeReservationId!);
          expect(doc?.status).toBe("confirmed");
        });
      });
    });

    // ==========================================================================
    // Rule: Only active reservations can be confirmed
    // ==========================================================================

    Rule("Only active reservations can be confirmed", ({ RuleScenario }) => {
      RuleScenario("Cannot confirm expired reservation", ({ Given, When, Then }) => {
        Given('an expired reservation with id "res_expired"', () => {
          const key = createReservationKey("email", "expired@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_expired",
            key,
            type: "email",
            value: "expired@example.com",
            status: "expired",
            expiresAt: state.baseTime - 60000, // Expired 1 minute ago
            entityId: null,
            confirmedAt: null,
            releasedAt: null,
            correlationId: null,
            createdAt: state.baseTime - 360000,
            updatedAt: state.baseTime,
          });
        });

        When("I call confirm({ reservationId: 'res_expired', entityId: 'user_789' })", async () => {
          const ctx = {} as MockCtx;
          state.confirmResult = await confirm(
            ctx,
            { reservationId: "res_expired", entityId: "user_789" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "RESERVATION_ALREADY_EXPIRED"', () => {
          expect(state.confirmResult?.status).toBe("error");
          if (state.confirmResult?.status === "error") {
            expect(state.confirmResult.code).toBe("RESERVATION_ALREADY_EXPIRED");
          }
        });
      });

      RuleScenario("Cannot confirm already confirmed reservation", ({ Given, When, Then }) => {
        Given('a confirmed reservation with id "res_confirmed"', () => {
          const key = createReservationKey("email", "confirmed@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_confirmed",
            key,
            type: "email",
            value: "confirmed@example.com",
            status: "confirmed",
            expiresAt: state.baseTime + 300000,
            entityId: "user_existing",
            confirmedAt: state.baseTime - 60000,
            releasedAt: null,
            correlationId: null,
            createdAt: state.baseTime - 360000,
            updatedAt: state.baseTime - 60000,
          });
        });

        When(
          "I call confirm({ reservationId: 'res_confirmed', entityId: 'user_999' })",
          async () => {
            const ctx = {} as MockCtx;
            state.confirmResult = await confirm(
              ctx,
              { reservationId: "res_confirmed", entityId: "user_999" },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('an error is thrown with code "RESERVATION_ALREADY_CONFIRMED"', () => {
          expect(state.confirmResult?.status).toBe("error");
          if (state.confirmResult?.status === "error") {
            expect(state.confirmResult.code).toBe("RESERVATION_ALREADY_CONFIRMED");
          }
        });
      });

      RuleScenario("Cannot confirm non-existent reservation", ({ When, Then }) => {
        When(
          "I call confirm({ reservationId: 'res_nonexistent', entityId: 'user_000' })",
          async () => {
            const ctx = {} as MockCtx;
            state.confirmResult = await confirm(
              ctx,
              { reservationId: "res_nonexistent", entityId: "user_000" },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('an error is thrown with code "RESERVATION_NOT_FOUND"', () => {
          expect(state.confirmResult?.status).toBe("error");
          if (state.confirmResult?.status === "error") {
            expect(state.confirmResult.code).toBe("RESERVATION_NOT_FOUND");
          }
        });
      });

      RuleScenario("Cannot confirm released reservation", ({ Given, When, Then }) => {
        Given('a released reservation with id "res_released"', () => {
          const key = createReservationKey("email", "released@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_released",
            key,
            type: "email",
            value: "released@example.com",
            status: "released",
            expiresAt: state.baseTime + 300000,
            entityId: null,
            confirmedAt: null,
            releasedAt: state.baseTime,
            correlationId: null,
            createdAt: state.baseTime - 60000,
            updatedAt: state.baseTime,
          });
        });

        When(
          "I call confirm({ reservationId: 'res_released', entityId: 'user_123' })",
          async () => {
            const ctx = {} as MockCtx;
            state.confirmResult = await confirm(
              ctx,
              { reservationId: "res_released", entityId: "user_123" },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('an error is thrown with code "RESERVATION_ALREADY_RELEASED"', () => {
          expect(state.confirmResult?.status).toBe("error");
          if (state.confirmResult?.status === "error") {
            expect(state.confirmResult.code).toBe("RESERVATION_ALREADY_RELEASED");
          }
        });
      });
    });

    // ==========================================================================
    // Rule: Entity ID must be provided for confirmation
    // ==========================================================================

    Rule("Entity ID must be provided for confirmation", ({ RuleScenario }) => {
      RuleScenario("Entity ID is required", ({ Given, When, Then }) => {
        Given('an active reservation with id "res_123"', async () => {
          // Create fresh reservation for this scenario
          state.activeReservationId = await setupActiveReservation("test@example.com");
        });

        When("I call confirm({ reservationId: 'res_123' }) without entityId", async () => {
          const ctx = {} as MockCtx;
          state.confirmResult = await confirm(
            ctx,
            { reservationId: state.activeReservationId!, entityId: "" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "ENTITY_ID_REQUIRED"', () => {
          expect(state.confirmResult?.status).toBe("error");
          if (state.confirmResult?.status === "error") {
            expect(state.confirmResult.code).toBe("ENTITY_ID_REQUIRED");
          }
        });
      });

      RuleScenario("Entity ID can be any string identifier", ({ Given, When, Then, And }) => {
        Given('an active reservation with id "res_123"', async () => {
          // Create fresh reservation for this scenario
          state.activeReservationId = await setupActiveReservation("custom@example.com");
        });

        When(
          "I call confirm({ reservationId: 'res_123', entityId: 'custom_id_format' })",
          async () => {
            const ctx = {} as MockCtx;
            state.confirmResult = await confirm(
              ctx,
              { reservationId: state.activeReservationId!, entityId: "custom_id_format" },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then("confirmation succeeds", () => {
          expect(state.confirmResult?.status).toBe("success");
        });

        And('reservation.entityId equals "custom_id_format"', () => {
          const doc = state.mockRepo.getById(state.activeReservationId!);
          expect(doc?.entityId).toBe("custom_id_format");
        });
      });
    });
  }
);
