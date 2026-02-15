/**
 * Pagination Helpers - Step Definitions
 *
 * BDD step definitions for cursor-based pagination utilities:
 * - Constants (DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
 * - normalizePaginationOptions
 * - createEmptyPage / createPagedResult
 * - encodeCursor / decodeCursor
 * - isValidPageSize / getEffectivePageSize
 * - Pagination workflow
 *
 * Mechanical migration from tests/unit/queries/pagination.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  normalizePaginationOptions,
  createEmptyPage,
  createPagedResult,
  encodeCursor,
  decodeCursor,
  isValidPageSize,
  getEffectivePageSize,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../../src/queries/pagination.js";
import type {
  NormalizedPaginationOptions,
  PagedQueryResult,
} from "../../../src/queries/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  config: { defaultPageSize: number; maxPageSize: number };
  normalizedResult: NormalizedPaginationOptions | null;
  normalizedResults: Array<{ pageSize: number; result: NormalizedPaginationOptions }>;
  page: PagedQueryResult<{ id: string }> | null;
  items: Array<{ id: string }>;
  cursorPosition: Record<string, unknown> | null;
  encodedCursor: string | null;
  decodedPosition: Record<string, unknown> | null;
  decodedResults: Array<{ input: string; result: Record<string, unknown> | null }>;
  dataShapeResults: Array<{
    shape: string;
    original: Record<string, unknown>;
    decoded: Record<string, unknown> | null;
  }>;
  // Workflow state
  page1: PagedQueryResult<{ id: string }> | null;
  page2: PagedQueryResult<{ id: string }> | null;
  page1Cursor: string | null;
}

function createInitialState(): TestState {
  return {
    config: { defaultPageSize: 20, maxPageSize: 100 },
    normalizedResult: null,
    normalizedResults: [],
    page: null,
    items: [],
    cursorPosition: null,
    encodedCursor: null,
    decodedPosition: null,
    decodedResults: [],
    dataShapeResults: [],
    page1: null,
    page2: null,
    page1Cursor: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Data shape helpers for cursor round-trip tests
// =============================================================================

function getDataShape(shape: string): Record<string, unknown> {
  switch (shape) {
    case "empty-object":
      return {};
    case "nested-objects":
      return {
        page: { offset: 10 },
        filter: { status: "active" },
      };
    case "arrays":
      return {
        ids: ["a", "b", "c"],
        offset: 5,
      };
    case "special-chars":
      return {
        key: "value with spaces & special <chars>",
        emoji: "\uD83C\uDF89",
        unicode: "\u65E5\u672C\u8A9E\u30C6\u30B9\u30C8",
        quotes: "\"quoted\" and 'single'",
        symbols: "!@#$%^&*()",
      };
    default:
      throw new Error(`Unknown data shape: ${shape}`);
  }
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/queries/pagination.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Constants
  // ==========================================================================

  Rule("Pagination constants define reasonable defaults", ({ RuleScenario }) => {
    RuleScenario("Pagination constants have expected values", ({ Then }) => {
      Then("the pagination constants are:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          constant: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const expected = Number(row.value);
          if (row.constant === "DEFAULT_PAGE_SIZE") {
            expect(DEFAULT_PAGE_SIZE).toBe(expected);
          } else if (row.constant === "MAX_PAGE_SIZE") {
            expect(MAX_PAGE_SIZE).toBe(expected);
          }
        }
      });
    });
  });

  // ==========================================================================
  // normalizePaginationOptions
  // ==========================================================================

  Rule(
    "normalizePaginationOptions clamps page size and passes through cursor",
    ({ RuleScenario }) => {
      RuleScenario("Returns defaults when no options provided", ({ Given, When, Then, And }) => {
        Given(
          "a pagination config with defaultPageSize {int} and maxPageSize {int}",
          (_ctx: unknown, defaultPageSize: number, maxPageSize: number) => {
            state.config = { defaultPageSize, maxPageSize };
          }
        );

        When("I normalize pagination options with no input", () => {
          state.normalizedResult = normalizePaginationOptions(undefined, state.config);
        });

        Then("the normalized pageSize is {int}", (_ctx: unknown, expected: number) => {
          expect(state.normalizedResult.pageSize).toBe(expected);
        });

        And("the normalized cursor is undefined", () => {
          expect(state.normalizedResult.cursor).toBeUndefined();
        });
      });

      RuleScenario("Uses provided page size within limits", ({ Given, When, Then }) => {
        Given(
          "a pagination config with defaultPageSize {int} and maxPageSize {int}",
          (_ctx: unknown, defaultPageSize: number, maxPageSize: number) => {
            state.config = { defaultPageSize, maxPageSize };
          }
        );

        When(
          "I normalize pagination options with pageSize {int}",
          (_ctx: unknown, pageSize: number) => {
            state.normalizedResult = normalizePaginationOptions({ pageSize }, state.config);
          }
        );

        Then("the normalized pageSize is {int}", (_ctx: unknown, expected: number) => {
          expect(state.normalizedResult.pageSize).toBe(expected);
        });
      });

      RuleScenario("Caps page size at max", ({ Given, When, Then }) => {
        Given(
          "a pagination config with defaultPageSize {int} and maxPageSize {int}",
          (_ctx: unknown, defaultPageSize: number, maxPageSize: number) => {
            state.config = { defaultPageSize, maxPageSize };
          }
        );

        When(
          "I normalize pagination options with pageSize {int}",
          (_ctx: unknown, pageSize: number) => {
            state.normalizedResult = normalizePaginationOptions({ pageSize }, state.config);
          }
        );

        Then("the normalized pageSize is {int}", (_ctx: unknown, expected: number) => {
          expect(state.normalizedResult.pageSize).toBe(expected);
        });
      });

      RuleScenario(
        "Enforces minimum page size of 1 for boundary values",
        ({ Given, When, Then }) => {
          Given(
            "a pagination config with defaultPageSize {int} and maxPageSize {int}",
            (_ctx: unknown, defaultPageSize: number, maxPageSize: number) => {
              state.config = { defaultPageSize, maxPageSize };
            }
          );

          When(
            "I normalize pagination options with pageSize values:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ pageSize: string }>(dataTable);
              state.normalizedResults = rows.map((row) => {
                const pageSize = Number(row.pageSize);
                return {
                  pageSize,
                  result: normalizePaginationOptions({ pageSize }, state.config),
                };
              });
            }
          );

          Then("all normalized pageSizes are {int}", (_ctx: unknown, expected: number) => {
            for (const entry of state.normalizedResults) {
              expect(entry.result.pageSize).toBe(expected);
            }
          });
        }
      );

      RuleScenario("Passes through cursor", ({ Given, When, Then }) => {
        Given(
          "a pagination config with defaultPageSize {int} and maxPageSize {int}",
          (_ctx: unknown, defaultPageSize: number, maxPageSize: number) => {
            state.config = { defaultPageSize, maxPageSize };
          }
        );

        When(
          "I normalize pagination options with cursor {string}",
          (_ctx: unknown, cursor: string) => {
            state.normalizedResult = normalizePaginationOptions({ cursor }, state.config);
          }
        );

        Then("the normalized cursor is {string}", (_ctx: unknown, expected: string) => {
          expect(state.normalizedResult.cursor).toBe(expected);
        });
      });

      RuleScenario("Works with custom config values", ({ Given, When }) => {
        Given(
          "a pagination config with defaultPageSize {int} and maxPageSize {int}",
          (_ctx: unknown, defaultPageSize: number, maxPageSize: number) => {
            state.config = { defaultPageSize, maxPageSize };
          }
        );

        When(
          "I normalize pagination options with various inputs:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              pageSize: string;
              expectedPageSize: string;
            }>(dataTable);
            for (const row of rows) {
              const options =
                row.pageSize === "__default__" ? undefined : { pageSize: Number(row.pageSize) };
              const result = normalizePaginationOptions(options, state.config);
              expect(result.pageSize).toBe(Number(row.expectedPageSize));
            }
          }
        );
      });

      RuleScenario("Rounds floating-point page sizes down", ({ Given, When }) => {
        Given(
          "a pagination config with defaultPageSize {int} and maxPageSize {int}",
          (_ctx: unknown, defaultPageSize: number, maxPageSize: number) => {
            state.config = { defaultPageSize, maxPageSize };
          }
        );

        When(
          "I normalize pagination options with float pageSize values:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              pageSize: string;
              expected: string;
            }>(dataTable);
            for (const row of rows) {
              const pageSize = Number(row.pageSize);
              const result = normalizePaginationOptions({ pageSize }, state.config);
              expect(result.pageSize).toBe(Number(row.expected));
            }
          }
        );
      });
    }
  );

  // ==========================================================================
  // createEmptyPage
  // ==========================================================================

  Rule("createEmptyPage creates a done page with no items", ({ RuleScenario }) => {
    RuleScenario("Creates an empty page with correct structure", ({ When, Then, And }) => {
      When("I create an empty page", () => {
        state.page = createEmptyPage<{ id: string }>();
      });

      Then("the page has {int} items", (_ctx: unknown, count: number) => {
        expect(state.page.page).toHaveLength(count);
      });

      And("the page continueCursor is null", () => {
        expect(state.page.continueCursor).toBeNull();
      });

      And("the page isDone is true", () => {
        expect(state.page.isDone).toBe(true);
      });
    });

    RuleScenario("Preserves type information with empty array", ({ When, Then }) => {
      When("I create an empty page", () => {
        state.page = createEmptyPage<{ id: string; status: string }>();
      });

      Then("the page items is an array with length 0", () => {
        expect(Array.isArray(state.page.page)).toBe(true);
        expect(state.page.page).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // createPagedResult
  // ==========================================================================

  Rule("createPagedResult creates a page with items and continuation state", ({ RuleScenario }) => {
    RuleScenario("Creates a page with items and cursor", ({ Given, When, Then, And }) => {
      Given(
        "items with ids {string}, {string}, {string}",
        (_ctx: unknown, id1: string, id2: string, id3: string) => {
          state.items = [{ id: id1 }, { id: id2 }, { id: id3 }];
        }
      );

      When(
        "I create a paged result with pageSize {int} and cursor {string}",
        (_ctx: unknown, pageSize: number, cursor: string) => {
          state.page = createPagedResult(state.items, pageSize, cursor);
        }
      );

      Then("the page has {int} items", (_ctx: unknown, count: number) => {
        expect(state.page.page).toHaveLength(count);
      });

      And("the page continueCursor is {string}", (_ctx: unknown, cursor: string) => {
        expect(state.page.continueCursor).toBe(cursor);
      });

      And("the page isDone is false", () => {
        expect(state.page.isDone).toBe(false);
      });
    });

    RuleScenario("Creates a done page when cursor is null", ({ Given, When, Then, And }) => {
      Given("items with ids {string}, {string}", (_ctx: unknown, id1: string, id2: string) => {
        state.items = [{ id: id1 }, { id: id2 }];
      });

      When(
        "I create a paged result with pageSize {int} and null cursor",
        (_ctx: unknown, pageSize: number) => {
          state.page = createPagedResult(state.items, pageSize, null);
        }
      );

      Then("the page items match the input items", () => {
        expect(state.page.page).toEqual(state.items);
      });

      And("the page continueCursor is null", () => {
        expect(state.page.continueCursor).toBeNull();
      });

      And("the page isDone is true", () => {
        expect(state.page.isDone).toBe(true);
      });
    });

    RuleScenario("Handles empty items array with null cursor", ({ When, Then, And }) => {
      When("I create a paged result with no items and null cursor", () => {
        state.page = createPagedResult([], 10, null);
      });

      Then("the page has {int} items", (_ctx: unknown, count: number) => {
        expect(state.page.page).toHaveLength(count);
      });

      And("the page isDone is true", () => {
        expect(state.page.isDone).toBe(true);
      });
    });
  });

  // ==========================================================================
  // encodeCursor / decodeCursor - round-trip
  // ==========================================================================

  Rule("encodeCursor and decodeCursor round-trip arbitrary position data", ({ RuleScenario }) => {
    RuleScenario("Encodes and decodes simple position data", ({ Given, When, Then }) => {
      Given(
        "a cursor position with offset {int} and lastId {string}",
        (_ctx: unknown, offset: number, lastId: string) => {
          state.cursorPosition = { offset, lastId };
        }
      );

      When("I encode and decode the cursor position", () => {
        const cursor = encodeCursor(state.cursorPosition);
        state.decodedPosition = decodeCursor<typeof state.cursorPosition>(cursor);
      });

      Then("the decoded position matches the original", () => {
        expect(state.decodedPosition).toEqual(state.cursorPosition);
      });
    });

    RuleScenario("Encodes and decodes complex position data", ({ Given, When, Then }) => {
      Given("a cursor position with globalPosition, streamId, and timestamp", () => {
        state.cursorPosition = {
          globalPosition: 12345678,
          streamId: "order-123",
          timestamp: Date.now(),
        };
      });

      When("I encode and decode the cursor position", () => {
        const cursor = encodeCursor(state.cursorPosition);
        state.decodedPosition = decodeCursor<typeof state.cursorPosition>(cursor);
      });

      Then("the decoded position matches the original", () => {
        expect(state.decodedPosition).toEqual(state.cursorPosition);
      });
    });

    RuleScenario("Produces base64-encoded string", ({ Given, When, Then }) => {
      Given("a cursor position with offset {int}", (_ctx: unknown, offset: number) => {
        state.cursorPosition = { offset };
      });

      When("I encode the cursor position", () => {
        state.encodedCursor = encodeCursor(state.cursorPosition);
      });

      Then("the encoded cursor is valid base64", () => {
        expect(() => Buffer.from(state.encodedCursor!, "base64")).not.toThrow();
      });
    });

    RuleScenario("Round-trips various data shapes", ({ When, Then }) => {
      When("I encode and decode each data shape:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ shape: string }>(dataTable);
        state.dataShapeResults = rows.map((row) => {
          const original = getDataShape(row.shape);
          const cursor = encodeCursor(original);
          const decoded = decodeCursor(cursor);
          return { shape: row.shape, original, decoded };
        });
      });

      Then("all decoded shapes match their originals", () => {
        for (const entry of state.dataShapeResults) {
          expect(entry.decoded).toEqual(entry.original);
        }
      });
    });
  });

  // ==========================================================================
  // decodeCursor - invalid inputs
  // ==========================================================================

  Rule("decodeCursor returns null for invalid or missing input", ({ RuleScenario }) => {
    RuleScenario("Returns null for invalid cursor inputs", ({ When, Then }) => {
      When("I decode invalid cursor values:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          input: string;
          description: string;
        }>(dataTable);
        state.decodedResults = rows.map((row) => {
          let input: string | undefined;
          if (row.input === "__undefined__") {
            input = undefined;
          } else if (row.input === "__empty__") {
            input = "";
          } else if (row.input === "__invalid_json__") {
            input = Buffer.from("not json").toString("base64");
          } else {
            input = row.input;
          }
          return {
            input: row.input,
            result: decodeCursor(input),
          };
        });
      });

      Then("all decoded results are null", () => {
        for (const entry of state.decodedResults) {
          expect(entry.result).toBeNull();
        }
      });
    });

    RuleScenario(
      "Returns null for base64 with invalid characters in middle or end",
      ({ When, Then }) => {
        When(
          "I decode cursors with invalid base64 characters:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ cursor: string }>(dataTable);
            state.decodedResults = rows.map((row) => ({
              input: row.cursor,
              result: decodeCursor(row.cursor),
            }));
          }
        );

        Then("all decoded results are null", () => {
          for (const entry of state.decodedResults) {
            expect(entry.result).toBeNull();
          }
        });
      }
    );

    RuleScenario("Returns null for truncated UTF-8 sequences", ({ When, Then }) => {
      When("I decode the cursor {string}", (_ctx: unknown, cursor: string) => {
        state.decodedPosition = decodeCursor(cursor);
      });

      Then("the decoded result is null", () => {
        expect(state.decodedPosition).toBeNull();
      });
    });
  });

  // ==========================================================================
  // isValidPageSize
  // ==========================================================================

  Rule("isValidPageSize validates integer page sizes within bounds", ({ RuleScenario }) => {
    RuleScenario("Returns true for valid page sizes", ({ Then }) => {
      Then("these page sizes are valid:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ size: string }>(dataTable);
        for (const row of rows) {
          expect(isValidPageSize(Number(row.size))).toBe(true);
        }
      });
    });

    RuleScenario("Returns false for invalid page sizes", ({ Then }) => {
      Then("these page sizes are invalid:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          size: string;
          reason: string;
        }>(dataTable);
        for (const row of rows) {
          const size = row.size === "NaN" ? NaN : Number(row.size);
          expect(isValidPageSize(size)).toBe(false);
        }
      });
    });

    RuleScenario("Respects custom max page size", ({ Then, And }) => {
      Then(
        "page size {int} is valid with max {int}",
        (_ctx: unknown, size: number, max: number) => {
          expect(isValidPageSize(size, max)).toBe(true);
        }
      );

      And(
        "page size {int} is invalid with max {int}",
        (_ctx: unknown, size: number, max: number) => {
          expect(isValidPageSize(size, max)).toBe(false);
        }
      );
    });
  });

  // ==========================================================================
  // getEffectivePageSize
  // ==========================================================================

  Rule("getEffectivePageSize returns clamped page size with defaults", ({ RuleScenario }) => {
    RuleScenario("Returns requested size when valid", ({ Then }) => {
      Then(
        "effective page size for requested {int} is {int}",
        (_ctx: unknown, requested: number, expected: number) => {
          expect(getEffectivePageSize(requested)).toBe(expected);
        }
      );
    });

    RuleScenario("Returns default when not specified", ({ Then }) => {
      Then("effective page size for undefined is DEFAULT_PAGE_SIZE", () => {
        expect(getEffectivePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
      });
    });

    RuleScenario("Caps at max and enforces minimum", ({ Then }) => {
      Then("these effective page sizes are correct:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          requested: string;
          expected: string;
        }>(dataTable);
        for (const row of rows) {
          const requested = Number(row.requested);
          expect(getEffectivePageSize(requested)).toBe(Number(row.expected));
        }
      });
    });

    RuleScenario("Uses custom default and max sizes", ({ Then }) => {
      Then(
        "these effective page sizes with custom config are correct:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            requested: string;
            defaultSize: string;
            maxSize: string;
            expected: string;
          }>(dataTable);
          for (const row of rows) {
            const requested = row.requested === "__undefined__" ? undefined : Number(row.requested);
            const defaultSize = Number(row.defaultSize);
            const maxSize = Number(row.maxSize);
            expect(getEffectivePageSize(requested, defaultSize, maxSize)).toBe(
              Number(row.expected)
            );
          }
        }
      );
    });

    RuleScenario("Rounds floating-point sizes down", ({ Then }) => {
      Then("these effective page sizes are correct:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          requested: string;
          expected: string;
        }>(dataTable);
        for (const row of rows) {
          const requested = Number(row.requested);
          expect(getEffectivePageSize(requested)).toBe(Number(row.expected));
        }
      });
    });
  });

  // ==========================================================================
  // Pagination Workflow
  // ==========================================================================

  Rule("Pagination workflow supports multi-page traversal and edge cases", ({ RuleScenario }) => {
    RuleScenario("Simulates complete pagination flow", ({ Given, When, Then, And }) => {
      Given(
        "items for page 1 with ids {string}, {string}, {string} and encoded cursor offset {int}",
        (_ctx: unknown, id1: string, id2: string, id3: string, offset: number) => {
          state.items = [{ id: id1 }, { id: id2 }, { id: id3 }];
          state.page1Cursor = encodeCursor({ offset });
        }
      );

      When("I create a paged result for page 1", () => {
        state.page1 = createPagedResult(state.items, 3, state.page1Cursor);
      });

      Then("page 1 isDone is false", () => {
        expect(state.page1.isDone).toBe(false);
      });

      And("the decoded cursor offset is {int}", (_ctx: unknown, expected: number) => {
        const position = decodeCursor<{ offset: number }>(state.page1.continueCursor!);
        expect(position?.offset).toBe(expected);
      });

      When("I create a final page with item id {string}", (_ctx: unknown, id: string) => {
        state.page2 = createPagedResult([{ id }], 3, null);
      });

      Then("page 2 isDone is true", () => {
        expect(state.page2.isDone).toBe(true);
      });

      And("page 2 continueCursor is null", () => {
        expect(state.page2.continueCursor).toBeNull();
      });
    });

    RuleScenario("Handles empty result set", ({ When, Then, And }) => {
      When("I create an empty page", () => {
        state.page = createEmptyPage<{ id: string }>();
      });

      Then("the page has {int} items", (_ctx: unknown, count: number) => {
        expect(state.page.page).toHaveLength(count);
      });

      And("the page isDone is true", () => {
        expect(state.page.isDone).toBe(true);
      });
    });

    RuleScenario(
      "Handles exact page size match with continuation",
      ({ Given, When, Then, And }) => {
        Given(
          "items for page 1 with ids {string}, {string}, {string} and encoded cursor offset {int}",
          (_ctx: unknown, id1: string, id2: string, id3: string, offset: number) => {
            state.items = [{ id: id1 }, { id: id2 }, { id: id3 }];
            state.page1Cursor = encodeCursor({ offset });
          }
        );

        When("I create a paged result for page 1", () => {
          state.page1 = createPagedResult(state.items, 3, state.page1Cursor);
          state.page = state.page1;
        });

        Then("the page has {int} items", (_ctx: unknown, count: number) => {
          expect(state.page.page).toHaveLength(count);
        });

        And("page 1 isDone is false", () => {
          expect(state.page1.isDone).toBe(false);
        });
      }
    );
  });
});
