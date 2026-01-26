/**
 * Release Operation - Step Definitions
 *
 * BDD step definitions for release() function behavior:
 * - Manual release (immediate availability)
 * - Validation (confirmed, already released, expired)
 * - TTL expiration via cron
 *
 * @since Phase 20 (ReservationPattern)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  reserve,
  release,
  expireReservations,
  createReservationKey,
  type ReleaseResult,
  type ReserveResult,
} from "../../../src/reservations/index.js";

import { createMockRepository, type MockCtx } from "./mock-repository.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  activeReservationId: string | null;
  releaseResult: ReleaseResult | null;
  reserveResult: ReserveResult | null;
  error: Error | null;
  mockRepo: ReturnType<typeof createMockRepository>;
  baseTime: number;
}

function createInitialState(): TestState {
  return {
    activeReservationId: null,
    releaseResult: null,
    reserveResult: null,
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
async function setupActiveReservation(email: string = "active@example.com"): Promise<string> {
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
// Release Operation Feature
// =============================================================================

const releaseOperationFeature = await loadFeature(
  "tests/features/behavior/reservation/release-operation.feature"
);

describeFeature(
  releaseOperationFeature,
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
        expect(release).toBeDefined();
        expect(expireReservations).toBeDefined();
      });

      And("an active reservation exists", () => {
        // Background is used for documentation - actual setup in each scenario
        // This ensures each scenario has isolated state
      });
    });

    // ==========================================================================
    // Rule: release() frees a reservation immediately
    // ==========================================================================

    Rule("release() frees a reservation immediately", ({ RuleScenario }) => {
      RuleScenario("Release active reservation", ({ Given, When, Then, And }) => {
        Given('an active reservation with id "res_123" for "cancel@example.com"', async () => {
          state.activeReservationId = await setupActiveReservation("cancel@example.com");
        });

        When("I call release({ reservationId: 'res_123' })", async () => {
          const ctx = {} as MockCtx;
          state.releaseResult = await release(
            ctx,
            { reservationId: state.activeReservationId! },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then("release succeeds", () => {
          expect(state.releaseResult?.status).toBe("success");
        });

        And('reservation.status equals "released"', () => {
          const doc = state.mockRepo.getById(state.activeReservationId!);
          expect(doc?.status).toBe("released");
        });

        And('"cancel@example.com" is available for new reservations', async () => {
          // Try to reserve again - should succeed
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "cancel@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
          expect(state.reserveResult?.status).toBe("success");
        });
      });

      RuleScenario("Released value can be immediately reserved", ({ Given, When, Then }) => {
        Given('I released reservation for "reuse@example.com"', async () => {
          const ctx = {} as MockCtx;
          // First create a reservation
          const reserveResult = await reserve(
            ctx,
            { type: "email", value: "reuse@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
          expect(reserveResult.status).toBe("success");

          // Then release it
          if (reserveResult.status === "success") {
            await release(
              ctx,
              { reservationId: reserveResult.reservationId },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        });

        When(
          "I call reserve({ type: 'email', value: 'reuse@example.com', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "reuse@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then("a new reservation is created successfully", () => {
          expect(state.reserveResult?.status).toBe("success");
        });
      });
    });

    // ==========================================================================
    // Rule: Only active reservations can be released
    // ==========================================================================

    Rule("Only active reservations can be released", ({ RuleScenario }) => {
      RuleScenario("Cannot release confirmed reservation", ({ Given, When, Then }) => {
        Given('a confirmed reservation with id "res_confirmed"', () => {
          const key = createReservationKey("email", "confirmed@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_confirmed",
            key,
            type: "email",
            value: "confirmed@example.com",
            status: "confirmed",
            expiresAt: state.baseTime + 300000,
            entityId: "user_123",
            confirmedAt: state.baseTime - 60000,
            releasedAt: null,
            correlationId: null,
            createdAt: state.baseTime - 360000,
            updatedAt: state.baseTime - 60000,
          });
        });

        When("I call release({ reservationId: 'res_confirmed' })", async () => {
          const ctx = {} as MockCtx;
          state.releaseResult = await release(
            ctx,
            { reservationId: "res_confirmed" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "RESERVATION_ALREADY_CONFIRMED"', () => {
          expect(state.releaseResult?.status).toBe("error");
          if (state.releaseResult?.status === "error") {
            expect(state.releaseResult.code).toBe("RESERVATION_ALREADY_CONFIRMED");
          }
        });
      });

      RuleScenario("Cannot release already released reservation", ({ Given, When, Then }) => {
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
            createdAt: state.baseTime - 360000,
            updatedAt: state.baseTime,
          });
        });

        When("I call release({ reservationId: 'res_released' })", async () => {
          const ctx = {} as MockCtx;
          state.releaseResult = await release(
            ctx,
            { reservationId: "res_released" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "RESERVATION_ALREADY_RELEASED"', () => {
          expect(state.releaseResult?.status).toBe("error");
          if (state.releaseResult?.status === "error") {
            expect(state.releaseResult.code).toBe("RESERVATION_ALREADY_RELEASED");
          }
        });
      });

      RuleScenario("Cannot release expired reservation", ({ Given, When, Then }) => {
        Given('an expired reservation with id "res_expired"', () => {
          const key = createReservationKey("email", "expired@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_expired",
            key,
            type: "email",
            value: "expired@example.com",
            status: "expired",
            expiresAt: state.baseTime - 60000,
            entityId: null,
            confirmedAt: null,
            releasedAt: null,
            correlationId: null,
            createdAt: state.baseTime - 360000,
            updatedAt: state.baseTime,
          });
        });

        When("I call release({ reservationId: 'res_expired' })", async () => {
          const ctx = {} as MockCtx;
          state.releaseResult = await release(
            ctx,
            { reservationId: "res_expired" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "RESERVATION_ALREADY_EXPIRED"', () => {
          expect(state.releaseResult?.status).toBe("error");
          if (state.releaseResult?.status === "error") {
            expect(state.releaseResult.code).toBe("RESERVATION_ALREADY_EXPIRED");
          }
        });
      });

      RuleScenario("Cannot release non-existent reservation", ({ When, Then }) => {
        When("I call release({ reservationId: 'res_nonexistent' })", async () => {
          const ctx = {} as MockCtx;
          state.releaseResult = await release(
            ctx,
            { reservationId: "res_nonexistent" },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "RESERVATION_NOT_FOUND"', () => {
          expect(state.releaseResult?.status).toBe("error");
          if (state.releaseResult?.status === "error") {
            expect(state.releaseResult.code).toBe("RESERVATION_NOT_FOUND");
          }
        });
      });
    });

    // ==========================================================================
    // Rule: TTL expiration cron marks expired reservations
    // ==========================================================================

    Rule("TTL expiration cron marks expired reservations", ({ RuleScenario }) => {
      RuleScenario("Expired reservations are marked by cron", ({ Given, When, Then, And }) => {
        Given("a reservation with TTL that expired 1 minute ago", () => {
          const key = createReservationKey("email", "willexpire@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_willexpire",
            key,
            type: "email",
            value: "willexpire@example.com",
            status: "reserved", // Still marked as reserved
            expiresAt: state.baseTime - 60000, // Expired 1 minute ago
            entityId: null,
            confirmedAt: null,
            correlationId: null,
            createdAt: state.baseTime - 360000,
            updatedAt: state.baseTime - 360000,
          });
        });

        When("the TTL expiration cron runs", async () => {
          const ctx = {} as MockCtx;
          await expireReservations(
            ctx,
            { now: state.baseTime }, // expireConfig
            { repository: state.mockRepo.repository } // config
          );
        });

        Then('reservation.status equals "expired"', () => {
          const doc = state.mockRepo.getById("res_willexpire");
          expect(doc?.status).toBe("expired");
        });

        And("the value is available for new reservations", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "willexpire@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
          expect(state.reserveResult?.status).toBe("success");
        });
      });

      RuleScenario("Cron does not affect active reservations", ({ Given, When, Then }) => {
        Given("a reservation with 10 minutes remaining TTL", () => {
          const key = createReservationKey("email", "stillactive@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_stillactive",
            key,
            type: "email",
            value: "stillactive@example.com",
            status: "reserved",
            expiresAt: state.baseTime + 600000, // 10 minutes from now
            entityId: null,
            confirmedAt: null,
            correlationId: null,
            createdAt: state.baseTime - 60000,
            updatedAt: state.baseTime - 60000,
          });
        });

        When("the TTL expiration cron runs", async () => {
          const ctx = {} as MockCtx;
          await expireReservations(
            ctx,
            { now: state.baseTime }, // expireConfig
            { repository: state.mockRepo.repository } // config
          );
        });

        Then('reservation.status remains "reserved"', () => {
          const doc = state.mockRepo.getById("res_stillactive");
          expect(doc?.status).toBe("reserved");
        });
      });

      RuleScenario("Cron does not affect confirmed reservations", ({ Given, When, Then }) => {
        Given("a confirmed reservation", () => {
          const key = createReservationKey("email", "permanent@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_permanent",
            key,
            type: "email",
            value: "permanent@example.com",
            status: "confirmed",
            expiresAt: state.baseTime - 600000, // Even if "expired" by time
            entityId: "user_123",
            confirmedAt: state.baseTime - 700000,
            correlationId: null,
            createdAt: state.baseTime - 800000,
            updatedAt: state.baseTime - 700000,
          });
        });

        When("the TTL expiration cron runs", async () => {
          const ctx = {} as MockCtx;
          await expireReservations(
            ctx,
            { now: state.baseTime }, // expireConfig
            { repository: state.mockRepo.repository } // config
          );
        });

        Then('reservation.status remains "confirmed"', () => {
          const doc = state.mockRepo.getById("res_permanent");
          expect(doc?.status).toBe("confirmed");
        });
      });
    });
  }
);
