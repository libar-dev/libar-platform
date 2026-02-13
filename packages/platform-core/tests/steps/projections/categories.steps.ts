/**
 * Projection Categories - Step Definitions
 *
 * BDD step definitions for projection categories behavior:
 * - category-definitions.feature: PROJECTION_CATEGORIES tuple, type guards, helpers
 * - explicit-declaration.feature: Validation (CATEGORY_REQUIRED, INVALID_CATEGORY)
 * - registry-lookup.feature: Registry getByCategory method
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

// Import modules under test
import {
  PROJECTION_CATEGORIES,
  type ProjectionCategory,
  isProjectionCategory,
  isLogicProjection,
  isViewProjection,
  isReportingProjection,
  isIntegrationProjection,
  isClientExposed,
} from "@libar-dev/platform-bc";

import {
  validateProjectionCategory,
  assertValidCategory,
  type ProjectionCategoryValidationResult,
} from "../../../src/projections/validation.js";

import {
  createProjectionRegistry,
  type ProjectionRegistry,
} from "../../../src/projections/registry.js";

import type { ProjectionDefinition } from "@libar-dev/platform-bc";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  category: ProjectionCategory | null;
  result: unknown;
  validationResult: ProjectionCategoryValidationResult | null;
  error: Error | null;
  registry: ProjectionRegistry | null;
  projections: ProjectionDefinition[];
}

let state: TestState;

function resetState(): void {
  state = {
    category: null,
    result: null,
    validationResult: null,
    error: null,
    registry: null,
    projections: [],
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function createMockProjectionDefinition(
  name: string,
  category: ProjectionCategory,
  context: string,
  eventSubscriptions: string[] = []
): ProjectionDefinition {
  return {
    projectionName: name,
    description: `${name} projection`,
    category,
    context,
    type: "primary",
    targetTable: `${name}Table`,
    partitionKeyField: "id",
    eventSubscriptions,
  };
}

// =============================================================================
// Category Definitions Feature
// =============================================================================

const categoryDefinitionsFeature = await loadFeature(
  "tests/features/behavior/projection-categories/category-definitions.feature"
);

describeFeature(
  categoryDefinitionsFeature,
  ({ Scenario, ScenarioOutline, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given }) => {
      Given("the projection category taxonomy:", () => {
        // Documentation table - taxonomy is defined in the implementation
        // This step documents the expected categories for reference
      });
    });

    // =========================================================================
    // PROJECTION_CATEGORIES Tuple
    // =========================================================================

    Scenario("PROJECTION_CATEGORIES tuple contains all valid categories", ({ When, Then, And }) => {
      When("I access PROJECTION_CATEGORIES", () => {
        state.result = PROJECTION_CATEGORIES;
      });

      Then('it contains exactly "logic", "view", "reporting", "integration"', () => {
        expect(state.result).toEqual(["logic", "view", "reporting", "integration"]);
      });

      And("it is a readonly tuple", () => {
        // TypeScript enforces this at compile time via `as const`
        // Runtime check: attempting to modify should not affect original
        const copy = [...PROJECTION_CATEGORIES];
        expect(copy).toEqual(PROJECTION_CATEGORIES);
        expect(PROJECTION_CATEGORIES.length).toBe(4);
      });
    });

    // =========================================================================
    // Type Guard
    // =========================================================================

    ScenarioOutline(
      "isProjectionCategory validates category strings",
      ({ When, Then }, variables: { value: string; result: string }) => {
        When('I call isProjectionCategory with "<value>"', () => {
          state.result = isProjectionCategory(variables.value);
        });

        Then("I receive <result>", () => {
          const expected = variables.result === "true";
          expect(state.result).toBe(expected);
        });
      }
    );

    // =========================================================================
    // Helper Functions
    // =========================================================================

    ScenarioOutline(
      "Category helper functions identify correct categories",
      (
        { Given, Then, And },
        variables: {
          category: string;
          isLogic: string;
          isView: string;
          isReporting: string;
          isIntegration: string;
        }
      ) => {
        Given('a projection category "<category>"', () => {
          state.category = variables.category as ProjectionCategory;
        });

        Then("isLogicProjection returns <isLogic>", () => {
          const expected = variables.isLogic === "true";
          expect(isLogicProjection(state.category!)).toBe(expected);
        });

        And("isViewProjection returns <isView>", () => {
          const expected = variables.isView === "true";
          expect(isViewProjection(state.category!)).toBe(expected);
        });

        And("isReportingProjection returns <isReporting>", () => {
          const expected = variables.isReporting === "true";
          expect(isReportingProjection(state.category!)).toBe(expected);
        });

        And("isIntegrationProjection returns <isIntegration>", () => {
          const expected = variables.isIntegration === "true";
          expect(isIntegrationProjection(state.category!)).toBe(expected);
        });
      }
    );

    // =========================================================================
    // Client Exposure
    // =========================================================================

    ScenarioOutline(
      "isClientExposed returns correct exposure status",
      ({ Given, When, Then }, variables: { category: string; exposed: string }) => {
        Given('a projection category "<category>"', () => {
          state.category = variables.category as ProjectionCategory;
        });

        When("I call isClientExposed", () => {
          state.result = isClientExposed(state.category!);
        });

        Then("I receive <exposed>", () => {
          const expected = variables.exposed === "true";
          expect(state.result).toBe(expected);
        });
      }
    );
  }
);

// =============================================================================
// Explicit Declaration Feature
// =============================================================================

const explicitDeclarationFeature = await loadFeature(
  "tests/features/behavior/projection-categories/explicit-declaration.feature"
);

describeFeature(
  explicitDeclarationFeature,
  ({ Scenario, ScenarioOutline, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given, And }) => {
      Given("the projection validation module is available", () => {
        // Module is imported at the top
        expect(validateProjectionCategory).toBeDefined();
      });

      And('valid categories are "logic", "view", "reporting", "integration"', () => {
        expect(PROJECTION_CATEGORIES).toEqual(["logic", "view", "reporting", "integration"]);
      });
    });

    // =========================================================================
    // Category Required Validation
    // =========================================================================

    Scenario("Missing category returns CATEGORY_REQUIRED error", ({ When, Then, And }) => {
      When("I validate a projection category with undefined", () => {
        state.validationResult = validateProjectionCategory(undefined);
      });

      Then("validation fails", () => {
        expect(state.validationResult!.valid).toBe(false);
      });

      And('error code is "CATEGORY_REQUIRED"', () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.error.code).toBe("CATEGORY_REQUIRED");
        }
      });

      And('error message contains "required"', () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.error.message.toLowerCase()).toContain("required");
        }
      });

      And("suggested categories are provided", () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.error.suggestedCategories).toEqual(PROJECTION_CATEGORIES);
        }
      });
    });

    Scenario("Null category returns CATEGORY_REQUIRED error", ({ When, Then, And }) => {
      When("I validate a projection category with null", () => {
        state.validationResult = validateProjectionCategory(null);
      });

      Then("validation fails", () => {
        expect(state.validationResult!.valid).toBe(false);
      });

      And('error code is "CATEGORY_REQUIRED"', () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.error.code).toBe("CATEGORY_REQUIRED");
        }
      });

      And("suggested categories are provided", () => {
        if (!state.validationResult!.valid) {
          expect(state.validationResult!.error.suggestedCategories).toEqual(PROJECTION_CATEGORIES);
        }
      });
    });

    // =========================================================================
    // Invalid Category Validation
    // =========================================================================

    ScenarioOutline(
      "Invalid category returns INVALID_CATEGORY error",
      ({ When, Then, And }, variables: { invalid_value: string }) => {
        When('I validate a projection category with "<invalid_value>"', () => {
          state.validationResult = validateProjectionCategory(variables.invalid_value);
        });

        Then("validation fails", () => {
          expect(state.validationResult!.valid).toBe(false);
        });

        And('error code is "INVALID_CATEGORY"', () => {
          if (!state.validationResult!.valid) {
            expect(state.validationResult!.error.code).toBe("INVALID_CATEGORY");
          }
        });

        And('error message contains "<invalid_value>"', () => {
          if (!state.validationResult!.valid) {
            expect(state.validationResult!.error.message).toContain(variables.invalid_value);
          }
        });

        And("suggested categories are provided", () => {
          if (!state.validationResult!.valid) {
            expect(state.validationResult!.error.suggestedCategories).toEqual(
              PROJECTION_CATEGORIES
            );
          }
        });
      }
    );

    // =========================================================================
    // Valid Category Validation
    // =========================================================================

    ScenarioOutline(
      "Valid category passes validation",
      ({ When, Then, And }, variables: { category: string }) => {
        When('I validate a projection category with "<category>"', () => {
          state.validationResult = validateProjectionCategory(variables.category);
        });

        Then("validation succeeds", () => {
          expect(state.validationResult!.valid).toBe(true);
        });

        And('returned category is "<category>"', () => {
          if (state.validationResult!.valid) {
            expect(state.validationResult!.category).toBe(variables.category);
          }
        });
      }
    );

    // =========================================================================
    // Assert Function
    // =========================================================================

    Scenario("assertValidCategory returns category on valid input", ({ When, Then, And }) => {
      When('I call assertValidCategory with "view"', () => {
        try {
          state.result = assertValidCategory("view");
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('I receive "view"', () => {
        expect(state.result).toBe("view");
      });

      And("no error is thrown", () => {
        expect(state.error).toBeNull();
      });
    });

    Scenario("assertValidCategory throws on invalid input", ({ When, Then, And }) => {
      When('I call assertValidCategory with "invalid"', () => {
        try {
          state.result = assertValidCategory("invalid");
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then("an error is thrown", () => {
        expect(state.error).not.toBeNull();
      });

      And('error message contains "INVALID_CATEGORY"', () => {
        expect(state.error?.message).toContain("INVALID_CATEGORY");
      });
    });
  }
);

// =============================================================================
// Registry Lookup Feature
// =============================================================================

const registryLookupFeature = await loadFeature(
  "tests/features/behavior/projection-categories/registry-lookup.feature"
);

/**
 * Helper to set up the standard registry with test projections.
 * Called by Background steps.
 */
