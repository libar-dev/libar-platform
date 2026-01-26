/**
 * Projection Complexity Classifier - Step Definitions
 *
 * BDD step definitions for projection classification:
 * - classifyProjection decision tree
 * - PARALLELISM_BY_STRATEGY constants
 * - getRecommendedParallelism function
 *
 * @since Phase 18c (WorkpoolPartitioning)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  classifyProjection,
  type ProjectionCharacteristics,
  type ClassificationResult,
} from "../../../src/workpool/partitioning/complexity.js";
import {
  getRecommendedParallelism,
  PARALLELISM_BY_STRATEGY,
  type PartitionStrategy,
} from "../../../src/workpool/partitioning/config.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  characteristics: ProjectionCharacteristics | null;
  classificationResult: ClassificationResult | null;
  parallelismResult: number | null;
}

let state: TestState;

function resetState(): void {
  state = {
    characteristics: null,
    classificationResult: null,
    parallelismResult: null,
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/workpool-partitioning/complexity-classifier.feature"
);

describeFeature(
  feature,
  ({ Scenario, ScenarioOutline, Background, BeforeEachScenario, AfterEachScenario }) => {
    BeforeEachScenario(() => {
      resetState();
    });

    AfterEachScenario(() => {
      resetState();
    });

    Background(({ Given }) => {
      Given("the decision tree priority is global > saga > customer > entity", () => {
        // Documentation - priority is defined in implementation
      });
    });

    // =========================================================================
    // Single Entity Projections (Default)
    // =========================================================================

    Scenario("Single entity projections recommend entity strategy", ({ Given, When, Then }) => {
      Given("projection characteristics with singleEntity true and all others false", () => {
        state.characteristics = {
          singleEntity: true,
          customerScoped: false,
          crossContext: false,
          globalRollup: false,
        };
      });

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the strategy should be "entity"', () => {
        expect(state.classificationResult?.strategy).toBe("entity");
      });
    });

    Scenario("Single entity projections return simple complexity", ({ Given, When, Then }) => {
      Given("projection characteristics with singleEntity true and all others false", () => {
        state.characteristics = {
          singleEntity: true,
          customerScoped: false,
          crossContext: false,
          globalRollup: false,
        };
      });

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the complexity should be "simple"', () => {
        expect(state.classificationResult?.complexity).toBe("simple");
      });
    });

    Scenario(
      "Single entity projections include rationale about streamId",
      ({ Given, When, Then, And }) => {
        Given("projection characteristics with singleEntity true and all others false", () => {
          state.characteristics = {
            singleEntity: true,
            customerScoped: false,
            crossContext: false,
            globalRollup: false,
          };
        });

        When("I call classifyProjection", () => {
          state.classificationResult = classifyProjection(state.characteristics!);
        });

        Then('the rationale should contain "streamId"', () => {
          expect(state.classificationResult?.rationale).toContain("streamId");
        });

        And('the rationale should contain "per-entity ordering"', () => {
          expect(state.classificationResult?.rationale).toContain("per-entity ordering");
        });
      }
    );

    Scenario(
      "Classification defaults to entity when all flags are false",
      ({ Given, When, Then }) => {
        Given("projection characteristics with all flags false", () => {
          state.characteristics = {
            singleEntity: false,
            customerScoped: false,
            crossContext: false,
            globalRollup: false,
          };
        });

        When("I call classifyProjection", () => {
          state.classificationResult = classifyProjection(state.characteristics!);
        });

        Then('the strategy should be "entity"', () => {
          expect(state.classificationResult?.strategy).toBe("entity");
        });
      }
    );

    // =========================================================================
    // Global Rollup Projections
    // =========================================================================

    Scenario("Global rollup projections recommend global strategy", ({ Given, When, Then }) => {
      Given("projection characteristics with globalRollup true and singleEntity false", () => {
        state.characteristics = {
          singleEntity: false,
          customerScoped: false,
          crossContext: false,
          globalRollup: true,
        };
      });

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the strategy should be "global"', () => {
        expect(state.classificationResult?.strategy).toBe("global");
      });
    });

    Scenario("Global rollup projections return complex complexity", ({ Given, When, Then }) => {
      Given("projection characteristics with globalRollup true and singleEntity false", () => {
        state.characteristics = {
          singleEntity: false,
          customerScoped: false,
          crossContext: false,
          globalRollup: true,
        };
      });

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the complexity should be "complex"', () => {
        expect(state.classificationResult?.complexity).toBe("complex");
      });
    });

    Scenario(
      "Global rollup projections include rationale about OCC conflicts",
      ({ Given, When, Then }) => {
        Given("projection characteristics with globalRollup true and singleEntity false", () => {
          state.characteristics = {
            singleEntity: false,
            customerScoped: false,
            crossContext: false,
            globalRollup: true,
          };
        });

        When("I call classifyProjection", () => {
          state.classificationResult = classifyProjection(state.characteristics!);
        });

        Then('the rationale should contain "OCC conflicts"', () => {
          expect(state.classificationResult?.rationale).toContain("OCC conflicts");
        });
      }
    );

    Scenario("Global strategy prioritizes over other flags", ({ Given, When, Then }) => {
      Given("projection characteristics with all flags true", () => {
        state.characteristics = {
          singleEntity: true,
          customerScoped: true,
          crossContext: true,
          globalRollup: true,
        };
      });

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the strategy should be "global"', () => {
        expect(state.classificationResult?.strategy).toBe("global");
      });
    });

    // =========================================================================
    // Cross-Context Projections
    // =========================================================================

    Scenario("Cross-context projections recommend saga strategy", ({ Given, When, Then }) => {
      Given("projection characteristics with crossContext true and globalRollup false", () => {
        state.characteristics = {
          singleEntity: false,
          customerScoped: false,
          crossContext: true,
          globalRollup: false,
        };
      });

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the strategy should be "saga"', () => {
        expect(state.classificationResult?.strategy).toBe("saga");
      });
    });

    Scenario("Cross-context projections return complex complexity", ({ Given, When, Then }) => {
      Given("projection characteristics with crossContext true and globalRollup false", () => {
        state.characteristics = {
          singleEntity: false,
          customerScoped: false,
          crossContext: true,
          globalRollup: false,
        };
      });

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the complexity should be "complex"', () => {
        expect(state.classificationResult?.complexity).toBe("complex");
      });
    });

    Scenario(
      "Cross-context projections include rationale about correlationId",
      ({ Given, When, Then, And }) => {
        Given("projection characteristics with crossContext true and globalRollup false", () => {
          state.characteristics = {
            singleEntity: false,
            customerScoped: false,
            crossContext: true,
            globalRollup: false,
          };
        });

        When("I call classifyProjection", () => {
          state.classificationResult = classifyProjection(state.characteristics!);
        });

        Then('the rationale should contain "correlationId"', () => {
          expect(state.classificationResult?.rationale).toContain("correlationId");
        });

        And('the rationale should contain "causal ordering"', () => {
          expect(state.classificationResult?.rationale).toContain("causal ordering");
        });
      }
    );

    Scenario("Saga strategy prioritizes over customer and entity", ({ Given, When, Then }) => {
      Given(
        "projection characteristics with singleEntity true, customerScoped true, crossContext true, globalRollup false",
        () => {
          state.characteristics = {
            singleEntity: true,
            customerScoped: true,
            crossContext: true,
            globalRollup: false,
          };
        }
      );

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the strategy should be "saga"', () => {
        expect(state.classificationResult?.strategy).toBe("saga");
      });
    });

    // =========================================================================
    // Customer-Scoped Projections
    // =========================================================================

    Scenario("Customer-scoped projections recommend customer strategy", ({ Given, When, Then }) => {
      Given(
        "projection characteristics with customerScoped true and crossContext false and globalRollup false",
        () => {
          state.characteristics = {
            singleEntity: false,
            customerScoped: true,
            crossContext: false,
            globalRollup: false,
          };
        }
      );

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the strategy should be "customer"', () => {
        expect(state.classificationResult?.strategy).toBe("customer");
      });
    });

    Scenario("Customer-scoped projections return moderate complexity", ({ Given, When, Then }) => {
      Given(
        "projection characteristics with customerScoped true and crossContext false and globalRollup false",
        () => {
          state.characteristics = {
            singleEntity: false,
            customerScoped: true,
            crossContext: false,
            globalRollup: false,
          };
        }
      );

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the complexity should be "moderate"', () => {
        expect(state.classificationResult?.complexity).toBe("moderate");
      });
    });

    Scenario(
      "Customer-scoped projections include rationale about customerId",
      ({ Given, When, Then, And }) => {
        Given(
          "projection characteristics with customerScoped true and crossContext false and globalRollup false",
          () => {
            state.characteristics = {
              singleEntity: false,
              customerScoped: true,
              crossContext: false,
              globalRollup: false,
            };
          }
        );

        When("I call classifyProjection", () => {
          state.classificationResult = classifyProjection(state.characteristics!);
        });

        Then('the rationale should contain "customerId"', () => {
          expect(state.classificationResult?.rationale).toContain("customerId");
        });

        And('the rationale should contain "per-customer ordering"', () => {
          expect(state.classificationResult?.rationale).toContain("per-customer ordering");
        });
      }
    );

    Scenario("Customer strategy prioritizes over entity", ({ Given, When, Then }) => {
      Given(
        "projection characteristics with singleEntity true, customerScoped true, crossContext false, globalRollup false",
        () => {
          state.characteristics = {
            singleEntity: true,
            customerScoped: true,
            crossContext: false,
            globalRollup: false,
          };
        }
      );

      When("I call classifyProjection", () => {
        state.classificationResult = classifyProjection(state.characteristics!);
      });

      Then('the strategy should be "customer"', () => {
        expect(state.classificationResult?.strategy).toBe("customer");
      });
    });

    // =========================================================================
    // Decision Tree Priority
    // =========================================================================

    Scenario(
      "Decision tree follows priority global > saga > customer > entity",
      ({ Given, Then }) => {
        Given("projection characteristics with all flags true", () => {
          state.characteristics = {
            singleEntity: true,
            customerScoped: true,
            crossContext: true,
            globalRollup: true,
          };
        });

        Then('classifying should return strategy "global"', () => {
          expect(classifyProjection(state.characteristics!).strategy).toBe("global");
        });

        Given("projection characteristics with globalRollup false but all others true", () => {
          state.characteristics = {
            singleEntity: true,
            customerScoped: true,
            crossContext: true,
            globalRollup: false,
          };
        });

        Then('classifying should return strategy "saga"', () => {
          expect(classifyProjection(state.characteristics!).strategy).toBe("saga");
        });

        Given(
          "projection characteristics with globalRollup false, crossContext false, but customerScoped and singleEntity true",
          () => {
            state.characteristics = {
              singleEntity: true,
              customerScoped: true,
              crossContext: false,
              globalRollup: false,
            };
          }
        );

        Then('classifying should return strategy "customer"', () => {
          expect(classifyProjection(state.characteristics!).strategy).toBe("customer");
        });

        Given("projection characteristics with only singleEntity true", () => {
          state.characteristics = {
            singleEntity: true,
            customerScoped: false,
            crossContext: false,
            globalRollup: false,
          };
        });

        Then('classifying should return strategy "entity"', () => {
          expect(classifyProjection(state.characteristics!).strategy).toBe("entity");
        });
      }
    );

    // =========================================================================
    // PARALLELISM_BY_STRATEGY Constants
    // =========================================================================

    ScenarioOutline(
      "Strategy parallelism values",
      ({ When, Then }, variables: { strategy: string; parallelism: string }) => {
        When('I access PARALLELISM_BY_STRATEGY for "<strategy>"', () => {
          state.parallelismResult =
            PARALLELISM_BY_STRATEGY[variables.strategy as PartitionStrategy];
        });

        Then("the parallelism should be <parallelism>", () => {
          expect(state.parallelismResult).toBe(Number(variables.parallelism));
        });
      }
    );

    // =========================================================================
    // getRecommendedParallelism Function
    // =========================================================================

    ScenarioOutline(
      "Get recommended parallelism by strategy",
      ({ When, Then }, variables: { strategy: string; parallelism: string }) => {
        When('I call getRecommendedParallelism with "<strategy>"', () => {
          state.parallelismResult = getRecommendedParallelism(
            variables.strategy as PartitionStrategy
          );
        });

        Then("the result should be <parallelism>", () => {
          expect(state.parallelismResult).toBe(Number(variables.parallelism));
        });
      }
    );
  }
);
