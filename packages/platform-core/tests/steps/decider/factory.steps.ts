/**
 * Decider Handler Factory - Step Definitions
 *
 * BDD step definitions for createDeciderHandler and createEntityDeciderHandler
 * factory functions. Tests pure decider wrapping with infrastructure concerns.
 *
 * Mechanical migration from tests/unit/decider/factory.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  createDeciderHandler,
  createEntityDeciderHandler,
  type DeciderHandlerConfig,
  type EntityDeciderHandlerConfig,
  type BaseCMSState,
} from "../../../src/decider";
import {
  success,
  rejected,
  failed,
  type DeciderEvent,
  type DeciderContext,
} from "../../../src/decider";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Deep Field Assertion Helper
// =============================================================================

/**
 * Navigate a deep field path like "event.metadata.correlationId.contains"
 * and assert the value. Supports ".contains" suffix for toContain assertions.
 */
function assertDeepField(obj: Record<string, unknown>, fieldPath: string, expected: string): void {
  const useContains = fieldPath.endsWith(".contains");
  const cleanPath = useContains ? fieldPath.replace(/\.contains$/, "") : fieldPath;
  const parts = cleanPath.split(".");

  let current: unknown = obj;
  for (const part of parts) {
    current = (current as Record<string, unknown>)?.[part];
  }

  if (useContains) {
    expect(current).toContain(expected);
  } else if (expected.match(/^\d+$/)) {
    expect(current).toBe(Number(expected));
  } else {
    expect(current).toBe(expected);
  }
}

// =============================================================================
// Test Types
// =============================================================================

interface TestCMS extends BaseCMSState {
  id: string;
  status: string;
  value: number;
  version: number;
}

interface TestCommand {
  commandId: string;
  correlationId: string;
  entityId: string;
  newValue?: number;
}

interface TestSuccessEvent extends DeciderEvent {
  eventType: "TestSucceeded";
  payload: { id: string; newValue: number };
}

interface TestFailedEvent extends DeciderEvent {
  eventType: "TestFailed";
  payload: { id: string; reason: string };
}

interface TestSuccessData {
  id: string;
  newValue: number;
}

interface TestStateUpdate {
  value?: number;
  status?: string;
}

// =============================================================================
// Mock Context
// =============================================================================

interface MockContext {
  db: {
    patch: ReturnType<typeof vi.fn>;
  };
}

interface EntityMockContext extends MockContext {
  db: {
    patch: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };
}

function createMockContext(): MockContext {
  return {
    db: {
      patch: vi.fn(),
    },
  };
}

function createEntityMockContext(): EntityMockContext {
  return {
    db: {
      patch: vi.fn(),
      insert: vi.fn(),
    },
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestCMS = (overrides: Partial<TestCMS> = {}): TestCMS => ({
  id: "test-1",
  status: "active",
  value: 100,
  version: 1,
  ...overrides,
});

const createTestCommand = (overrides: Partial<TestCommand> = {}): TestCommand => ({
  commandId: "cmd-1",
  correlationId: "corr-1",
  entityId: "test-1",
  ...overrides,
});

// =============================================================================
// Test Deciders
// =============================================================================

function successDecider(
  state: TestCMS,
  command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  const newValue = command.newValue ?? state.value + 1;
  return success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
    data: { id: state.id, newValue },
    event: {
      eventType: "TestSucceeded",
      payload: { id: state.id, newValue },
    },
    stateUpdate: { value: newValue },
  });
}

function rejectedDecider(
  _state: TestCMS,
  _command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  return rejected("TEST_REJECTED", "Test rejection message", {
    reason: "test",
  });
}

function failedDecider(
  state: TestCMS,
  _command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  return failed<TestFailedEvent>(
    "Business failure occurred",
    {
      eventType: "TestFailed",
      payload: { id: state.id, reason: "business_rule" },
    },
    { additionalInfo: "test" }
  );
}

function entityCreateDecider(
  state: TestCMS | null,
  command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  if (state !== null) {
    return rejected("ENTITY_ALREADY_EXISTS", `Entity ${command.entityId} already exists`);
  }
  return success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
    data: { id: command.entityId, newValue: command.newValue ?? 100 },
    event: {
      eventType: "TestSucceeded",
      payload: { id: command.entityId, newValue: command.newValue ?? 100 },
    },
    stateUpdate: { value: command.newValue ?? 100, status: "active" },
  });
}

function failedEntityDecider(
  _state: TestCMS | null,
  _command: Omit<TestCommand, "commandId" | "correlationId">,
  _context: DeciderContext
) {
  return failed<TestFailedEvent>("Cannot create entity", {
    eventType: "TestFailed",
    payload: { id: "test-1", reason: "validation" },
  });
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  // createDeciderHandler state
  mockContext: MockContext;
  loadState: ReturnType<typeof vi.fn>;
  applyUpdate: ReturnType<typeof vi.fn>;
  mockDecider: ReturnType<typeof vi.fn> | null;
  handleError: ReturnType<typeof vi.fn> | null;
  logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  } | null;
  result: unknown;
  result2: unknown;
  error: Error | null;
  schemaVersion: number;

  // createEntityDeciderHandler state
  entityMockContext: EntityMockContext;
  tryLoadState: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  entityMockDecider: ReturnType<typeof vi.fn> | null;
  entityHandleError: ReturnType<typeof vi.fn> | null;
  entityLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  } | null;
  preValidate: ReturnType<typeof vi.fn> | null;
  entitySchemaVersion: number;
  entityResult2: unknown;
  // Track which handler variant to use
  useEntityHandler: boolean;
}

