/**
 * CMS Upcaster Utilities - Step Definitions
 *
 * BDD step definitions for CMS schema evolution utilities:
 * - createUpcaster: Chain-based migration
 * - upcastIfNeeded: Simple single-version migration
 * - Helper migrations: addCMSFieldMigration, renameCMSFieldMigration, removeCMSFieldMigration
 * - CMSUpcasterError: Error handling
 *
 * Mechanical migration from tests/unit/cms/upcaster.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  createUpcaster,
  upcastIfNeeded,
  CMSUpcasterError,
  addCMSFieldMigration,
  renameCMSFieldMigration,
  removeCMSFieldMigration,
} from "../../../src/cms/upcaster.js";
import type { BaseCMS } from "../../../src/cms/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test CMS Types
// =============================================================================

interface TestCMSv1 extends BaseCMS {
  id: string;
  name: string;
  stateVersion: 1;
  version: number;
}

interface TestCMSv2 extends BaseCMS {
  id: string;
  name: string;
  description: string;
  stateVersion: 2;
  version: number;
}

interface TestCMSv3 extends BaseCMS {
  id: string;
  name: string;
  description: string;
  priority: "low" | "medium" | "high";
  stateVersion: 3;
  version: number;
}

// =============================================================================
// Test State
// =============================================================================

interface UpcasterResult {
  wasUpcasted: boolean;
  originalStateVersion: number;
  cms: BaseCMS & Record<string, unknown>;
}

interface TestState {
  upcaster: ((state: unknown) => UpcasterResult) | null;
  inputState: (BaseCMS & Record<string, unknown>) | null;
  result: UpcasterResult | null;
  caughtError: unknown;
  errorInstance: CMSUpcasterError | null;
  fieldMigration: ((state: BaseCMS) => BaseCMS) | null;
  fieldMigrationResult: (BaseCMS & Record<string, unknown>) | null;
}

function createInitialState(): TestState {
  return {
    upcaster: null,
    inputState: null,
    result: null,
    caughtError: null,
    errorInstance: null,
    fieldMigration: null,
    fieldMigrationResult: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/cms/upcaster.feature");

describeFeature(feature, ({ Background, Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Imports are at module level
    });
  });

  // ==========================================================================
  // createUpcaster — current version
  // ==========================================================================

  Rule("createUpcaster returns state at current version without migration", ({ RuleScenario }) => {
    RuleScenario("State at current version is returned as-is", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster from version 1 to version 2", () => {
        state.upcaster = createUpcaster<TestCMSv2>({
          currentVersion: 2,
          migrations: {
            1: (v1: unknown) => ({
              ...(v1 as TestCMSv1),
              description: "",
              stateVersion: 2,
            }),
          },
        }) as unknown as TestState["upcaster"];
      });

      And('a v2 CMS state with id "test_1" and name "Test" and description "Already at v2"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          description: "Already at v2",
          stateVersion: 2,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied", () => {
        state.result = state.upcaster!(state.inputState!) as UpcasterResult;
      });

      Then("the result was not upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(false);
      });

      And("the original state version is 2", () => {
        expect(state.result!.originalStateVersion).toBe(2);
      });

      And("the CMS state equals the input state", () => {
        expect(state.result!.cms).toEqual(state.inputState);
      });
    });
  });

  // ==========================================================================
  // createUpcaster — single migration
  // ==========================================================================

  Rule("createUpcaster applies a single migration step", ({ RuleScenario }) => {
    RuleScenario("State is migrated from v1 to v2", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster from version 1 to version 2", () => {
        state.upcaster = createUpcaster<TestCMSv2>({
          currentVersion: 2,
          migrations: {
            1: (v1: unknown) => ({
              ...(v1 as TestCMSv1),
              description: "Migrated from v1",
              stateVersion: 2,
            }),
          },
        }) as unknown as TestState["upcaster"];
      });

      And('a v1 CMS state with id "test_1" and name "Test"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied", () => {
        state.result = state.upcaster!(state.inputState!) as UpcasterResult;
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And("the original state version is 1", () => {
        expect(state.result!.originalStateVersion).toBe(1);
      });

      And("the CMS stateVersion is 2", () => {
        expect(state.result!.cms.stateVersion).toBe(2);
      });

      And('the CMS description is "Migrated from v1"', () => {
        expect(state.result!.cms.description).toBe("Migrated from v1");
      });
    });
  });

  // ==========================================================================
  // createUpcaster — multiple migrations
  // ==========================================================================

  Rule("createUpcaster applies multiple migration steps in order", ({ RuleScenario }) => {
    RuleScenario("State is migrated from v1 to v3", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster from version 1 to version 3", () => {
        state.upcaster = createUpcaster<TestCMSv3>({
          currentVersion: 3,
          migrations: {
            1: (v1: unknown) => ({
              ...(v1 as TestCMSv1),
              description: "Added in v2",
              stateVersion: 2,
            }),
            2: (v2: unknown) => ({
              ...(v2 as TestCMSv2),
              priority: "medium" as const,
              stateVersion: 3,
            }),
          },
        }) as unknown as TestState["upcaster"];
      });

      And('a v1 CMS state with id "test_1" and name "Test"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied", () => {
        state.result = state.upcaster!(state.inputState!) as UpcasterResult;
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And("the original state version is 1", () => {
        expect(state.result!.originalStateVersion).toBe(1);
      });

      And("the CMS stateVersion is 3", () => {
        expect(state.result!.cms.stateVersion).toBe(3);
      });

      And('the CMS description is "Added in v2"', () => {
        expect(state.result!.cms.description).toBe("Added in v2");
      });

      And('the CMS priority is "medium"', () => {
        expect(state.result!.cms.priority).toBe("medium");
      });
    });
  });

  // ==========================================================================
  // createUpcaster — legacy version 0
  // ==========================================================================

  Rule("createUpcaster handles legacy version 0 state", ({ RuleScenario }) => {
    RuleScenario(
      "Legacy state without stateVersion is treated as version 0",
      ({ Given, And, When, Then }) => {
        Given("a CMS upcaster from version 0 to version 2 with legacy support", () => {
          state.upcaster = createUpcaster<TestCMSv2>({
            currentVersion: 2,
            migrations: {
              0: (v0: unknown) => ({
                ...(v0 as Record<string, unknown>),
                stateVersion: 1,
              }),
              1: (v1: unknown) => ({
                ...(v1 as TestCMSv1),
                description: "Migrated from v0 to v2",
                stateVersion: 2,
              }),
            },
          }) as unknown as TestState["upcaster"];
        });

        And('a legacy CMS state with id "legacy_1" and name "Legacy"', () => {
          state.inputState = {
            id: "legacy_1",
            name: "Legacy",
            version: 1,
            // No stateVersion field
          } as BaseCMS & Record<string, unknown>;
        });

        When("the CMS upcaster is applied", () => {
          state.result = state.upcaster!(state.inputState!) as UpcasterResult;
        });

        Then("the result was upcasted", () => {
          expect(state.result!.wasUpcasted).toBe(true);
        });

        And("the original state version is 0", () => {
          expect(state.result!.originalStateVersion).toBe(0);
        });

        And("the CMS stateVersion is 2", () => {
          expect(state.result!.cms.stateVersion).toBe(2);
        });
      }
    );
  });

  // ==========================================================================
  // createUpcaster — error cases
  // ==========================================================================

  Rule("createUpcaster rejects invalid inputs and configurations", ({ RuleScenario }) => {
    RuleScenario("Null input throws CMSUpcasterError", ({ Given, When, Then, And }) => {
      Given("a CMS upcaster from version 1 to version 1 with no migrations", () => {
        state.upcaster = createUpcaster<TestCMSv1>({
          currentVersion: 1,
          migrations: {},
        }) as unknown as TestState["upcaster"];
      });

      When("the CMS upcaster is applied to null", () => {
        state.caughtError = null;
        try {
          state.upcaster!(null);
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then("it throws a CMSUpcasterError", () => {
        expect(state.caughtError).toBeInstanceOf(CMSUpcasterError);
      });

      And('the error message contains "Cannot upcast null"', () => {
        expect((state.caughtError as Error).message).toContain("Cannot upcast null");
      });
    });

    RuleScenario("Undefined input throws CMSUpcasterError", ({ Given, When, Then, And }) => {
      Given("a CMS upcaster from version 1 to version 1 with no migrations", () => {
        state.upcaster = createUpcaster<TestCMSv1>({
          currentVersion: 1,
          migrations: {},
        }) as unknown as TestState["upcaster"];
      });

      When("the CMS upcaster is applied to undefined", () => {
        state.caughtError = null;
        try {
          state.upcaster!(undefined);
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then("it throws a CMSUpcasterError", () => {
        expect(state.caughtError).toBeInstanceOf(CMSUpcasterError);
      });

      And('the error message contains "Cannot upcast null or undefined"', () => {
        expect((state.caughtError as Error).message).toContain("Cannot upcast null or undefined");
      });
    });

    RuleScenario("Incomplete migration chain throws at creation time", ({ When, Then }) => {
      When("a CMS upcaster is created with current version 3 but only a v1 migration", () => {
        state.caughtError = null;
        try {
          createUpcaster<TestCMSv3>({
            currentVersion: 3,
            migrations: {
              1: (v1: unknown) => ({
                ...(v1 as TestCMSv1),
                description: "",
                stateVersion: 2,
              }),
              // Missing migration from v2 to v3
            },
          });
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then('it throws an error containing "Missing migration for version 2"', () => {
        expect(state.caughtError).toBeDefined();
        expect((state.caughtError as Error).message).toContain("Missing migration for version 2");
      });
    });

    RuleScenario("Future state version throws CMSUpcasterError", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster from version 1 to version 1 with no migrations", () => {
        state.upcaster = createUpcaster<TestCMSv1>({
          currentVersion: 1,
          migrations: {},
        }) as unknown as TestState["upcaster"];
      });

      And("a CMS state with stateVersion 5", () => {
        state.inputState = {
          id: "future_1",
          name: "Future",
          stateVersion: 5,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied expecting an error", () => {
        state.caughtError = null;
        try {
          state.upcaster!(state.inputState!);
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then("it throws a CMSUpcasterError", () => {
        expect(state.caughtError).toBeInstanceOf(CMSUpcasterError);
      });

      And('the error message contains "is newer than current schema version 1"', () => {
        expect((state.caughtError as Error).message).toContain(
          "State version 5 is newer than current schema version 1"
        );
      });
    });

    RuleScenario("Migration function error propagates mid-chain", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster from v1 to v3 where v2-to-v3 migration throws", () => {
        state.upcaster = createUpcaster<TestCMSv3>({
          currentVersion: 3,
          migrations: {
            1: (v1: unknown) => ({
              ...(v1 as TestCMSv1),
              description: "Migrated to v2",
              stateVersion: 2,
            }),
            2: () => {
              throw new Error("Migration v2->v3 failed: data corruption detected");
            },
          },
        }) as unknown as TestState["upcaster"];
      });

      And('a v1 CMS state with id "test_1" and name "Test"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied expecting an error", () => {
        state.caughtError = null;
        try {
          state.upcaster!(state.inputState!);
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then('the error message contains "Migration v2->v3 failed: data corruption detected"', () => {
        expect((state.caughtError as Error).message).toContain(
          "Migration v2->v3 failed: data corruption detected"
        );
      });
    });

    RuleScenario("First migration function error propagates", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster from v1 to v2 where v1 migration throws", () => {
        state.upcaster = createUpcaster<TestCMSv2>({
          currentVersion: 2,
          migrations: {
            1: () => {
              throw new Error("Invalid v1 state structure");
            },
          },
        }) as unknown as TestState["upcaster"];
      });

      And('a v1 CMS state with id "test_1" and name "Test"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied expecting an error", () => {
        state.caughtError = null;
        try {
          state.upcaster!(state.inputState!);
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then('the error message contains "Invalid v1 state structure"', () => {
        expect((state.caughtError as Error).message).toContain("Invalid v1 state structure");
      });
    });
  });

  // ==========================================================================
  // upcastIfNeeded — current version
  // ==========================================================================

  Rule("upcastIfNeeded returns state at current version without migration", ({ RuleScenario }) => {
    RuleScenario(
      "State at current version is returned as-is via upcastIfNeeded",
      ({ Given, When, Then, And }) => {
        Given('a v2 CMS state with id "test_1" and description "Current version"', () => {
          state.inputState = {
            id: "test_1",
            name: "Test",
            description: "Current version",
            stateVersion: 2,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        });

        When("upcastIfNeeded is called with target version 2", () => {
          state.result = upcastIfNeeded<TestCMSv1, TestCMSv2>(state.inputState!, 2, (old) => ({
            ...old,
            description: "Should not be called",
            stateVersion: 2,
          })) as unknown as UpcasterResult;
        });

        Then("the result was not upcasted", () => {
          expect(state.result!.wasUpcasted).toBe(false);
        });

        And("the original state version is 2", () => {
          expect(state.result!.originalStateVersion).toBe(2);
        });

        And('the CMS description is "Current version"', () => {
          expect(state.result!.cms.description).toBe("Current version");
        });
      }
    );
  });

  // ==========================================================================
  // upcastIfNeeded — needs migration
  // ==========================================================================

  Rule("upcastIfNeeded applies migration when state is behind", ({ RuleScenario }) => {
    RuleScenario("State is migrated via upcastIfNeeded", ({ Given, When, Then, And }) => {
      Given('a v1 CMS state with id "test_1" and name "Test"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("upcastIfNeeded is called with target version 2 and migration", () => {
        state.result = upcastIfNeeded<TestCMSv1, TestCMSv2>(state.inputState!, 2, (old) => ({
          ...old,
          description: "Migrated",
          stateVersion: 2,
        })) as unknown as UpcasterResult;
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And("the original state version is 1", () => {
        expect(state.result!.originalStateVersion).toBe(1);
      });

      And('the CMS description is "Migrated"', () => {
        expect(state.result!.cms.description).toBe("Migrated");
      });

      And("the CMS stateVersion is 2", () => {
        expect(state.result!.cms.stateVersion).toBe(2);
      });
    });
  });

  // ==========================================================================
  // upcastIfNeeded — with validation
  // ==========================================================================

  Rule("upcastIfNeeded supports validation function", ({ RuleScenario }) => {
    RuleScenario("Validation passes when state is valid", ({ Given, When, Then, And }) => {
      Given('a v2 CMS state with id "test_1" and description "Valid"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          description: "Valid",
          stateVersion: 2,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("upcastIfNeeded is called with target version 2 and validation", () => {
        const isValid = (s: unknown): s is TestCMSv2 =>
          s !== null &&
          typeof s === "object" &&
          "description" in s &&
          typeof (s as TestCMSv2).description === "string";

        state.result = upcastIfNeeded<TestCMSv1, TestCMSv2>(
          state.inputState!,
          2,
          (old) => ({ ...old, description: "", stateVersion: 2 }),
          isValid
        ) as unknown as UpcasterResult;
      });

      Then("the result was not upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(false);
      });

      And("the CMS state equals the input state", () => {
        expect(state.result!.cms).toEqual(state.inputState);
      });
    });

    RuleScenario("Validation fails when state is invalid", ({ Given, When, Then, And }) => {
      Given("a v2 CMS state without description field", () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          // Missing description field
          stateVersion: 2,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("upcastIfNeeded is called with target version 2 and validation expecting error", () => {
        const isValid = (s: unknown): s is TestCMSv2 =>
          s !== null &&
          typeof s === "object" &&
          "description" in s &&
          typeof (s as TestCMSv2).description === "string";

        state.caughtError = null;
        try {
          upcastIfNeeded<TestCMSv1, TestCMSv2>(
            state.inputState!,
            2,
            (old) => ({ ...old, description: "", stateVersion: 2 }),
            isValid
          );
        } catch (e) {
          state.caughtError = e;
        }
      });

      Then("it throws a CMSUpcasterError", () => {
        expect(state.caughtError).toBeInstanceOf(CMSUpcasterError);
      });

      And('the error message contains "fails validation"', () => {
        expect((state.caughtError as Error).message).toContain("fails validation");
      });
    });
  });

  // ==========================================================================
  // upcastIfNeeded — future version error
  // ==========================================================================

  Rule("upcastIfNeeded rejects future state versions", ({ RuleScenario }) => {
    RuleScenario(
      "Future state version throws CMSUpcasterError via upcastIfNeeded",
      ({ Given, When, Then, And }) => {
        Given("a CMS state with stateVersion 5", () => {
          state.inputState = {
            id: "future_1",
            name: "Future",
            stateVersion: 5,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        });

        When("upcastIfNeeded is called with target version 2 expecting error", () => {
          state.caughtError = null;
          try {
            upcastIfNeeded<TestCMSv1, TestCMSv2>(state.inputState!, 2, (old) => ({
              ...old,
              description: "",
              stateVersion: 2,
            }));
          } catch (e) {
            state.caughtError = e;
          }
        });

        Then("it throws a CMSUpcasterError", () => {
          expect(state.caughtError).toBeInstanceOf(CMSUpcasterError);
        });

        And('the error message contains "is newer than expected version"', () => {
          expect((state.caughtError as Error).message).toContain("is newer than expected version");
        });
      }
    );
  });

  // ==========================================================================
  // CMSUpcasterError
  // ==========================================================================

  Rule("CMSUpcasterError captures error metadata", ({ RuleScenario }) => {
    RuleScenario("Error has correct name", ({ Given, Then }) => {
      Given('a CMSUpcasterError with code "NULL_STATE" and message "Test error"', () => {
        state.errorInstance = new CMSUpcasterError("NULL_STATE", "Test error");
      });

      Then('the error name is "CMSUpcasterError"', () => {
        expect(state.errorInstance!.name).toBe("CMSUpcasterError");
      });
    });

    RuleScenario("Error has correct code", ({ Given, Then }) => {
      Given('a CMSUpcasterError with code "MISSING_MIGRATION" and message "Test error"', () => {
        state.errorInstance = new CMSUpcasterError("MISSING_MIGRATION", "Test error");
      });

      Then('the error code is "MISSING_MIGRATION"', () => {
        expect(state.errorInstance!.code).toBe("MISSING_MIGRATION");
      });
    });

    RuleScenario("Error has correct message", ({ Given, Then }) => {
      Given('a CMSUpcasterError with code "INVALID_STATE" and message "Custom message"', () => {
        state.errorInstance = new CMSUpcasterError("INVALID_STATE", "Custom message");
      });

      Then('the error message text is "Custom message"', () => {
        expect(state.errorInstance!.message).toBe("Custom message");
      });
    });

    RuleScenario("Error stores context when provided", ({ Given, Then }) => {
      Given(
        'a CMSUpcasterError with code "INVALID_STATE" and message "Error" and context:',
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
          const context: Record<string, unknown> = {};
          for (const row of rows) {
            const numVal = Number(row.value);
            context[row.key] = isNaN(numVal) ? row.value : numVal;
          }
          state.errorInstance = new CMSUpcasterError("INVALID_STATE", "Error", context);
        }
      );

      Then("the error context matches:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ key: string; value: string }>(dataTable);
        for (const row of rows) {
          const numVal = Number(row.value);
          const expected = isNaN(numVal) ? row.value : numVal;
          expect((state.errorInstance!.context as Record<string, unknown>)[row.key]).toEqual(
            expected
          );
        }
      });
    });

    RuleScenario("Error has undefined context when not provided", ({ Given, Then }) => {
      Given('a CMSUpcasterError with code "NULL_STATE" and message "Error"', () => {
        state.errorInstance = new CMSUpcasterError("NULL_STATE", "Error");
      });

      Then("the error context is undefined", () => {
        expect(state.errorInstance!.context).toBeUndefined();
      });
    });

    RuleScenario("Error is instanceof Error", ({ Given, Then }) => {
      Given('a CMSUpcasterError with code "NULL_STATE" and message "Error"', () => {
        state.errorInstance = new CMSUpcasterError("NULL_STATE", "Error");
      });

      Then("the error is an instance of Error", () => {
        expect(state.errorInstance).toBeInstanceOf(Error);
      });
    });
  });

  // ==========================================================================
  // createUpcaster with validate
  // ==========================================================================

  Rule("createUpcaster supports post-migration validation", ({ RuleScenario }) => {
    RuleScenario("Validation passes for current version state", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster with validation that checks description is a string", () => {
        const isValidV2 = (s: unknown): s is TestCMSv2 =>
          s !== null &&
          typeof s === "object" &&
          "description" in s &&
          typeof (s as TestCMSv2).description === "string";

        state.upcaster = createUpcaster<TestCMSv2>({
          currentVersion: 2,
          migrations: {
            1: (v1: unknown) => ({
              ...(v1 as TestCMSv1),
              description: "Migrated",
              stateVersion: 2,
            }),
          },
          validate: isValidV2,
        }) as unknown as TestState["upcaster"];
      });

      And('a v2 CMS state with id "test_1" and description "Valid"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          description: "Valid",
          stateVersion: 2,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied", () => {
        state.result = state.upcaster!(state.inputState!) as UpcasterResult;
      });

      Then("the result was not upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(false);
      });

      And("the CMS state equals the input state", () => {
        expect(state.result!.cms).toEqual(state.inputState);
      });
    });

    RuleScenario(
      "Validation fails for current version state with empty description",
      ({ Given, And, When, Then }) => {
        Given("a CMS upcaster with validation that checks description is non-empty", () => {
          const isValidV2 = (s: unknown): s is TestCMSv2 =>
            s !== null &&
            typeof s === "object" &&
            "description" in s &&
            typeof (s as TestCMSv2).description === "string" &&
            (s as TestCMSv2).description.length > 0;

          state.upcaster = createUpcaster<TestCMSv2>({
            currentVersion: 2,
            migrations: {
              1: (v1: unknown) => ({
                ...(v1 as TestCMSv1),
                description: "",
                stateVersion: 2,
              }),
            },
            validate: isValidV2,
          }) as unknown as TestState["upcaster"];
        });

        And('a v2 CMS state with id "test_1" and description ""', () => {
          state.inputState = {
            id: "test_1",
            name: "Test",
            description: "",
            stateVersion: 2,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        });

        When("the CMS upcaster is applied expecting an error", () => {
          state.caughtError = null;
          try {
            state.upcaster!(state.inputState!);
          } catch (e) {
            state.caughtError = e;
          }
        });

        Then("it throws a CMSUpcasterError", () => {
          expect(state.caughtError).toBeInstanceOf(CMSUpcasterError);
        });

        And('the error message contains "fails validation"', () => {
          expect((state.caughtError as Error).message).toContain("fails validation");
        });
      }
    );

    RuleScenario("Validation passes after upcasting from v1", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster with validation that checks description is a string", () => {
        const isValidV2 = (s: unknown): s is TestCMSv2 =>
          s !== null &&
          typeof s === "object" &&
          "description" in s &&
          typeof (s as TestCMSv2).description === "string";

        state.upcaster = createUpcaster<TestCMSv2>({
          currentVersion: 2,
          migrations: {
            1: (v1: unknown) => ({
              ...(v1 as TestCMSv1),
              description: "Migrated successfully",
              stateVersion: 2,
            }),
          },
          validate: isValidV2,
        }) as unknown as TestState["upcaster"];
      });

      And('a v1 CMS state with id "test_1" and name "Test"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied", () => {
        state.result = state.upcaster!(state.inputState!) as UpcasterResult;
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And('the CMS description is "Migrated successfully"', () => {
        expect(state.result!.cms.description).toBe("Migrated successfully");
      });
    });

    RuleScenario(
      "Validation fails after upcasting produces invalid state",
      ({ Given, And, When, Then }) => {
        Given(
          "a CMS upcaster with validation that checks description is non-empty and migration produces empty",
          () => {
            const isValidV2 = (s: unknown): s is TestCMSv2 =>
              s !== null &&
              typeof s === "object" &&
              "description" in s &&
              typeof (s as TestCMSv2).description === "string" &&
              (s as TestCMSv2).description.length > 0;

            state.upcaster = createUpcaster<TestCMSv2>({
              currentVersion: 2,
              migrations: {
                1: (v1: unknown) => ({
                  ...(v1 as TestCMSv1),
                  description: "", // Empty - fails validation
                  stateVersion: 2,
                }),
              },
              validate: isValidV2,
            }) as unknown as TestState["upcaster"];
          }
        );

        And('a v1 CMS state with id "test_1" and name "Test"', () => {
          state.inputState = {
            id: "test_1",
            name: "Test",
            stateVersion: 1,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        });

        When("the CMS upcaster is applied expecting an error", () => {
          state.caughtError = null;
          try {
            state.upcaster!(state.inputState!);
          } catch (e) {
            state.caughtError = e;
          }
        });

        Then("it throws a CMSUpcasterError", () => {
          expect(state.caughtError).toBeInstanceOf(CMSUpcasterError);
        });

        And('the error message contains "Upcasted CMS failed validation"', () => {
          expect((state.caughtError as Error).message).toContain("Upcasted CMS failed validation");
        });
      }
    );
  });

  // ==========================================================================
  // addCMSFieldMigration
  // ==========================================================================

  Rule(
    "addCMSFieldMigration adds a field with a static or computed default",
    ({ RuleScenario }) => {
      RuleScenario("Static default value is added", ({ Given, And, When, Then }) => {
        Given('an addCMSFieldMigration for "priority" with default "standard" to version 2', () => {
          state.fieldMigration = addCMSFieldMigration("priority", "standard", 2);
        });

        And('a base CMS state with id "test_1" and name "Test" at version 1', () => {
          state.inputState = {
            id: "test_1",
            name: "Test",
            stateVersion: 1,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        });

        When("the CMS field migration is applied", () => {
          state.fieldMigrationResult = state.fieldMigration!(
            state.inputState! as BaseCMS
          ) as BaseCMS & Record<string, unknown>;
        });

        Then('the CMS field "priority" is "standard"', () => {
          expect(state.fieldMigrationResult!.priority).toBe("standard");
        });

        And('the CMS field "name" is "Test"', () => {
          expect(state.fieldMigrationResult!.name).toBe("Test");
        });

        And("the CMS stateVersion is 2", () => {
          expect(state.fieldMigrationResult!.stateVersion).toBe(2);
        });
      });

      RuleScenario("Computed default value is added", ({ Given, And, When, Then }) => {
        Given(
          'an addCMSFieldMigration for "createdAt" with computed value 1704067200000 to version 2',
          () => {
            state.fieldMigration = addCMSFieldMigration("createdAt", () => 1704067200000, 2);
          }
        );

        And('a base CMS state with id "test_1" at version 1', () => {
          state.inputState = {
            id: "test_1",
            stateVersion: 1,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        });

        When("the CMS field migration is applied", () => {
          state.fieldMigrationResult = state.fieldMigration!(
            state.inputState! as BaseCMS
          ) as BaseCMS & Record<string, unknown>;
        });

        Then('the CMS field "createdAt" is 1704067200000', () => {
          expect(state.fieldMigrationResult!.createdAt).toBe(1704067200000);
        });

        And("the CMS stateVersion is 2", () => {
          expect(state.fieldMigrationResult!.stateVersion).toBe(2);
        });
      });

      RuleScenario("Computed default accesses state", ({ Given, And, When, Then }) => {
        Given(
          'an addCMSFieldMigration for "displayName" computed from orderId to version 2',
          () => {
            state.fieldMigration = addCMSFieldMigration(
              "displayName",
              (s) => `Order ${(s as { orderId?: string }).orderId ?? "unknown"}`,
              2
            );
          }
        );

        And('a base CMS state with orderId "order_123" at version 1', () => {
          state.inputState = {
            orderId: "order_123",
            stateVersion: 1,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        });

        When("the CMS field migration is applied", () => {
          state.fieldMigrationResult = state.fieldMigration!(
            state.inputState! as BaseCMS
          ) as BaseCMS & Record<string, unknown>;
        });

        Then('the CMS field "displayName" is "Order order_123"', () => {
          expect(state.fieldMigrationResult!.displayName).toBe("Order order_123");
        });
      });

      RuleScenario("Existing fields are preserved", ({ Given, And, When, Then }) => {
        Given('an addCMSFieldMigration for "newField" with default "value" to version 2', () => {
          state.fieldMigration = addCMSFieldMigration("newField", "value", 2);
        });

        And(
          'a base CMS state with existingField "existing" and anotherField 42 at version 1 with version 5',
          () => {
            state.inputState = {
              existingField: "existing",
              anotherField: 42,
              stateVersion: 1,
              version: 5,
            } as BaseCMS & Record<string, unknown>;
          }
        );

        When("the CMS field migration is applied", () => {
          state.fieldMigrationResult = state.fieldMigration!(
            state.inputState! as BaseCMS
          ) as BaseCMS & Record<string, unknown>;
        });

        Then('the CMS field "existingField" is "existing"', () => {
          expect(state.fieldMigrationResult!.existingField).toBe("existing");
        });

        And('the CMS field "anotherField" is 42', () => {
          expect(state.fieldMigrationResult!.anotherField).toBe(42);
        });

        And("the CMS version is 5", () => {
          expect(state.fieldMigrationResult!.version).toBe(5);
        });
      });
    }
  );

  // ==========================================================================
  // renameCMSFieldMigration
  // ==========================================================================

  Rule("renameCMSFieldMigration renames a field in the CMS state", ({ RuleScenario }) => {
    RuleScenario("Field is renamed", ({ Given, And, When, Then }) => {
      Given('a renameCMSFieldMigration from "userId" to "customerId" at version 2', () => {
        state.fieldMigration = renameCMSFieldMigration("userId", "customerId", 2);
      });

      And('a CMS state with userId "user_123" and name "Test" at version 1', () => {
        state.inputState = {
          userId: "user_123",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS rename migration is applied", () => {
        state.fieldMigrationResult = state.fieldMigration!(
          state.inputState! as BaseCMS
        ) as BaseCMS & Record<string, unknown>;
      });

      Then('the CMS field "customerId" is "user_123"', () => {
        expect(state.fieldMigrationResult!.customerId).toBe("user_123");
      });

      And('the CMS field "userId" is undefined', () => {
        expect(state.fieldMigrationResult!.userId).toBeUndefined();
      });

      And('the CMS field "name" is "Test"', () => {
        expect(state.fieldMigrationResult!.name).toBe("Test");
      });

      And("the CMS stateVersion is 2", () => {
        expect(state.fieldMigrationResult!.stateVersion).toBe(2);
      });
    });

    RuleScenario("Other fields are preserved when renaming", ({ Given, And, When, Then }) => {
      Given('a renameCMSFieldMigration from "oldName" to "newName" at version 2', () => {
        state.fieldMigration = renameCMSFieldMigration("oldName", "newName", 2);
      });

      And(
        'a CMS state with oldName "value" and otherField1 "keep1" and otherField2 42 at version 1 with version 3',
        () => {
          state.inputState = {
            oldName: "value",
            otherField1: "keep1",
            otherField2: 42,
            stateVersion: 1,
            version: 3,
          } as BaseCMS & Record<string, unknown>;
        }
      );

      When("the CMS rename migration is applied", () => {
        state.fieldMigrationResult = state.fieldMigration!(
          state.inputState! as BaseCMS
        ) as BaseCMS & Record<string, unknown>;
      });

      Then('the CMS field "otherField1" is "keep1"', () => {
        expect(state.fieldMigrationResult!.otherField1).toBe("keep1");
      });

      And('the CMS field "otherField2" is 42', () => {
        expect(state.fieldMigrationResult!.otherField2).toBe(42);
      });

      And("the CMS version is 3", () => {
        expect(state.fieldMigrationResult!.version).toBe(3);
      });
    });

    RuleScenario("Undefined value in renamed field is handled", ({ Given, And, When, Then }) => {
      Given(
        'a renameCMSFieldMigration from "optionalField" to "renamedOptional" at version 2',
        () => {
          state.fieldMigration = renameCMSFieldMigration("optionalField", "renamedOptional", 2);
        }
      );

      And("a base CMS state at version 1", () => {
        state.inputState = {
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS rename migration is applied", () => {
        state.fieldMigrationResult = state.fieldMigration!(
          state.inputState! as BaseCMS
        ) as BaseCMS & Record<string, unknown>;
      });

      Then('the CMS field "renamedOptional" is undefined', () => {
        expect(state.fieldMigrationResult!.renamedOptional).toBeUndefined();
      });

      And("the CMS stateVersion is 2", () => {
        expect(state.fieldMigrationResult!.stateVersion).toBe(2);
      });
    });
  });

  // ==========================================================================
  // removeCMSFieldMigration
  // ==========================================================================

  Rule("removeCMSFieldMigration removes a field from the CMS state", ({ RuleScenario }) => {
    RuleScenario("Specified field is removed", ({ Given, And, When, Then }) => {
      Given('a removeCMSFieldMigration for "deprecatedField" at version 2', () => {
        state.fieldMigration = removeCMSFieldMigration("deprecatedField", 2);
      });

      And(
        'a CMS state with deprecatedField "old value" and keepField "keep me" at version 1',
        () => {
          state.inputState = {
            deprecatedField: "old value",
            keepField: "keep me",
            stateVersion: 1,
            version: 1,
          } as BaseCMS & Record<string, unknown>;
        }
      );

      When("the CMS remove migration is applied", () => {
        state.fieldMigrationResult = state.fieldMigration!(
          state.inputState! as BaseCMS
        ) as BaseCMS & Record<string, unknown>;
      });

      Then('the CMS field "deprecatedField" is undefined', () => {
        expect(state.fieldMigrationResult!.deprecatedField).toBeUndefined();
      });

      And('the CMS field "keepField" is "keep me"', () => {
        expect(state.fieldMigrationResult!.keepField).toBe("keep me");
      });

      And("the CMS stateVersion is 2", () => {
        expect(state.fieldMigrationResult!.stateVersion).toBe(2);
      });
    });

    RuleScenario("Other fields are preserved when removing", ({ Given, And, When, Then }) => {
      Given('a removeCMSFieldMigration for "toRemove" at version 2', () => {
        state.fieldMigration = removeCMSFieldMigration("toRemove", 2);
      });

      And(
        'a CMS state with toRemove "bye" and field1 "a" and field2 "b" and nested data at version 1 with version 5',
        () => {
          state.inputState = {
            toRemove: "bye",
            field1: "a",
            field2: "b",
            nested: { data: 123 },
            stateVersion: 1,
            version: 5,
          } as BaseCMS & Record<string, unknown>;
        }
      );

      When("the CMS remove migration is applied", () => {
        state.fieldMigrationResult = state.fieldMigration!(
          state.inputState! as BaseCMS
        ) as BaseCMS & Record<string, unknown>;
      });

      Then('the CMS field "field1" is "a"', () => {
        expect(state.fieldMigrationResult!.field1).toBe("a");
      });

      And('the CMS field "field2" is "b"', () => {
        expect(state.fieldMigrationResult!.field2).toBe("b");
      });

      And("the CMS nested field equals data 123", () => {
        expect(state.fieldMigrationResult!.nested).toEqual({ data: 123 });
      });

      And("the CMS version is 5", () => {
        expect(state.fieldMigrationResult!.version).toBe(5);
      });
    });

    RuleScenario("Non-existent field is handled gracefully", ({ Given, And, When, Then }) => {
      Given('a removeCMSFieldMigration for "nonExistent" at version 2', () => {
        state.fieldMigration = removeCMSFieldMigration("nonExistent", 2);
      });

      And('a CMS state with existingField "value" at version 1', () => {
        state.inputState = {
          existingField: "value",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS remove migration is applied", () => {
        state.fieldMigrationResult = state.fieldMigration!(
          state.inputState! as BaseCMS
        ) as BaseCMS & Record<string, unknown>;
      });

      Then('the CMS field "existingField" is "value"', () => {
        expect(state.fieldMigrationResult!.existingField).toBe("value");
      });

      And("the CMS stateVersion is 2", () => {
        expect(state.fieldMigrationResult!.stateVersion).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Helper migrations integration with createUpcaster
  // ==========================================================================

  Rule("Helper migrations integrate with createUpcaster chain", ({ RuleScenario }) => {
    RuleScenario("addCMSFieldMigration works in migration chain", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster using addCMSFieldMigration for description", () => {
        state.upcaster = createUpcaster<TestCMSv2>({
          currentVersion: 2,
          migrations: {
            1: addCMSFieldMigration("description", "Added via helper", 2),
          },
        }) as unknown as TestState["upcaster"];
      });

      And('a v1 CMS state with id "test_1" and name "Test"', () => {
        state.inputState = {
          id: "test_1",
          name: "Test",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied", () => {
        state.result = state.upcaster!(state.inputState!) as UpcasterResult;
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And('the CMS description is "Added via helper"', () => {
        expect(state.result!.cms.description).toBe("Added via helper");
      });

      And("the CMS stateVersion is 2", () => {
        expect(state.result!.cms.stateVersion).toBe(2);
      });
    });

    RuleScenario("Multiple helper migrations are chained", ({ Given, And, When, Then }) => {
      Given("a CMS upcaster chaining rename and add helper migrations", () => {
        interface CMSv3 extends BaseCMS {
          id: string;
          customerId: string;
          priority: string;
          stateVersion: 3;
          version: number;
        }

        state.upcaster = createUpcaster<CMSv3>({
          currentVersion: 3,
          migrations: {
            1: renameCMSFieldMigration("userId", "customerId", 2),
            2: addCMSFieldMigration("priority", "normal", 3),
          },
        }) as unknown as TestState["upcaster"];
      });

      And('a CMS state with userId "user_456" at version 1', () => {
        state.inputState = {
          id: "test_1",
          userId: "user_456",
          stateVersion: 1,
          version: 1,
        } as BaseCMS & Record<string, unknown>;
      });

      When("the CMS upcaster is applied", () => {
        state.result = state.upcaster!(state.inputState!) as UpcasterResult;
      });

      Then("the result was upcasted", () => {
        expect(state.result!.wasUpcasted).toBe(true);
      });

      And("the original state version is 1", () => {
        expect(state.result!.originalStateVersion).toBe(1);
      });

      And('the CMS field "customerId" is "user_456"', () => {
        expect((state.result!.cms as Record<string, unknown>).customerId).toBe("user_456");
      });

      And('the CMS field "userId" is undefined', () => {
        expect((state.result!.cms as Record<string, unknown>).userId).toBeUndefined();
      });

      And('the CMS field "priority" is "normal"', () => {
        expect((state.result!.cms as Record<string, unknown>).priority).toBe("normal");
      });

      And("the CMS stateVersion is 3", () => {
        expect(state.result!.cms.stateVersion).toBe(3);
      });
    });
  });
});
