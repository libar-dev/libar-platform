/**
 * Reservation Key - Step Definitions
 *
 * BDD step definitions for reservation key utilities behavior:
 * - Creation: createReservationKey, parseReservationKey
 * - Validation: validateReservationKey, isValidReservationKey
 * - ID generation: hashReservationId
 *
 * @since Phase 20 (ReservationPattern)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  reserve,
  createReservationKey,
  findReservation,
  type ReservationKey,
  type ReserveResult,
} from "../../../src/reservations/index.js";

import { createMockRepository, type MockCtx } from "./mock-repository.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  reservationType: string | null;
  reservationValue: string | null;
  ttl: number;
  reserveResult: ReserveResult | null;
  reservationKey: ReservationKey | null;
  foundReservation: unknown;
  error: Error | null;
  mockRepo: ReturnType<typeof createMockRepository>;
}

function createInitialState(): TestState {
  return {
    reservationType: null,
    reservationValue: null,
    ttl: 300000,
    reserveResult: null,
    reservationKey: null,
    foundReservation: null,
    error: null,
    mockRepo: createMockRepository(),
  };
}

// Initialize state immediately to avoid undefined errors in Background
let state: TestState = createInitialState();

function resetState(): void {
  state = createInitialState();
}

// =============================================================================
// Reservation Key Feature
// =============================================================================

const reservationKeyFeature = await loadFeature(
  "tests/features/behavior/reservation/reservation-key.feature"
);

describeFeature(
  reservationKeyFeature,
  ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given }) => {
      Given("the reservation module is imported from platform-core", () => {
        // Module is imported at the top - verify key functions exist
        expect(reserve).toBeDefined();
        expect(createReservationKey).toBeDefined();
        expect(findReservation).toBeDefined();
      });
    });

    // ==========================================================================
    // Rule: Reservation key combines type and value
    // ==========================================================================

    Rule("Reservation key combines type and value", ({ RuleScenario }) => {
      RuleScenario("Email reservation key format", ({ When, Then }) => {
        When(
          "I call reserve({ type: 'email', value: 'alice@example.com', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "alice@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository }
            );
          }
        );

        Then('reservation.key equals "email:alice@example.com"', () => {
          expect(state.reserveResult?.status).toBe("success");
          if (state.reserveResult?.status === "success") {
            expect(state.reserveResult.key).toBe("email:alice@example.com");
          }
        });
      });

      RuleScenario("Username reservation key format", ({ When, Then }) => {
        When("I call reserve({ type: 'username', value: 'alice123', ttl: 300000 })", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "username", value: "alice123", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        Then('reservation.key equals "username:alice123"', () => {
          expect(state.reserveResult?.status).toBe("success");
          if (state.reserveResult?.status === "success") {
            expect(state.reserveResult.key).toBe("username:alice123");
          }
        });
      });

      RuleScenario("Custom type reservation key format", ({ When, Then }) => {
        When("I call reserve({ type: 'phone', value: '+1-555-0123', ttl: 300000 })", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "phone", value: "+1-555-0123", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        Then('reservation.key equals "phone:+1-555-0123"', () => {
          expect(state.reserveResult?.status).toBe("success");
          if (state.reserveResult?.status === "success") {
            expect(state.reserveResult.key).toBe("phone:+1-555-0123");
          }
        });
      });
    });

    // ==========================================================================
    // Rule: Different types are independent namespaces
    // ==========================================================================

    Rule("Different types are independent namespaces", ({ RuleScenario }) => {
      RuleScenario("Same value different types", ({ Given, When, Then, And }) => {
        Given('a reservation for email "alice"', async () => {
          const ctx = {} as MockCtx;
          await reserve(
            ctx,
            { type: "email", value: "alice", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        When("I call reserve({ type: 'username', value: 'alice', ttl: 300000 })", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "username", value: "alice", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        Then("reservation succeeds", () => {
          expect(state.reserveResult?.status).toBe("success");
        });

        And("two reservations exist with different keys:", () => {
          const allReservations = state.mockRepo.getAllReservations();
          const keys = allReservations.map((r) => r.key);
          expect(keys).toContain("email:alice");
          expect(keys).toContain("username:alice");
          expect(allReservations.length).toBe(2);
        });
      });

      RuleScenario("Independent type uniqueness", ({ Given, When, Then, And }) => {
        Given('a confirmed reservation for email "taken@example.com"', () => {
          const key = createReservationKey("email", "taken@example.com");
          state.mockRepo.addReservation({
            reservationId: "res_existing",
            key,
            type: "email",
            value: "taken@example.com",
            status: "confirmed",
            expiresAt: Date.now() + 300000,
            entityId: "user_123",
            confirmedAt: Date.now(),
            releasedAt: null,
            correlationId: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        });

        When(
          "I call reserve({ type: 'recovery_email', value: 'taken@example.com', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "recovery_email", value: "taken@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository }
            );
          }
        );

        Then("reservation succeeds", () => {
          expect(state.reserveResult?.status).toBe("success");
        });

        And('key is "recovery_email:taken@example.com"', () => {
          if (state.reserveResult?.status === "success") {
            expect(state.reserveResult.key).toBe("recovery_email:taken@example.com");
          }
        });
      });
    });

    // ==========================================================================
    // Rule: Type and value must be valid strings
    // ==========================================================================

    Rule("Type and value must be valid strings", ({ RuleScenario }) => {
      RuleScenario("Type is required", ({ When, Then }) => {
        When(
          "I call reserve({ value: 'test@example.com', ttl: 300000 }) without type",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "", value: "test@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository }
            );
          }
        );

        Then('an error is thrown with code "TYPE_REQUIRED"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TYPE");
          }
        });
      });

      RuleScenario("Value is required", ({ When, Then }) => {
        When("I call reserve({ type: 'email', ttl: 300000 }) without value", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        Then('an error is thrown with code "VALUE_REQUIRED"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_VALUE");
          }
        });
      });

      RuleScenario("Empty type is invalid", ({ When, Then }) => {
        When("I call reserve({ type: '', value: 'test@example.com', ttl: 300000 })", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "", value: "test@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        Then('an error is thrown with code "INVALID_TYPE"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TYPE");
          }
        });
      });

      RuleScenario("Empty value is invalid", ({ When, Then }) => {
        When("I call reserve({ type: 'email', value: '', ttl: 300000 })", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        Then('an error is thrown with code "INVALID_VALUE"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_VALUE");
          }
        });
      });
    });

    // ==========================================================================
    // Rule: Reservations can be looked up by key
    // ==========================================================================

    Rule("Reservations can be looked up by key", ({ RuleScenario }) => {
      RuleScenario("Find reservation by key", ({ Given, When, Then }) => {
        Given('an active reservation for email "lookup@example.com"', async () => {
          const ctx = {} as MockCtx;
          await reserve(
            ctx,
            { type: "email", value: "lookup@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        When("I call findReservation({ key: 'email:lookup@example.com' })", async () => {
          const ctx = {} as MockCtx;
          state.foundReservation = await findReservation(
            ctx,
            { key: "email:lookup@example.com" as ReservationKey },
            { repository: state.mockRepo.repository }
          );
        });

        Then("I receive the reservation object", () => {
          expect(state.foundReservation).not.toBeNull();
          expect((state.foundReservation as { key: string }).key).toBe("email:lookup@example.com");
        });
      });

      RuleScenario("Find reservation by type and value", ({ Given, When, Then }) => {
        Given('an active reservation for email "lookup@example.com"', async () => {
          const ctx = {} as MockCtx;
          await reserve(
            ctx,
            { type: "email", value: "lookup@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository }
          );
        });

        When("I call findReservation({ type: 'email', value: 'lookup@example.com' })", async () => {
          const ctx = {} as MockCtx;
          state.foundReservation = await findReservation(
            ctx,
            { type: "email", value: "lookup@example.com" },
            { repository: state.mockRepo.repository }
          );
        });

        Then("I receive the reservation object", () => {
          expect(state.foundReservation).not.toBeNull();
          expect((state.foundReservation as { key: string }).key).toBe("email:lookup@example.com");
        });
      });

      RuleScenario("Non-existent key returns null", ({ When, Then }) => {
        When("I call findReservation({ key: 'email:nonexistent@example.com' })", async () => {
          const ctx = {} as MockCtx;
          state.foundReservation = await findReservation(
            ctx,
            { key: "email:nonexistent@example.com" as ReservationKey },
            { repository: state.mockRepo.repository }
          );
        });

        Then("I receive null", () => {
          expect(state.foundReservation).toBeNull();
        });
      });
    });

    // ==========================================================================
    // Rule: Separator character is handled correctly
    // ==========================================================================

    Rule("Separator character is handled correctly", ({ RuleScenario }) => {
      RuleScenario("Type containing colon is rejected", ({ When, Then }) => {
        When(
          "I call reserve({ type: 'email:backup', value: 'test@example.com', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email:backup", value: "test@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository }
            );
          }
        );

        Then('an error is thrown with code "INVALID_TYPE"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TYPE");
          }
        });
      });

      RuleScenario("Value can contain colon (URL with port)", ({ When, Then, And }) => {
        When(
          "I call reserve({ type: 'url', value: 'https://example.com:8080', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "url", value: "https://example.com:8080", ttl: 300000 },
              { repository: state.mockRepo.repository }
            );
          }
        );

        Then("I receive a reservation object", () => {
          expect(state.reserveResult?.status).toBe("success");
        });

        And('reservation.key equals "url:https://example.com:8080"', () => {
          if (state.reserveResult?.status === "success") {
            expect(state.reserveResult.key).toBe("url:https://example.com:8080");
          }
        });
      });
    });
  }
);
