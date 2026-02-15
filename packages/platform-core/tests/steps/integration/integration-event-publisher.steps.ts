/**
 * IntegrationEventPublisher - Step Definitions
 *
 * BDD step definitions for IntegrationEventPublisher:
 * - Constructor with empty/populated routes and duplicate rejection
 * - hasRouteFor and getRoutes queries
 * - publish: translation, routing, ID generation, metadata, correlation, onComplete, errors, context
 * - IntegrationRouteBuilder fluent API and build validation
 * - defineIntegrationRoute and createIntegrationPublisher factories
 * - IntegrationRouteError typed error class
 *
 * Mechanical migration from tests/unit/integration/IntegrationEventPublisher.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  IntegrationEventPublisher,
  IntegrationRouteBuilder,
  defineIntegrationRoute,
  createIntegrationPublisher,
  IntegrationRouteError,
} from "../../../src/integration/IntegrationEventPublisher.js";
import type { SourceEventInfo, IntegrationEventRoute } from "../../../src/integration/types.js";
import type { WorkpoolClient, MutationCtx } from "../../../src/orchestration/types.js";
import type { CorrelationChain } from "../../../src/correlation/types.js";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Mock Factories
// =============================================================================

const mockHandler = { name: "mockHandler" } as FunctionReference<
  "mutation",
  FunctionVisibility,
  Record<string, unknown>,
  unknown
>;

function createMockWorkpool(): WorkpoolClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async enqueueMutation(ctx, handler, args, options) {
      calls.push([ctx, handler, args, options]);
      return null;
    },
    async enqueueAction() {
      return null;
    },
  };
}

function createMockCtx(): MutationCtx {
  return {} as MutationCtx;
}

function createSourceEvent(overrides: Partial<SourceEventInfo> = {}): SourceEventInfo {
  return {
    eventId: "evt_123",
    eventType: "OrderSubmitted",
    boundedContext: "orders",
    globalPosition: 1000,
    payload: {
      orderId: "order_456",
      customerId: "customer_789",
      totalAmount: 99.99,
    },
    correlation: {
      correlationId: "corr_abc",
      causationId: "cmd_def",
      userId: "user_123",
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

function createTestChain(overrides: Partial<CorrelationChain> = {}): CorrelationChain {
  return {
    commandId: "cmd_def",
    correlationId: "corr_abc",
    causationId: "cmd_def",
    initiatedAt: Date.now(),
    userId: "user_123",
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  mockWorkpool: WorkpoolClient & { calls: unknown[][] };
  mockCtx: MutationCtx;
  routes: IntegrationEventRoute[];
  publisher: IntegrationEventPublisher | null;
  publishResult: {
    success: boolean;
    handlersInvoked: number;
    integrationEventId: string;
  } | null;
  builtRoute: IntegrationEventRoute | null;
  thrownError: unknown;
  onCompleteRef: FunctionReference<"mutation", FunctionVisibility, unknown, unknown> | null;
  factoryPublisher: IntegrationEventPublisher | null;
  integrationRouteError: IntegrationRouteError | null;
}

function createInitialState(): TestState {
  return {
    mockWorkpool: createMockWorkpool(),
    mockCtx: createMockCtx(),
    routes: [],
    publisher: null,
    publishResult: null,
    builtRoute: null,
    thrownError: null,
    onCompleteRef: null,
    factoryPublisher: null,
    integrationRouteError: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/integration/integration-event-publisher.feature"
);

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Module imports are validated at load time
    });
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  Rule("Constructor accepts an empty or populated route list", ({ RuleScenario }) => {
    RuleScenario("Create publisher with empty routes", ({ Given, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized in BeforeEachScenario
      });

      When("a publisher is created with no routes", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, []);
      });

      Then("getRoutes returns 0 routes", () => {
        expect(state.publisher!.getRoutes()).toHaveLength(0);
      });
    });

    RuleScenario("Create publisher with one route", ({ Given, When, Then, And }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 1', () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: (source) => ({
              orderId: source.payload.orderId,
            }),
            handlers: [mockHandler],
          },
        ];
      });

      When("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      Then("getRoutes returns 1 route", () => {
        expect(state.publisher!.getRoutes()).toHaveLength(1);
      });
    });
  });

  Rule("Constructor rejects duplicate source event type routes", ({ RuleScenario }) => {
    RuleScenario("Reject duplicate sourceEventType routes", ({ Given, When, Then, And }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('two routes both mapping from "OrderSubmitted"', () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedV1",
            schemaVersion: 1,
            translator: (source) => ({
              orderId: source.payload.orderId,
            }),
            handlers: [mockHandler],
          },
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedV2",
            schemaVersion: 2,
            translator: (source) => ({
              orderId: source.payload.orderId,
            }),
            handlers: [mockHandler],
          },
        ];
      });

      When("a publisher is created with both routes", () => {
        try {
          state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
        } catch (e) {
          state.thrownError = e;
        }
      });

      Then("an IntegrationRouteError is thrown", () => {
        expect(state.thrownError).toBeInstanceOf(IntegrationRouteError);
      });

      And('the error message contains "Duplicate route for source event type"', () => {
        expect((state.thrownError as Error).message).toContain(
          'Duplicate route for source event type: "OrderSubmitted"'
        );
      });
    });
  });

  // ==========================================================================
  // hasRouteFor
  // ==========================================================================

  Rule(
    "hasRouteFor returns true for registered and false for unregistered event types",
    ({ RuleScenario }) => {
      RuleScenario(
        "Check route existence for registered and unregistered types",
        ({ Given, And, Then }) => {
          Given("a mock workpool client", () => {
            // Already initialized
          });

          And(
            'a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 1',
            () => {
              state.routes = [
                {
                  sourceEventType: "OrderSubmitted",
                  targetEventType: "OrderPlacedIntegration",
                  schemaVersion: 1,
                  translator: () => ({}),
                  handlers: [mockHandler],
                },
              ];
            }
          );

          And("a publisher is created with that route", () => {
            state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
          });

          Then('hasRouteFor "OrderSubmitted" returns true', () => {
            expect(state.publisher!.hasRouteFor("OrderSubmitted")).toBe(true);
          });

          And(
            "hasRouteFor returns false for unregistered types:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{ eventType: string }>(dataTable);
              for (const row of rows) {
                expect(state.publisher!.hasRouteFor(row.eventType)).toBe(false);
              }
            }
          );
        }
      );
    }
  );

  // ==========================================================================
  // getRoutes
  // ==========================================================================

  Rule("getRoutes returns all registered routes", ({ RuleScenario }) => {
    RuleScenario("Retrieve all registered routes", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And("routes are configured for source event types:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          sourceEventType: string;
          targetEventType: string;
        }>(dataTable);
        state.routes = rows.map((row) => ({
          sourceEventType: row.sourceEventType,
          targetEventType: row.targetEventType,
          schemaVersion: 1,
          translator: () => ({}),
          handlers: [mockHandler],
        }));
      });

      When("a publisher is created with those routes", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      Then("getRoutes returns 2 routes", () => {
        expect(state.publisher!.getRoutes()).toHaveLength(2);
      });

      And(
        "the returned routes include source event types:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ sourceEventType: string }>(dataTable);
          const sourceTypes = state.publisher!.getRoutes().map((r) => r.sourceEventType);
          for (const row of rows) {
            expect(sourceTypes).toContain(row.sourceEventType);
          }
        }
      );
    });
  });

  // ==========================================================================
  // publish
  // ==========================================================================

  Rule("Publish returns null for unmatched source event types", ({ RuleScenario }) => {
    RuleScenario("Return null when no route matches", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 1', () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: () => ({}),
            handlers: [mockHandler],
          },
        ];
      });

      And("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      When('publish is called with source event type "DifferentEvent"', async () => {
        const sourceEvent = createSourceEvent({
          eventType: "DifferentEvent",
        });
        const chain = createTestChain();
        state.publishResult = await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
      });

      Then("the publish result is null", () => {
        expect(state.publishResult).toBeNull();
      });

      And("the workpool received 0 calls", () => {
        expect(state.mockWorkpool.calls).toHaveLength(0);
      });
    });
  });

  Rule("Publish translates domain events to integration events", ({ RuleScenario }) => {
    RuleScenario("Translate and publish a domain event", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('a translating route from "OrderSubmitted" to "OrderPlacedIntegration"', () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: (source) => ({
              orderId: (source.payload as { orderId: string }).orderId,
              customerId: (source.payload as { customerId: string }).customerId,
              placedAt: source.timestamp,
            }),
            handlers: [mockHandler],
          },
        ];
      });

      And("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      When("publish is called with a standard source event", async () => {
        const sourceEvent = createSourceEvent();
        const chain = createTestChain();
        state.publishResult = await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
      });

      Then("the publish result is not null", () => {
        expect(state.publishResult).not.toBeNull();
      });

      And("the publish result indicates success with 1 handler invoked", () => {
        expect(state.publishResult!.success).toBe(true);
        expect(state.publishResult!.handlersInvoked).toBe(1);
      });

      And('the integration event ID starts with "int_"', () => {
        expect(state.publishResult!.integrationEventId).toBeDefined();
        expect(state.publishResult!.integrationEventId).toMatch(/^int_/);
      });
    });
  });

  Rule("Publish enqueues all handlers for a matched route", ({ RuleScenario }) => {
    RuleScenario("Enqueue multiple handlers", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('a route from "OrderSubmitted" to "OrderPlacedIntegration" with 2 handlers', () => {
        const handler1 = { name: "handler1" } as FunctionReference<
          "mutation",
          FunctionVisibility,
          Record<string, unknown>,
          unknown
        >;
        const handler2 = { name: "handler2" } as FunctionReference<
          "mutation",
          FunctionVisibility,
          Record<string, unknown>,
          unknown
        >;

        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: () => ({ orderId: "test" }),
            handlers: [handler1, handler2],
          },
        ];
      });

      And("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      When("publish is called with a standard source event", async () => {
        const sourceEvent = createSourceEvent();
        const chain = createTestChain();
        state.publishResult = await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
      });

      Then("the publish result indicates success with 2 handlers invoked", () => {
        expect(state.publishResult!.handlersInvoked).toBe(2);
      });

      And("the workpool received 2 calls", () => {
        expect(state.mockWorkpool.calls).toHaveLength(2);
      });
    });
  });

  Rule(
    "Integration event includes correct metadata from source event and correlation chain",
    ({ RuleScenario }) => {
      RuleScenario("Verify integration event metadata fields", ({ Given, And, When, Then }) => {
        Given("a mock workpool client", () => {
          // Already initialized
        });

        And(
          'a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 2 and orderId translator',
          () => {
            state.routes = [
              {
                sourceEventType: "OrderSubmitted",
                targetEventType: "OrderPlacedIntegration",
                schemaVersion: 2,
                translator: (source) => ({
                  orderId: (source.payload as { orderId: string }).orderId,
                }),
                handlers: [mockHandler],
              },
            ];
          }
        );

        And("a publisher is created with that route", () => {
          state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
        });

        When("publish is called with a standard source event", async () => {
          const sourceEvent = createSourceEvent();
          const chain = createTestChain();
          await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
        });

        Then(
          "the enqueued integration event has metadata:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              field: string;
              expected: string;
            }>(dataTable);
            const [, , integrationEvent] = state.mockWorkpool.calls[0] as [
              unknown,
              unknown,
              Record<string, unknown>,
            ];
            for (const row of rows) {
              const actual = integrationEvent[row.field];
              // Handle numeric comparisons
              const expected =
                row.expected === String(Number(row.expected)) ? Number(row.expected) : row.expected;
              expect(actual).toBe(expected);
            }
          }
        );

        And('the enqueued integration event payload equals orderId "order_456"', () => {
          const [, , integrationEvent] = state.mockWorkpool.calls[0] as [
            unknown,
            unknown,
            { payload: unknown },
          ];
          expect(integrationEvent.payload).toEqual({
            orderId: "order_456",
          });
        });
      });
    }
  );

  Rule("Publish propagates userId from the correlation chain when present", ({ RuleScenario }) => {
    RuleScenario("Include userId when present in chain", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('a simple route from "OrderSubmitted" to "OrderPlacedIntegration"', () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: () => ({}),
            handlers: [mockHandler],
          },
        ];
      });

      And("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      When('publish is called with userId "user_abc"', async () => {
        const sourceEvent = createSourceEvent();
        const chain = createTestChain({ userId: "user_abc" });
        await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
      });

      Then('the enqueued integration event userId is "user_abc"', () => {
        const [, , integrationEvent] = state.mockWorkpool.calls[0] as [
          unknown,
          unknown,
          { userId?: string },
        ];
        expect(integrationEvent.userId).toBe("user_abc");
      });
    });

    RuleScenario("Omit userId when absent from chain", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('a simple route from "OrderSubmitted" to "OrderPlacedIntegration"', () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: () => ({}),
            handlers: [mockHandler],
          },
        ];
      });

      And("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      When("publish is called without userId", async () => {
        const sourceEvent = createSourceEvent();
        const chain = createTestChain();
        delete chain.userId;
        await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
      });

      Then("the enqueued integration event userId is undefined", () => {
        const [, , integrationEvent] = state.mockWorkpool.calls[0] as [
          unknown,
          unknown,
          { userId?: string },
        ];
        expect(integrationEvent.userId).toBeUndefined();
      });
    });
  });

  Rule(
    "Publish includes onComplete callback in workpool options when configured",
    ({ RuleScenario }) => {
      RuleScenario("Pass onComplete handler to workpool", ({ Given, And, When, Then }) => {
        Given("a mock workpool client", () => {
          // Already initialized
        });

        And('a simple route from "OrderSubmitted" to "OrderPlacedIntegration"', () => {
          state.routes = [
            {
              sourceEventType: "OrderSubmitted",
              targetEventType: "OrderPlacedIntegration",
              schemaVersion: 1,
              translator: () => ({}),
              handlers: [mockHandler],
            },
          ];
        });

        And("an onComplete handler reference", () => {
          state.onCompleteRef = { name: "onComplete" } as FunctionReference<
            "mutation",
            FunctionVisibility,
            unknown,
            unknown
          >;
        });

        And("a publisher is created with that route and onComplete", () => {
          state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes, {
            onComplete: state.onCompleteRef!,
          });
        });

        When("publish is called with a standard source event", async () => {
          const sourceEvent = createSourceEvent();
          const chain = createTestChain();
          await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
        });

        Then("the workpool options include the onComplete handler", () => {
          const [, , , options] = state.mockWorkpool.calls[0] as [
            unknown,
            unknown,
            unknown,
            { onComplete?: unknown },
          ];
          expect(options.onComplete).toBe(state.onCompleteRef);
        });
      });
    }
  );

  Rule("Publish propagates translator errors to the caller", ({ RuleScenario }) => {
    RuleScenario("Propagate translator error", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And("a route with a failing translator", () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: () => {
              throw new Error("Translation failed: invalid payload structure");
            },
            handlers: [mockHandler],
          },
        ];
      });

      And("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      When("publish is called with a standard source event", async () => {
        const sourceEvent = createSourceEvent();
        const chain = createTestChain();
        try {
          await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
        } catch (e) {
          state.thrownError = e;
        }
      });

      Then('the publish call rejects with "Translation failed: invalid payload structure"', () => {
        expect(state.thrownError).toBeDefined();
        expect((state.thrownError as Error).message).toBe(
          "Translation failed: invalid payload structure"
        );
      });

      And("the workpool received 0 calls", () => {
        expect(state.mockWorkpool.calls).toHaveLength(0);
      });
    });
  });

  Rule("Publish includes integration context in workpool options", ({ RuleScenario }) => {
    RuleScenario("Verify workpool context fields", ({ Given, And, When, Then }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      And('a simple route from "OrderSubmitted" to "OrderPlacedIntegration"', () => {
        state.routes = [
          {
            sourceEventType: "OrderSubmitted",
            targetEventType: "OrderPlacedIntegration",
            schemaVersion: 1,
            translator: () => ({}),
            handlers: [mockHandler],
          },
        ];
      });

      And("a publisher is created with that route", () => {
        state.publisher = new IntegrationEventPublisher(state.mockWorkpool, state.routes);
      });

      When("publish is called with a standard source event", async () => {
        const sourceEvent = createSourceEvent();
        const chain = createTestChain();
        await state.publisher!.publish(state.mockCtx, sourceEvent, chain);
      });

      Then("the workpool context includes:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          field: string;
          expected: string;
        }>(dataTable);
        const [, , , options] = state.mockWorkpool.calls[0] as [
          unknown,
          unknown,
          unknown,
          { context: Record<string, unknown> },
        ];
        for (const row of rows) {
          expect(options.context[row.field]).toBe(row.expected);
        }
      });
    });
  });

  // ==========================================================================
  // IntegrationRouteBuilder fluent API
  // ==========================================================================

  Rule(
    "IntegrationRouteBuilder builds routes with all required fields via fluent API",
    ({ RuleScenario }) => {
      RuleScenario("Build a route with all required fields", ({ When, Then, And }) => {
        When(
          'a route is built with from "OrderSubmitted", to "OrderPlacedIntegration", a translator, and one handler',
          () => {
            state.builtRoute = new IntegrationRouteBuilder()
              .from("OrderSubmitted")
              .to("OrderPlacedIntegration")
              .translate(() => ({ orderId: "test" }))
              .notify(mockHandler)
              .build();
          }
        );

        Then('the built route sourceEventType is "OrderSubmitted"', () => {
          expect(state.builtRoute!.sourceEventType).toBe("OrderSubmitted");
        });

        And('the built route targetEventType is "OrderPlacedIntegration"', () => {
          expect(state.builtRoute!.targetEventType).toBe("OrderPlacedIntegration");
        });

        And("the built route schemaVersion defaults to 1", () => {
          expect(state.builtRoute!.schemaVersion).toBe(1);
        });

        And("the built route has 1 handler", () => {
          expect(state.builtRoute!.handlers).toHaveLength(1);
        });
      });
    }
  );

  Rule("IntegrationRouteBuilder version method sets schema version", ({ RuleScenario }) => {
    RuleScenario("Set schema version via version method", ({ When, Then }) => {
      When("a route is built with version 3", () => {
        state.builtRoute = new IntegrationRouteBuilder()
          .from("OrderSubmitted")
          .to("OrderPlacedIntegration")
          .version(3)
          .translate(() => ({}))
          .notify(mockHandler)
          .build();
      });

      Then("the built route schemaVersion is 3", () => {
        expect(state.builtRoute!.schemaVersion).toBe(3);
      });
    });
  });

  Rule("IntegrationRouteBuilder notify accepts multiple handlers", ({ RuleScenario }) => {
    RuleScenario("Pass multiple handlers to notify", ({ When, Then }) => {
      When("a route is built with 2 handlers via notify", () => {
        const handler1 = { name: "h1" } as FunctionReference<
          "mutation",
          FunctionVisibility,
          Record<string, unknown>,
          unknown
        >;
        const handler2 = { name: "h2" } as FunctionReference<
          "mutation",
          FunctionVisibility,
          Record<string, unknown>,
          unknown
        >;

        state.builtRoute = new IntegrationRouteBuilder()
          .from("OrderSubmitted")
          .to("OrderPlacedIntegration")
          .translate(() => ({}))
          .notify(handler1, handler2)
          .build();
      });

      Then("the built route has 2 handlers", () => {
        expect(state.builtRoute!.handlers).toHaveLength(2);
      });
    });
  });

  Rule("IntegrationRouteBuilder translate sets the translator function", ({ RuleScenario }) => {
    RuleScenario("Translator function transforms source event", ({ When, Then }) => {
      When("a route is built with a translator that extracts eventId and eventType", () => {
        state.builtRoute = new IntegrationRouteBuilder()
          .from("OrderSubmitted")
          .to("OrderPlacedIntegration")
          .translate((source) => ({
            id: source.eventId,
            type: source.eventType,
          }))
          .notify(mockHandler)
          .build();
      });

      Then(
        'invoking the translator with eventId "evt_1" and eventType "OrderSubmitted" returns the expected payload',
        () => {
          const result = state.builtRoute!.translator({
            eventId: "evt_1",
            eventType: "OrderSubmitted",
            boundedContext: "orders",
            globalPosition: 100,
            payload: {},
            correlation: { correlationId: "c", causationId: "d" },
            timestamp: 123,
          });
          expect(result).toEqual({ id: "evt_1", type: "OrderSubmitted" });
        }
      );
    });
  });

  // ==========================================================================
  // IntegrationRouteBuilder build validation
  // ==========================================================================

  Rule("IntegrationRouteBuilder build rejects incomplete configurations", ({ RuleScenario }) => {
    RuleScenario("Reject missing source event type", ({ When, Then }) => {
      When("build is called without from", () => {
        try {
          new IntegrationRouteBuilder()
            .to("Target")
            .translate(() => ({}))
            .notify(mockHandler)
            .build();
        } catch (e) {
          state.thrownError = e;
        }
      });

      Then('an IntegrationRouteError is thrown with code "MISSING_SOURCE_EVENT_TYPE"', () => {
        expect(state.thrownError).toBeInstanceOf(IntegrationRouteError);
        expect((state.thrownError as IntegrationRouteError).code).toBe("MISSING_SOURCE_EVENT_TYPE");
      });
    });

    RuleScenario("Reject missing target event type", ({ When, Then }) => {
      When("build is called without to", () => {
        try {
          new IntegrationRouteBuilder()
            .from("Source")
            .translate(() => ({}))
            .notify(mockHandler)
            .build();
        } catch (e) {
          state.thrownError = e;
        }
      });

      Then('an IntegrationRouteError is thrown with code "MISSING_TARGET_EVENT_TYPE"', () => {
        expect(state.thrownError).toBeInstanceOf(IntegrationRouteError);
        expect((state.thrownError as IntegrationRouteError).code).toBe("MISSING_TARGET_EVENT_TYPE");
      });
    });

    RuleScenario("Reject missing translator", ({ When, Then }) => {
      When("build is called without translate", () => {
        try {
          new IntegrationRouteBuilder().from("Source").to("Target").notify(mockHandler).build();
        } catch (e) {
          state.thrownError = e;
        }
      });

      Then('an IntegrationRouteError is thrown with code "MISSING_TRANSLATOR"', () => {
        expect(state.thrownError).toBeInstanceOf(IntegrationRouteError);
        expect((state.thrownError as IntegrationRouteError).code).toBe("MISSING_TRANSLATOR");
      });
    });

    RuleScenario("Reject missing handlers", ({ When, Then }) => {
      When("build is called without notify", () => {
        try {
          new IntegrationRouteBuilder()
            .from("Source")
            .to("Target")
            .translate(() => ({}))
            .build();
        } catch (e) {
          state.thrownError = e;
        }
      });

      Then('an IntegrationRouteError is thrown with code "MISSING_HANDLERS"', () => {
        expect(state.thrownError).toBeInstanceOf(IntegrationRouteError);
        expect((state.thrownError as IntegrationRouteError).code).toBe("MISSING_HANDLERS");
      });
    });
  });

  // ==========================================================================
  // defineIntegrationRoute factory
  // ==========================================================================

  Rule(
    "defineIntegrationRoute returns a builder for fluent route construction",
    ({ RuleScenario }) => {
      RuleScenario("Build route via defineIntegrationRoute factory", ({ When, Then, And }) => {
        When("a route is built using defineIntegrationRoute", () => {
          state.builtRoute = defineIntegrationRoute()
            .from("OrderSubmitted")
            .to("OrderPlacedIntegration")
            .translate(() => ({}))
            .notify(mockHandler)
            .build();
        });

        Then('the built route sourceEventType is "OrderSubmitted"', () => {
          expect(state.builtRoute!.sourceEventType).toBe("OrderSubmitted");
        });

        And('the built route targetEventType is "OrderPlacedIntegration"', () => {
          expect(state.builtRoute!.targetEventType).toBe("OrderPlacedIntegration");
        });
      });
    }
  );

  // ==========================================================================
  // createIntegrationPublisher factory
  // ==========================================================================

  Rule("createIntegrationPublisher creates a functional publisher instance", ({ RuleScenario }) => {
    RuleScenario("Create publisher via factory function", ({ Given, When, Then, And }) => {
      Given("a mock workpool client", () => {
        // Already initialized
      });

      When("a publisher is created using createIntegrationPublisher with one route", () => {
        const routes = [
          defineIntegrationRoute()
            .from("OrderSubmitted")
            .to("OrderPlacedIntegration")
            .translate(() => ({}))
            .notify(mockHandler)
            .build(),
        ];
        state.factoryPublisher = createIntegrationPublisher(state.mockWorkpool, routes);
      });

      Then('hasRouteFor "OrderSubmitted" returns true on the factory publisher', () => {
        expect(state.factoryPublisher!.hasRouteFor("OrderSubmitted")).toBe(true);
      });

      And("getRoutes returns 1 route on the factory publisher", () => {
        expect(state.factoryPublisher!.getRoutes()).toHaveLength(1);
      });
    });
  });

  // ==========================================================================
  // IntegrationRouteError
  // ==========================================================================

  Rule(
    "IntegrationRouteError has correct name, code, context, and is instanceof Error",
    ({ RuleScenario }) => {
      RuleScenario("Verify IntegrationRouteError properties", ({ When, Then, And }) => {
        When(
          'an IntegrationRouteError is created with code "MISSING_TRANSLATOR" and message "Test message"',
          () => {
            state.integrationRouteError = new IntegrationRouteError(
              "MISSING_TRANSLATOR",
              "Test message"
            );
          }
        );

        Then('the error name is "IntegrationRouteError"', () => {
          expect(state.integrationRouteError!.name).toBe("IntegrationRouteError");
        });

        And('the error code is "MISSING_TRANSLATOR"', () => {
          expect(state.integrationRouteError!.code).toBe("MISSING_TRANSLATOR");
        });
      });

      RuleScenario("Verify IntegrationRouteError with context", ({ When, Then }) => {
        When(
          'an IntegrationRouteError is created with code "DUPLICATE_SOURCE_EVENT_TYPE", message "Test", and context sourceEventType "OrderSubmitted"',
          () => {
            state.integrationRouteError = new IntegrationRouteError(
              "DUPLICATE_SOURCE_EVENT_TYPE",
              "Test",
              { sourceEventType: "OrderSubmitted" }
            );
          }
        );

        Then('the error context equals sourceEventType "OrderSubmitted"', () => {
          expect(state.integrationRouteError!.context).toEqual({
            sourceEventType: "OrderSubmitted",
          });
        });
      });

      RuleScenario("Verify IntegrationRouteError instanceof chain", ({ When, Then, And }) => {
        When(
          'an IntegrationRouteError is created with code "MISSING_HANDLERS" and message "Test"',
          () => {
            state.integrationRouteError = new IntegrationRouteError("MISSING_HANDLERS", "Test");
          }
        );

        Then("the error is an instance of Error", () => {
          expect(state.integrationRouteError).toBeInstanceOf(Error);
        });

        And("the error is an instance of IntegrationRouteError", () => {
          expect(state.integrationRouteError).toBeInstanceOf(IntegrationRouteError);
        });
      });
    }
  );
});