function setupStandardRegistry(): void {
  state.registry = createProjectionRegistry();

  // Register projections from the Background table:
  // | orderSummary       | view        | orders       |
  // | productCatalog     | view        | inventory    |
  // | orderExistence     | logic       | orders       |
  // | dailySales         | reporting   | analytics    |
  // | orderStatusFeed    | integration | cross-context |

  state.registry.register(
    createMockProjectionDefinition("orderSummary", "view", "orders", ["OrderCreated"])
  );
  state.registry.register(
    createMockProjectionDefinition("productCatalog", "view", "inventory", ["ProductCreated"])
  );
  state.registry.register(
    createMockProjectionDefinition("orderExistence", "logic", "orders", ["OrderCreated"])
  );
  state.registry.register(
    createMockProjectionDefinition("dailySales", "reporting", "analytics", ["OrderCreated"])
  );
  state.registry.register(
    createMockProjectionDefinition("orderStatusFeed", "integration", "cross-context", [
      "OrderStatusChanged",
    ])
  );
}

describeFeature(
  registryLookupFeature,
  ({ Scenario, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
      // Set up standard registry for most scenarios
      // Background step is a documentation marker, actual setup is here
      setupStandardRegistry();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given }) => {
      Given(
        "a projection registry with the following projections:",
        (_ctx: unknown, _docString: string) => {
          // Registry already set up in BeforeEachScenario
          // Docstring is documentation matching the feature file
        }
      );
    });

    // =========================================================================
    // getByCategory Method
    // =========================================================================

    Scenario("getByCategory returns all view projections", ({ When, Then, And }) => {
      When('I call getByCategory with "view"', () => {
        state.projections = state.registry!.getByCategory("view");
      });

      Then("I receive 2 projections", () => {
        expect(state.projections.length).toBe(2);
      });

      And('the result contains "orderSummary"', () => {
        const names = state.projections.map((p) => p.projectionName);
        expect(names).toContain("orderSummary");
      });

      And('the result contains "productCatalog"', () => {
        const names = state.projections.map((p) => p.projectionName);
        expect(names).toContain("productCatalog");
      });
    });

    Scenario("getByCategory returns all logic projections", ({ When, Then, And }) => {
      When('I call getByCategory with "logic"', () => {
        state.projections = state.registry!.getByCategory("logic");
      });

      Then("I receive 1 projection", () => {
        expect(state.projections.length).toBe(1);
      });

      And('the result contains "orderExistence"', () => {
        const names = state.projections.map((p) => p.projectionName);
        expect(names).toContain("orderExistence");
      });
    });

    Scenario("getByCategory returns all reporting projections", ({ When, Then, And }) => {
      When('I call getByCategory with "reporting"', () => {
        state.projections = state.registry!.getByCategory("reporting");
      });

      Then("I receive 1 projection", () => {
        expect(state.projections.length).toBe(1);
      });

      And('the result contains "dailySales"', () => {
        const names = state.projections.map((p) => p.projectionName);
        expect(names).toContain("dailySales");
      });
    });

    Scenario("getByCategory returns all integration projections", ({ When, Then, And }) => {
      When('I call getByCategory with "integration"', () => {
        state.projections = state.registry!.getByCategory("integration");
      });

      Then("I receive 1 projection", () => {
        expect(state.projections.length).toBe(1);
      });

      And('the result contains "orderStatusFeed"', () => {
        const names = state.projections.map((p) => p.projectionName);
        expect(names).toContain("orderStatusFeed");
      });
    });

    Scenario(
      "getByCategory returns empty array for category with no projections",
      ({ Given, When, Then }) => {
        Given("an empty projection registry", () => {
          state.registry = createProjectionRegistry();
        });

        When('I call getByCategory with "view"', () => {
          state.projections = state.registry!.getByCategory("view");
        });

        Then("I receive 0 projections", () => {
          expect(state.projections.length).toBe(0);
        });
      }
    );

    // =========================================================================
    // Use Cases
    // =========================================================================

    Scenario("Target view projections for reactive layer", ({ When, Then, And }) => {
      When('I call getByCategory with "view"', () => {
        state.projections = state.registry!.getByCategory("view");
      });

      Then('all returned projections have category "view"', () => {
        expect(state.projections.every((p) => p.category === "view")).toBe(true);
      });

      And("these are candidates for reactive subscriptions", () => {
        // Documented behavior: view projections support reactive subscriptions
        // This is validated by category - all projections returned have view category
        expect(state.projections.every((p) => isViewProjection(p.category))).toBe(true);
      });
    });

    Scenario("Target integration projections for EventBus routing", ({ When, Then, And }) => {
      When('I call getByCategory with "integration"', () => {
        state.projections = state.registry!.getByCategory("integration");
      });

      Then('all returned projections have category "integration"', () => {
        expect(state.projections.every((p) => p.category === "integration")).toBe(true);
      });

      And("these are candidates for EventBus publication", () => {
        // Documented behavior: integration projections publish to EventBus
        // This is validated by category - all projections returned have integration category
        expect(state.projections.every((p) => isIntegrationProjection(p.category))).toBe(true);
      });
    });
  }
);
