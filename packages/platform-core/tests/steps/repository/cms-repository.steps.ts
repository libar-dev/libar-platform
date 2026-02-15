/**
 * CMS Repository - Step Definitions
 *
 * BDD step definitions for CMS repository factory and error types:
 * - createCMSRepository: Factory for typed repositories with upcast support
 * - NotFoundError: Entity not found errors
 * - VersionConflictError: OCC failures
 *
 * Mechanical migration from tests/unit/repository/CMSRepository.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import { createCMSRepository, NotFoundError, VersionConflictError } from "../../../src/repository";
import type { BaseCMS, CMSLoadResult } from "../../../src/cms/types";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test CMS Type
// =============================================================================

interface TestCMS extends BaseCMS {
  testId: string;
  name: string;
  stateVersion: number;
  version: number;
}

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockDb() {
  const mockFirst = vi.fn<[], Promise<Record<string, unknown> | null>>();
  const mockWithIndex = vi.fn().mockReturnValue({ first: mockFirst });
  const mockQuery = vi.fn().mockReturnValue({ withIndex: mockWithIndex });
  const mockInsert = vi.fn<[string, Record<string, unknown>], Promise<string>>();
  const mockPatch = vi.fn<[unknown, Record<string, unknown>], Promise<void>>();
  const mockGet = vi.fn<[unknown], Promise<Record<string, unknown> | null>>();

  return {
    db: {
      query: mockQuery,
      insert: mockInsert,
      patch: mockPatch,
      get: mockGet,
    },
    mocks: {
      query: mockQuery,
      withIndex: mockWithIndex,
      first: mockFirst,
      insert: mockInsert,
      patch: mockPatch,
      get: mockGet,
    },
  };
}

function createMockUpcast() {
  return vi.fn<[unknown], CMSLoadResult<TestCMS>>().mockImplementation((raw) => ({
    cms: raw as TestCMS,
    wasUpcasted: false,
    originalStateVersion: (raw as TestCMS).stateVersion ?? 1,
  }));
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  mockDb: ReturnType<typeof createMockDb>;
  mockUpcast: ReturnType<typeof createMockUpcast>;
  repo: ReturnType<typeof createCMSRepository<TestCMS>>;
  loadResult: Awaited<ReturnType<ReturnType<typeof createCMSRepository<TestCMS>>["load"]>> | null;
  tryLoadResult: Awaited<
    ReturnType<ReturnType<typeof createCMSRepository<TestCMS>>["tryLoad"]>
  > | null;
  existsResult: boolean | null;
  loadManyResult: Awaited<
    ReturnType<ReturnType<typeof createCMSRepository<TestCMS>>["loadMany"]>
  > | null;
  insertResult: string | null;
  caughtError: unknown;
  cmsRecord: TestCMS | null;
  notFoundError: NotFoundError | null;
  versionConflictError: VersionConflictError | null;
}

function createInitialState(): TestState {
  const mockDb = createMockDb();
  const mockUpcast = createMockUpcast();
  const repo = createCMSRepository<TestCMS>({
    table: "testCMS",
    idField: "testId",
    index: "by_testId",
    upcast: mockUpcast,
  });

  return {
    mockDb,
    mockUpcast,
    repo,
    loadResult: null,
    tryLoadResult: null,
    existsResult: null,
    loadManyResult: null,
    insertResult: null,
    caughtError: null,
    cmsRecord: null,
    notFoundError: null,
    versionConflictError: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/repository/cms-repository.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: load retrieves and upcasts a CMS entity by ID
  // ==========================================================================

  Rule("load retrieves and upcasts a CMS entity by ID", ({ RuleScenario }) => {
    RuleScenario("Load and upcast CMS by entity ID", ({ Given, When, Then, And }) => {
      Given('a raw CMS document exists with testId "test_456" and docId "doc_123"', () => {
        const rawCMS = {
          _id: "doc_123",
          testId: "test_456",
          name: "Test Entity",
          stateVersion: 1,
          version: 5,
        };
        state.mockDb.mocks.first.mockResolvedValue(rawCMS);
      });

      When('I load the entity with ID "test_456"', async () => {
        state.loadResult = await state.repo.load(state.mockDb, "test_456");
      });

      Then("the load result has all expected fields:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ field: string; value: string }>(dataTable);
        for (const row of rows) {
          if (row.field === "_id") {
            expect(state.loadResult!._id).toBe(row.value);
          } else if (row.field === "testId") {
            expect(state.loadResult!.cms.testId).toBe(row.value);
          }
        }
      });

      And('the query was called with table "testCMS" and index "by_testId"', () => {
        expect(state.mockDb.mocks.query).toHaveBeenCalledWith("testCMS");
        expect(state.mockDb.mocks.withIndex).toHaveBeenCalledWith(
          "by_testId",
          expect.any(Function)
        );
      });

      And("the upcast function was called with the raw document", () => {
        expect(state.mockUpcast).toHaveBeenCalledWith(
          expect.objectContaining({ _id: "doc_123", testId: "test_456" })
        );
      });
    });

    RuleScenario("Load throws NotFoundError for missing entity", ({ Given, When, Then }) => {
      Given("no CMS document exists for the query", () => {
        state.mockDb.mocks.first.mockResolvedValue(null);
      });

      When('I attempt to load the entity with ID "nonexistent"', async () => {
        try {
          await state.repo.load(state.mockDb, "nonexistent");
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then('a NotFoundError is thrown with message "testCMS not found: nonexistent"', () => {
        expect(state.caughtError).toBeInstanceOf(NotFoundError);
        expect((state.caughtError as Error).message).toBe("testCMS not found: nonexistent");
      });
    });

    RuleScenario("Load returns upcast metadata", ({ Given, And, When, Then }) => {
      Given('a raw CMS document exists with testId "test_456" and docId "doc_123"', () => {
        const rawCMS = {
          _id: "doc_123",
          testId: "test_456",
          name: "Test",
          stateVersion: 1,
          version: 1,
        };
        state.mockDb.mocks.first.mockResolvedValue(rawCMS);
      });

      And("the upcast function returns wasUpcasted true and originalStateVersion 1", () => {
        state.mockUpcast.mockReturnValue({
          cms: {
            _id: "doc_123",
            testId: "test_456",
            name: "Test",
            stateVersion: 2,
            version: 1,
          } as unknown as TestCMS,
          wasUpcasted: true,
          originalStateVersion: 1,
        });
      });

      When('I load the entity with ID "test_456"', async () => {
        state.loadResult = await state.repo.load(state.mockDb, "test_456");
      });

      Then("the load result wasUpcasted is true", () => {
        expect(state.loadResult!.wasUpcasted).toBe(true);
      });

      And("the load result originalStateVersion is 1", () => {
        expect(state.loadResult!.originalStateVersion).toBe(1);
      });
    });

    RuleScenario("Load propagates upcast errors", ({ Given, And, When, Then }) => {
      Given('a raw CMS document exists with testId "test_456" and docId "doc_123"', () => {
        const rawCMS = {
          _id: "doc_123",
          testId: "test_456",
          name: "Test Entity",
          stateVersion: 1,
          version: 5,
        };
        state.mockDb.mocks.first.mockResolvedValue(rawCMS);
      });

      And('the upcast function throws "Upcast failed: invalid state"', () => {
        state.mockUpcast.mockImplementation(() => {
          throw new Error("Upcast failed: invalid state");
        });
      });

      When('I attempt to load the entity with ID "test_456"', async () => {
        try {
          await state.repo.load(state.mockDb, "test_456");
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then('an error is thrown with message "Upcast failed: invalid state"', () => {
        expect(state.caughtError).toBeInstanceOf(Error);
        expect((state.caughtError as Error).message).toBe("Upcast failed: invalid state");
      });
    });
  });

  // ==========================================================================
  // Rule: tryLoad returns null instead of throwing for missing entities
  // ==========================================================================

  Rule("tryLoad returns null instead of throwing for missing entities", ({ RuleScenario }) => {
    RuleScenario("tryLoad returns CMS when entity exists", ({ Given, When, Then, And }) => {
      Given('a raw CMS document exists with testId "test_456" and docId "doc_123"', () => {
        const rawCMS = {
          _id: "doc_123",
          testId: "test_456",
          name: "Test Entity",
          stateVersion: 1,
          version: 3,
        };
        state.mockDb.mocks.first.mockResolvedValue(rawCMS);
      });

      When('I tryLoad the entity with ID "test_456"', async () => {
        state.tryLoadResult = await state.repo.tryLoad(state.mockDb, "test_456");
      });

      Then("the tryLoad result is not null", () => {
        expect(state.tryLoadResult).not.toBeNull();
      });

      And('the tryLoad result has docId "doc_123" and testId "test_456"', () => {
        expect(state.tryLoadResult?._id).toBe("doc_123");
        expect(state.tryLoadResult?.cms.testId).toBe("test_456");
      });
    });

    RuleScenario("tryLoad returns null when entity does not exist", ({ Given, When, Then }) => {
      Given("no CMS document exists for the query", () => {
        state.mockDb.mocks.first.mockResolvedValue(null);
      });

      When('I tryLoad the entity with ID "nonexistent"', async () => {
        state.tryLoadResult = await state.repo.tryLoad(state.mockDb, "nonexistent");
      });

      Then("the tryLoad result is null", () => {
        expect(state.tryLoadResult).toBeNull();
      });
    });

    RuleScenario("tryLoad resolves to null without throwing", ({ Given, When, Then }) => {
      Given("no CMS document exists for the query", () => {
        state.mockDb.mocks.first.mockResolvedValue(null);
      });

      When('I tryLoad the entity with ID "nonexistent"', async () => {
        state.tryLoadResult = await state.repo.tryLoad(state.mockDb, "nonexistent");
      });

      Then("the tryLoad promise resolves to null", () => {
        expect(state.tryLoadResult).toBeNull();
      });
    });

    RuleScenario("tryLoad propagates upcast errors", ({ Given, And, When, Then }) => {
      Given('a raw CMS document exists with testId "test_456" and docId "doc_123"', () => {
        const rawCMS = {
          _id: "doc_123",
          testId: "test_456",
          name: "Test Entity",
          stateVersion: 1,
          version: 1,
        };
        state.mockDb.mocks.first.mockResolvedValue(rawCMS);
      });

      And('the upcast function throws "Invalid CMS state during upcast"', () => {
        state.mockUpcast.mockImplementation(() => {
          throw new Error("Invalid CMS state during upcast");
        });
      });

      When('I attempt to tryLoad the entity with ID "test_456"', async () => {
        try {
          await state.repo.tryLoad(state.mockDb, "test_456");
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then('an error is thrown with message "Invalid CMS state during upcast"', () => {
        expect(state.caughtError).toBeInstanceOf(Error);
        expect((state.caughtError as Error).message).toBe("Invalid CMS state during upcast");
      });
    });
  });

  // ==========================================================================
  // Rule: exists checks entity presence without upcast overhead
  // ==========================================================================

  Rule("exists checks entity presence without upcast overhead", ({ RuleScenario }) => {
    RuleScenario("exists returns true when entity exists", ({ Given, When, Then, And }) => {
      Given('a raw CMS document exists with testId "test_456" and docId "doc_123"', () => {
        const rawCMS = {
          _id: "doc_123",
          testId: "test_456",
          name: "Test Entity",
          stateVersion: 1,
          version: 1,
        };
        state.mockDb.mocks.first.mockResolvedValue(rawCMS);
      });

      When('I check if entity "test_456" exists', async () => {
        state.existsResult = await state.repo.exists(state.mockDb, "test_456");
      });

      Then("the exists result is true", () => {
        expect(state.existsResult).toBe(true);
      });

      And('the query was called with table "testCMS" and index "by_testId"', () => {
        expect(state.mockDb.mocks.query).toHaveBeenCalledWith("testCMS");
        expect(state.mockDb.mocks.withIndex).toHaveBeenCalledWith(
          "by_testId",
          expect.any(Function)
        );
      });
    });

    RuleScenario("exists returns false when entity does not exist", ({ Given, When, Then }) => {
      Given("no CMS document exists for the query", () => {
        state.mockDb.mocks.first.mockResolvedValue(null);
      });

      When('I check if entity "nonexistent" exists', async () => {
        state.existsResult = await state.repo.exists(state.mockDb, "nonexistent");
      });

      Then("the exists result is false", () => {
        expect(state.existsResult).toBe(false);
      });
    });

    RuleScenario("exists does not call upcast function", ({ Given, When, Then }) => {
      Given('a raw CMS document exists with testId "test_456" and docId "doc_123"', () => {
        const rawCMS = {
          _id: "doc_123",
          testId: "test_456",
          name: "Test Entity",
          stateVersion: 1,
          version: 1,
        };
        state.mockDb.mocks.first.mockResolvedValue(rawCMS);
      });

      When('I check if entity "test_456" exists', async () => {
        await state.repo.exists(state.mockDb, "test_456");
      });

      Then("the upcast function was not called", () => {
        expect(state.mockUpcast).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Rule: loadMany retrieves multiple entities in parallel with null for missing
  // ==========================================================================

  Rule(
    "loadMany retrieves multiple entities in parallel with null for missing",
    ({ RuleScenario }) => {
      RuleScenario("loadMany loads multiple entities in parallel", ({ Given, When, Then, And }) => {
        Given("raw CMS documents exist for IDs:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ testId: string; docId: string }>(dataTable);
          for (const row of rows) {
            const rawCMS = {
              _id: row.docId,
              testId: row.testId,
              name: `Entity ${row.testId}`,
              stateVersion: 1,
              version: 1,
            };
            state.mockDb.mocks.first.mockResolvedValueOnce(rawCMS);
          }
        });

        When('I loadMany with IDs "test_1,test_2"', async () => {
          state.loadManyResult = await state.repo.loadMany(state.mockDb, ["test_1", "test_2"]);
        });

        Then("the loadMany result has length 2", () => {
          expect(state.loadManyResult).toHaveLength(2);
        });

        And("the loadMany results match:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ index: string; docId: string; testId: string }>(
            dataTable
          );
          for (const row of rows) {
            const idx = Number(row.index);
            expect(state.loadManyResult![idx]?._id).toBe(row.docId);
            expect(state.loadManyResult![idx]?.cms.testId).toBe(row.testId);
          }
        });
      });

      RuleScenario("loadMany returns null for missing entities", ({ Given, When, Then, And }) => {
        Given("raw CMS documents exist with gaps:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ testId: string; docId: string; exists: string }>(
            dataTable
          );
          for (const row of rows) {
            if (row.exists === "true") {
              const rawCMS = {
                _id: row.docId,
                testId: row.testId,
                name: `Entity ${row.testId}`,
                stateVersion: 1,
                version: 1,
              };
              state.mockDb.mocks.first.mockResolvedValueOnce(rawCMS);
            } else {
              state.mockDb.mocks.first.mockResolvedValueOnce(null);
            }
          }
        });

        When('I loadMany with IDs "test_1,missing,test_3"', async () => {
          state.loadManyResult = await state.repo.loadMany(state.mockDb, [
            "test_1",
            "missing",
            "test_3",
          ]);
        });

        Then("the loadMany result has length 3", () => {
          expect(state.loadManyResult).toHaveLength(3);
        });

        And("the loadMany result at index 0 is not null", () => {
          expect(state.loadManyResult![0]).not.toBeNull();
        });

        And("the loadMany result at index 1 is null", () => {
          expect(state.loadManyResult![1]).toBeNull();
        });

        And("the loadMany result at index 2 is not null", () => {
          expect(state.loadManyResult![2]).not.toBeNull();
        });
      });

      RuleScenario("loadMany returns empty array for empty input", ({ When, Then, And }) => {
        When("I loadMany with an empty ID list", async () => {
          state.loadManyResult = await state.repo.loadMany(state.mockDb, []);
        });

        Then("the loadMany result is an empty array", () => {
          expect(state.loadManyResult).toEqual([]);
        });

        And("the query was not called", () => {
          expect(state.mockDb.mocks.query).not.toHaveBeenCalled();
        });
      });

      RuleScenario("loadMany upcasts all loaded entities", ({ Given, When, Then }) => {
        Given("raw CMS documents exist for IDs:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ testId: string; docId: string }>(dataTable);
          for (const row of rows) {
            const rawCMS = {
              _id: row.docId,
              testId: row.testId,
              name: `Entity ${row.testId}`,
              stateVersion: 1,
              version: 1,
            };
            state.mockDb.mocks.first.mockResolvedValueOnce(rawCMS);
          }
        });

        When('I loadMany with IDs "test_1,test_2"', async () => {
          await state.repo.loadMany(state.mockDb, ["test_1", "test_2"]);
        });

        Then("the upcast function was called 2 times", () => {
          expect(state.mockUpcast).toHaveBeenCalledTimes(2);
        });
      });

      RuleScenario("loadMany preserves order of input IDs", ({ Given, When, Then }) => {
        Given("raw CMS documents exist for IDs:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ testId: string; docId: string }>(dataTable);
          for (const row of rows) {
            const rawCMS = {
              _id: row.docId,
              testId: row.testId,
              name: row.testId.toUpperCase(),
              stateVersion: 1,
              version: 1,
            };
            state.mockDb.mocks.first.mockResolvedValueOnce(rawCMS);
          }
        });

        When('I loadMany with IDs "a,b,c"', async () => {
          state.loadManyResult = await state.repo.loadMany(state.mockDb, ["a", "b", "c"]);
        });

        Then("the loadMany results are in order:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ index: string; testId: string }>(dataTable);
          for (const row of rows) {
            const idx = Number(row.index);
            expect(state.loadManyResult![idx]?.cms.testId).toBe(row.testId);
          }
        });
      });

      RuleScenario(
        "loadMany propagates upcast errors for any entity",
        ({ Given, And, When, Then }) => {
          Given("raw CMS documents exist for IDs:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ testId: string; docId: string }>(dataTable);
            for (const row of rows) {
              const rawCMS = {
                _id: row.docId,
                testId: row.testId,
                name: `Entity ${row.testId}`,
                stateVersion: 1,
                version: 1,
              };
              state.mockDb.mocks.first.mockResolvedValueOnce(rawCMS);
            }
          });

          And('the upcast function succeeds then throws "Upcast failed for second entity"', () => {
            const rawCMS1 = {
              _id: "doc_1",
              testId: "test_1",
              name: "Entity test_1",
              stateVersion: 1,
              version: 1,
            };
            state.mockUpcast
              .mockReturnValueOnce({
                cms: rawCMS1 as TestCMS,
                wasUpcasted: false,
                originalStateVersion: 1,
              })
              .mockImplementationOnce(() => {
                throw new Error("Upcast failed for second entity");
              });
          });

          When('I attempt to loadMany with IDs "test_1,test_2"', async () => {
            try {
              await state.repo.loadMany(state.mockDb, ["test_1", "test_2"]);
            } catch (e) {
              state.caughtError = e;
            }
          });

          Then('an error is thrown with message "Upcast failed for second entity"', () => {
            expect(state.caughtError).toBeInstanceOf(Error);
            expect((state.caughtError as Error).message).toBe("Upcast failed for second entity");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: insert persists a new CMS record and returns the document ID
  // ==========================================================================

  Rule("insert persists a new CMS record and returns the document ID", ({ RuleScenario }) => {
    RuleScenario(
      "insert creates CMS record and returns document ID",
      ({ Given, When, Then, And }) => {
        Given('a new CMS record with testId "test_789" and name "New Entity"', () => {
          state.cmsRecord = {
            testId: "test_789",
            name: "New Entity",
            stateVersion: 1,
            version: 0,
          };
          state.mockDb.mocks.insert.mockResolvedValue("doc_789");
        });

        When("I insert the CMS record", async () => {
          state.insertResult = await state.repo.insert(state.mockDb, state.cmsRecord!);
        });

        Then('the insert returns document ID "doc_789"', () => {
          expect(state.insertResult).toBe("doc_789");
        });

        And('the insert was called with table "testCMS"', () => {
          expect(state.mockDb.mocks.insert).toHaveBeenCalledWith("testCMS", state.cmsRecord);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: update patches CMS with optimistic concurrency control
  // ==========================================================================

  Rule("update patches CMS with optimistic concurrency control", ({ RuleScenario }) => {
    RuleScenario("update patches CMS when version matches", ({ Given, When, Then }) => {
      Given('a stored document "doc_123" with version 5', () => {
        state.mockDb.mocks.get.mockResolvedValue({
          _id: "doc_123",
          testId: "test_456",
          version: 5,
        });
      });

      When('I update document "doc_123" with name "Updated" at version 5', async () => {
        await state.repo.update(state.mockDb, "doc_123", { name: "Updated" }, 5);
      });

      Then("the patch was called with the update fields", () => {
        expect(state.mockDb.mocks.patch).toHaveBeenCalledWith("doc_123", { name: "Updated" });
      });
    });

    RuleScenario("update throws NotFoundError for missing document", ({ Given, When, Then }) => {
      Given('no stored document exists for ID "nonexistent"', () => {
        state.mockDb.mocks.get.mockResolvedValue(null);
      });

      When('I attempt to update document "nonexistent" at version 1', async () => {
        try {
          await state.repo.update(state.mockDb, "nonexistent", {}, 1);
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then("a NotFoundError is thrown", () => {
        expect(state.caughtError).toBeInstanceOf(NotFoundError);
      });
    });

    RuleScenario(
      "update throws VersionConflictError on version mismatch",
      ({ Given, When, Then }) => {
        Given('a stored document "doc_123" with version 10', () => {
          state.mockDb.mocks.get.mockResolvedValue({
            _id: "doc_123",
            testId: "test_456",
            version: 10,
          });
        });

        When('I attempt to update document "doc_123" at version 5', async () => {
          try {
            await state.repo.update(state.mockDb, "doc_123", {}, 5);
          } catch (e) {
            state.caughtError = e;
          }
        });

        Then('a VersionConflictError is thrown with message "expected 5, got 10"', () => {
          expect(state.caughtError).toBeInstanceOf(VersionConflictError);
          expect((state.caughtError as Error).message).toContain("expected 5, got 10");
        });
      }
    );
  });

  // ==========================================================================
  // Rule: NotFoundError has correct properties and type guard
  // ==========================================================================

  Rule("NotFoundError has correct properties and type guard", ({ RuleScenario }) => {
    RuleScenario("NotFoundError has correct properties", ({ When, Then }) => {
      When('I create a NotFoundError with table "orderCMS" and id "order_123"', () => {
        state.notFoundError = new NotFoundError("orderCMS", "order_123");
      });

      Then(
        "the NotFoundError has all expected properties:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
          for (const row of rows) {
            if (row.property === "name") {
              expect(state.notFoundError!.name).toBe(row.value);
            } else if (row.property === "table") {
              expect(state.notFoundError!.table).toBe(row.value);
            } else if (row.property === "id") {
              expect(state.notFoundError!.id).toBe(row.value);
            } else if (row.property === "message") {
              expect(state.notFoundError!.message).toBe(row.value);
            }
          }
        }
      );
    });

    RuleScenario("NotFoundError is instanceof Error", ({ When, Then }) => {
      When('I create a NotFoundError with table "testCMS" and id "test_1"', () => {
        state.notFoundError = new NotFoundError("testCMS", "test_1");
      });

      Then("the NotFoundError is an instance of Error", () => {
        expect(state.notFoundError).toBeInstanceOf(Error);
      });
    });

    RuleScenario("isNotFoundError type guard returns true for NotFoundError", ({ When, Then }) => {
      When('I create a NotFoundError with table "testCMS" and id "test_1"', () => {
        state.notFoundError = new NotFoundError("testCMS", "test_1");
      });

      Then("isNotFoundError returns true", () => {
        expect(NotFoundError.isNotFoundError(state.notFoundError!)).toBe(true);
      });
    });

    RuleScenario(
      "isNotFoundError type guard returns false for non-NotFoundError values",
      ({ Then }) => {
        Then("isNotFoundError returns false for:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ value: string }>(dataTable);
          for (const row of rows) {
            if (row.value === "regularError") {
              expect(NotFoundError.isNotFoundError(new Error("msg"))).toBe(false);
            } else if (row.value === "null") {
              expect(NotFoundError.isNotFoundError(null)).toBe(false);
            } else if (row.value === "string") {
              expect(NotFoundError.isNotFoundError("error")).toBe(false);
            }
          }
        });
      }
    );
  });

  // ==========================================================================
  // Rule: VersionConflictError has correct properties and type guard
  // ==========================================================================

  Rule("VersionConflictError has correct properties and type guard", ({ RuleScenario }) => {
    RuleScenario("VersionConflictError has correct properties", ({ When, Then }) => {
      When(
        'I create a VersionConflictError with table "orderCMS" id "order_123" expected 5 actual 10',
        () => {
          state.versionConflictError = new VersionConflictError("orderCMS", "order_123", 5, 10);
        }
      );

      Then(
        "the VersionConflictError has all expected properties:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ property: string; value: string }>(dataTable);
          for (const row of rows) {
            if (row.property === "name") {
              expect(state.versionConflictError!.name).toBe(row.value);
            } else if (row.property === "table") {
              expect(state.versionConflictError!.table).toBe(row.value);
            } else if (row.property === "id") {
              expect(state.versionConflictError!.id).toBe(row.value);
            } else if (row.property === "expectedVersion") {
              expect(state.versionConflictError!.expectedVersion).toBe(Number(row.value));
            } else if (row.property === "actualVersion") {
              expect(state.versionConflictError!.actualVersion).toBe(Number(row.value));
            } else if (row.property === "message") {
              expect(state.versionConflictError!.message).toBe(row.value);
            }
          }
        }
      );
    });

    RuleScenario("VersionConflictError is instanceof Error", ({ When, Then }) => {
      When(
        'I create a VersionConflictError with table "testCMS" id "test_1" expected 1 actual 2',
        () => {
          state.versionConflictError = new VersionConflictError("testCMS", "test_1", 1, 2);
        }
      );

      Then("the VersionConflictError is an instance of Error", () => {
        expect(state.versionConflictError).toBeInstanceOf(Error);
      });
    });

    RuleScenario(
      "isVersionConflictError type guard returns true for VersionConflictError",
      ({ When, Then }) => {
        When(
          'I create a VersionConflictError with table "testCMS" id "test_1" expected 1 actual 2',
          () => {
            state.versionConflictError = new VersionConflictError("testCMS", "test_1", 1, 2);
          }
        );

        Then("isVersionConflictError returns true", () => {
          expect(VersionConflictError.isVersionConflictError(state.versionConflictError!)).toBe(
            true
          );
        });
      }
    );

    RuleScenario("isVersionConflictError type guard returns false for other errors", ({ Then }) => {
      Then("isVersionConflictError returns false for:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        for (const row of rows) {
          if (row.value === "regularError") {
            expect(VersionConflictError.isVersionConflictError(new Error("msg"))).toBe(false);
          } else if (row.value === "notFoundError") {
            expect(VersionConflictError.isVersionConflictError(new NotFoundError("t", "1"))).toBe(
              false
            );
          }
        }
      });
    });
  });
});
