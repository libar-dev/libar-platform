/**
 * Reserve Operation - Step Definitions
 *
 * BDD step definitions for reserve() function behavior:
 * - Basic reservation (email, username, etc.)
 * - Concurrent reservation (OCC, first-wins)
 * - TTL configuration and validation
 *
 * @since Phase 20 (ReservationPattern)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  reserve,
  createReservationKey,
  type ReserveResult,
  type ReservationKey,
} from "../../../src/reservations/index.js";

import { createMockRepository, type MockCtx } from "./mock-repository.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  correlationId: string | null;
  reserveResult: ReserveResult | null;
  reserveResultA: ReserveResult | null;
  reserveResultB: ReserveResult | null;
  error: Error | null;
  mockRepo: ReturnType<typeof createMockRepository>;
  baseTime: number;
}

function createInitialState(): TestState {
  return {
    correlationId: null,
    reserveResult: null,
    reserveResultA: null,
    reserveResultB: null,
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

// =============================================================================
// Reserve Operation Feature
// =============================================================================

const reserveOperationFeature = await loadFeature(
  "tests/features/behavior/reservation/reserve-operation.feature"
);

describeFeature(
  reserveOperationFeature,
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
        expect(createReservationKey).toBeDefined();
      });

      And("the reservation table exists", () => {
        // Using mock repository - table always "exists"
        expect(state.mockRepo.repository).toBeDefined();
      });
    });

    // ==========================================================================
    // Rule: reserve() creates a time-limited claim on a unique value
    // ==========================================================================

    Rule("reserve() creates a time-limited claim on a unique value", ({ RuleScenario }) => {
      RuleScenario("Reserve an email address", ({ Given, When, Then, And }) => {
        Given('no existing reservation for "alice@example.com"', () => {
          // Fresh mock repository has no reservations
          const existing = state.mockRepo.getByKey("email:alice@example.com" as ReservationKey);
          expect(existing).toBeUndefined();
        });

        When(
          "I call reserve({ type: 'email', value: 'alice@example.com', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "alice@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then("I receive a reservation object", () => {
          expect(state.reserveResult).not.toBeNull();
          expect(state.reserveResult?.status).toBe("success");
        });

        And('reservation.key equals "email:alice@example.com"', () => {
          if (state.reserveResult?.status === "success") {
            expect(state.reserveResult.key).toBe("email:alice@example.com");
          }
        });

        And('reservation.status equals "reserved"', () => {
          // The result indicates success, the actual status in DB is "reserved"
          const doc = state.mockRepo.getByKey("email:alice@example.com" as ReservationKey);
          expect(doc?.status).toBe("reserved");
        });

        And("reservation.expiresAt is 5 minutes from now", () => {
          if (state.reserveResult?.status === "success") {
            const expectedExpiry = state.baseTime + 300000;
            expect(state.reserveResult.expiresAt).toBe(expectedExpiry);
          }
        });
      });

      RuleScenario("Reserve with correlation ID", ({ Given, And, When, Then }) => {
        Given('no existing reservation for "bob@example.com"', () => {
          const existing = state.mockRepo.getByKey("email:bob@example.com" as ReservationKey);
          expect(existing).toBeUndefined();
        });

        And('correlationId "corr_123"', () => {
          state.correlationId = "corr_123";
        });

        When(
          "I call reserve({ type: 'email', value: 'bob@example.com', ttl: 300000, correlationId })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              {
                type: "email",
                value: "bob@example.com",
                ttl: 300000,
                correlationId: state.correlationId!,
              },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('reservation.correlationId equals "corr_123"', () => {
          const doc = state.mockRepo.getByKey("email:bob@example.com" as ReservationKey);
          expect(doc?.correlationId).toBe("corr_123");
        });
      });
    });

    // ==========================================================================
    // Rule: Concurrent reservations use OCC for atomicity
    // ==========================================================================

    Rule("Concurrent reservations use OCC for atomicity", ({ RuleScenario }) => {
      RuleScenario("First reservation wins", ({ Given, When, And, Then }) => {
        Given('no existing reservation for "unique@example.com"', () => {
          const existing = state.mockRepo.getByKey("email:unique@example.com" as ReservationKey);
          expect(existing).toBeUndefined();
        });

        When('reservation A is created for "unique@example.com"', async () => {
          const ctx = {} as MockCtx;
          state.reserveResultA = await reserve(
            ctx,
            { type: "email", value: "unique@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        And('reservation B is attempted concurrently for "unique@example.com"', async () => {
          const ctx = {} as MockCtx;
          state.reserveResultB = await reserve(
            ctx,
            { type: "email", value: "unique@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then("reservation A succeeds", () => {
          expect(state.reserveResultA?.status).toBe("success");
        });

        And('reservation B fails with "ALREADY_RESERVED"', () => {
          expect(state.reserveResultB?.status).toBe("conflict");
          if (state.reserveResultB?.status === "conflict") {
            expect(state.reserveResultB.code).toBe("ALREADY_RESERVED");
          }
        });
      });

      RuleScenario("Reserved value cannot be re-reserved", ({ Given, When, Then, And }) => {
        Given('an active reservation for "taken@example.com"', async () => {
          const ctx = {} as MockCtx;
          await reserve(
            ctx,
            { type: "email", value: "taken@example.com", ttl: 300000 },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        When(
          "I call reserve({ type: 'email', value: 'taken@example.com', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "taken@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('an error is thrown with code "ALREADY_RESERVED"', () => {
          expect(state.reserveResult?.status).toBe("conflict");
          if (state.reserveResult?.status === "conflict") {
            expect(state.reserveResult.code).toBe("ALREADY_RESERVED");
          }
        });

        And("error.existingReservationId is provided", () => {
          if (state.reserveResult?.status === "conflict") {
            expect(state.reserveResult.existingReservationId).toBeDefined();
            expect(state.reserveResult.existingReservationId.length).toBeGreaterThan(0);
          }
        });
      });
    });

    // ==========================================================================
    // Rule: TTL determines reservation expiration time
    // ==========================================================================

    Rule("TTL determines reservation expiration time", ({ RuleScenario, RuleScenarioOutline }) => {
      RuleScenarioOutline(
        "Different TTL values",
        ({ Given, When, Then }, variables: { ttl_ms: string; expected_duration: string }) => {
          Given("no existing reservation", () => {
            state.mockRepo.clear();
          });

          When("I call reserve with ttl <ttl_ms>", async () => {
            const ctx = {} as MockCtx;
            const ttl = parseInt(variables.ttl_ms, 10);
            state.reserveResult = await reserve(
              ctx,
              { type: "test", value: `value_${variables.ttl_ms}`, ttl },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          });

          Then("expiresAt is <expected_duration> from now", () => {
            expect(state.reserveResult?.status).toBe("success");
            if (state.reserveResult?.status === "success") {
              const ttl = parseInt(variables.ttl_ms, 10);
              const expectedExpiry = state.baseTime + ttl;
              expect(state.reserveResult.expiresAt).toBe(expectedExpiry);
            }
          });
        }
      );

      RuleScenario("TTL must be positive", ({ When, Then }) => {
        When("I call reserve({ type: 'email', value: 'test@example.com', ttl: 0 })", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "test@example.com", ttl: 0 },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "INVALID_TTL"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TTL");
          }
        });
      });

      RuleScenario("TTL has maximum limit", ({ When, Then, And }) => {
        When(
          "I call reserve({ type: 'email', value: 'test@example.com', ttl: 86400001 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "test@example.com", ttl: 86400001 },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('an error is thrown with code "TTL_TOO_LONG"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("TTL_TOO_LONG");
          }
        });

        And("error message mentions maximum of 24 hours", () => {
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.message.toLowerCase()).toContain("24 hours");
          }
        });
      });
    });

    // ==========================================================================
    // Rule: TTL boundary values are validated
    // ==========================================================================

    Rule("TTL boundary values are validated", ({ RuleScenario }) => {
      RuleScenario("Negative TTL is rejected", ({ When, Then }) => {
        When(
          "I call reserve({ type: 'email', value: 'negative@example.com', ttl: -1 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "negative@example.com", ttl: -1 },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('an error is thrown with code "INVALID_TTL"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TTL");
          }
        });
      });

      RuleScenario("TTL at minimum boundary succeeds", ({ When, Then }) => {
        When(
          "I call reserve({ type: 'email', value: 'minttl@example.com', ttl: 1000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "minttl@example.com", ttl: 1000 },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then("I receive a reservation object", () => {
          expect(state.reserveResult).not.toBeNull();
          expect(state.reserveResult?.status).toBe("success");
        });
      });

      RuleScenario("TTL just below minimum is rejected", ({ When, Then }) => {
        When(
          "I call reserve({ type: 'email', value: 'belowmin@example.com', ttl: 999 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "email", value: "belowmin@example.com", ttl: 999 },
              { repository: state.mockRepo.repository, now: state.baseTime }
            );
          }
        );

        Then('an error is thrown with code "INVALID_TTL"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TTL");
          }
        });
      });

      RuleScenario("NaN TTL is rejected", ({ When, Then }) => {
        When("I call reserve with NaN TTL", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "nan@example.com", ttl: NaN },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "INVALID_TTL"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TTL");
          }
        });
      });

      RuleScenario("Infinity TTL is rejected", ({ When, Then }) => {
        When("I call reserve with Infinity TTL", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "infinity@example.com", ttl: Infinity },
            { repository: state.mockRepo.repository, now: state.baseTime }
          );
        });

        Then('an error is thrown with code "INVALID_TTL"', () => {
          expect(state.reserveResult?.status).toBe("error");
          if (state.reserveResult?.status === "error") {
            expect(state.reserveResult.code).toBe("INVALID_TTL");
          }
        });
      });
    });

    // ==========================================================================
    // Rule: Type and value input is sanitized
    // ==========================================================================

    Rule("Type and value input is sanitized", ({ RuleScenario }) => {
      RuleScenario("Whitespace-only type is invalid", ({ When, Then }) => {
        When(
          "I call reserve({ type: '   ', value: 'test@example.com', ttl: 300000 })",
          async () => {
            const ctx = {} as MockCtx;
            state.reserveResult = await reserve(
              ctx,
              { type: "   ", value: "test@example.com", ttl: 300000 },
              { repository: state.mockRepo.repository, now: state.baseTime }
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

      RuleScenario("Whitespace-only value is invalid", ({ When, Then }) => {
        When("I call reserve({ type: 'email', value: '   ', ttl: 300000 })", async () => {
          const ctx = {} as MockCtx;
          state.reserveResult = await reserve(
            ctx,
            { type: "email", value: "   ", ttl: 300000 },
            { repository: state.mockRepo.repository, now: state.baseTime }
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
  }
);
