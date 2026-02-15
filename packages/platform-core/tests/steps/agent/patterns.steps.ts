/**
 * Pattern Detection Framework - Step Definitions
 *
 * BDD step definitions for pattern detection pure functions including:
 * - Error codes enumeration
 * - PatternWindowSchema Zod validation
 * - Duration parsing (parseDuration, isValidDuration)
 * - Pattern definition validation (validatePatternDefinition)
 * - definePattern factory
 * - Window boundary calculation (calculateWindowBoundary)
 * - Event filtering (filterEventsInWindow, hasMinimumEvents)
 * - Pattern triggers (countThreshold, eventTypePresent, multiStreamPresent, all, any)
 * - Complex trigger combinations
 *
 * Mechanical migration from tests/unit/agent/patterns.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  PATTERN_ERROR_CODES,
  PatternWindowSchema,
  parseDuration,
  isValidDuration,
  validatePatternDefinition,
  definePattern,
  calculateWindowBoundary,
  filterEventsInWindow,
  hasMinimumEvents,
  PatternTriggers,
  type PatternDefinition,
  type PatternTrigger,
} from "../../../src/agent/patterns.js";
import type { PublishedEvent } from "../../../src/eventbus/types.js";
import type { PatternWindow } from "../../../src/agent/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    eventId: "evt_test_123",
    eventType: "TestEvent",
    streamId: "stream-001",
    streamType: "TestStream",
    globalPosition: 100,
    streamPosition: 10,
    timestamp: Date.now(),
    payload: {},
    metadata: {},
    schemaVersion: 1,
    causationId: "cause-001",
    correlationId: "corr-001",
    ...overrides,
  };
}

function createTestWindow(overrides: Partial<PatternWindow> = {}): PatternWindow {
  return {
    duration: "7d",
    ...overrides,
  };
}

function createTestPatternDefinition(
  overrides: Partial<PatternDefinition> = {}
): PatternDefinition {
  return {
    name: "test-pattern",
    description: "A test pattern",
    window: createTestWindow(),
    trigger: () => true,
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  schemaResult: { success: boolean } | null;
  validationResult: { valid: boolean; code?: string } | null;
  definition: PatternDefinition | null;
  returnedDefinition: PatternDefinition | null;
  boundary: number | null;
  filteredEvents: PublishedEvent[];
  events: PublishedEvent[];
  triggerResult: boolean | null;
}

function createInitialState(): TestState {
  return {
    schemaResult: null,
    validationResult: null,
    definition: null,
    returnedDefinition: null,
    boundary: null,
    filteredEvents: [],
    events: [],
    triggerResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/patterns.feature");

describeFeature(feature, ({ Background, Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Module imported at top level
    });
  });

  // ===========================================================================
  // Rule: Error codes are defined as a complete enumeration
  // ===========================================================================

  Rule("Error codes are defined as a complete enumeration", ({ RuleScenario }) => {
    RuleScenario("Error codes contain all expected values", ({ Then, And }) => {
      Then(
        "the error codes contain the following entries:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ code: string; value: string }>(dataTable);
          for (const row of rows) {
            expect(PATTERN_ERROR_CODES[row.code as keyof typeof PATTERN_ERROR_CODES]).toBe(
              row.value
            );
          }
        }
      );

      And("the error codes object has exactly 6 keys", () => {
        expect(Object.keys(PATTERN_ERROR_CODES).length).toBe(6);
      });
    });
  });

  // ===========================================================================
  // Rule: PatternWindowSchema validates window configuration via Zod
  // ===========================================================================

  Rule("PatternWindowSchema validates window configuration via Zod", ({ RuleScenario }) => {
    RuleScenario("Accepts valid window with duration only", ({ When, Then }) => {
      When('I parse a window with duration "7d"', () => {
        state.schemaResult = PatternWindowSchema.safeParse({
          duration: "7d",
        });
      });

      Then("the schema parse succeeds", () => {
        expect(state.schemaResult!.success).toBe(true);
      });
    });

    RuleScenario("Accepts window with all optional fields", ({ When, Then }) => {
      When(
        'I parse a window with duration "7d" eventLimit 100 minEvents 5 loadBatchSize 50',
        () => {
          state.schemaResult = PatternWindowSchema.safeParse({
            duration: "7d",
            eventLimit: 100,
            minEvents: 5,
            loadBatchSize: 50,
          });
        }
      );

      Then("the schema parse succeeds", () => {
        expect(state.schemaResult!.success).toBe(true);
      });
    });

    RuleScenario("Rejects window with empty duration", ({ When, Then }) => {
      When('I parse a window with duration ""', () => {
        state.schemaResult = PatternWindowSchema.safeParse({ duration: "" });
      });

      Then("the schema parse fails", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects window with missing duration", ({ When, Then }) => {
      When("I parse a window with no duration", () => {
        state.schemaResult = PatternWindowSchema.safeParse({});
      });

      Then("the schema parse fails", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects window with non-positive eventLimit", ({ When, Then }) => {
      When('I parse a window with duration "7d" and eventLimit 0', () => {
        state.schemaResult = PatternWindowSchema.safeParse({
          duration: "7d",
          eventLimit: 0,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects window with negative eventLimit", ({ When, Then }) => {
      When('I parse a window with duration "7d" and eventLimit -10', () => {
        state.schemaResult = PatternWindowSchema.safeParse({
          duration: "7d",
          eventLimit: -10,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects window with non-positive minEvents", ({ When, Then }) => {
      When('I parse a window with duration "7d" and minEvents 0', () => {
        state.schemaResult = PatternWindowSchema.safeParse({
          duration: "7d",
          minEvents: 0,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects window with non-positive loadBatchSize", ({ When, Then }) => {
      When('I parse a window with duration "7d" and loadBatchSize 0', () => {
        state.schemaResult = PatternWindowSchema.safeParse({
          duration: "7d",
          loadBatchSize: 0,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });

    RuleScenario("Rejects window with non-integer eventLimit", ({ When, Then }) => {
      When('I parse a window with duration "7d" and eventLimit 50.5', () => {
        state.schemaResult = PatternWindowSchema.safeParse({
          duration: "7d",
          eventLimit: 50.5,
        });
      });

      Then("the schema parse fails", () => {
        expect(state.schemaResult!.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: Duration parsing converts duration strings to milliseconds
  // ===========================================================================

  Rule("Duration parsing converts duration strings to milliseconds", ({ RuleScenario }) => {
    RuleScenario("Parses days format correctly", ({ Then }) => {
      Then(
        "parseDuration returns expected milliseconds for:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            input: string;
            expectedMs: string;
          }>(dataTable);
          for (const row of rows) {
            expect(parseDuration(row.input)).toBe(Number(row.expectedMs));
          }
        }
      );
    });

    RuleScenario("Parses hours format correctly", ({ Then }) => {
      Then(
        "parseDuration returns expected milliseconds for:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            input: string;
            expectedMs: string;
          }>(dataTable);
          for (const row of rows) {
            expect(parseDuration(row.input)).toBe(Number(row.expectedMs));
          }
        }
      );
    });

    RuleScenario("Parses minutes format correctly", ({ Then }) => {
      Then(
        "parseDuration returns expected milliseconds for:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            input: string;
            expectedMs: string;
          }>(dataTable);
          for (const row of rows) {
            expect(parseDuration(row.input)).toBe(Number(row.expectedMs));
          }
        }
      );
    });

    RuleScenario("Handles uppercase units", ({ Then }) => {
      Then(
        "parseDuration returns expected milliseconds for:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            input: string;
            expectedMs: string;
          }>(dataTable);
          for (const row of rows) {
            expect(parseDuration(row.input)).toBe(Number(row.expectedMs));
          }
        }
      );
    });

    RuleScenario("Returns null for invalid formats", ({ Then }) => {
      Then("parseDuration returns null for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(parseDuration(row.input)).toBeNull();
        }
      });
    });

    RuleScenario("Trims leading and trailing whitespace", ({ Then }) => {
      Then(
        "parseDuration returns expected milliseconds for:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            input: string;
            expectedMs: string;
          }>(dataTable);
          for (const row of rows) {
            expect(parseDuration(row.input)).toBe(Number(row.expectedMs));
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: isValidDuration checks format validity
  // ===========================================================================

  Rule("isValidDuration checks format validity", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid duration formats", ({ Then }) => {
      Then("isValidDuration returns true for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(isValidDuration(row.input)).toBe(true);
        }
      });
    });

    RuleScenario("Returns false for invalid duration formats", ({ Then }) => {
      Then("isValidDuration returns false for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ input: string }>(dataTable);
        for (const row of rows) {
          expect(isValidDuration(row.input)).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: Pattern definition validation catches invalid configurations
  // ===========================================================================

  Rule("Pattern definition validation catches invalid configurations", ({ RuleScenario }) => {
    RuleScenario("Returns invalid when name is missing", ({ When, Then }) => {
      When("I validate a pattern with no name", () => {
        state.validationResult = validatePatternDefinition({
          window: createTestWindow(),
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "PATTERN_NAME_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when name is empty string", ({ When, Then }) => {
      When('I validate a pattern with name ""', () => {
        state.validationResult = validatePatternDefinition({
          name: "",
          window: createTestWindow(),
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "PATTERN_NAME_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when name is whitespace only", ({ When, Then }) => {
      When('I validate a pattern with name "   "', () => {
        state.validationResult = validatePatternDefinition({
          name: "   ",
          window: createTestWindow(),
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "PATTERN_NAME_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when trigger is missing", ({ When, Then }) => {
      When("I validate a pattern with no trigger", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: createTestWindow(),
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "TRIGGER_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.TRIGGER_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when trigger is not a function", ({ When, Then }) => {
      When("I validate a pattern with trigger as a non-function", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: createTestWindow(),
          trigger: "not a function" as unknown as PatternTrigger,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "TRIGGER_REQUIRED"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.TRIGGER_REQUIRED);
      });
    });

    RuleScenario("Returns invalid when duration format is invalid", ({ When, Then }) => {
      When('I validate a pattern with duration "invalid"', () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "invalid" },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "INVALID_DURATION_FORMAT"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.INVALID_DURATION_FORMAT);
      });
    });

    RuleScenario("Returns invalid when duration is empty", ({ When, Then }) => {
      When('I validate a pattern with duration ""', () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "" },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "INVALID_DURATION_FORMAT"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.INVALID_DURATION_FORMAT);
      });
    });

    RuleScenario("Returns invalid when eventLimit is non-positive", ({ When, Then }) => {
      When("I validate a pattern with eventLimit 0", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "7d", eventLimit: 0 },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "INVALID_EVENT_LIMIT"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.INVALID_EVENT_LIMIT);
      });
    });

    RuleScenario("Returns invalid when eventLimit is negative", ({ When, Then }) => {
      When("I validate a pattern with eventLimit -10", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "7d", eventLimit: -10 },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns invalid when eventLimit is not an integer", ({ When, Then }) => {
      When("I validate a pattern with eventLimit 50.5", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "7d", eventLimit: 50.5 },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then("the validation result is invalid", () => {
        expect(state.validationResult!.valid).toBe(false);
      });
    });

    RuleScenario("Returns invalid when minEvents is non-positive", ({ When, Then }) => {
      When("I validate a pattern with minEvents 0", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "7d", minEvents: 0 },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "INVALID_MIN_EVENTS"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.INVALID_MIN_EVENTS);
      });
    });

    RuleScenario("Returns invalid when loadBatchSize is non-positive", ({ When, Then }) => {
      When("I validate a pattern with loadBatchSize 0", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "7d", loadBatchSize: 0 },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then('the validation result is invalid with code "INVALID_LOAD_BATCH_SIZE"', () => {
        expect(state.validationResult!.valid).toBe(false);
        expect(state.validationResult!.code).toBe(PATTERN_ERROR_CODES.INVALID_LOAD_BATCH_SIZE);
      });
    });

    RuleScenario("Returns valid for minimal definition", ({ When, Then }) => {
      When('I validate a pattern with name "test-pattern" and duration "7d" and a trigger', () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: { duration: "7d" },
          trigger: () => true,
        }) as { valid: boolean; code?: string };
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Returns valid for complete definition", ({ When, Then }) => {
      When("I validate a complete test pattern definition", () => {
        state.validationResult = validatePatternDefinition(createTestPatternDefinition()) as {
          valid: boolean;
          code?: string;
        };
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });

    RuleScenario("Returns valid for definition with all window options", ({ When, Then }) => {
      When("I validate a pattern with all window options", () => {
        state.validationResult = validatePatternDefinition({
          name: "test-pattern",
          window: {
            duration: "30d",
            eventLimit: 100,
            minEvents: 5,
            loadBatchSize: 25,
          },
          trigger: () => true,
          analyze: async () => ({
            detected: true,
            confidence: 0.9,
            reasoning: "test",
            matchingEventIds: [],
          }),
        }) as { valid: boolean; code?: string };
      });

      Then("the validation result is valid", () => {
        expect(state.validationResult!.valid).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: definePattern factory validates and returns definitions
  // ===========================================================================

  Rule("definePattern factory validates and returns definitions", ({ RuleScenario }) => {
    RuleScenario("Returns the definition when valid", ({ When, Then }) => {
      When("I define a valid test pattern", () => {
        state.definition = createTestPatternDefinition();
        state.returnedDefinition = definePattern(state.definition);
      });

      Then("the returned definition is the same object", () => {
        expect(state.returnedDefinition).toBe(state.definition);
      });
    });

    RuleScenario("Throws error when name is missing", ({ Then }) => {
      Then('definePattern with empty name throws "Pattern name is required"', () => {
        expect(() =>
          definePattern({
            name: "",
            window: createTestWindow(),
            trigger: () => true,
          })
        ).toThrow("Pattern name is required");
      });
    });

    RuleScenario("Throws error when trigger is missing", ({ Then }) => {
      Then('definePattern with no trigger throws "Pattern trigger function is required"', () => {
        expect(() =>
          definePattern({
            name: "test",
            window: createTestWindow(),
            trigger: undefined as unknown as PatternTrigger,
          })
        ).toThrow("Pattern trigger function is required");
      });
    });

    RuleScenario("Throws error when duration is invalid", ({ Then }) => {
      Then('definePattern with duration "invalid" throws "Duration must be in format"', () => {
        expect(() =>
          definePattern({
            name: "test",
            window: { duration: "invalid" },
            trigger: () => true,
          })
        ).toThrow("Duration must be in format");
      });
    });

    RuleScenario("Includes error code in thrown error message", ({ Then }) => {
      Then('definePattern with empty name throws "PATTERN_NAME_REQUIRED"', () => {
        expect(() =>
          definePattern({
            name: "",
            window: createTestWindow(),
            trigger: () => true,
          })
        ).toThrow(PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED);
      });
    });
  });

  // ===========================================================================
  // Rule: Window boundary calculation subtracts parsed duration from now
  // ===========================================================================

  Rule("Window boundary calculation subtracts parsed duration from now", ({ RuleScenario }) => {
    RuleScenario("Calculates boundary for days", ({ When, Then }) => {
      When('I calculate the window boundary for "7d" at timestamp 1000000000', () => {
        state.boundary = calculateWindowBoundary(createTestWindow({ duration: "7d" }), 1000000000);
      });

      Then("the boundary is 1000000000 minus 7 days in milliseconds", () => {
        expect(state.boundary).toBe(1000000000 - 7 * 24 * 60 * 60 * 1000);
      });
    });

    RuleScenario("Calculates boundary for hours", ({ When, Then }) => {
      When('I calculate the window boundary for "24h" at timestamp 1000000000', () => {
        state.boundary = calculateWindowBoundary(createTestWindow({ duration: "24h" }), 1000000000);
      });

      Then("the boundary is 1000000000 minus 24 hours in milliseconds", () => {
        expect(state.boundary).toBe(1000000000 - 24 * 60 * 60 * 1000);
      });
    });

    RuleScenario("Calculates boundary for minutes", ({ When, Then }) => {
      When('I calculate the window boundary for "30m" at timestamp 1000000000', () => {
        state.boundary = calculateWindowBoundary(createTestWindow({ duration: "30m" }), 1000000000);
      });

      Then("the boundary is 1000000000 minus 30 minutes in milliseconds", () => {
        expect(state.boundary).toBe(1000000000 - 30 * 60 * 1000);
      });
    });

    RuleScenario("Uses Date.now when now is not provided", ({ When, Then }) => {
      let before: number;
      let after: number;

      When('I calculate the window boundary for "7d" without providing now', () => {
        before = Date.now();
        state.boundary = calculateWindowBoundary(createTestWindow({ duration: "7d" }));
        after = Date.now();
      });

      Then("the boundary is approximately Date.now minus 7 days", () => {
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        expect(state.boundary).toBeGreaterThanOrEqual(before - sevenDaysMs);
        expect(state.boundary).toBeLessThanOrEqual(after - sevenDaysMs);
      });
    });

    RuleScenario("Throws error for invalid duration format", ({ Then }) => {
      Then(
        'calculateWindowBoundary with duration "invalid" throws "Invalid duration format"',
        () => {
          expect(() =>
            calculateWindowBoundary({
              duration: "invalid",
            } as PatternWindow)
          ).toThrow("Invalid duration format");
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Event filtering applies time window and optional event limit
  // ===========================================================================

  Rule("Event filtering applies time window and optional event limit", ({ RuleScenario }) => {
    const NOW = 1000000000;

    RuleScenario("Includes events within the window", ({ Given, When, Then }) => {
      Given("events at offsets 100 and 200 from the 1h boundary at timestamp 1000000000", () => {
        const boundary = NOW - 3600000;
        state.events = [
          createTestEvent({
            eventId: "evt1",
            timestamp: boundary + 100,
          }),
          createTestEvent({
            eventId: "evt2",
            timestamp: boundary + 200,
          }),
        ];
      });

      When("I filter events in a 1h window at timestamp 1000000000", () => {
        state.filteredEvents = filterEventsInWindow(
          state.events,
          createTestWindow({ duration: "1h" }),
          NOW
        );
      });

      Then("2 events are returned", () => {
        expect(state.filteredEvents.length).toBe(2);
      });
    });

    RuleScenario("Excludes events outside the window", ({ Given, When, Then }) => {
      Given("events at offsets -100 and 100 from the 1h boundary at timestamp 1000000000", () => {
        const boundary = NOW - 3600000;
        state.events = [
          createTestEvent({
            eventId: "evt1",
            timestamp: boundary - 100,
          }),
          createTestEvent({
            eventId: "evt2",
            timestamp: boundary + 100,
          }),
        ];
      });

      When("I filter events in a 1h window at timestamp 1000000000", () => {
        state.filteredEvents = filterEventsInWindow(
          state.events,
          createTestWindow({ duration: "1h" }),
          NOW
        );
      });

      Then('1 event is returned with eventId "evt2"', () => {
        expect(state.filteredEvents.length).toBe(1);
        expect(state.filteredEvents[0].eventId).toBe("evt2");
      });
    });

    RuleScenario("Includes events exactly at the boundary", ({ Given, When, Then }) => {
      Given("an event exactly at the 1h boundary at timestamp 1000000000", () => {
        const boundary = NOW - 3600000;
        state.events = [
          createTestEvent({
            eventId: "evt1",
            timestamp: boundary,
          }),
        ];
      });

      When("I filter events in a 1h window at timestamp 1000000000", () => {
        state.filteredEvents = filterEventsInWindow(
          state.events,
          createTestWindow({ duration: "1h" }),
          NOW
        );
      });

      Then("1 event is returned", () => {
        expect(state.filteredEvents.length).toBe(1);
      });
    });

    RuleScenario("Applies event limit and takes most recent", ({ Given, When, Then }) => {
      Given("3 events at offsets 100 200 300 from the 1h boundary at timestamp 1000000000", () => {
        const boundary = NOW - 3600000;
        state.events = [
          createTestEvent({
            eventId: "evt1",
            timestamp: boundary + 100,
          }),
          createTestEvent({
            eventId: "evt2",
            timestamp: boundary + 200,
          }),
          createTestEvent({
            eventId: "evt3",
            timestamp: boundary + 300,
          }),
        ];
      });

      When("I filter events in a 1h window with eventLimit 2 at timestamp 1000000000", () => {
        state.filteredEvents = filterEventsInWindow(
          state.events,
          createTestWindow({ duration: "1h", eventLimit: 2 }),
          NOW
        );
      });

      Then('2 events are returned containing eventIds "evt2" and "evt3"', () => {
        expect(state.filteredEvents.length).toBe(2);
        expect(state.filteredEvents.map((e) => e.eventId)).toContain("evt2");
        expect(state.filteredEvents.map((e) => e.eventId)).toContain("evt3");
      });
    });

    RuleScenario("Does not limit when under event limit", ({ Given, When, Then }) => {
      Given("events at offsets 100 and 200 from the 1h boundary at timestamp 1000000000", () => {
        const boundary = NOW - 3600000;
        state.events = [
          createTestEvent({
            eventId: "evt1",
            timestamp: boundary + 100,
          }),
          createTestEvent({
            eventId: "evt2",
            timestamp: boundary + 200,
          }),
        ];
      });

      When("I filter events in a 1h window with eventLimit 10 at timestamp 1000000000", () => {
        state.filteredEvents = filterEventsInWindow(
          state.events,
          createTestWindow({ duration: "1h", eventLimit: 10 }),
          NOW
        );
      });

      Then("2 events are returned", () => {
        expect(state.filteredEvents.length).toBe(2);
      });
    });

    RuleScenario("Returns empty array when no events match", ({ Given, When, Then }) => {
      Given(
        "events at offsets -1000 and -2000 from the 1h boundary at timestamp 1000000000",
        () => {
          const boundary = NOW - 3600000;
          state.events = [
            createTestEvent({
              eventId: "evt1",
              timestamp: boundary - 1000,
            }),
            createTestEvent({
              eventId: "evt2",
              timestamp: boundary - 2000,
            }),
          ];
        }
      );

      When("I filter events in a 1h window at timestamp 1000000000", () => {
        state.filteredEvents = filterEventsInWindow(
          state.events,
          createTestWindow({ duration: "1h" }),
          NOW
        );
      });

      Then("0 events are returned", () => {
        expect(state.filteredEvents.length).toBe(0);
      });
    });

    RuleScenario("Handles empty events array", ({ When, Then }) => {
      When("I filter an empty array in a 1h window at timestamp 1000000000", () => {
        state.filteredEvents = filterEventsInWindow([], createTestWindow({ duration: "1h" }), NOW);
      });

      Then("0 events are returned", () => {
        expect(state.filteredEvents.length).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Rule: hasMinimumEvents checks count against window minEvents
  // ===========================================================================

  Rule("hasMinimumEvents checks count against window minEvents", ({ RuleScenario }) => {
    RuleScenario("Returns true when events count meets minEvents", ({ Then }) => {
      Then("hasMinimumEvents with 3 events and minEvents 3 is true", () => {
        const events = [createTestEvent(), createTestEvent(), createTestEvent()];
        expect(hasMinimumEvents(events, createTestWindow({ minEvents: 3 }))).toBe(true);
      });
    });

    RuleScenario("Returns true when events count exceeds minEvents", ({ Then }) => {
      Then("hasMinimumEvents with 3 events and minEvents 2 is true", () => {
        const events = [createTestEvent(), createTestEvent(), createTestEvent()];
        expect(hasMinimumEvents(events, createTestWindow({ minEvents: 2 }))).toBe(true);
      });
    });

    RuleScenario("Returns false when events count is below minEvents", ({ Then }) => {
      Then("hasMinimumEvents with 2 events and minEvents 5 is false", () => {
        const events = [createTestEvent(), createTestEvent()];
        expect(hasMinimumEvents(events, createTestWindow({ minEvents: 5 }))).toBe(false);
      });
    });

    RuleScenario("Defaults to minEvents of 1", ({ Then }) => {
      Then("hasMinimumEvents with 1 event and no minEvents is true", () => {
        const events = [createTestEvent()];
        expect(hasMinimumEvents(events, createTestWindow())).toBe(true);
      });
    });

    RuleScenario("Returns false for empty events when minEvents is default", ({ Then }) => {
      Then("hasMinimumEvents with 0 events and no minEvents is false", () => {
        expect(hasMinimumEvents([], createTestWindow())).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: countThreshold trigger fires when event count meets threshold
  // ===========================================================================

  Rule("countThreshold trigger fires when event count meets threshold", ({ RuleScenario }) => {
    RuleScenario("Returns true when event count meets threshold", ({ Then }) => {
      Then("countThreshold 3 with 3 events returns true", () => {
        const trigger = PatternTriggers.countThreshold(3);
        const events = [createTestEvent(), createTestEvent(), createTestEvent()];
        expect(trigger(events)).toBe(true);
      });
    });

    RuleScenario("Returns true when event count exceeds threshold", ({ Then }) => {
      Then("countThreshold 2 with 3 events returns true", () => {
        const trigger = PatternTriggers.countThreshold(2);
        const events = [createTestEvent(), createTestEvent(), createTestEvent()];
        expect(trigger(events)).toBe(true);
      });
    });

    RuleScenario("Returns false when event count is below threshold", ({ Then }) => {
      Then("countThreshold 5 with 2 events returns false", () => {
        const trigger = PatternTriggers.countThreshold(5);
        const events = [createTestEvent(), createTestEvent()];
        expect(trigger(events)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: eventTypePresent trigger checks for specific event types
  // ===========================================================================

  Rule("eventTypePresent trigger checks for specific event types", ({ RuleScenario }) => {
    RuleScenario("Returns true when event type is present", ({ Given, When, Then }) => {
      Given('events with types "OrderCreated" and "OrderCancelled"', () => {
        state.events = [
          createTestEvent({ eventType: "OrderCreated" }),
          createTestEvent({ eventType: "OrderCancelled" }),
        ];
      });

      When('I check eventTypePresent for "OrderCancelled"', () => {
        const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"]);
        state.triggerResult = trigger(state.events);
      });

      Then("the trigger returns true", () => {
        expect(state.triggerResult).toBe(true);
      });
    });

    RuleScenario("Returns false when event type is not present", ({ Given, When, Then }) => {
      Given('events with types "OrderCreated" and "OrderShipped"', () => {
        state.events = [
          createTestEvent({ eventType: "OrderCreated" }),
          createTestEvent({ eventType: "OrderShipped" }),
        ];
      });

      When('I check eventTypePresent for "OrderCancelled"', () => {
        const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"]);
        state.triggerResult = trigger(state.events);
      });

      Then("the trigger returns false", () => {
        expect(state.triggerResult).toBe(false);
      });
    });

    RuleScenario(
      "Returns true when any of multiple event types is present",
      ({ Given, When, Then }) => {
        Given('events with types "OrderRefunded"', () => {
          state.events = [createTestEvent({ eventType: "OrderRefunded" })];
        });

        When('I check eventTypePresent for "OrderCancelled" or "OrderRefunded"', () => {
          const trigger = PatternTriggers.eventTypePresent(["OrderCancelled", "OrderRefunded"]);
          state.triggerResult = trigger(state.events);
        });

        Then("the trigger returns true", () => {
          expect(state.triggerResult).toBe(true);
        });
      }
    );

    RuleScenario("Respects minCount parameter", ({ Given, When, Then }) => {
      Given('2 events of type "OrderCancelled"', () => {
        state.events = [
          createTestEvent({ eventType: "OrderCancelled" }),
          createTestEvent({ eventType: "OrderCancelled" }),
        ];
      });

      When('I check eventTypePresent for "OrderCancelled" with minCount 3', () => {
        const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"], 3);
        state.triggerResult = trigger(state.events);
      });

      Then("the trigger returns false", () => {
        expect(state.triggerResult).toBe(false);
      });
    });

    RuleScenario("Returns true when minCount is met", ({ Given, When, Then }) => {
      Given('3 events of type "OrderCancelled"', () => {
        state.events = [
          createTestEvent({ eventType: "OrderCancelled" }),
          createTestEvent({ eventType: "OrderCancelled" }),
          createTestEvent({ eventType: "OrderCancelled" }),
        ];
      });

      When('I check eventTypePresent for "OrderCancelled" with minCount 3', () => {
        const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"], 3);
        state.triggerResult = trigger(state.events);
      });

      Then("the trigger returns true", () => {
        expect(state.triggerResult).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: multiStreamPresent trigger checks for events from distinct streams
  // ===========================================================================

  Rule("multiStreamPresent trigger checks for events from distinct streams", ({ RuleScenario }) => {
    RuleScenario("Returns true when minimum streams are present", ({ Given, When, Then }) => {
      Given('events from streams "stream-1" and "stream-2"', () => {
        state.events = [
          createTestEvent({ streamId: "stream-1" }),
          createTestEvent({ streamId: "stream-2" }),
        ];
      });

      When("I check multiStreamPresent with minimum 2", () => {
        const trigger = PatternTriggers.multiStreamPresent(2);
        state.triggerResult = trigger(state.events);
      });

      Then("the trigger returns true", () => {
        expect(state.triggerResult).toBe(true);
      });
    });

    RuleScenario("Returns false when below minimum streams", ({ Given, When, Then }) => {
      Given('events from streams "stream-1" and "stream-2"', () => {
        state.events = [
          createTestEvent({ streamId: "stream-1" }),
          createTestEvent({ streamId: "stream-2" }),
        ];
      });

      When("I check multiStreamPresent with minimum 3", () => {
        const trigger = PatternTriggers.multiStreamPresent(3);
        state.triggerResult = trigger(state.events);
      });

      Then("the trigger returns false", () => {
        expect(state.triggerResult).toBe(false);
      });
    });

    RuleScenario("Counts unique streams correctly", ({ Given, When, Then }) => {
      Given('3 events all from stream "stream-1"', () => {
        state.events = [
          createTestEvent({ streamId: "stream-1" }),
          createTestEvent({ streamId: "stream-1" }),
          createTestEvent({ streamId: "stream-1" }),
        ];
      });

      When("I check multiStreamPresent with minimum 2", () => {
        const trigger = PatternTriggers.multiStreamPresent(2);
        state.triggerResult = trigger(state.events);
      });

      Then("the trigger returns false", () => {
        expect(state.triggerResult).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: PatternTriggers.all combines triggers with AND logic
  // ===========================================================================

  Rule("PatternTriggers.all combines triggers with AND logic", ({ RuleScenario }) => {
    RuleScenario("Returns true when ALL triggers match", ({ Then }) => {
      Then("all() with two true triggers returns true", () => {
        const trigger1: PatternTrigger = () => true;
        const trigger2: PatternTrigger = () => true;
        const combined = PatternTriggers.all(trigger1, trigger2);
        expect(combined([])).toBe(true);
      });
    });

    RuleScenario("Returns false when ANY trigger does not match", ({ Then }) => {
      Then("all() with one true and one false trigger returns false", () => {
        const trigger1: PatternTrigger = () => true;
        const trigger2: PatternTrigger = () => false;
        const combined = PatternTriggers.all(trigger1, trigger2);
        expect(combined([])).toBe(false);
      });
    });

    RuleScenario("Returns false when NO triggers match", ({ Then }) => {
      Then("all() with two false triggers returns false", () => {
        const trigger1: PatternTrigger = () => false;
        const trigger2: PatternTrigger = () => false;
        const combined = PatternTriggers.all(trigger1, trigger2);
        expect(combined([])).toBe(false);
      });
    });

    RuleScenario("Returns true for empty triggers array", ({ Then }) => {
      Then("all() with no triggers returns true", () => {
        const combined = PatternTriggers.all();
        expect(combined([])).toBe(true);
      });
    });

    RuleScenario("Passes events to each trigger", ({ Then }) => {
      Then("all() passes the events array to each trigger", () => {
        const mockTrigger1 = vi.fn().mockReturnValue(true);
        const mockTrigger2 = vi.fn().mockReturnValue(true);
        const combined = PatternTriggers.all(mockTrigger1, mockTrigger2);
        const events = [createTestEvent()];
        combined(events);
        expect(mockTrigger1).toHaveBeenCalledWith(events);
        expect(mockTrigger2).toHaveBeenCalledWith(events);
      });
    });
  });

  // ===========================================================================
  // Rule: PatternTriggers.any combines triggers with OR logic
  // ===========================================================================

  Rule("PatternTriggers.any combines triggers with OR logic", ({ RuleScenario }) => {
    RuleScenario("Returns true when ANY trigger matches", ({ Then }) => {
      Then("any() with one false and one true trigger returns true", () => {
        const trigger1: PatternTrigger = () => false;
        const trigger2: PatternTrigger = () => true;
        const combined = PatternTriggers.any(trigger1, trigger2);
        expect(combined([])).toBe(true);
      });
    });

    RuleScenario("Returns true when ALL triggers match", ({ Then }) => {
      Then("any() with two true triggers returns true", () => {
        const trigger1: PatternTrigger = () => true;
        const trigger2: PatternTrigger = () => true;
        const combined = PatternTriggers.any(trigger1, trigger2);
        expect(combined([])).toBe(true);
      });
    });

    RuleScenario("Returns false when NO triggers match", ({ Then }) => {
      Then("any() with two false triggers returns false", () => {
        const trigger1: PatternTrigger = () => false;
        const trigger2: PatternTrigger = () => false;
        const combined = PatternTriggers.any(trigger1, trigger2);
        expect(combined([])).toBe(false);
      });
    });

    RuleScenario("Returns false for empty triggers array", ({ Then }) => {
      Then("any() with no triggers returns false", () => {
        const combined = PatternTriggers.any();
        expect(combined([])).toBe(false);
      });
    });

    RuleScenario("Short-circuits on first match", ({ Then }) => {
      Then("any() calls the first trigger", () => {
        const mockTrigger1 = vi.fn().mockReturnValue(true);
        const mockTrigger2 = vi.fn().mockReturnValue(true);
        const combined = PatternTriggers.any(mockTrigger1, mockTrigger2);
        combined([]);
        expect(mockTrigger1).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Rule: Complex trigger combinations compose correctly
  // ===========================================================================

  Rule("Complex trigger combinations compose correctly", ({ RuleScenario }) => {
    RuleScenario("Combines count threshold with event type using all", ({ Given, When, Then }) => {
      Given('3 events where one is "OrderCancelled"', () => {
        state.events = [
          createTestEvent({ eventType: "OrderCreated" }),
          createTestEvent({ eventType: "OrderCancelled" }),
          createTestEvent({ eventType: "OrderShipped" }),
        ];
      });

      When('I check all(countThreshold 3, eventTypePresent "OrderCancelled")', () => {
        const combined = PatternTriggers.all(
          PatternTriggers.countThreshold(3),
          PatternTriggers.eventTypePresent(["OrderCancelled"])
        );
        state.triggerResult = combined(state.events);
      });

      Then("the trigger returns true", () => {
        expect(state.triggerResult).toBe(true);
      });
    });

    RuleScenario("Fails all when event type missing despite count met", ({ Given, When, Then }) => {
      Given('3 events with no "OrderCancelled"', () => {
        state.events = [
          createTestEvent({ eventType: "OrderCreated" }),
          createTestEvent({ eventType: "OrderShipped" }),
          createTestEvent({ eventType: "OrderDelivered" }),
        ];
      });

      When('I check all(countThreshold 3, eventTypePresent "OrderCancelled")', () => {
        const combined = PatternTriggers.all(
          PatternTriggers.countThreshold(3),
          PatternTriggers.eventTypePresent(["OrderCancelled"])
        );
        state.triggerResult = combined(state.events);
      });

      Then("the trigger returns false", () => {
        expect(state.triggerResult).toBe(false);
      });
    });

    RuleScenario("Combines any with count thresholds - alert present", ({ Given, When, Then }) => {
      Given('5 events where first is "HighPriorityAlert"', () => {
        state.events = Array(5)
          .fill(null)
          .map((_, i) =>
            createTestEvent({
              eventId: `evt${i}`,
              eventType: i === 0 ? "HighPriorityAlert" : "Regular",
            })
          );
      });

      When('I check any(countThreshold 10, eventTypePresent "HighPriorityAlert")', () => {
        const combined = PatternTriggers.any(
          PatternTriggers.countThreshold(10),
          PatternTriggers.eventTypePresent(["HighPriorityAlert"])
        );
        state.triggerResult = combined(state.events);
      });

      Then("the trigger returns true", () => {
        expect(state.triggerResult).toBe(true);
      });
    });

    RuleScenario(
      "Combines any with count thresholds - neither condition met",
      ({ Given, When, Then }) => {
        Given("5 regular events", () => {
          state.events = Array(5)
            .fill(null)
            .map((_, i) =>
              createTestEvent({
                eventId: `evt${i}`,
                eventType: "Regular",
              })
            );
        });

        When('I check any(countThreshold 10, eventTypePresent "HighPriorityAlert")', () => {
          const combined = PatternTriggers.any(
            PatternTriggers.countThreshold(10),
            PatternTriggers.eventTypePresent(["HighPriorityAlert"])
          );
          state.triggerResult = combined(state.events);
        });

        Then("the trigger returns false", () => {
          expect(state.triggerResult).toBe(false);
        });
      }
    );
  });
});
