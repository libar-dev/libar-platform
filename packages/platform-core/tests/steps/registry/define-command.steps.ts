/**
 * defineCommand Helpers - Step Definitions
 *
 * BDD step definitions for defineAggregateCommand, defineProcessCommand,
 * and defineSystemCommand helper functions.
 *
 * Mechanical migration from tests/unit/registry/defineCommand.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { z } from "zod";
import {
  defineAggregateCommand,
  defineProcessCommand,
  defineSystemCommand,
  CommandRegistry,
} from "../../../src/registry/index.js";
import type { CommandHandlerResult } from "../../../src/orchestration/types.js";

// =============================================================================
// Mock Helpers
// =============================================================================

const mockMutationRef = <TArgs = unknown, TResult = unknown>() =>
  ({}) as never as import("convex/server").FunctionReference<
    "mutation",
    "internal",
    TArgs,
    TResult
  >;

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // Aggregate command results
  aggregateResult: ReturnType<typeof defineAggregateCommand> | null;
  handlerArgs: Record<string, unknown> | null;
  partitionKey: { name: string; value: string } | null;
  sagaOnCompleteRef: unknown;
  // Process command results
  processResult: ReturnType<typeof defineProcessCommand> | null;
  processPartitionKey: { name: string; value: string } | null;
  // System command results
  systemResult: ReturnType<typeof defineSystemCommand> | null;
  systemHandlerArgs: Record<string, unknown> | null;
  systemPartitionKey: { name: string; value: string } | null;
}

function createInitialState(): TestState {
  return {
    aggregateResult: null,
    handlerArgs: null,
    partitionKey: null,
    sagaOnCompleteRef: null,
    processResult: null,
    processPartitionKey: null,
    systemResult: null,
    systemHandlerArgs: null,
    systemPartitionKey: null,
  };
}

let state: TestState = createInitialState();

const feature = await loadFeature("tests/features/behavior/registry/define-command.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    CommandRegistry.resetForTesting();
  });

  // ===========================================================================
  // Background
  // ===========================================================================

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Imports verified at module level
    });
  });

  // ===========================================================================
  // defineAggregateCommand — Config Structure
  // ===========================================================================

  Rule(
    "defineAggregateCommand creates a correctly structured command config",
    ({ RuleScenario }) => {
      RuleScenario(
        "Config has correct commandType, boundedContext, and projection name",
        ({ When, Then, And }) => {
          When(
            'an aggregate command "CreateOrder" is defined in context "orders" with projection "orderSummary"',
            () => {
              const schema = z.object({
                orderId: z.string(),
                customerId: z.string(),
              });
              state.aggregateResult = defineAggregateCommand({
                commandType: "CreateOrder",
                boundedContext: "orders",
                targetAggregate: "Order",
                aggregateIdField: "orderId",
                argsSchema: schema,
                handler: mockMutationRef<
                  {
                    orderId: string;
                    customerId: string;
                    commandId: string;
                    correlationId: string;
                  },
                  CommandHandlerResult<{ orderId: string }>
                >(),
                projection: {
                  handler: mockMutationRef(),
                  projectionName: "orderSummary",
                  toProjectionArgs: (args, result, globalPosition) => ({
                    orderId: args.orderId,
                    eventId: result.event.eventId,
                    globalPosition,
                  }),
                },
                autoRegister: false,
              });
            }
          );

          Then('the config commandType is "CreateOrder"', () => {
            expect(state.aggregateResult!.config.commandType).toBe("CreateOrder");
          });

          And('the config boundedContext is "orders"', () => {
            expect(state.aggregateResult!.config.boundedContext).toBe("orders");
          });

          And('the config projection name is "orderSummary"', () => {
            expect(state.aggregateResult!.config.projection.projectionName).toBe("orderSummary");
          });
        }
      );
    }
  );

  // ===========================================================================
  // defineAggregateCommand — toHandlerArgs
  // ===========================================================================

  Rule(
    "defineAggregateCommand generates toHandlerArgs that adds commandId and correlationId",
    ({ RuleScenario }) => {
      RuleScenario(
        "toHandlerArgs merges original args with commandId and correlationId",
        ({ Given, When, Then }) => {
          Given('an aggregate command "CreateOrder" is defined with an orderId field', () => {
            const schema = z.object({ orderId: z.string() });
            state.aggregateResult = defineAggregateCommand({
              commandType: "CreateOrder",
              boundedContext: "orders",
              targetAggregate: "Order",
              aggregateIdField: "orderId",
              argsSchema: schema,
              handler: mockMutationRef(),
              projection: {
                handler: mockMutationRef(),
                projectionName: "orderSummary",
                toProjectionArgs: () => ({}),
              },
              autoRegister: false,
            });
          });

          When(
            'toHandlerArgs is called with orderId "ord_123", commandId "cmd_456", correlationId "corr_789"',
            () => {
              state.handlerArgs = state.aggregateResult!.config.toHandlerArgs(
                { orderId: "ord_123" },
                "cmd_456",
                "corr_789"
              );
            }
          );

          Then(
            'the handler args equal orderId "ord_123", commandId "cmd_456", correlationId "corr_789"',
            () => {
              expect(state.handlerArgs).toEqual({
                orderId: "ord_123",
                commandId: "cmd_456",
                correlationId: "corr_789",
              });
            }
          );
        }
      );
    }
  );

  // ===========================================================================
  // defineAggregateCommand — Default Partition Key
  // ===========================================================================

  Rule(
    "defineAggregateCommand generates default partition key from aggregateIdField",
    ({ RuleScenario }) => {
      RuleScenario("Default partition key uses aggregateIdField", ({ Given, When, Then }) => {
        Given(
          'an aggregate command "CreateOrder" is defined with aggregateIdField "orderId"',
          () => {
            const schema = z.object({ orderId: z.string() });
            state.aggregateResult = defineAggregateCommand({
              commandType: "CreateOrder",
              boundedContext: "orders",
              targetAggregate: "Order",
              aggregateIdField: "orderId",
              argsSchema: schema,
              handler: mockMutationRef(),
              projection: {
                handler: mockMutationRef(),
                projectionName: "orderSummary",
                toProjectionArgs: () => ({}),
              },
              autoRegister: false,
            });
          }
        );

        When('getPartitionKey is called with orderId "ord_123"', () => {
          state.partitionKey = state.aggregateResult!.config.projection.getPartitionKey({
            orderId: "ord_123",
          });
        });

        Then('the partition key is name "orderId" and value "ord_123"', () => {
          expect(state.partitionKey).toEqual({
            name: "orderId",
            value: "ord_123",
          });
        });
      });
    }
  );

  // ===========================================================================
  // defineAggregateCommand — Custom Partition Key
  // ===========================================================================

  Rule("defineAggregateCommand allows custom partition key override", ({ RuleScenario }) => {
    RuleScenario("Custom partition key overrides the default", ({ Given, When, Then }) => {
      Given(
        'an aggregate command "CreateOrder" is defined with a custom partition key on "customerId"',
        () => {
          const schema = z.object({
            orderId: z.string(),
            customerId: z.string(),
          });
          state.aggregateResult = defineAggregateCommand({
            commandType: "CreateOrder",
            boundedContext: "orders",
            targetAggregate: "Order",
            aggregateIdField: "orderId",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "orderSummary",
              toProjectionArgs: () => ({}),
              getPartitionKey: (args) => ({
                name: "customerId",
                value: args.customerId as string,
              }),
            },
            autoRegister: false,
          });
        }
      );

      When('getPartitionKey is called with orderId "ord_123" and customerId "cust_456"', () => {
        state.partitionKey = state.aggregateResult!.config.projection.getPartitionKey({
          orderId: "ord_123",
          customerId: "cust_456",
        });
      });

      Then('the partition key is name "customerId" and value "cust_456"', () => {
        expect(state.partitionKey).toEqual({
          name: "customerId",
          value: "cust_456",
        });
      });
    });
  });

  // ===========================================================================
  // defineAggregateCommand — Metadata
  // ===========================================================================

  Rule(
    "defineAggregateCommand sets correct metadata for aggregate commands",
    ({ RuleScenario }) => {
      RuleScenario(
        "Metadata reflects aggregate category and custom options",
        ({ When, Then, And }) => {
          When(
            'an aggregate command "CreateOrder" is defined with description "Creates a new order", schemaVersion 2, and tags "orders,create"',
            () => {
              const schema = z.object({ orderId: z.string() });
              state.aggregateResult = defineAggregateCommand({
                commandType: "CreateOrder",
                boundedContext: "orders",
                targetAggregate: "Order",
                aggregateIdField: "orderId",
                argsSchema: schema,
                handler: mockMutationRef(),
                projection: {
                  handler: mockMutationRef(),
                  projectionName: "orderSummary",
                  toProjectionArgs: () => ({}),
                },
                description: "Creates a new order",
                schemaVersion: 2,
                tags: ["orders", "create"],
                autoRegister: false,
              });
            }
          );

          Then('the metadata category is "aggregate"', () => {
            expect(state.aggregateResult!.metadata.category).toBe("aggregate");
          });

          And('the metadata targetAggregate type is "Order" with idField "orderId"', () => {
            expect(state.aggregateResult!.metadata.targetAggregate).toEqual({
              type: "Order",
              idField: "orderId",
            });
          });

          And('the metadata description is "Creates a new order"', () => {
            expect(state.aggregateResult!.metadata.description).toBe("Creates a new order");
          });

          And("the metadata schemaVersion is 2", () => {
            expect(state.aggregateResult!.metadata.schemaVersion).toBe(2);
          });

          And('the metadata tags are "orders,create"', () => {
            expect(state.aggregateResult!.metadata.tags).toEqual(["orders", "create"]);
          });
        }
      );
    }
  );

  // ===========================================================================
  // defineAggregateCommand — Auto-Registration
  // ===========================================================================

  Rule(
    "defineAggregateCommand auto-registers with global registry by default",
    ({ RuleScenario }) => {
      RuleScenario("Command is auto-registered by default", ({ When, Then }) => {
        When('an aggregate command "CreateOrder" is defined without autoRegister option', () => {
          const schema = z.object({ orderId: z.string() });
          defineAggregateCommand({
            commandType: "CreateOrder",
            boundedContext: "orders",
            targetAggregate: "Order",
            aggregateIdField: "orderId",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "orderSummary",
              toProjectionArgs: () => ({}),
            },
          });
        });

        Then('the global registry has "CreateOrder"', () => {
          const registry = CommandRegistry.getInstance();
          expect(registry.has("CreateOrder")).toBe(true);
        });
      });

      RuleScenario("Command is not registered when autoRegister is false", ({ When, Then }) => {
        When('an aggregate command "CreateOrder" is defined with autoRegister false', () => {
          const schema = z.object({ orderId: z.string() });
          defineAggregateCommand({
            commandType: "CreateOrder",
            boundedContext: "orders",
            targetAggregate: "Order",
            aggregateIdField: "orderId",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "orderSummary",
              toProjectionArgs: () => ({}),
            },
            autoRegister: false,
          });
        });

        Then('the global registry does not have "CreateOrder"', () => {
          const registry = CommandRegistry.getInstance();
          expect(registry.has("CreateOrder")).toBe(false);
        });
      });
    }
  );

  // ===========================================================================
  // defineAggregateCommand — Secondary Projections
  // ===========================================================================

  Rule("defineAggregateCommand handles secondary projections", ({ RuleScenario }) => {
    RuleScenario("Secondary projections are included in config", ({ When, Then, And }) => {
      When(
        'an aggregate command "CreateOrder" is defined with a secondary projection "orderStats"',
        () => {
          const schema = z.object({ orderId: z.string() });
          state.aggregateResult = defineAggregateCommand({
            commandType: "CreateOrder",
            boundedContext: "orders",
            targetAggregate: "Order",
            aggregateIdField: "orderId",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "orderSummary",
              toProjectionArgs: () => ({}),
            },
            secondaryProjections: [
              {
                handler: mockMutationRef(),
                projectionName: "orderStats",
                toProjectionArgs: () => ({}),
              },
            ],
            autoRegister: false,
          });
        }
      );

      Then("the config has 1 secondary projection", () => {
        expect(state.aggregateResult!.config.secondaryProjections).toHaveLength(1);
      });

      And('the first secondary projection name is "orderStats"', () => {
        expect(state.aggregateResult!.config.secondaryProjections?.[0].projectionName).toBe(
          "orderStats"
        );
      });
    });
  });

  // ===========================================================================
  // defineAggregateCommand — Saga Routing
  // ===========================================================================

  Rule("defineAggregateCommand handles saga routing", ({ RuleScenario }) => {
    RuleScenario("Saga route is included in config", ({ When, Then, And }) => {
      When(
        'an aggregate command "CreateOrder" is defined with a saga route returning "OrderCreated"',
        () => {
          const schema = z.object({ orderId: z.string() });
          state.aggregateResult = defineAggregateCommand({
            commandType: "CreateOrder",
            boundedContext: "orders",
            targetAggregate: "Order",
            aggregateIdField: "orderId",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "orderSummary",
              toProjectionArgs: () => ({}),
            },
            sagaRoute: {
              router: mockMutationRef(),
              getEventType: () => "OrderCreated",
            },
            autoRegister: false,
          });
        }
      );

      Then("the config saga route is defined", () => {
        expect(state.aggregateResult!.config.sagaRoute).toBeDefined();
      });

      And('the saga route getEventType returns "OrderCreated"', () => {
        expect(
          state.aggregateResult!.config.sagaRoute?.getEventType({
            orderId: "ord_123",
          })
        ).toBe("OrderCreated");
      });
    });
  });

  // ===========================================================================
  // defineAggregateCommand — Saga onComplete
  // ===========================================================================

  Rule(
    "defineAggregateCommand preserves sagaRoute.onComplete for dead letter tracking",
    ({ RuleScenario }) => {
      RuleScenario("sagaRoute.onComplete is preserved", ({ When, Then }) => {
        When(
          'an aggregate command "CreateOrder" is defined with a saga route that has an onComplete handler',
          () => {
            const schema = z.object({ orderId: z.string() });
            state.sagaOnCompleteRef = mockMutationRef();
            state.aggregateResult = defineAggregateCommand({
              commandType: "CreateOrder",
              boundedContext: "orders",
              targetAggregate: "Order",
              aggregateIdField: "orderId",
              argsSchema: schema,
              handler: mockMutationRef(),
              projection: {
                handler: mockMutationRef(),
                projectionName: "orderSummary",
                toProjectionArgs: () => ({}),
              },
              sagaRoute: {
                router: mockMutationRef(),
                getEventType: () => "OrderCreated",
                onComplete: state.sagaOnCompleteRef as ReturnType<typeof mockMutationRef>,
              },
              autoRegister: false,
            });
          }
        );

        Then(
          "the config saga route onComplete is the same reference as the provided handler",
          () => {
            expect(state.aggregateResult!.config.sagaRoute).toBeDefined();
            expect(state.aggregateResult!.config.sagaRoute?.onComplete).toBe(
              state.sagaOnCompleteRef
            );
          }
        );
      });
    }
  );

  // ===========================================================================
  // defineAggregateCommand — Failed Projection
  // ===========================================================================

  Rule("defineAggregateCommand handles failed projection", ({ RuleScenario }) => {
    RuleScenario("Failed projection is included in config", ({ When, Then, And }) => {
      When(
        'an aggregate command "CreateOrder" is defined with a failed projection "orderFailures"',
        () => {
          const schema = z.object({ orderId: z.string() });
          state.aggregateResult = defineAggregateCommand({
            commandType: "CreateOrder",
            boundedContext: "orders",
            targetAggregate: "Order",
            aggregateIdField: "orderId",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "orderSummary",
              toProjectionArgs: () => ({}),
            },
            failedProjection: {
              handler: mockMutationRef(),
              projectionName: "orderFailures",
              toProjectionArgs: () => ({}),
            },
            autoRegister: false,
          });
        }
      );

      Then("the config failed projection is defined", () => {
        expect(state.aggregateResult!.config.failedProjection).toBeDefined();
      });

      And('the config failed projection name is "orderFailures"', () => {
        expect(state.aggregateResult!.config.failedProjection?.projectionName).toBe(
          "orderFailures"
        );
      });
    });
  });

  // ===========================================================================
  // defineAggregateCommand — Default Schema Version
  // ===========================================================================

  Rule("defineAggregateCommand defaults schemaVersion to 1", ({ RuleScenario }) => {
    RuleScenario("SchemaVersion defaults to 1", ({ When, Then }) => {
      When('an aggregate command "CreateOrder" is defined without specifying schemaVersion', () => {
        const schema = z.object({ orderId: z.string() });
        state.aggregateResult = defineAggregateCommand({
          commandType: "CreateOrder",
          boundedContext: "orders",
          targetAggregate: "Order",
          aggregateIdField: "orderId",
          argsSchema: schema,
          handler: mockMutationRef(),
          projection: {
            handler: mockMutationRef(),
            projectionName: "orderSummary",
            toProjectionArgs: () => ({}),
          },
          autoRegister: false,
        });
      });

      Then("the metadata schemaVersion is 1", () => {
        expect(state.aggregateResult!.metadata.schemaVersion).toBe(1);
      });
    });
  });

  // ===========================================================================
  // defineProcessCommand — Metadata
  // ===========================================================================

  Rule(
    "defineProcessCommand creates a process command with correct metadata",
    ({ RuleScenario }) => {
      RuleScenario("Process command has correct category and target", ({ When, Then, And }) => {
        When(
          'a process command "StartOrderFulfillment" is defined for process "OrderFulfillment"',
          () => {
            const schema = z.object({
              processId: z.string(),
              orderId: z.string(),
            });
            state.processResult = defineProcessCommand({
              commandType: "StartOrderFulfillment",
              boundedContext: "fulfillment",
              targetProcess: "OrderFulfillment",
              processIdField: "processId",
              argsSchema: schema,
              handler: mockMutationRef(),
              projection: {
                handler: mockMutationRef(),
                projectionName: "fulfillmentStatus",
                toProjectionArgs: () => ({}),
              },
              autoRegister: false,
            });
          }
        );

        Then('the process metadata category is "process"', () => {
          expect(state.processResult!.metadata.category).toBe("process");
        });

        And('the process metadata targetProcess is "OrderFulfillment"', () => {
          expect(state.processResult!.metadata.targetProcess).toBe("OrderFulfillment");
        });

        And("the process metadata targetAggregate is undefined", () => {
          expect(state.processResult!.metadata.targetAggregate).toBeUndefined();
        });
      });
    }
  );

  // ===========================================================================
  // defineProcessCommand — Partition Key
  // ===========================================================================

  Rule("defineProcessCommand uses processIdField for default partition key", ({ RuleScenario }) => {
    RuleScenario("Partition key uses processIdField", ({ Given, When, Then }) => {
      Given(
        'a process command "StartOrderFulfillment" is defined with processIdField "processId"',
        () => {
          const schema = z.object({ processId: z.string() });
          state.processResult = defineProcessCommand({
            commandType: "StartOrderFulfillment",
            boundedContext: "fulfillment",
            targetProcess: "OrderFulfillment",
            processIdField: "processId",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "fulfillmentStatus",
              toProjectionArgs: () => ({}),
            },
            autoRegister: false,
          });
        }
      );

      When('the process getPartitionKey is called with processId "proc_123"', () => {
        state.processPartitionKey = state.processResult!.config.projection.getPartitionKey({
          processId: "proc_123",
        });
      });

      Then('the process partition key is name "processId" and value "proc_123"', () => {
        expect(state.processPartitionKey).toEqual({
          name: "processId",
          value: "proc_123",
        });
      });
    });
  });

  // ===========================================================================
  // defineProcessCommand — Auto-Registration
  // ===========================================================================

  Rule("defineProcessCommand auto-registers with correct category info", ({ RuleScenario }) => {
    RuleScenario(
      "Process command auto-registers with category and target info",
      ({ When, Then, And }) => {
        When(
          'a process command "StartOrderFulfillment" is defined for process "OrderFulfillment" with auto-register',
          () => {
            const schema = z.object({ processId: z.string() });
            defineProcessCommand({
              commandType: "StartOrderFulfillment",
              boundedContext: "fulfillment",
              targetProcess: "OrderFulfillment",
              processIdField: "processId",
              argsSchema: schema,
              handler: mockMutationRef(),
              projection: {
                handler: mockMutationRef(),
                projectionName: "fulfillmentStatus",
                toProjectionArgs: () => ({}),
              },
            });
          }
        );

        Then('the global registry has "StartOrderFulfillment"', () => {
          const registry = CommandRegistry.getInstance();
          expect(registry.has("StartOrderFulfillment")).toBe(true);
        });

        And(
          'the registry entry for "StartOrderFulfillment" has category "process" and targetProcess "OrderFulfillment"',
          () => {
            const registry = CommandRegistry.getInstance();
            const info = registry.list().find((c) => c.commandType === "StartOrderFulfillment");
            expect(info?.category).toBe("process");
            expect(info?.targetProcess).toBe("OrderFulfillment");
          }
        );
      }
    );
  });

  // ===========================================================================
  // defineSystemCommand — Metadata
  // ===========================================================================

  Rule("defineSystemCommand creates a system command with correct metadata", ({ RuleScenario }) => {
    RuleScenario(
      "System command has correct category, subsystem, and description",
      ({ When, Then, And }) => {
        When(
          'a system command "CleanupExpiredCommands" is defined with subsystem "cleanup" and description "Cleans up expired command records"',
          () => {
            const schema = z.object({ olderThanMs: z.number() });
            state.systemResult = defineSystemCommand({
              commandType: "CleanupExpiredCommands",
              boundedContext: "system",
              subsystem: "cleanup",
              argsSchema: schema,
              handler: mockMutationRef(),
              description: "Cleans up expired command records",
            });
          }
        );

        Then('the system metadata category is "system"', () => {
          expect(state.systemResult!.metadata.category).toBe("system");
        });

        And('the system metadata subsystem is "cleanup"', () => {
          expect(state.systemResult!.metadata.subsystem).toBe("cleanup");
        });

        And('the system metadata description is "Cleans up expired command records"', () => {
          expect(state.systemResult!.metadata.description).toBe(
            "Cleans up expired command records"
          );
        });
      }
    );
  });

  // ===========================================================================
  // defineSystemCommand — toHandlerArgs
  // ===========================================================================

  Rule("defineSystemCommand generates toHandlerArgs correctly", ({ RuleScenario }) => {
    RuleScenario(
      "System toHandlerArgs merges args with commandId and correlationId",
      ({ Given, When, Then }) => {
        Given('a system command "CleanupExpiredCommands" is defined', () => {
          const schema = z.object({ olderThanMs: z.number() });
          state.systemResult = defineSystemCommand({
            commandType: "CleanupExpiredCommands",
            boundedContext: "system",
            subsystem: "cleanup",
            argsSchema: schema,
            handler: mockMutationRef(),
          });
        });

        When(
          'system toHandlerArgs is called with olderThanMs 86400000, commandId "cmd_123", correlationId "corr_456"',
          () => {
            state.systemHandlerArgs = state.systemResult!.config.toHandlerArgs(
              { olderThanMs: 86400000 },
              "cmd_123",
              "corr_456"
            );
          }
        );

        Then(
          'the system handler args equal olderThanMs 86400000, commandId "cmd_123", correlationId "corr_456"',
          () => {
            expect(state.systemHandlerArgs).toEqual({
              olderThanMs: 86400000,
              commandId: "cmd_123",
              correlationId: "corr_456",
            });
          }
        );
      }
    );
  });

  // ===========================================================================
  // defineSystemCommand — Without Projection
  // ===========================================================================

  Rule("defineSystemCommand works without projection", ({ RuleScenario }) => {
    RuleScenario(
      "System command without projection has no projection property",
      ({ When, Then, And }) => {
        When('a system command "CleanupExpiredCommands" is defined without a projection', () => {
          const schema = z.object({ olderThanMs: z.number() });
          state.systemResult = defineSystemCommand({
            commandType: "CleanupExpiredCommands",
            boundedContext: "system",
            subsystem: "cleanup",
            argsSchema: schema,
            handler: mockMutationRef(),
          });
        });

        Then('the system config commandType is "CleanupExpiredCommands"', () => {
          expect(state.systemResult!.config.commandType).toBe("CleanupExpiredCommands");
        });

        And("the system config does not have a projection property", () => {
          expect("projection" in state.systemResult!.config).toBe(false);
        });
      }
    );
  });

  // ===========================================================================
  // defineSystemCommand — Optional Projection
  // ===========================================================================

  Rule("defineSystemCommand supports optional projection", ({ RuleScenario }) => {
    RuleScenario("System command with projection includes it in config", ({ When, Then }) => {
      When(
        'a system command "CleanupExpiredCommands" is defined with projection "cleanupStats"',
        () => {
          const schema = z.object({ olderThanMs: z.number() });
          state.systemResult = defineSystemCommand({
            commandType: "CleanupExpiredCommands",
            boundedContext: "system",
            subsystem: "cleanup",
            argsSchema: schema,
            handler: mockMutationRef(),
            projection: {
              handler: mockMutationRef(),
              projectionName: "cleanupStats",
              toProjectionArgs: () => ({}),
            },
          });
        }
      );

      Then('the system config projection name is "cleanupStats"', () => {
        expect(state.systemResult!.config.projection?.projectionName).toBe("cleanupStats");
      });
    });
  });

  // ===========================================================================
  // defineSystemCommand — System Partition Key
  // ===========================================================================

  Rule(
    "defineSystemCommand uses system partition key when no custom key specified",
    ({ RuleScenario }) => {
      RuleScenario(
        "System partition key defaults to system/commandType",
        ({ Given, When, Then }) => {
          Given('a system command "CleanupExpiredCommands" is defined with a projection', () => {
            const schema = z.object({ olderThanMs: z.number() });
            state.systemResult = defineSystemCommand({
              commandType: "CleanupExpiredCommands",
              boundedContext: "system",
              subsystem: "cleanup",
              argsSchema: schema,
              handler: mockMutationRef(),
              projection: {
                handler: mockMutationRef(),
                projectionName: "cleanupStats",
                toProjectionArgs: () => ({}),
              },
            });
          });

          When("the system getPartitionKey is called with olderThanMs 86400000", () => {
            state.systemPartitionKey =
              state.systemResult!.config.projection?.getPartitionKey({
                olderThanMs: 86400000,
              }) ?? null;
          });

          Then(
            'the system partition key is name "system" and value "CleanupExpiredCommands"',
            () => {
              expect(state.systemPartitionKey).toEqual({
                name: "system",
                value: "CleanupExpiredCommands",
              });
            }
          );
        }
      );
    }
  );

  // ===========================================================================
  // defineSystemCommand — Registration with Projection
  // ===========================================================================

  Rule("defineSystemCommand registers only when projection is provided", ({ RuleScenario }) => {
    RuleScenario(
      "System command without projection is not registered even with autoRegister true",
      ({ When, Then }) => {
        When(
          'a system command "CleanupExpiredCommandsNoProj" is defined with autoRegister true but no projection',
          () => {
            const schema = z.object({ olderThanMs: z.number() });
            defineSystemCommand({
              commandType: "CleanupExpiredCommandsNoProj",
              boundedContext: "system",
              subsystem: "cleanup",
              argsSchema: schema,
              handler: mockMutationRef(),
              autoRegister: true,
            });
          }
        );

        Then('the global registry does not have "CleanupExpiredCommandsNoProj"', () => {
          const registry = CommandRegistry.getInstance();
          expect(registry.has("CleanupExpiredCommandsNoProj")).toBe(false);
        });

        When(
          'a system command "CleanupExpiredCommandsWithProj" is defined with autoRegister true and projection "cleanupStats"',
          () => {
            const schema = z.object({ olderThanMs: z.number() });
            defineSystemCommand({
              commandType: "CleanupExpiredCommandsWithProj",
              boundedContext: "system",
              subsystem: "cleanup",
              argsSchema: schema,
              handler: mockMutationRef(),
              projection: {
                handler: mockMutationRef(),
                projectionName: "cleanupStats",
                toProjectionArgs: () => ({}),
              },
              autoRegister: true,
            });
          }
        );

        Then('the global registry has "CleanupExpiredCommandsWithProj"', () => {
          const registry = CommandRegistry.getInstance();
          expect(registry.has("CleanupExpiredCommandsWithProj")).toBe(true);
        });
      }
    );
  });

  // ===========================================================================
  // defineSystemCommand — Default Schema Version
  // ===========================================================================

  Rule("defineSystemCommand defaults schemaVersion to 1", ({ RuleScenario }) => {
    RuleScenario("System schemaVersion defaults to 1", ({ When, Then }) => {
      When(
        'a system command "CleanupExpiredCommands" is defined without specifying schemaVersion',
        () => {
          const schema = z.object({ olderThanMs: z.number() });
          state.systemResult = defineSystemCommand({
            commandType: "CleanupExpiredCommands",
            boundedContext: "system",
            subsystem: "cleanup",
            argsSchema: schema,
            handler: mockMutationRef(),
          });
        }
      );

      Then("the system metadata schemaVersion is 1", () => {
        expect(state.systemResult!.metadata.schemaVersion).toBe(1);
      });
    });
  });
});
