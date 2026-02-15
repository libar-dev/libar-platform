/**
 * Process Manager Types - Step Definitions
 *
 * BDD step definitions for PM type guards and interface structures:
 * - isProcessManagerStatus: valid/invalid value checks with type narrowing
 * - isDeadLetterStatus: valid/invalid value checks with type narrowing
 * - PROCESS_MANAGER_STATUSES / DEAD_LETTER_STATUSES: constant validation
 * - ProcessManagerDeadLetter: interface structure and edge cases
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import type {
  ProcessManagerDeadLetter,
  ProcessManagerStatus,
  DeadLetterStatus,
} from "../../../src/processManager/types.js";
import {
  PROCESS_MANAGER_STATUSES,
  isProcessManagerStatus,
  DEAD_LETTER_STATUSES,
  isDeadLetterStatus,
} from "../../../src/processManager/types.js";
import { extractDataTable } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  unknownValue: unknown;
  pmGuardResult: boolean | null;
  dlGuardResult: boolean | null;
  filteredPMResults: unknown[] | null;
  filteredDLResults: unknown[] | null;
  deadLetter: ProcessManagerDeadLetter | null;
  longError: string | null;
}

function createInitialState(): TestState {
  return {
    unknownValue: null,
    pmGuardResult: null,
    dlGuardResult: null,
    filteredPMResults: null,
    filteredDLResults: null,
    deadLetter: null,
    longError: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/processManager/types.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: isProcessManagerStatus returns true for all valid PM statuses
  // ==========================================================================

  Rule("isProcessManagerStatus returns true for all valid PM statuses", ({ RuleScenario }) => {
    RuleScenario("All valid PM statuses are accepted", ({ Then }) => {
      Then(
        "isProcessManagerStatus returns true for all of:",
        (_ctx: unknown, ...args: unknown[]) => {
          const rows = extractDataTable<{ value: string }>(...args);
          for (const row of rows) {
            expect(isProcessManagerStatus(row.value)).toBe(true);
          }
        }
      );
    });

    RuleScenario("Every entry in PROCESS_MANAGER_STATUSES passes the guard", ({ Then }) => {
      Then("every value in PROCESS_MANAGER_STATUSES passes isProcessManagerStatus", () => {
        for (const status of PROCESS_MANAGER_STATUSES) {
          expect(isProcessManagerStatus(status)).toBe(true);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: isProcessManagerStatus rejects invalid values
  // ==========================================================================

  Rule("isProcessManagerStatus rejects invalid values", ({ RuleScenario }) => {
    RuleScenario("Invalid status strings are rejected", ({ Then }) => {
      Then(
        "isProcessManagerStatus returns false for strings:",
        (_ctx: unknown, ...args: unknown[]) => {
          const rows = extractDataTable<{ value: string }>(...args);
          for (const row of rows) {
            expect(isProcessManagerStatus(row.value)).toBe(false);
          }
        }
      );
    });

    RuleScenario("Non-string values are rejected by isProcessManagerStatus", ({ Then }) => {
      Then("isProcessManagerStatus returns false for non-string values", () => {
        expect(isProcessManagerStatus(null)).toBe(false);
        expect(isProcessManagerStatus(undefined)).toBe(false);
        expect(isProcessManagerStatus(123)).toBe(false);
        expect(isProcessManagerStatus({})).toBe(false);
        expect(isProcessManagerStatus([])).toBe(false);
        expect(isProcessManagerStatus(true)).toBe(false);
      });
    });

    RuleScenario(
      "Arrays containing valid statuses are rejected by isProcessManagerStatus",
      ({ Then }) => {
        Then("isProcessManagerStatus returns false for arrays of valid statuses", () => {
          expect(isProcessManagerStatus(["idle"])).toBe(false);
          expect(isProcessManagerStatus(["idle", "processing"])).toBe(false);
        });
      }
    );

    RuleScenario("isProcessManagerStatus is case-sensitive", ({ Then }) => {
      Then(
        "isProcessManagerStatus returns false for case variants:",
        (_ctx: unknown, ...args: unknown[]) => {
          const rows = extractDataTable<{ value: string }>(...args);
          for (const row of rows) {
            expect(isProcessManagerStatus(row.value)).toBe(false);
          }
        }
      );
    });
  });

  // ==========================================================================
  // Rule: isProcessManagerStatus supports TypeScript type narrowing
  // ==========================================================================

  Rule("isProcessManagerStatus supports TypeScript type narrowing", ({ RuleScenario }) => {
    RuleScenario("Type narrowing works in conditionals", ({ Given, When, Then }) => {
      Given("an unknown value {string}", (_ctx: unknown, value: string) => {
        state.unknownValue = value;
      });

      When("I check isProcessManagerStatus on the value", () => {
        state.pmGuardResult = isProcessManagerStatus(state.unknownValue);
      });

      Then("the narrowed PM status equals {string}", (_ctx: unknown, expected: string) => {
        expect(state.pmGuardResult).toBe(true);
        if (isProcessManagerStatus(state.unknownValue)) {
          const status: ProcessManagerStatus = state.unknownValue;
          expect(status).toBe(expected);
        }
      });
    });

    RuleScenario("Type guard works as array filter predicate", ({ Given, When, Then }) => {
      Given("an array of mixed values including PM statuses", () => {
        state.unknownValue = ["idle", "invalid", "processing", null, "failed"];
      });

      When("I filter the array with isProcessManagerStatus", () => {
        state.filteredPMResults = (state.unknownValue as unknown[]).filter(isProcessManagerStatus);
      });

      Then("the filtered PM result contains exactly:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        const expected = rows.map((r) => r.value);
        expect(state.filteredPMResults).toEqual(expected);
        expect(state.filteredPMResults).toHaveLength(expected.length);
      });
    });
  });

  // ==========================================================================
  // Rule: PROCESS_MANAGER_STATUSES exports the canonical PM status list
  // ==========================================================================

  Rule("PROCESS_MANAGER_STATUSES exports the canonical PM status list", ({ RuleScenario }) => {
    RuleScenario("PROCESS_MANAGER_STATUSES contains exactly 4 statuses in order", ({ Then }) => {
      Then("PROCESS_MANAGER_STATUSES equals exactly:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        const expected = rows.map((r) => r.value);
        expect(PROCESS_MANAGER_STATUSES).toEqual(expected);
        expect(PROCESS_MANAGER_STATUSES).toHaveLength(expected.length);
      });
    });

    RuleScenario(
      "PROCESS_MANAGER_STATUSES is a readonly array with correct bounds",
      ({ Then, And }) => {
        Then(
          "PROCESS_MANAGER_STATUSES first element is {string}",
          (_ctx: unknown, expected: string) => {
            const statuses: readonly ProcessManagerStatus[] = PROCESS_MANAGER_STATUSES;
            expect(statuses[0]).toBe(expected);
          }
        );

        And(
          "PROCESS_MANAGER_STATUSES last element is {string}",
          (_ctx: unknown, expected: string) => {
            const statuses: readonly ProcessManagerStatus[] = PROCESS_MANAGER_STATUSES;
            expect(statuses[3]).toBe(expected);
          }
        );
      }
    );

    RuleScenario("PROCESS_MANAGER_STATUSES contains all lifecycle states", ({ Then }) => {
      Then("PROCESS_MANAGER_STATUSES contains all of:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        for (const row of rows) {
          expect(PROCESS_MANAGER_STATUSES).toContain(row.value);
        }
      });
    });

    RuleScenario("PROCESS_MANAGER_STATUSES is in logical lifecycle order", ({ Then }) => {
      Then("PM statuses are in lifecycle order:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{
          before: string;
          after: string;
        }>(...args);
        for (const row of rows) {
          expect(PROCESS_MANAGER_STATUSES.indexOf(row.before as ProcessManagerStatus)).toBeLessThan(
            PROCESS_MANAGER_STATUSES.indexOf(row.after as ProcessManagerStatus)
          );
        }
      });
    });
  });

  // ==========================================================================
  // Rule: isDeadLetterStatus returns true for all valid dead letter statuses
  // ==========================================================================

  Rule("isDeadLetterStatus returns true for all valid dead letter statuses", ({ RuleScenario }) => {
    RuleScenario("All valid dead letter statuses are accepted", ({ Then }) => {
      Then("isDeadLetterStatus returns true for all of:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        for (const row of rows) {
          expect(isDeadLetterStatus(row.value)).toBe(true);
        }
      });
    });

    RuleScenario("Every entry in DEAD_LETTER_STATUSES passes the guard", ({ Then }) => {
      Then("every value in DEAD_LETTER_STATUSES passes isDeadLetterStatus", () => {
        for (const status of DEAD_LETTER_STATUSES) {
          expect(isDeadLetterStatus(status)).toBe(true);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: isDeadLetterStatus rejects invalid values
  // ==========================================================================

  Rule("isDeadLetterStatus rejects invalid values", ({ RuleScenario }) => {
    RuleScenario("Invalid status strings are rejected by isDeadLetterStatus", ({ Then }) => {
      Then("isDeadLetterStatus returns false for strings:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        for (const row of rows) {
          expect(isDeadLetterStatus(row.value)).toBe(false);
        }
      });
    });

    RuleScenario("PM statuses are rejected by isDeadLetterStatus", ({ Then }) => {
      Then(
        "isDeadLetterStatus returns false for PM-domain statuses:",
        (_ctx: unknown, ...args: unknown[]) => {
          const rows = extractDataTable<{ value: string }>(...args);
          for (const row of rows) {
            expect(isDeadLetterStatus(row.value)).toBe(false);
          }
        }
      );
    });

    RuleScenario("Non-string values are rejected by isDeadLetterStatus", ({ Then }) => {
      Then("isDeadLetterStatus returns false for non-string values", () => {
        expect(isDeadLetterStatus(null)).toBe(false);
        expect(isDeadLetterStatus(undefined)).toBe(false);
        expect(isDeadLetterStatus(123)).toBe(false);
        expect(isDeadLetterStatus({})).toBe(false);
        expect(isDeadLetterStatus([])).toBe(false);
        expect(isDeadLetterStatus(true)).toBe(false);
      });
    });

    RuleScenario("Arrays containing valid DL statuses are rejected", ({ Then }) => {
      Then("isDeadLetterStatus returns false for arrays of valid DL statuses", () => {
        expect(isDeadLetterStatus(["pending"])).toBe(false);
        expect(isDeadLetterStatus(["pending", "replayed"])).toBe(false);
      });
    });

    RuleScenario("isDeadLetterStatus is case-sensitive", ({ Then }) => {
      Then(
        "isDeadLetterStatus returns false for case variants:",
        (_ctx: unknown, ...args: unknown[]) => {
          const rows = extractDataTable<{ value: string }>(...args);
          for (const row of rows) {
            expect(isDeadLetterStatus(row.value)).toBe(false);
          }
        }
      );
    });
  });

  // ==========================================================================
  // Rule: isDeadLetterStatus supports TypeScript type narrowing
  // ==========================================================================

  Rule("isDeadLetterStatus supports TypeScript type narrowing", ({ RuleScenario }) => {
    RuleScenario("DL type narrowing works in conditionals", ({ Given, When, Then }) => {
      Given("an unknown value {string}", (_ctx: unknown, value: string) => {
        state.unknownValue = value;
      });

      When("I check isDeadLetterStatus on the value", () => {
        state.dlGuardResult = isDeadLetterStatus(state.unknownValue);
      });

      Then("the narrowed DL status equals {string}", (_ctx: unknown, expected: string) => {
        expect(state.dlGuardResult).toBe(true);
        if (isDeadLetterStatus(state.unknownValue)) {
          const status: DeadLetterStatus = state.unknownValue;
          expect(status).toBe(expected);
        }
      });
    });

    RuleScenario("DL type guard works as array filter predicate", ({ Given, When, Then }) => {
      Given("an array of mixed values including DL statuses", () => {
        state.unknownValue = ["pending", "invalid", "replayed", null, "ignored"];
      });

      When("I filter the array with isDeadLetterStatus", () => {
        state.filteredDLResults = (state.unknownValue as unknown[]).filter(isDeadLetterStatus);
      });

      Then("the filtered DL result contains exactly:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        const expected = rows.map((r) => r.value);
        expect(state.filteredDLResults).toEqual(expected);
        expect(state.filteredDLResults).toHaveLength(expected.length);
      });
    });
  });

  // ==========================================================================
  // Rule: DEAD_LETTER_STATUSES exports the canonical dead letter status list
  // ==========================================================================

  Rule("DEAD_LETTER_STATUSES exports the canonical dead letter status list", ({ RuleScenario }) => {
    RuleScenario("DEAD_LETTER_STATUSES contains exactly 3 statuses in order", ({ Then }) => {
      Then("DEAD_LETTER_STATUSES equals exactly:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        const expected = rows.map((r) => r.value);
        expect(DEAD_LETTER_STATUSES).toEqual(expected);
        expect(DEAD_LETTER_STATUSES).toHaveLength(expected.length);
      });
    });

    RuleScenario(
      "DEAD_LETTER_STATUSES is a readonly array with correct bounds",
      ({ Then, And }) => {
        Then(
          "DEAD_LETTER_STATUSES first element is {string}",
          (_ctx: unknown, expected: string) => {
            const statuses: readonly DeadLetterStatus[] = DEAD_LETTER_STATUSES;
            expect(statuses[0]).toBe(expected);
          }
        );

        And("DEAD_LETTER_STATUSES last element is {string}", (_ctx: unknown, expected: string) => {
          const statuses: readonly DeadLetterStatus[] = DEAD_LETTER_STATUSES;
          expect(statuses[2]).toBe(expected);
        });
      }
    );

    RuleScenario("DEAD_LETTER_STATUSES contains all dead letter states", ({ Then }) => {
      Then("DEAD_LETTER_STATUSES contains all of:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{ value: string }>(...args);
        for (const row of rows) {
          expect(DEAD_LETTER_STATUSES).toContain(row.value);
        }
      });
    });

    RuleScenario("DEAD_LETTER_STATUSES is in logical workflow order", ({ Then }) => {
      Then("DL statuses are in workflow order:", (_ctx: unknown, ...args: unknown[]) => {
        const rows = extractDataTable<{
          before: string;
          after: string;
        }>(...args);
        for (const row of rows) {
          expect(DEAD_LETTER_STATUSES.indexOf(row.before as DeadLetterStatus)).toBeLessThan(
            DEAD_LETTER_STATUSES.indexOf(row.after as DeadLetterStatus)
          );
        }
      });
    });
  });

  // ==========================================================================
  // Rule: ProcessManagerDeadLetter has correct structure with all fields
  // ==========================================================================

  Rule("ProcessManagerDeadLetter has correct structure with all fields", ({ RuleScenario }) => {
    RuleScenario(
      "Full dead letter with all fields has correct structure",
      ({ Given, Then, And }) => {
        Given("a dead letter with all fields populated", () => {
          state.deadLetter = {
            processManagerName: "testPM",
            instanceId: "inst-123",
            eventId: "evt-456",
            error: "Command execution failed",
            attemptCount: 3,
            status: "pending",
            failedCommand: {
              commandType: "SendNotification",
              payload: { orderId: "ord-789" },
            },
            context: { retryable: true },
            failedAt: Date.now(),
          };
        });

        Then(
          "the dead letter has processManagerName {string}",
          (_ctx: unknown, expected: string) => {
            expect(state.deadLetter!.processManagerName).toBe(expected);
          }
        );

        And("the dead letter has instanceId {string}", (_ctx: unknown, expected: string) => {
          expect(state.deadLetter!.instanceId).toBe(expected);
        });

        And("the dead letter has eventId {string}", (_ctx: unknown, expected: string) => {
          expect(state.deadLetter!.eventId).toBe(expected);
        });

        And("the dead letter has error {string}", (_ctx: unknown, expected: string) => {
          expect(state.deadLetter!.error).toBe(expected);
        });

        And("the dead letter has attemptCount {int}", (_ctx: unknown, expected: number) => {
          expect(state.deadLetter!.attemptCount).toBe(expected);
        });

        And("the dead letter has status {string}", (_ctx: unknown, expected: string) => {
          expect(state.deadLetter!.status).toBe(expected);
        });

        And(
          "the dead letter failedCommand has commandType {string}",
          (_ctx: unknown, expected: string) => {
            expect(state.deadLetter!.failedCommand?.commandType).toBe(expected);
          }
        );

        And(
          "the dead letter failedCommand has payload with orderId {string}",
          (_ctx: unknown, expected: string) => {
            expect(state.deadLetter!.failedCommand?.payload).toEqual({
              orderId: expected,
            });
          }
        );

        And("the dead letter has context with retryable true", () => {
          expect(state.deadLetter!.context).toEqual({ retryable: true });
        });

        And("the dead letter has a positive failedAt timestamp", () => {
          expect(state.deadLetter!.failedAt).toBeGreaterThan(0);
        });
      }
    );

    RuleScenario(
      "Dead letter with only required fields has undefined optionals",
      ({ Given, Then, And }) => {
        Given("a dead letter with only required fields", () => {
          state.deadLetter = {
            processManagerName: "testPM",
            instanceId: "inst-123",
            error: "Failed",
            attemptCount: 1,
            status: "pending",
            failedAt: Date.now(),
          };
        });

        Then("the dead letter eventId is undefined", () => {
          expect(state.deadLetter!.eventId).toBeUndefined();
        });

        And("the dead letter failedCommand is undefined", () => {
          expect(state.deadLetter!.failedCommand).toBeUndefined();
        });

        And("the dead letter context is undefined", () => {
          expect(state.deadLetter!.context).toBeUndefined();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: ProcessManagerDeadLetter supports all dead letter statuses
  // ==========================================================================

  Rule("ProcessManagerDeadLetter supports all dead letter statuses", ({ RuleScenario }) => {
    RuleScenario("Dead letter supports each status individually", ({ Then }) => {
      Then(
        "a dead letter can be created with each status:",
        (_ctx: unknown, ...args: unknown[]) => {
          const rows = extractDataTable<{ status: string }>(...args);
          for (const row of rows) {
            const dl: ProcessManagerDeadLetter = {
              processManagerName: "testPM",
              instanceId: "inst-123",
              error: "Failed",
              attemptCount: 1,
              status: row.status as ProcessManagerDeadLetter["status"],
              failedAt: Date.now(),
            };
            expect(dl.status).toBe(row.status);
          }
        }
      );
    });
  });

  // ==========================================================================
  // Rule: ProcessManagerDeadLetter failedCommand captures type and payload
  // ==========================================================================

  Rule("ProcessManagerDeadLetter failedCommand captures type and payload", ({ RuleScenario }) => {
    RuleScenario(
      "failedCommand captures command type and complex payload",
      ({ Given, Then, And }) => {
        Given("a dead letter with a complex failedCommand", () => {
          state.deadLetter = {
            processManagerName: "orderNotificationPM",
            instanceId: "inst-456",
            error: "Notification service unavailable",
            attemptCount: 3,
            status: "pending",
            failedCommand: {
              commandType: "SendOrderConfirmation",
              payload: {
                orderId: "ord-123",
                customerId: "cust-456",
                email: "customer@example.com",
              },
            },
            failedAt: Date.now(),
          };
        });

        Then("the dead letter failedCommand is defined", () => {
          expect(state.deadLetter!.failedCommand).toBeDefined();
        });

        And("the failedCommand commandType is {string}", (_ctx: unknown, expected: string) => {
          expect(state.deadLetter!.failedCommand?.commandType).toBe(expected);
        });

        And("the failedCommand payload has orderId {string}", (_ctx: unknown, expected: string) => {
          expect(state.deadLetter!.failedCommand?.payload).toHaveProperty("orderId", expected);
        });

        And(
          "the failedCommand payload has customerId {string}",
          (_ctx: unknown, expected: string) => {
            expect(state.deadLetter!.failedCommand?.payload).toHaveProperty("customerId", expected);
          }
        );
      }
    );

    RuleScenario("failedCommand allows empty payload", ({ Given, Then }) => {
      Given("a dead letter with an empty failedCommand payload", () => {
        state.deadLetter = {
          processManagerName: "testPM",
          instanceId: "inst-123",
          error: "Failed",
          attemptCount: 1,
          status: "pending",
          failedCommand: {
            commandType: "NoOpCommand",
            payload: {},
          },
          failedAt: Date.now(),
        };
      });

      Then("the dead letter failedCommand payload is an empty object", () => {
        expect(state.deadLetter!.failedCommand?.payload).toEqual({});
      });
    });
  });

  // ==========================================================================
  // Rule: ProcessManagerDeadLetter handles edge cases
  // ==========================================================================

  Rule("ProcessManagerDeadLetter handles edge cases", ({ RuleScenario }) => {
    RuleScenario("Dead letter handles high attempt count", ({ Given, Then }) => {
      Given("a dead letter with attemptCount {int}", (_ctx: unknown, count: number) => {
        state.deadLetter = {
          processManagerName: "testPM",
          instanceId: "inst-123",
          error: "Persistent failure",
          attemptCount: count,
          status: "pending",
          failedAt: Date.now(),
        };
      });

      Then("the dead letter has attemptCount {int}", (_ctx: unknown, expected: number) => {
        expect(state.deadLetter!.attemptCount).toBe(expected);
      });
    });

    RuleScenario("Dead letter handles long error messages", ({ Given, Then }) => {
      Given("a dead letter with a long error message", () => {
        state.longError = "Error: ".repeat(100) + "Stack trace...";
        state.deadLetter = {
          processManagerName: "testPM",
          instanceId: "inst-123",
          error: state.longError,
          attemptCount: 1,
          status: "pending",
          failedAt: Date.now(),
        };
      });

      Then("the dead letter error matches the long error message", () => {
        expect(state.deadLetter!.error).toBe(state.longError);
      });
    });

    RuleScenario("Dead letter handles complex context objects", ({ Given, Then, And }) => {
      Given("a dead letter with a complex context object", () => {
        state.deadLetter = {
          processManagerName: "testPM",
          instanceId: "inst-123",
          error: "Failed",
          attemptCount: 1,
          status: "pending",
          context: {
            correlationId: "corr-123",
            timestamp: Date.now(),
            metadata: {
              source: "integration-event",
              version: 2,
            },
            tags: ["critical", "retry"],
          },
          failedAt: Date.now(),
        };
      });

      Then(
        "the dead letter context has correlationId {string}",
        (_ctx: unknown, expected: string) => {
          expect(state.deadLetter!.context).toHaveProperty("correlationId", expected);
        }
      );

      And("the dead letter context has a metadata property", () => {
        expect(state.deadLetter!.context).toHaveProperty("metadata");
      });

      And("the dead letter context has a tags property", () => {
        expect(state.deadLetter!.context).toHaveProperty("tags");
      });
    });
  });
});
