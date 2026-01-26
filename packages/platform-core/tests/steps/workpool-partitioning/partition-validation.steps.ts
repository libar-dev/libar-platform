/**
 * Partition Validation - Step Definitions
 *
 * BDD step definitions for command config partition validation:
 * - validateCommandConfigPartitions
 * - assertValidPartitionKeys
 *
 * @since Phase 18c (WorkpoolPartitioning)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  validateCommandConfigPartitions,
  assertValidPartitionKeys,
  type ConfigValidationResult,
} from "../../../src/orchestration/validation.js";
import { createEntityPartitionKey } from "../../../src/workpool/partitioning/helpers.js";

// =============================================================================
// Types
// =============================================================================

interface MinimalProjectionConfig {
  projectionName: string;
  getPartitionKey?: ((args: unknown) => unknown) | undefined;
}

interface MinimalCommandConfig {
  commandType: string;
  projection: MinimalProjectionConfig;
  secondaryProjections?: MinimalProjectionConfig[];
  failedProjection?: MinimalProjectionConfig;
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  commandConfig: MinimalCommandConfig | null;
  commandConfigs: MinimalCommandConfig[];
  validationResult: ConfigValidationResult | null;
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    commandConfig: null,
    commandConfigs: [],
    validationResult: null,
    error: null,
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/workpool-partitioning/partition-validation.feature"
);

describeFeature(feature, ({ Scenario, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  Background(({ Given }) => {
    Given(
      "the validation error codes MISSING_PARTITION_KEY, INVALID_PARTITION_KEY_SHAPE, EMPTY_PARTITION_VALUE",
      () => {
        // Documentation - error codes are defined in implementation
      }
    );
  });

  // =========================================================================
  // Valid Configuration
  // =========================================================================

  Scenario("Valid result for config with getPartitionKey", ({ Given, When, Then, And }) => {
    Given(
      'a command config for "CreateOrder" with projection "orderSummary" using createEntityPartitionKey',
      () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: createEntityPartitionKey("Order"),
          },
        };
      }
    );

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then("the result should be valid", () => {
      expect(state.validationResult?.valid).toBe(true);
    });

    And("there should be 0 errors", () => {
      expect(state.validationResult?.errors).toHaveLength(0);
    });
  });

  Scenario("Valid result for inline partition key function", ({ Given, When, Then }) => {
    Given(
      'a command config for "CreateOrder" with projection "orderSummary" using inline function',
      () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: (args: { orderId?: string }) => ({
              name: "streamId",
              value: `Order:${args.orderId ?? "default"}`,
            }),
          },
        };
      }
    );

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then("the result should be valid", () => {
      expect(state.validationResult?.valid).toBe(true);
    });
  });

  Scenario("Validates secondary projections with getPartitionKey", ({ Given, And, When, Then }) => {
    Given("a command config with primary projection with getPartitionKey", () => {
      state.commandConfig = {
        commandType: "CreateOrder",
        projection: {
          projectionName: "orderSummary",
          getPartitionKey: () => ({ name: "a", value: "b" }),
        },
      };
    });

    And("secondary projections with getPartitionKey", () => {
      state.commandConfig!.secondaryProjections = [
        {
          projectionName: "orderAnalytics",
          getPartitionKey: () => ({ name: "c", value: "d" }),
        },
      ];
    });

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then("the result should be valid", () => {
      expect(state.validationResult?.valid).toBe(true);
    });
  });

  Scenario("Validates failed projection with getPartitionKey", ({ Given, And, When, Then }) => {
    Given("a command config with primary projection with getPartitionKey", () => {
      state.commandConfig = {
        commandType: "CreateOrder",
        projection: {
          projectionName: "orderSummary",
          getPartitionKey: () => ({ name: "a", value: "b" }),
        },
      };
    });

    And("failed projection with getPartitionKey", () => {
      state.commandConfig!.failedProjection = {
        projectionName: "failedOrders",
        getPartitionKey: () => ({ name: "e", value: "f" }),
      };
    });

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then("the result should be valid", () => {
      expect(state.validationResult?.valid).toBe(true);
    });
  });

  // =========================================================================
  // Missing getPartitionKey Errors
  // =========================================================================

  Scenario(
    "Returns MISSING_PARTITION_KEY error for missing getPartitionKey",
    ({ Given, When, Then, And }) => {
      Given(
        'a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey',
        () => {
          state.commandConfig = {
            commandType: "CreateOrder",
            projection: {
              projectionName: "orderSummary",
            },
          };
        }
      );

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then("the result should be invalid", () => {
        expect(state.validationResult?.valid).toBe(false);
      });

      And("there should be 1 error", () => {
        expect(state.validationResult?.errors).toHaveLength(1);
      });

      And('the error code should be "MISSING_PARTITION_KEY"', () => {
        expect(state.validationResult?.errors[0].code).toBe("MISSING_PARTITION_KEY");
      });
    }
  );

  Scenario("Includes projection name in error", ({ Given, When, Then }) => {
    Given(
      'a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey',
      () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
          },
        };
      }
    );

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then('the error projectionName should be "orderSummary"', () => {
      expect(state.validationResult?.errors[0].projectionName).toBe("orderSummary");
    });
  });

  Scenario("Includes config path in error", ({ Given, When, Then }) => {
    Given(
      'a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey',
      () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
          },
        };
      }
    );

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then('the error configPath should be "CreateOrder.projection"', () => {
      expect(state.validationResult?.errors[0].configPath).toBe("CreateOrder.projection");
    });
  });

  Scenario("Suggests helper functions in error message", ({ Given, When, Then, And }) => {
    Given(
      'a command config for "CreateOrder" with projection "orderSummary" missing getPartitionKey',
      () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
          },
        };
      }
    );

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then('the error message should contain "createEntityPartitionKey"', () => {
      expect(state.validationResult?.errors[0].message).toContain("createEntityPartitionKey");
    });

    And('the error message should contain "createCustomerPartitionKey"', () => {
      expect(state.validationResult?.errors[0].message).toContain("createCustomerPartitionKey");
    });

    And('the error message should contain "createSagaPartitionKey"', () => {
      expect(state.validationResult?.errors[0].message).toContain("createSagaPartitionKey");
    });

    And('the error message should contain "GLOBAL_PARTITION_KEY"', () => {
      expect(state.validationResult?.errors[0].message).toContain("GLOBAL_PARTITION_KEY");
    });
  });

  // =========================================================================
  // Invalid Partition Key Shape Errors
  // =========================================================================

  Scenario(
    "Returns INVALID_PARTITION_KEY_SHAPE when returning null",
    ({ Given, When, Then, And }) => {
      Given("a command config with getPartitionKey returning null", () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => null,
          },
        };
      });

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then("the result should be invalid", () => {
        expect(state.validationResult?.valid).toBe(false);
      });

      And('the error code should be "INVALID_PARTITION_KEY_SHAPE"', () => {
        expect(state.validationResult?.errors[0].code).toBe("INVALID_PARTITION_KEY_SHAPE");
      });
    }
  );

  Scenario(
    "Returns INVALID_PARTITION_KEY_SHAPE when returning wrong type",
    ({ Given, When, Then, And }) => {
      Given("a command config with getPartitionKey returning a string", () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => "invalid-string",
          },
        };
      });

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then("the result should be invalid", () => {
        expect(state.validationResult?.valid).toBe(false);
      });

      And('the error code should be "INVALID_PARTITION_KEY_SHAPE"', () => {
        expect(state.validationResult?.errors[0].code).toBe("INVALID_PARTITION_KEY_SHAPE");
      });
    }
  );

  Scenario(
    "Returns INVALID_PARTITION_KEY_SHAPE when missing name",
    ({ Given, When, Then, And }) => {
      Given("a command config with getPartitionKey returning object with only value", () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => ({ value: "something" }),
          },
        };
      });

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then("the result should be invalid", () => {
        expect(state.validationResult?.valid).toBe(false);
      });

      And('the error code should be "INVALID_PARTITION_KEY_SHAPE"', () => {
        expect(state.validationResult?.errors[0].code).toBe("INVALID_PARTITION_KEY_SHAPE");
      });
    }
  );

  Scenario(
    "Returns INVALID_PARTITION_KEY_SHAPE when missing value",
    ({ Given, When, Then, And }) => {
      Given("a command config with getPartitionKey returning object with only name", () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => ({ name: "something" }),
          },
        };
      });

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then("the result should be invalid", () => {
        expect(state.validationResult?.valid).toBe(false);
      });

      And('the error code should be "INVALID_PARTITION_KEY_SHAPE"', () => {
        expect(state.validationResult?.errors[0].code).toBe("INVALID_PARTITION_KEY_SHAPE");
      });
    }
  );

  Scenario(
    "Returns INVALID_PARTITION_KEY_SHAPE when value is number",
    ({ Given, When, Then, And }) => {
      Given("a command config with getPartitionKey returning value as number", () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => ({ name: "test", value: 123 }),
          },
        };
      });

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then("the result should be invalid", () => {
        expect(state.validationResult?.valid).toBe(false);
      });

      And('the error code should be "INVALID_PARTITION_KEY_SHAPE"', () => {
        expect(state.validationResult?.errors[0].code).toBe("INVALID_PARTITION_KEY_SHAPE");
      });
    }
  );

  // =========================================================================
  // Empty Partition Value Errors
  // =========================================================================

  Scenario("Returns EMPTY_PARTITION_VALUE for empty string", ({ Given, When, Then, And }) => {
    Given("a command config with getPartitionKey returning empty string value", () => {
      state.commandConfig = {
        commandType: "CreateOrder",
        projection: {
          projectionName: "orderSummary",
          getPartitionKey: () => ({ name: "test", value: "" }),
        },
      };
    });

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then("the result should be invalid", () => {
      expect(state.validationResult?.valid).toBe(false);
    });

    And('the error code should be "EMPTY_PARTITION_VALUE"', () => {
      expect(state.validationResult?.errors[0].code).toBe("EMPTY_PARTITION_VALUE");
    });
  });

  Scenario(
    "Returns EMPTY_PARTITION_VALUE for whitespace-only string",
    ({ Given, When, Then, And }) => {
      Given("a command config with getPartitionKey returning whitespace-only value", () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => ({ name: "test", value: "   " }),
          },
        };
      });

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then("the result should be invalid", () => {
        expect(state.validationResult?.valid).toBe(false);
      });

      And('the error code should be "EMPTY_PARTITION_VALUE"', () => {
        expect(state.validationResult?.errors[0].code).toBe("EMPTY_PARTITION_VALUE");
      });
    }
  );

  // =========================================================================
  // Multiple Projection Validation
  // =========================================================================

  Scenario("Collects errors from all projections", ({ Given, When, Then }) => {
    Given("a command config with all projections missing getPartitionKey", () => {
      state.commandConfig = {
        commandType: "CreateOrder",
        projection: {
          projectionName: "orderSummary",
        },
        secondaryProjections: [
          {
            projectionName: "orderAnalytics",
          },
        ],
        failedProjection: {
          projectionName: "failedOrders",
        },
      };
    });

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then("there should be 3 errors", () => {
      expect(state.validationResult?.errors).toHaveLength(3);
    });
  });

  Scenario(
    "Reports correct config paths for secondary projections",
    ({ Given, And, When, Then }) => {
      Given("a command config with valid primary projection", () => {
        state.commandConfig = {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => ({ name: "a", value: "b" }),
          },
        };
      });

      And("2 secondary projections missing getPartitionKey", () => {
        state.commandConfig!.secondaryProjections = [
          { projectionName: "secondary0" },
          { projectionName: "secondary1" },
        ];
      });

      When("I call validateCommandConfigPartitions", () => {
        state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
      });

      Then('error 0 configPath should be "CreateOrder.secondaryProjections[0]"', () => {
        expect(state.validationResult?.errors[0].configPath).toBe(
          "CreateOrder.secondaryProjections[0]"
        );
      });

      And('error 1 configPath should be "CreateOrder.secondaryProjections[1]"', () => {
        expect(state.validationResult?.errors[1].configPath).toBe(
          "CreateOrder.secondaryProjections[1]"
        );
      });
    }
  );

  Scenario("Reports correct config path for failed projection", ({ Given, And, When, Then }) => {
    Given("a command config with valid primary projection", () => {
      state.commandConfig = {
        commandType: "CreateOrder",
        projection: {
          projectionName: "orderSummary",
          getPartitionKey: () => ({ name: "a", value: "b" }),
        },
      };
    });

    And("failed projection missing getPartitionKey", () => {
      state.commandConfig!.failedProjection = {
        projectionName: "failedOrders",
      };
    });

    When("I call validateCommandConfigPartitions", () => {
      state.validationResult = validateCommandConfigPartitions(state.commandConfig!);
    });

    Then('the error configPath should be "CreateOrder.failedProjection"', () => {
      expect(state.validationResult?.errors[0].configPath).toBe("CreateOrder.failedProjection");
    });
  });

  // =========================================================================
  // assertValidPartitionKeys Array Validation
  // =========================================================================

  Scenario("Does not throw for valid configs array", ({ Given, When, Then }) => {
    Given("an array of valid command configs", () => {
      state.commandConfigs = [
        {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
            getPartitionKey: () => ({ name: "a", value: "b" }),
          },
        },
        {
          commandType: "SubmitOrder",
          projection: {
            projectionName: "orderStatus",
            getPartitionKey: () => ({ name: "c", value: "d" }),
          },
        },
      ];
    });

    When("I call assertValidPartitionKeys", () => {
      try {
        assertValidPartitionKeys(state.commandConfigs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("no error should be thrown", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Does not throw for empty array", ({ Given, When, Then }) => {
    Given("an empty array of command configs", () => {
      state.commandConfigs = [];
    });

    When("I call assertValidPartitionKeys", () => {
      try {
        assertValidPartitionKeys(state.commandConfigs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("no error should be thrown", () => {
      expect(state.error).toBeNull();
    });
  });

  Scenario("Throws on first invalid config", ({ Given, When, Then }) => {
    Given("an array with one invalid command config", () => {
      state.commandConfigs = [
        {
          commandType: "CreateOrder",
          projection: {
            projectionName: "orderSummary",
          },
        },
      ];
    });

    When("I call assertValidPartitionKeys", () => {
      try {
        assertValidPartitionKeys(state.commandConfigs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then(
      'an error should be thrown with message containing "Partition key validation failed"',
      () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toContain("Partition key validation failed");
      }
    );
  });

  Scenario("Includes all errors in thrown message", ({ Given, When, Then }) => {
    Given("an array with 2 invalid command configs", () => {
      state.commandConfigs = [
        {
          commandType: "CreateOrder",
          projection: { projectionName: "orderSummary" },
        },
        {
          commandType: "SubmitOrder",
          projection: { projectionName: "orderStatus" },
        },
      ];
    });

    When("I call assertValidPartitionKeys", () => {
      try {
        assertValidPartitionKeys(state.commandConfigs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error should be thrown with message containing "2 projection(s)"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toMatch(/2 projection\(s\)/);
    });
  });

  Scenario("Includes error codes in thrown message", ({ Given, When, Then }) => {
    Given("an array with one config missing getPartitionKey", () => {
      state.commandConfigs = [
        {
          commandType: "CreateOrder",
          projection: { projectionName: "orderSummary" },
        },
      ];
    });

    When("I call assertValidPartitionKeys", () => {
      try {
        assertValidPartitionKeys(state.commandConfigs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error should be thrown with message containing "MISSING_PARTITION_KEY"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("MISSING_PARTITION_KEY");
    });
  });

  Scenario("Includes config path in thrown message", ({ Given, When, Then }) => {
    Given(
      'an array with one config for "CreateOrder" missing getPartitionKey on primary projection',
      () => {
        state.commandConfigs = [
          {
            commandType: "CreateOrder",
            projection: { projectionName: "orderSummary" },
          },
        ];
      }
    );

    When("I call assertValidPartitionKeys", () => {
      try {
        assertValidPartitionKeys(state.commandConfigs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error should be thrown with message containing "CreateOrder.projection"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("CreateOrder.projection");
    });
  });
});