function createInitialState(): TestState {
  return {
    mockContext: createMockContext(),
    loadState: vi.fn(),
    applyUpdate: vi.fn(),
    mockDecider: null,
    handleError: null,
    logger: null,
    result: null,
    result2: null,
    error: null,
    schemaVersion: 1,

    entityMockContext: createEntityMockContext(),
    tryLoadState: vi.fn(),
    insert: vi.fn(),
    entityMockDecider: null,
    entityHandleError: null,
    entityLogger: null,
    preValidate: null,
    entitySchemaVersion: 1,
    entityResult2: null,
    useEntityHandler: false,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helper: Create decider handler config
// =============================================================================

function createConfig(
  decider: DeciderHandlerConfig<
    MockContext,
    TestCMS,
    TestCommand,
    TestSuccessEvent | TestFailedEvent,
    object,
    TestStateUpdate,
    string
  >["decider"]
): DeciderHandlerConfig<
  MockContext,
  TestCMS,
  TestCommand,
  TestSuccessEvent | TestFailedEvent,
  object,
  TestStateUpdate,
  string
> {
  return {
    name: "TestHandler",
    streamType: "Test",
    schemaVersion: state.schemaVersion,
    decider,
    getEntityId: (args) => args.entityId,
    loadState: state.loadState,
    applyUpdate: state.applyUpdate,
    ...(state.handleError ? { handleError: state.handleError } : {}),
    ...(state.logger ? { logger: state.logger } : {}),
  };
}

function createEntityConfig(): EntityDeciderHandlerConfig<
  EntityMockContext,
  TestCMS,
  TestCommand,
  TestSuccessEvent,
  TestSuccessData,
  TestStateUpdate,
  string
> {
  return {
    name: "CreateEntity",
    streamType: "Test",
    schemaVersion: state.entitySchemaVersion,
    decider: entityCreateDecider,
    getEntityId: (args) => args.entityId,
    tryLoadState: state.tryLoadState,
    insert: state.insert,
    ...(state.entityHandleError ? { handleError: state.entityHandleError } : {}),
    ...(state.entityLogger ? { logger: state.entityLogger } : {}),
    ...(state.preValidate ? { preValidate: state.preValidate } : {}),
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/decider/factory.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: createDeciderHandler success path
  // ==========================================================================

  Rule(
    "createDeciderHandler success path loads state, calls decider, applies update, and returns success",
    ({ RuleScenario }) => {
      RuleScenario(
        "Handler calls loadState with correct entityId",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a success decider", () => {
            // Config uses successDecider by default
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            const cms = createTestCMS();
            state.loadState.mockResolvedValue({ cms, _id: "doc-1" });
          });

          When('the handler processes a command with entityId "test-1"', async () => {
            const handler = createDeciderHandler(createConfig(successDecider));
            state.result = await handler(state.mockContext, createTestCommand());
          });

          Then('loadState was called with entityId "test-1"', () => {
            expect(state.loadState).toHaveBeenCalledWith(state.mockContext, "test-1");
          });
        }
      );

      RuleScenario(
        "Handler calls decider with state, command input, and context",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a mock decider", () => {
            state.mockDecider = vi.fn().mockReturnValue(
              success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
                data: { id: "test-1", newValue: 101 },
                event: {
                  eventType: "TestSucceeded",
                  payload: { id: "test-1", newValue: 101 },
                },
                stateUpdate: { value: 101 },
              })
            );
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            const cms = createTestCMS();
            state.loadState.mockResolvedValue({ cms, _id: "doc-1" });
          });

          When(
            'the handler processes a command with entityId "test-1" and newValue 101',
            async () => {
              const handler = createDeciderHandler(createConfig(state.mockDecider!));
              state.result = await handler(state.mockContext, createTestCommand({ newValue: 101 }));
            }
          );

          Then("the mock decider was called with the CMS state", () => {
            expect(state.mockDecider).toHaveBeenCalledWith(
              expect.objectContaining({
                id: "test-1",
                status: "active",
                value: 100,
                version: 1,
              }),
              expect.anything(),
              expect.anything()
            );
          });

          And(
            'the mock decider received command input with entityId "test-1" and newValue 101',
            () => {
              expect(state.mockDecider).toHaveBeenCalledWith(
                expect.anything(),
                { entityId: "test-1", newValue: 101 },
                expect.anything()
              );
            }
          );

          And(
            'the mock decider received context with commandId "cmd-1" and correlationId "corr-1"',
            () => {
              expect(state.mockDecider).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({
                  commandId: "cmd-1",
                  correlationId: "corr-1",
                  now: expect.any(Number),
                })
              );
            }
          );
        }
      );

      RuleScenario(
        "Handler calls applyUpdate with correct parameters",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a success decider", () => {
            // default
          });

          And('loadState returns a CMS with id "test-1" and version 5', () => {
            const cms = createTestCMS({ version: 5 });
            state.loadState.mockResolvedValue({ cms, _id: "doc-1" });
          });

          When(
            'the handler processes a command with entityId "test-1" and newValue 200',
            async () => {
              const handler = createDeciderHandler(createConfig(successDecider));
              state.result = await handler(state.mockContext, createTestCommand({ newValue: 200 }));
            }
          );

          Then(
            'applyUpdate was called with docId "doc-1" and stateUpdate value 200 and version 6',
            () => {
              expect(state.applyUpdate).toHaveBeenCalledWith(
                state.mockContext,
                "doc-1",
                expect.objectContaining({ version: 5 }),
                { value: 200 },
                6,
                expect.any(Number)
              );
            }
          );
        }
      );

      RuleScenario(
        "Handler returns success result with correct structure",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a success decider", () => {
            // default
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS(),
              _id: "doc-1",
            });
          });

          When('the handler processes a command with entityId "test-1"', async () => {
            const handler = createDeciderHandler(createConfig(successDecider));
            state.result = await handler(state.mockContext, createTestCommand());
          });

          Then('the result status is "success"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("success");
          });

          And("the result has all success fields:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              field: string;
              expected: string;
            }>(dataTable);
            const r = state.result as Record<string, unknown>;
            for (const row of rows) {
              assertDeepField(r, row.field, row.expected);
            }
          });
        }
      );

      RuleScenario(
        "Handler increments version correctly from existing version",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a success decider", () => {
            // default
          });

          And('loadState returns a CMS with id "test-1" and version 10', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS({ version: 10 }),
              _id: "doc-1",
            });
          });

          When('the handler processes a command with entityId "test-1"', async () => {
            const handler = createDeciderHandler(createConfig(successDecider));
            state.result = await handler(state.mockContext, createTestCommand());
          });

          Then('the result status is "success"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("success");
          });

          And("the result version is 11", () => {
            const r = state.result as { status: string; version: number };
            expect(r.version).toBe(11);
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: createDeciderHandler rejected path
  // ==========================================================================

  Rule(
    "createDeciderHandler rejected path returns rejection without applying update",
    ({ RuleScenario }) => {
      RuleScenario(
        "Handler returns rejected result without calling applyUpdate",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a rejected decider", () => {
            // uses rejectedDecider
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS(),
              _id: "doc-1",
            });
          });

          When('the handler processes a command with entityId "test-1"', async () => {
            const handler = createDeciderHandler(createConfig(rejectedDecider));
            state.result = await handler(state.mockContext, createTestCommand());
          });

          Then('the result status is "rejected"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("rejected");
          });

          And("applyUpdate was not called", () => {
            expect(state.applyUpdate).not.toHaveBeenCalled();
          });
        }
      );

      RuleScenario("Rejected result includes rejection details", ({ Given, And, When, Then }) => {
        Given("a decider handler configured with a rejected decider", () => {
          // uses rejectedDecider
        });

        And('loadState returns a CMS with id "test-1" and version 1', () => {
          state.loadState.mockResolvedValue({
            cms: createTestCMS(),
            _id: "doc-1",
          });
        });

        When('the handler processes a command with entityId "test-1"', async () => {
          const handler = createDeciderHandler(createConfig(rejectedDecider));
          state.result = await handler(state.mockContext, createTestCommand());
        });

        Then("the rejected result has all details:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            field: string;
            expected: string;
          }>(dataTable);
          const r = state.result as Record<string, unknown>;
          for (const row of rows) {
            expect(r[row.field]).toBe(row.expected);
          }
        });

        And('the rejected result context has reason "test"', () => {
          const r = state.result as {
            status: string;
            context: { reason: string };
          };
          expect(r.context).toEqual({ reason: "test" });
        });
      });
    }
  );

  // ==========================================================================
  // Rule: createDeciderHandler failed path
  // ==========================================================================

  Rule(
    "createDeciderHandler failed path returns failure with event without applying update",
    ({ RuleScenario }) => {
      RuleScenario(
        "Handler returns failed result without calling applyUpdate",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a failed decider", () => {
            // uses failedDecider
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS(),
              _id: "doc-1",
            });
          });

          When('the handler processes a command with entityId "test-1"', async () => {
            const handler = createDeciderHandler(createConfig(failedDecider));
            state.result = await handler(state.mockContext, createTestCommand());
          });

          Then('the result status is "failed"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("failed");
          });

          And("applyUpdate was not called", () => {
            expect(state.applyUpdate).not.toHaveBeenCalled();
          });
        }
      );

      RuleScenario(
        "Failed result includes failure event and details",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a failed decider", () => {
            // uses failedDecider
          });

          And('loadState returns a CMS with id "test-1" and version 3', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS({ version: 3 }),
              _id: "doc-1",
            });
          });

          When('the handler processes a command with entityId "test-1"', async () => {
            const handler = createDeciderHandler(createConfig(failedDecider));
            state.result = await handler(state.mockContext, createTestCommand());
          });

          Then("the failed result has all details:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              field: string;
              expected: string;
            }>(dataTable);
            const r = state.result as Record<string, unknown>;
            for (const row of rows) {
              assertDeepField(r, row.field, row.expected);
            }
          });

          And('the failed result context has additionalInfo "test"', () => {
            const r = state.result as {
              context: { additionalInfo: string };
            };
            expect(r.context).toEqual({ additionalInfo: "test" });
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: createDeciderHandler error handling
  // ==========================================================================

  Rule("createDeciderHandler error handling propagates or delegates errors", ({ RuleScenario }) => {
    RuleScenario("Handler propagates loadState errors", ({ Given, And, When, Then }) => {
      Given("a decider handler configured with a success decider", () => {
        // default
      });

      And('loadState rejects with error "Entity not found"', () => {
        state.loadState.mockRejectedValue(new Error("Entity not found"));
      });

      When("the handler processes a command expecting an error", async () => {
        const handler = createDeciderHandler(createConfig(successDecider));
        try {
          await handler(state.mockContext, createTestCommand());
        } catch (e) {
          state.error = e as Error;
        }
      });

      Then('the error message is "Entity not found"', () => {
        expect(state.error).toBeTruthy();
        expect(state.error!.message).toBe("Entity not found");
      });
    });

    RuleScenario(
      "Handler uses custom error handler when provided",
      ({ Given, And, When, Then }) => {
        Given(
          'a decider handler configured with a success decider and a custom error handler returning rejection "NOT_FOUND"',
          () => {
            state.handleError = vi.fn().mockReturnValue({
              status: "rejected" as const,
              code: "NOT_FOUND",
              message: "Custom not found message",
            });
          }
        );

        And('loadState rejects with error "Not found"', () => {
          state.loadState.mockRejectedValue(new Error("Not found"));
        });

        When('the handler processes a command with entityId "test-1"', async () => {
          const handler = createDeciderHandler(createConfig(successDecider));
          state.result = await handler(state.mockContext, createTestCommand());
        });

        Then("the custom error handler was called", () => {
          expect(state.handleError).toHaveBeenCalled();
        });

        And('the result status is "rejected"', () => {
          const r = state.result as { status: string };
          expect(r.status).toBe("rejected");
        });

        And('the result rejection code is "NOT_FOUND"', () => {
          const r = state.result as { status: string; code: string };
          expect(r.code).toBe("NOT_FOUND");
        });
      }
    );

    RuleScenario(
      "Handler rethrows when custom error handler returns nothing",
      ({ Given, And, When, Then }) => {
        Given(
          "a decider handler configured with a success decider and a custom error handler returning undefined",
          () => {
            state.handleError = vi.fn().mockReturnValue(undefined);
          }
        );

        And('loadState rejects with error "Unknown error"', () => {
          state.loadState.mockRejectedValue(new Error("Unknown error"));
        });

        When("the handler processes a command expecting an error", async () => {
          const handler = createDeciderHandler(createConfig(successDecider));
          try {
            await handler(state.mockContext, createTestCommand());
          } catch (e) {
            state.error = e as Error;
          }
        });

        Then('the error message is "Unknown error"', () => {
          expect(state.error).toBeTruthy();
          expect(state.error!.message).toBe("Unknown error");
        });
      }
    );
  });

  // ==========================================================================
  // Rule: createDeciderHandler logging
  // ==========================================================================

  Rule("createDeciderHandler logging emits debug and error messages", ({ RuleScenario }) => {
    RuleScenario("Handler logs debug on success", ({ Given, And, When, Then }) => {
      Given("a decider handler configured with a success decider and a logger", () => {
        state.logger = {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        };
      });

      And('loadState returns a CMS with id "test-1" and version 1', () => {
        state.loadState.mockResolvedValue({
          cms: createTestCMS(),
          _id: "doc-1",
        });
      });

      When('the handler processes a command with entityId "test-1"', async () => {
        const handler = createDeciderHandler(createConfig(successDecider));
        state.result = await handler(state.mockContext, createTestCommand());
      });

      Then("the logger debug was called with messages:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ message: string }>(dataTable);
        for (const row of rows) {
          if (row.message.includes("Starting")) {
            expect(state.logger!.debug).toHaveBeenCalledWith(
              row.message,
              expect.objectContaining({ entityId: "test-1" })
            );
          } else if (row.message.includes("succeeded")) {
            expect(state.logger!.debug).toHaveBeenCalledWith(
              row.message,
              expect.objectContaining({ version: 2 })
            );
          }
        }
      });
    });

    RuleScenario("Handler logs debug on rejection", ({ Given, And, When, Then }) => {
      Given("a decider handler configured with a rejected decider and a logger", () => {
        state.logger = {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        };
      });

      And('loadState returns a CMS with id "test-1" and version 1', () => {
        state.loadState.mockResolvedValue({
          cms: createTestCMS(),
          _id: "doc-1",
        });
      });

      When('the handler processes a command with entityId "test-1"', async () => {
        const handler = createDeciderHandler(createConfig(rejectedDecider));
        state.result = await handler(state.mockContext, createTestCommand());
      });

      Then(
        'the logger debug was called with message "[TestHandler] Command rejected" with code "TEST_REJECTED"',
        () => {
          expect(state.logger!.debug).toHaveBeenCalledWith(
            "[TestHandler] Command rejected",
            expect.objectContaining({ code: "TEST_REJECTED" })
          );
        }
      );
    });

    RuleScenario("Handler logs error on exception", ({ Given, And, When, Then }) => {
      Given("a decider handler configured with a success decider and a logger", () => {
        state.logger = {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        };
      });

      And('loadState rejects with error "Test error"', () => {
        state.loadState.mockRejectedValue(new Error("Test error"));
      });

      When('the handler processes a command with entityId "test-1" ignoring error', async () => {
        const handler = createDeciderHandler(createConfig(successDecider));
        try {
          await handler(state.mockContext, createTestCommand());
        } catch {
          // Ignore - we want to check the logger
        }
      });

      Then(
        'the logger error was called with message "[TestHandler] Command error" with entityId "test-1"',
        () => {
          expect(state.logger!.error).toHaveBeenCalledWith(
            "[TestHandler] Command error",
            expect.objectContaining({ entityId: "test-1" })
          );
        }
      );
    });
  });

  // ==========================================================================
  // Rule: createDeciderHandler event metadata
  // ==========================================================================

  Rule(
    "createDeciderHandler event metadata generates unique IDs and correct fields",
    ({ RuleScenario }) => {
      RuleScenario(
        "Handler generates unique eventId per invocation",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a success decider", () => {
            // default
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS(),
              _id: "doc-1",
            });
          });

          When("the handler processes two commands", async () => {
            const handler = createDeciderHandler(createConfig(successDecider));
            state.result = await handler(state.mockContext, createTestCommand());
            state.result2 = await handler(state.mockContext, createTestCommand());
          });

          Then("the two events have different eventIds", () => {
            const r1 = state.result as {
              status: string;
              event: { eventId: string };
            };
            const r2 = state.result2 as {
              status: string;
              event: { eventId: string };
            };
            if (r1.status === "success" && r2.status === "success") {
              expect(r1.event.eventId).not.toBe(r2.event.eventId);
            }
          });
        }
      );

      RuleScenario(
        "Handler includes schemaVersion in event metadata",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a success decider and schemaVersion 3", () => {
            state.schemaVersion = 3;
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS(),
              _id: "doc-1",
            });
          });

          When('the handler processes a command with entityId "test-1"', async () => {
            const handler = createDeciderHandler(createConfig(successDecider));
            state.result = await handler(state.mockContext, createTestCommand());
          });

          Then("the event metadata schemaVersion is 3", () => {
            const r = state.result as {
              status: string;
              event: { metadata: { schemaVersion: number } };
            };
            if (r.status === "success") {
              expect(r.event.metadata.schemaVersion).toBe(3);
            }
          });
        }
      );

      RuleScenario(
        "Handler builds correct streamId from entityId",
        ({ Given, And, When, Then }) => {
          Given("a decider handler configured with a success decider", () => {
            // default
          });

          And('loadState returns a CMS with id "test-1" and version 1', () => {
            state.loadState.mockResolvedValue({
              cms: createTestCMS(),
              _id: "doc-1",
            });
          });

          When('the handler processes a command with entityId "my-entity-123"', async () => {
            const handler = createDeciderHandler(createConfig(successDecider));
            state.result = await handler(
              state.mockContext,
              createTestCommand({ entityId: "my-entity-123" })
            );
          });

          Then('the event streamId contains "my-entity-123"', () => {
            const r = state.result as {
              status: string;
              event: { streamId: string };
            };
            if (r.status === "success") {
              expect(r.event.streamId).toContain("my-entity-123");
            }
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: createEntityDeciderHandler entity creation
  // ==========================================================================

  Rule(
    "createEntityDeciderHandler entity creation calls tryLoadState and insert for new entities",
    ({ RuleScenario }) => {
      RuleScenario(
        "Entity handler calls tryLoadState with correct entityId",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured for creation", () => {
            // default entity config
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then('tryLoadState was called with entityId "test-1"', () => {
            expect(state.tryLoadState).toHaveBeenCalledWith(state.entityMockContext, "test-1");
          });
        }
      );

      RuleScenario(
        "Entity handler calls decider with null state when entity does not exist",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured with a mock decider", () => {
            state.entityMockDecider = vi.fn().mockReturnValue(
              success<TestSuccessEvent, TestSuccessData, TestStateUpdate>({
                data: { id: "test-1", newValue: 100 },
                event: {
                  eventType: "TestSucceeded",
                  payload: { id: "test-1", newValue: 100 },
                },
                stateUpdate: { value: 100, status: "active" },
              })
            );
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const config = {
              ...createEntityConfig(),
              decider: state.entityMockDecider!,
            };
            const handler = createEntityDeciderHandler(config);
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then("the entity mock decider was called with null state", () => {
            expect(state.entityMockDecider).toHaveBeenCalledWith(
              null,
              expect.anything(),
              expect.anything()
            );
          });

          And('the entity mock decider received command input with entityId "test-1"', () => {
            const calls = state.entityMockDecider!.mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            const [, commandInput] = calls[0];
            expect(commandInput).toEqual({ entityId: "test-1" });
          });

          And(
            'the entity mock decider received context with commandId "cmd-1" and correlationId "corr-1"',
            () => {
              const calls = state.entityMockDecider!.mock.calls;
              expect(calls.length).toBeGreaterThan(0);
              const [, , context] = calls[0];
              expect(context).toEqual(
                expect.objectContaining({
                  commandId: "cmd-1",
                  correlationId: "corr-1",
                })
              );
            }
          );
        }
      );

      RuleScenario("Entity handler calls insert for new entities", ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured for creation", () => {
          // default
        });

        And("tryLoadState returns null", () => {
          state.tryLoadState.mockResolvedValue(null);
        });

        When(
          'the entity handler processes a command with entityId "test-1" and newValue 200',
          async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(
              state.entityMockContext,
              createTestCommand({ newValue: 200 })
            );
          }
        );

        Then(
          'insert was called with entityId "test-1" and stateUpdate value 200 and status "active" and version 1',
          () => {
            expect(state.insert).toHaveBeenCalledWith(
              state.entityMockContext,
              "test-1",
              { value: 200, status: "active" },
              { entityId: "test-1", newValue: 200 },
              1,
              expect.any(Number)
            );
          }
        );
      });

      RuleScenario(
        "Entity handler returns success with version 1 for new entities",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured for creation", () => {
            // default
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then('the result status is "success"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("success");
          });

          And("the entity result has all success fields:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              field: string;
              expected: string;
            }>(dataTable);
            const r = state.result as Record<string, unknown>;
            for (const row of rows) {
              assertDeepField(r, row.field, row.expected);
            }
          });
        }
      );

      RuleScenario(
        "Entity handler generates correct event metadata for new entities",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured for creation", () => {
            // default
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then("the entity event has correct metadata:", (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              field: string;
              expected: string;
            }>(dataTable);
            const r = state.result as Record<string, unknown>;
            const resultStatus = (r as { status: string }).status;
            if (resultStatus === "success") {
              for (const row of rows) {
                assertDeepField(r, row.field, row.expected);
              }
            }
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: createEntityDeciderHandler entity already exists
  // ==========================================================================

  Rule("createEntityDeciderHandler entity already exists returns rejection", ({ RuleScenario }) => {
    RuleScenario(
      "Entity handler calls decider with existing state when entity exists",
      ({ Given, And, When, Then }) => {
        Given(
          "an entity decider handler configured with an existence-checking mock decider",
          () => {
            state.entityMockDecider = vi
              .fn()
              .mockReturnValue(rejected("ENTITY_ALREADY_EXISTS", "Entity already exists"));
          }
        );

        And('tryLoadState returns an existing CMS with id "test-1"', () => {
          const existingCMS = createTestCMS();
          state.tryLoadState.mockResolvedValue({
            cms: existingCMS,
            _id: "doc-1",
          });
        });

        When('the entity handler processes a command with entityId "test-1"', async () => {
          const config = {
            ...createEntityConfig(),
            decider: state.entityMockDecider!,
          };
          const handler = createEntityDeciderHandler(config);
          state.result = await handler(state.entityMockContext, createTestCommand());
        });

        Then("the existence mock decider was called with the existing CMS state", () => {
          expect(state.entityMockDecider).toHaveBeenCalledWith(
            expect.objectContaining({
              id: "test-1",
              status: "active",
              value: 100,
              version: 1,
            }),
            expect.anything(),
            expect.anything()
          );
        });

        And('the existence mock decider received command input with entityId "test-1"', () => {
          expect(state.entityMockDecider).toHaveBeenCalledWith(
            expect.anything(),
            { entityId: "test-1" },
            expect.anything()
          );
        });
      }
    );

    RuleScenario(
      "Entity handler returns rejection when entity already exists",
      ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured for creation", () => {
          // default
        });

        And('tryLoadState returns an existing CMS with id "test-1"', () => {
          state.tryLoadState.mockResolvedValue({
            cms: createTestCMS(),
            _id: "doc-1",
          });
        });

        When('the entity handler processes a command with entityId "test-1"', async () => {
          const handler = createEntityDeciderHandler(createEntityConfig());
          state.result = await handler(state.entityMockContext, createTestCommand());
        });

        Then('the result status is "rejected"', () => {
          const r = state.result as { status: string };
          expect(r.status).toBe("rejected");
        });

        And('the result rejection code is "ENTITY_ALREADY_EXISTS"', () => {
          const r = state.result as { status: string; code: string };
          expect(r.code).toBe("ENTITY_ALREADY_EXISTS");
        });
      }
    );

    RuleScenario(
      "Entity handler does not call insert when entity already exists",
      ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured for creation", () => {
          // default
        });

        And('tryLoadState returns an existing CMS with id "test-1"', () => {
          state.tryLoadState.mockResolvedValue({
            cms: createTestCMS(),
            _id: "doc-1",
          });
        });

        When('the entity handler processes a command with entityId "test-1"', async () => {
          const handler = createEntityDeciderHandler(createEntityConfig());
          state.result = await handler(state.entityMockContext, createTestCommand());
        });

        Then("insert was not called", () => {
          expect(state.insert).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: createEntityDeciderHandler failed path
  // ==========================================================================

  Rule(
    "createEntityDeciderHandler failed path returns failure without insert",
    ({ RuleScenario }) => {
      RuleScenario(
        "Entity handler returns failed result with version 0 for non-existent entity",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured with a failed entity decider", () => {
            // uses failedEntityDecider
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const config = {
              ...createEntityConfig(),
              decider: failedEntityDecider,
            };
            const handler = createEntityDeciderHandler(config);
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then('the result status is "failed"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("failed");
          });

          And("the entity failed result has expectedVersion 0", () => {
            const r = state.result as {
              status: string;
              expectedVersion: number;
            };
            expect(r.expectedVersion).toBe(0);
          });

          And('the entity failed result event type is "TestFailed"', () => {
            const r = state.result as {
              status: string;
              event: { eventType: string };
            };
            expect(r.event.eventType).toBe("TestFailed");
          });
        }
      );

      RuleScenario(
        "Entity handler does not call insert on business failure",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured with a failed entity decider", () => {
            // uses failedEntityDecider
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const config = {
              ...createEntityConfig(),
              decider: failedEntityDecider,
            };
            const handler = createEntityDeciderHandler(config);
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then("insert was not called", () => {
            expect(state.insert).not.toHaveBeenCalled();
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: createEntityDeciderHandler error handling
  // ==========================================================================

  Rule(
    "createEntityDeciderHandler error handling propagates or delegates errors",
    ({ RuleScenario }) => {
      RuleScenario(
        "Entity handler propagates tryLoadState errors",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured for creation", () => {
            // default
          });

          And('tryLoadState rejects with error "Database error"', () => {
            state.tryLoadState.mockRejectedValue(new Error("Database error"));
          });

          When("the entity handler processes a command expecting an error", async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            try {
              await handler(state.entityMockContext, createTestCommand());
            } catch (e) {
              state.error = e as Error;
            }
          });

          Then('the error message is "Database error"', () => {
            expect(state.error).toBeTruthy();
            expect(state.error!.message).toBe("Database error");
          });
        }
      );

      RuleScenario("Entity handler propagates insert errors", ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured for creation", () => {
          // default
        });

        And("tryLoadState returns null", () => {
          state.tryLoadState.mockResolvedValue(null);
        });

        And('insert rejects with error "Insert constraint violation"', () => {
          state.insert.mockRejectedValue(new Error("Insert constraint violation"));
        });

        When("the entity handler processes a command expecting an error", async () => {
          const handler = createEntityDeciderHandler(createEntityConfig());
          try {
            await handler(state.entityMockContext, createTestCommand());
          } catch (e) {
            state.error = e as Error;
          }
        });

        Then('the error message is "Insert constraint violation"', () => {
          expect(state.error).toBeTruthy();
          expect(state.error!.message).toBe("Insert constraint violation");
        });
      });

      RuleScenario(
        "Entity handler uses custom error handler when provided",
        ({ Given, And, When, Then }) => {
          Given(
            'an entity decider handler configured for creation with a custom error handler returning rejection "CONSTRAINT_ERROR"',
            () => {
              state.entityHandleError = vi.fn().mockReturnValue({
                status: "rejected" as const,
                code: "CONSTRAINT_ERROR",
                message: "Custom error message",
              });
            }
          );

          And('tryLoadState rejects with error "Constraint violation"', () => {
            state.tryLoadState.mockRejectedValue(new Error("Constraint violation"));
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then("the custom error handler was called", () => {
            expect(state.entityHandleError).toHaveBeenCalled();
          });

          And('the result status is "rejected"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("rejected");
          });

          And('the result rejection code is "CONSTRAINT_ERROR"', () => {
            const r = state.result as { status: string; code: string };
            expect(r.code).toBe("CONSTRAINT_ERROR");
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: createEntityDeciderHandler logging
  // ==========================================================================

  Rule("createEntityDeciderHandler logging emits debug messages", ({ RuleScenario }) => {
    RuleScenario(
      "Entity handler logs debug on entity creation success",
      ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured for creation with a logger", () => {
          state.entityLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          };
        });

        And("tryLoadState returns null", () => {
          state.tryLoadState.mockResolvedValue(null);
        });

        When('the entity handler processes a command with entityId "test-1"', async () => {
          const config = {
            ...createEntityConfig(),
            logger: state.entityLogger!,
          };
          const handler = createEntityDeciderHandler(config);
          state.result = await handler(state.entityMockContext, createTestCommand());
        });

        Then(
          "the entity logger debug was called with messages:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ message: string }>(dataTable);
            for (const row of rows) {
              if (row.message.includes("Starting")) {
                expect(state.entityLogger!.debug).toHaveBeenCalledWith(
                  row.message,
                  expect.objectContaining({ entityId: "test-1" })
                );
              } else if (row.message.includes("succeeded")) {
                expect(state.entityLogger!.debug).toHaveBeenCalledWith(
                  row.message,
                  expect.objectContaining({ version: 1 })
                );
              }
            }
          }
        );
      }
    );

    RuleScenario("Entity handler logs debug on rejection", ({ Given, And, When, Then }) => {
      Given("an entity decider handler configured for creation with a logger", () => {
        state.entityLogger = {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        };
      });

      And('tryLoadState returns an existing CMS with id "test-1"', () => {
        state.tryLoadState.mockResolvedValue({
          cms: createTestCMS(),
          _id: "doc-1",
        });
      });

      When('the entity handler processes a command with entityId "test-1"', async () => {
        const config = {
          ...createEntityConfig(),
          logger: state.entityLogger!,
        };
        const handler = createEntityDeciderHandler(config);
        state.result = await handler(state.entityMockContext, createTestCommand());
      });

      Then(
        'the entity logger debug was called with message "[CreateEntity] Command rejected" with code "ENTITY_ALREADY_EXISTS"',
        () => {
          expect(state.entityLogger!.debug).toHaveBeenCalledWith(
            "[CreateEntity] Command rejected",
            expect.objectContaining({ code: "ENTITY_ALREADY_EXISTS" })
          );
        }
      );
    });
  });

  // ==========================================================================
  // Rule: createEntityDeciderHandler event metadata
  // ==========================================================================

  Rule("createEntityDeciderHandler event metadata for entity creation", ({ RuleScenario }) => {
    RuleScenario(
      "Entity handler generates unique eventId for each creation",
      ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured for creation", () => {
          // default
        });

        And("tryLoadState returns null", () => {
          state.tryLoadState.mockResolvedValue(null);
        });

        When(
          "the entity handler processes two creation commands with different entityIds",
          async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(
              state.entityMockContext,
              createTestCommand({ entityId: "entity-1" })
            );
            state.entityResult2 = await handler(
              state.entityMockContext,
              createTestCommand({ entityId: "entity-2" })
            );
          }
        );

        Then("the two entity events have different eventIds", () => {
          const r1 = state.result as {
            status: string;
            event: { eventId: string };
          };
          const r2 = state.entityResult2 as {
            status: string;
            event: { eventId: string };
          };
          if (r1.status === "success" && r2.status === "success") {
            expect(r1.event.eventId).not.toBe(r2.event.eventId);
          }
        });
      }
    );

    RuleScenario(
      "Entity handler includes schemaVersion in metadata",
      ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured for creation with schemaVersion 5", () => {
          state.entitySchemaVersion = 5;
        });

        And("tryLoadState returns null", () => {
          state.tryLoadState.mockResolvedValue(null);
        });

        When('the entity handler processes a command with entityId "test-1"', async () => {
          const handler = createEntityDeciderHandler(createEntityConfig());
          state.result = await handler(state.entityMockContext, createTestCommand());
        });

        Then("the entity event metadata schemaVersion is 5", () => {
          const r = state.result as {
            status: string;
            event: { metadata: { schemaVersion: number } };
          };
          if (r.status === "success") {
            expect(r.event.metadata.schemaVersion).toBe(5);
          }
        });
      }
    );
  });

  // ==========================================================================
  // Rule: createEntityDeciderHandler preValidate hook
  // ==========================================================================

  Rule(
    "createEntityDeciderHandler preValidate hook short-circuits before loading state",
    ({ RuleScenario }) => {
      RuleScenario("PreValidate rejection short-circuits handler", ({ Given, When, Then, And }) => {
        Given(
          'an entity decider handler configured with preValidate returning rejection "SKU_ALREADY_EXISTS"',
          () => {
            state.preValidate = vi.fn().mockResolvedValue({
              status: "rejected" as const,
              code: "SKU_ALREADY_EXISTS",
              reason: 'SKU "ABC-123" already exists',
            });
            state.entityMockDecider = vi.fn();
          }
        );

        When('the entity handler processes a command with entityId "test-1"', async () => {
          const config = {
            ...createEntityConfig(),
            decider: state.entityMockDecider!,
          };
          const handler = createEntityDeciderHandler(config);
          state.result = await handler(state.entityMockContext, createTestCommand());
        });

        Then('the result status is "rejected"', () => {
          const r = state.result as { status: string };
          expect(r.status).toBe("rejected");
        });

        And('the result rejection code is "SKU_ALREADY_EXISTS"', () => {
          const r = state.result as { status: string; code: string };
          expect(r.code).toBe("SKU_ALREADY_EXISTS");
        });

        And("tryLoadState was not called", () => {
          expect(state.tryLoadState).not.toHaveBeenCalled();
        });

        And("the entity mock decider was not called", () => {
          expect(state.entityMockDecider).not.toHaveBeenCalled();
        });

        And("insert was not called", () => {
          expect(state.insert).not.toHaveBeenCalled();
        });
      });

      RuleScenario(
        "PreValidate returning undefined allows normal flow",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured with preValidate returning undefined", () => {
            state.preValidate = vi.fn().mockResolvedValue(undefined);
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then('preValidate was called with entityId "test-1"', () => {
            expect(state.preValidate).toHaveBeenCalledWith(state.entityMockContext, {
              entityId: "test-1",
            });
          });

          And("tryLoadState was called", () => {
            expect(state.tryLoadState).toHaveBeenCalled();
          });

          And("insert was called", () => {
            expect(state.insert).toHaveBeenCalled();
          });

          And('the result status is "success"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("success");
          });
        }
      );

      RuleScenario("PreValidate receives correct arguments", ({ Given, And, When, Then }) => {
        Given("an entity decider handler configured with preValidate returning undefined", () => {
          state.preValidate = vi.fn().mockResolvedValue(undefined);
        });

        And("tryLoadState returns null", () => {
          state.tryLoadState.mockResolvedValue(null);
        });

        When(
          'the entity handler processes a command with entityId "my-product" and newValue 500',
          async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(
              state.entityMockContext,
              createTestCommand({ entityId: "my-product", newValue: 500 })
            );
          }
        );

        Then('preValidate was called with entityId "my-product" and newValue 500', () => {
          expect(state.preValidate).toHaveBeenCalledWith(state.entityMockContext, {
            entityId: "my-product",
            newValue: 500,
          });
        });
      });

      RuleScenario("PreValidate failure is logged", ({ Given, When, Then }) => {
        Given(
          'an entity decider handler configured with preValidate returning rejection "VALIDATION_FAILED" and a logger',
          () => {
            state.preValidate = vi.fn().mockResolvedValue({
              status: "rejected" as const,
              code: "VALIDATION_FAILED",
              reason: "Pre-validation failed",
            });
            state.entityLogger = {
              debug: vi.fn(),
              info: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
            };
          }
        );

        When('the entity handler processes a command with entityId "test-1"', async () => {
          const config = {
            ...createEntityConfig(),
            logger: state.entityLogger!,
          };
          const handler = createEntityDeciderHandler(config);
          state.result = await handler(state.entityMockContext, createTestCommand());
        });

        Then(
          "the entity logger debug was called with messages:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ message: string }>(dataTable);
            for (const row of rows) {
              if (row.message.includes("Starting")) {
                expect(state.entityLogger!.debug).toHaveBeenCalledWith(
                  row.message,
                  expect.objectContaining({ entityId: "test-1" })
                );
              } else if (row.message.includes("Pre-validation")) {
                expect(state.entityLogger!.debug).toHaveBeenCalledWith(
                  row.message,
                  expect.objectContaining({ entityId: "test-1" })
                );
              }
            }
          }
        );
      });

      RuleScenario(
        "Handler works normally without preValidate configured",
        ({ Given, And, When, Then }) => {
          Given("an entity decider handler configured for creation without preValidate", () => {
            // preValidate is null by default
          });

          And("tryLoadState returns null", () => {
            state.tryLoadState.mockResolvedValue(null);
          });

          When('the entity handler processes a command with entityId "test-1"', async () => {
            const handler = createEntityDeciderHandler(createEntityConfig());
            state.result = await handler(state.entityMockContext, createTestCommand());
          });

          Then("tryLoadState was called", () => {
            expect(state.tryLoadState).toHaveBeenCalled();
          });

          And('the result status is "success"', () => {
            const r = state.result as { status: string };
            expect(r.status).toBe("success");
          });
        }
      );
    }
  );
});
