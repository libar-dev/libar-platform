/**
 * Partition Key Helpers - Step Definitions
 *
 * BDD step definitions for partition key helper functions:
 * - createEntityPartitionKey
 * - createCustomerPartitionKey
 * - createSagaPartitionKey
 * - createGlobalPartitionKey
 * - createDCBPartitionKey
 * - GLOBAL_PARTITION_KEY constant
 *
 * @since Phase 18c (WorkpoolPartitioning)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  GLOBAL_PARTITION_KEY,
  createEntityPartitionKey,
  createCustomerPartitionKey,
  createSagaPartitionKey,
  createGlobalPartitionKey,
  createDCBPartitionKey,
  type PartitionKey,
  type PartitionKeyExtractor,
  type EntityPartitionArgs,
  type CustomerPartitionArgs,
  type SagaPartitionArgs,
} from "../../../src/workpool/partitioning/index.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Helpers
  entityHelper: PartitionKeyExtractor<EntityPartitionArgs> | null;
  customerHelper: PartitionKeyExtractor<CustomerPartitionArgs> | null;
  sagaHelper: PartitionKeyExtractor<SagaPartitionArgs> | null;
  globalHelper: PartitionKeyExtractor<unknown> | null;

  // Results
  partitionKey: PartitionKey | null;
  partitionKeyResults: PartitionKey[];

  // Error handling
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    entityHelper: null,
    customerHelper: null,
    sagaHelper: null,
    globalHelper: null,
    partitionKey: null,
    partitionKeyResults: [],
    error: null,
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/workpool-partitioning/partition-key-helpers.feature"
);

describeFeature(feature, ({ Scenario, ScenarioOutline, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // =========================================================================
  // GLOBAL_PARTITION_KEY Constant
  // =========================================================================

  Scenario("GLOBAL_PARTITION_KEY has name 'global'", ({ When, Then }) => {
    When("I access GLOBAL_PARTITION_KEY", () => {
      state.partitionKey = GLOBAL_PARTITION_KEY;
    });

    Then('the partition key name should be "global"', () => {
      expect(state.partitionKey?.name).toBe("global");
    });
  });

  Scenario("GLOBAL_PARTITION_KEY has value 'global'", ({ When, Then }) => {
    When("I access GLOBAL_PARTITION_KEY", () => {
      state.partitionKey = GLOBAL_PARTITION_KEY;
    });

    Then('the partition key value should be "global"', () => {
      expect(state.partitionKey?.value).toBe("global");
    });
  });

  // =========================================================================
  // createEntityPartitionKey - streamId Field
  // =========================================================================

  Scenario("Entity partition key uses streamType:streamId format", ({ Given, When, Then }) => {
    Given('a createEntityPartitionKey helper for streamType "Order"', () => {
      state.entityHelper = createEntityPartitionKey("Order");
    });

    When('called with streamId "ord-123"', () => {
      try {
        state.partitionKey = state.entityHelper!({ streamId: "ord-123" });
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('the partition key should be name "streamId" and value "Order:ord-123"', () => {
      expect(state.partitionKey).toEqual({ name: "streamId", value: "Order:ord-123" });
    });
  });

  Scenario(
    "Entity partition key prioritizes streamId over other ID fields",
    ({ Given, When, Then }) => {
      Given('a createEntityPartitionKey helper for streamType "Order"', () => {
        state.entityHelper = createEntityPartitionKey("Order");
      });

      When('called with streamId "stream-123", orderId "ord-456", productId "prod-789"', () => {
        state.partitionKey = state.entityHelper!({
          streamId: "stream-123",
          orderId: "ord-456",
          productId: "prod-789",
        });
      });

      Then('the partition key should be name "streamId" and value "Order:stream-123"', () => {
        expect(state.partitionKey).toEqual({ name: "streamId", value: "Order:stream-123" });
      });
    }
  );

  // =========================================================================
  // createEntityPartitionKey - Fallback Fields
  // =========================================================================

  ScenarioOutline(
    "Entity partition key falls back to alternate ID fields",
    (
      { Given, When, Then },
      variables: { streamType: string; idField: string; idValue: string; expectedValue: string }
    ) => {
      Given('a createEntityPartitionKey helper for streamType "<streamType>"', () => {
        state.entityHelper = createEntityPartitionKey(variables.streamType);
      });

      When('called with <idField> "<idValue>"', () => {
        const args: EntityPartitionArgs = { [variables.idField]: variables.idValue };
        state.partitionKey = state.entityHelper!(args);
      });

      Then('the partition key should be name "streamId" and value "<expectedValue>"', () => {
        expect(state.partitionKey).toEqual({
          name: "streamId",
          value: variables.expectedValue,
        });
      });
    }
  );

  // =========================================================================
  // createEntityPartitionKey - Error Cases
  // =========================================================================

  Scenario("Entity partition key throws when no ID field provided", ({ Given, When, Then }) => {
    Given('a createEntityPartitionKey helper for streamType "Order"', () => {
      state.entityHelper = createEntityPartitionKey("Order");
    });

    When("called with empty args", () => {
      try {
        state.partitionKey = state.entityHelper!({});
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then(
      'an error should be thrown with message containing "requires streamId, orderId, productId, or reservationId"',
      () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toContain(
          "requires streamId, orderId, productId, or reservationId"
        );
      }
    );
  });

  Scenario(
    "Entity partition key includes available keys in error message",
    ({ Given, When, Then }) => {
      Given('a createEntityPartitionKey helper for streamType "Order"', () => {
        state.entityHelper = createEntityPartitionKey("Order");
      });

      When('called with customerId "cust-123" and someField "value"', () => {
        try {
          state.partitionKey = state.entityHelper!({
            customerId: "cust-123",
            someField: "value",
          } as EntityPartitionArgs);
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('an error should be thrown with message containing "Received args with keys:"', () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toContain("Received args with keys:");
      });
    }
  );

  // =========================================================================
  // createEntityPartitionKey - Different Stream Types
  // =========================================================================

  ScenarioOutline(
    "Entity partition key uses provided streamType in value",
    (
      { Given, When, Then },
      variables: { streamType: string; idField: string; idValue: string; expectedValue: string }
    ) => {
      Given('a createEntityPartitionKey helper for streamType "<streamType>"', () => {
        state.entityHelper = createEntityPartitionKey(variables.streamType);
      });

      When('called with <idField> "<idValue>"', () => {
        const args: EntityPartitionArgs = { [variables.idField]: variables.idValue };
        state.partitionKey = state.entityHelper!(args);
      });

      Then('the partition key value should be "<expectedValue>"', () => {
        expect(state.partitionKey?.value).toBe(variables.expectedValue);
      });
    }
  );

  // =========================================================================
  // createCustomerPartitionKey - Valid Cases
  // =========================================================================

  Scenario("Customer partition key returns customerId", ({ Given, When, Then }) => {
    Given("a createCustomerPartitionKey helper", () => {
      state.customerHelper = createCustomerPartitionKey();
    });

    When('called with customerId "cust-123"', () => {
      state.partitionKey = state.customerHelper!({ customerId: "cust-123" });
    });

    Then('the partition key should be name "customerId" and value "cust-123"', () => {
      expect(state.partitionKey).toEqual({ name: "customerId", value: "cust-123" });
    });
  });

  Scenario("Customer partition key ignores additional fields", ({ Given, When, Then }) => {
    Given("a createCustomerPartitionKey helper", () => {
      state.customerHelper = createCustomerPartitionKey();
    });

    When('called with customerId "cust-456", orderId "ord-789", someOtherField "value"', () => {
      state.partitionKey = state.customerHelper!({
        customerId: "cust-456",
        orderId: "ord-789",
        someOtherField: "value",
      } as CustomerPartitionArgs);
    });

    Then('the partition key should be name "customerId" and value "cust-456"', () => {
      expect(state.partitionKey).toEqual({ name: "customerId", value: "cust-456" });
    });
  });

  // =========================================================================
  // createCustomerPartitionKey - Error Cases
  // =========================================================================

  Scenario(
    "Customer partition key throws when customerId is undefined",
    ({ Given, When, Then }) => {
      Given("a createCustomerPartitionKey helper", () => {
        state.customerHelper = createCustomerPartitionKey();
      });

      When("called with customerId undefined", () => {
        try {
          state.partitionKey = state.customerHelper!({
            customerId: undefined,
          } as unknown as CustomerPartitionArgs);
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('an error should be thrown with message containing "requires customerId field"', () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toContain("requires customerId field");
      });
    }
  );

  Scenario("Customer partition key throws when customerId is missing", ({ Given, When, Then }) => {
    Given("a createCustomerPartitionKey helper", () => {
      state.customerHelper = createCustomerPartitionKey();
    });

    When("called with customerId missing entirely", () => {
      try {
        state.partitionKey = state.customerHelper!({} as unknown as CustomerPartitionArgs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error should be thrown with message containing "requires customerId field"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("requires customerId field");
    });
  });

  Scenario(
    "Customer partition key throws when customerId is empty string",
    ({ Given, When, Then }) => {
      Given("a createCustomerPartitionKey helper", () => {
        state.customerHelper = createCustomerPartitionKey();
      });

      When("called with customerId empty string", () => {
        try {
          state.partitionKey = state.customerHelper!({ customerId: "" });
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('an error should be thrown with message containing "requires customerId field"', () => {
        expect(state.error).not.toBeNull();
        expect(state.error?.message).toContain("requires customerId field");
      });
    }
  );

  // =========================================================================
  // createSagaPartitionKey - Valid Cases
  // =========================================================================

  Scenario("Saga partition key returns correlationId", ({ Given, When, Then }) => {
    Given("a createSagaPartitionKey helper", () => {
      state.sagaHelper = createSagaPartitionKey();
    });

    When('called with correlationId "corr-123"', () => {
      state.partitionKey = state.sagaHelper!({ correlationId: "corr-123" });
    });

    Then('the partition key should be name "correlationId" and value "corr-123"', () => {
      expect(state.partitionKey).toEqual({ name: "correlationId", value: "corr-123" });
    });
  });

  Scenario("Saga partition key ignores additional fields", ({ Given, When, Then }) => {
    Given("a createSagaPartitionKey helper", () => {
      state.sagaHelper = createSagaPartitionKey();
    });

    When('called with correlationId "corr-456", sagaId "saga-789", orderId "ord-101"', () => {
      state.partitionKey = state.sagaHelper!({
        correlationId: "corr-456",
        sagaId: "saga-789",
        orderId: "ord-101",
      } as SagaPartitionArgs);
    });

    Then('the partition key should be name "correlationId" and value "corr-456"', () => {
      expect(state.partitionKey).toEqual({ name: "correlationId", value: "corr-456" });
    });
  });

  // =========================================================================
  // createSagaPartitionKey - Error Cases
  // =========================================================================

  Scenario("Saga partition key throws when correlationId is undefined", ({ Given, When, Then }) => {
    Given("a createSagaPartitionKey helper", () => {
      state.sagaHelper = createSagaPartitionKey();
    });

    When("called with correlationId undefined", () => {
      try {
        state.partitionKey = state.sagaHelper!({
          correlationId: undefined,
        } as unknown as SagaPartitionArgs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error should be thrown with message containing "requires correlationId field"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("requires correlationId field");
    });
  });

  Scenario("Saga partition key throws when correlationId is missing", ({ Given, When, Then }) => {
    Given("a createSagaPartitionKey helper", () => {
      state.sagaHelper = createSagaPartitionKey();
    });

    When("called with correlationId missing entirely", () => {
      try {
        state.partitionKey = state.sagaHelper!({} as unknown as SagaPartitionArgs);
        state.error = null;
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then('an error should be thrown with message containing "requires correlationId field"', () => {
      expect(state.error).not.toBeNull();
      expect(state.error?.message).toContain("requires correlationId field");
    });
  });

  Scenario(
    "Saga partition key throws when correlationId is empty string",
    ({ Given, When, Then }) => {
      Given("a createSagaPartitionKey helper", () => {
        state.sagaHelper = createSagaPartitionKey();
      });

      When("called with correlationId empty string", () => {
        try {
          state.partitionKey = state.sagaHelper!({ correlationId: "" });
          state.error = null;
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then(
        'an error should be thrown with message containing "requires correlationId field"',
        () => {
          expect(state.error).not.toBeNull();
          expect(state.error?.message).toContain("requires correlationId field");
        }
      );
    }
  );

  // =========================================================================
  // createGlobalPartitionKey
  // =========================================================================

  Scenario("Global partition key returns GLOBAL_PARTITION_KEY", ({ Given, When, Then }) => {
    Given("a createGlobalPartitionKey helper", () => {
      state.globalHelper = createGlobalPartitionKey();
    });

    When("called with no arguments", () => {
      state.partitionKey = state.globalHelper!({});
    });

    Then("the result should equal GLOBAL_PARTITION_KEY", () => {
      expect(state.partitionKey).toEqual(GLOBAL_PARTITION_KEY);
    });
  });

  Scenario("Global partition key ignores any arguments", ({ Given, When, Then }) => {
    Given("a createGlobalPartitionKey helper with type argument", () => {
      state.globalHelper = createGlobalPartitionKey<{ orderId: string }>();
    });

    When('called with orderId "ord-123"', () => {
      state.partitionKey = state.globalHelper!({ orderId: "ord-123" });
    });

    Then("the result should equal GLOBAL_PARTITION_KEY", () => {
      expect(state.partitionKey).toEqual(GLOBAL_PARTITION_KEY);
    });
  });

  Scenario(
    "Global partition key returns same reference on multiple calls",
    ({ Given, When, Then }) => {
      Given("a createGlobalPartitionKey helper", () => {
        state.globalHelper = createGlobalPartitionKey();
      });

      When("called multiple times", () => {
        state.partitionKeyResults = [
          state.globalHelper!({}),
          state.globalHelper!({}),
          state.globalHelper!({}),
        ];
      });

      Then("all results should be the same reference as GLOBAL_PARTITION_KEY", () => {
        for (const result of state.partitionKeyResults) {
          expect(result).toBe(GLOBAL_PARTITION_KEY);
        }
      });
    }
  );

  // =========================================================================
  // createDCBPartitionKey
  // =========================================================================

  Scenario("DCB partition key has name 'dcb'", ({ When, Then }) => {
    When('I call createDCBPartitionKey with scope key "tenant:T:entity:Order:ord-123"', () => {
      state.partitionKey = createDCBPartitionKey("tenant:T:entity:Order:ord-123");
    });

    Then('the partition key name should be "dcb"', () => {
      expect(state.partitionKey?.name).toBe("dcb");
    });
  });

  Scenario("DCB partition key uses scope key as value", ({ When, Then }) => {
    When('I call createDCBPartitionKey with scope key "tenant:T:reservation:res-456"', () => {
      state.partitionKey = createDCBPartitionKey("tenant:T:reservation:res-456");
    });

    Then('the partition key value should be "tenant:T:reservation:res-456"', () => {
      expect(state.partitionKey?.value).toBe("tenant:T:reservation:res-456");
    });
  });

  ScenarioOutline(
    "DCB partition key handles various scope key formats",
    ({ When, Then }, variables: { scopeKey: string }) => {
      When('I call createDCBPartitionKey with scope key "<scopeKey>"', () => {
        state.partitionKey = createDCBPartitionKey(variables.scopeKey);
      });

      Then('the partition key should be name "dcb" and value "<scopeKey>"', () => {
        expect(state.partitionKey).toEqual({ name: "dcb", value: variables.scopeKey });
      });
    }
  );
});
