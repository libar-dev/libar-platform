/**
 * Command Schemas - Step Definitions
 *
 * BDD step definitions for command schema validation:
 * - CommandMetadataSchema
 * - createCommandSchema factory
 * - CommandResultSchema discriminated union (success, rejected, conflict, error)
 *
 * Mechanical migration from tests/unit/schemas/command-schemas.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { z } from "zod";

import {
  createCommandSchema,
  CommandResultSchema,
  CommandMetadataSchema,
  CommandSuccessResultSchema,
  CommandRejectedResultSchema,
  CommandConflictResultSchema,
  CommandErrorResultSchema,
} from "../../../src/commands/schemas";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  schema: z.ZodType<unknown> | null;
  parseResult: unknown;
  parseSuccess: boolean | null;
  // For multi-validation scenarios (invalid timestamps)
  multiResults: Array<{ success: boolean }>;
}

function createInitialState(): TestState {
  return {
    schema: null,
    parseResult: null,
    parseSuccess: null,
    multiResults: [],
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/schemas/command-schemas.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Rule: CommandMetadataSchema validates required fields and timestamp constraints
  // ===========================================================================

  Rule(
    "CommandMetadataSchema validates required fields and timestamp constraints",
    ({ RuleScenario }) => {
      RuleScenario("Complete metadata is accepted", ({ Given, When, Then }) => {
        Given(
          'a metadata object with commandId "cmd_123", commandType "TestCommand", correlationId "corr_456", and a valid timestamp',
          () => {
            state.parseResult = {
              commandId: "cmd_123",
              commandType: "TestCommand",
              correlationId: "corr_456",
              timestamp: Date.now(),
            };
          }
        );

        When("the metadata is validated against CommandMetadataSchema", () => {
          const result = CommandMetadataSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Metadata with optional userId is accepted", ({ Given, When, Then }) => {
        Given(
          'a metadata object with commandId "cmd_123", commandType "TestCommand", correlationId "corr_456", userId "user_789", and a valid timestamp',
          () => {
            state.parseResult = {
              commandId: "cmd_123",
              commandType: "TestCommand",
              correlationId: "corr_456",
              userId: "user_789",
              timestamp: Date.now(),
            };
          }
        );

        When("the metadata is validated against CommandMetadataSchema", () => {
          const result = CommandMetadataSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Metadata with invalid timestamps is rejected", ({ Given, When, Then }) => {
        Given(
          "metadata objects with the following timestamps:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ timestamp: string }>(dataTable);
            state.multiResults = rows.map((row) => {
              const result = CommandMetadataSchema.safeParse({
                commandId: "cmd_123",
                commandType: "TestCommand",
                correlationId: "corr_456",
                timestamp: parseFloat(row.timestamp),
              });
              return { success: result.success };
            });
          }
        );

        When("each metadata object is validated against CommandMetadataSchema", () => {
          // Validation already performed in Given step with DataTable
        });

        Then("each validation fails", () => {
          expect(state.multiResults).toHaveLength(3);
          for (const entry of state.multiResults) {
            expect(entry.success).toBe(false);
          }
        });
      });

      RuleScenario("Metadata missing required fields is rejected", ({ Given, When, Then }) => {
        Given('a metadata object with only commandId "cmd_123"', () => {
          state.parseResult = {
            commandId: "cmd_123",
          };
        });

        When("the metadata is validated against CommandMetadataSchema", () => {
          const result = CommandMetadataSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });
    }
  );

  // ===========================================================================
  // Rule: createCommandSchema produces schemas that enforce commandType literal and payload shape
  // ===========================================================================

  const TestPayloadSchema = z.object({
    foo: z.string(),
    bar: z.number().optional(),
  });

  Rule(
    "createCommandSchema produces schemas that enforce commandType literal and payload shape",
    ({ RuleScenario }) => {
      RuleScenario("Complete command is accepted", ({ Given, When, Then }) => {
        Given(
          'a TestCommand schema created with createCommandSchema and payload field "foo:string"',
          () => {
            state.schema = createCommandSchema("TestCommand", TestPayloadSchema);
          }
        );

        When(
          'a valid command is parsed with commandType "TestCommand" and payload foo "bar"',
          () => {
            const result = state.schema!.safeParse({
              commandId: "cmd_123",
              commandType: "TestCommand",
              correlationId: "corr_456",
              targetContext: "test",
              timestamp: Date.now(),
              payload: { foo: "bar" },
            });
            state.parseSuccess = result.success;
          }
        );

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Command with optional payload fields is accepted", ({ Given, When, Then }) => {
        Given(
          'a TestCommand schema created with createCommandSchema and payload field "foo:string"',
          () => {
            state.schema = createCommandSchema("TestCommand", TestPayloadSchema);
          }
        );

        When(
          'a valid command is parsed with commandType "TestCommand" and payload foo "bar" and bar 42',
          () => {
            const result = state.schema!.safeParse({
              commandId: "cmd_123",
              commandType: "TestCommand",
              correlationId: "corr_456",
              targetContext: "test",
              timestamp: Date.now(),
              payload: { foo: "bar", bar: 42 },
            });
            state.parseSuccess = result.success;
          }
        );

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario(
        "Command with wrong commandType literal is rejected",
        ({ Given, When, Then }) => {
          Given(
            'a TestCommand schema created with createCommandSchema and payload field "foo:string"',
            () => {
              state.schema = createCommandSchema("TestCommand", TestPayloadSchema);
            }
          );

          When('a command is parsed with commandType "WrongType" and payload foo "bar"', () => {
            const result = state.schema!.safeParse({
              commandId: "cmd_123",
              commandType: "WrongType",
              correlationId: "corr_456",
              targetContext: "test",
              timestamp: Date.now(),
              payload: { foo: "bar" },
            });
            state.parseSuccess = result.success;
          });

          Then("the validation fails", () => {
            expect(state.parseSuccess).toBe(false);
          });
        }
      );

      RuleScenario("Command with invalid payload type is rejected", ({ Given, When, Then }) => {
        Given(
          'a TestCommand schema created with createCommandSchema and payload field "foo:string"',
          () => {
            state.schema = createCommandSchema("TestCommand", TestPayloadSchema);
          }
        );

        When("a command is parsed with payload foo as number 123", () => {
          const result = state.schema!.safeParse({
            commandId: "cmd_123",
            commandType: "TestCommand",
            correlationId: "corr_456",
            targetContext: "test",
            timestamp: Date.now(),
            payload: { foo: 123 },
          });
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });

      RuleScenario(
        "Command with missing required payload field is rejected",
        ({ Given, When, Then }) => {
          Given(
            'a TestCommand schema created with createCommandSchema and payload field "foo:string"',
            () => {
              state.schema = createCommandSchema("TestCommand", TestPayloadSchema);
            }
          );

          When("a command is parsed with an empty payload object", () => {
            const result = state.schema!.safeParse({
              commandId: "cmd_123",
              commandType: "TestCommand",
              correlationId: "corr_456",
              targetContext: "test",
              timestamp: Date.now(),
              payload: {},
            });
            state.parseSuccess = result.success;
          });

          Then("the validation fails", () => {
            expect(state.parseSuccess).toBe(false);
          });
        }
      );

      RuleScenario("Command missing targetContext is rejected", ({ Given, When, Then }) => {
        Given(
          'a TestCommand schema created with createCommandSchema and payload field "foo:string"',
          () => {
            state.schema = createCommandSchema("TestCommand", TestPayloadSchema);
          }
        );

        When("a command is parsed without targetContext", () => {
          const result = state.schema!.safeParse({
            commandId: "cmd_123",
            commandType: "TestCommand",
            correlationId: "corr_456",
            timestamp: Date.now(),
            payload: { foo: "bar" },
          });
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });

      RuleScenario(
        "Schema provides type inference for commandType literal",
        ({ Given, When, Then }) => {
          Given(
            'a TestCommand schema created with createCommandSchema and payload field "foo:string"',
            () => {
              state.schema = createCommandSchema("TestCommand", TestPayloadSchema);
            }
          );

          When(
            'a valid command is parsed with commandType "TestCommand" and payload foo "bar"',
            () => {
              const validCommand = {
                commandId: "cmd_123",
                commandType: "TestCommand" as const,
                correlationId: "corr_456",
                targetContext: "test",
                timestamp: Date.now(),
                payload: { foo: "bar" },
              };

              type InferredCommand = z.infer<typeof TestPayloadSchema>;
              // Compile-time check: the type system accepts this
              const _typeCheck: InferredCommand = { foo: "bar" };
              void _typeCheck;

              const result = state.schema!.safeParse(validCommand);
              state.parseSuccess = result.success;
              if (result.success) {
                state.parseResult = result.data;
              }
            }
          );

          Then('the parsed commandType equals "TestCommand"', () => {
            expect((state.parseResult as Record<string, unknown>).commandType).toBe("TestCommand");
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: CommandSuccessResultSchema validates success results
  // ===========================================================================

  Rule(
    "CommandSuccessResultSchema validates success results with version and optional data",
    ({ RuleScenario }) => {
      RuleScenario("Success with version and data is accepted", ({ Given, When, Then }) => {
        Given('a success result with version 1 and data id "123"', () => {
          state.parseResult = {
            status: "success",
            version: 1,
            data: { id: "123" },
          };
        });

        When("the result is validated against CommandSuccessResultSchema", () => {
          const result = CommandSuccessResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Success with undefined data is accepted", ({ Given, When, Then }) => {
        Given("a success result with version 5 and undefined data", () => {
          state.parseResult = {
            status: "success",
            version: 5,
            data: undefined,
          };
        });

        When("the result is validated against CommandSuccessResultSchema", () => {
          const result = CommandSuccessResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Success without version is rejected", ({ Given, When, Then }) => {
        Given('a success result without version and data id "123"', () => {
          state.parseResult = {
            status: "success",
            data: { id: "123" },
          };
        });

        When("the result is validated against CommandSuccessResultSchema", () => {
          const result = CommandSuccessResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });
    }
  );

  // ===========================================================================
  // Rule: CommandRejectedResultSchema validates rejected results
  // ===========================================================================

  Rule(
    "CommandRejectedResultSchema validates rejected results with code and reason",
    ({ RuleScenario }) => {
      RuleScenario("Rejected with code and reason is accepted", ({ Given, When, Then }) => {
        Given(
          'a rejected result with code "VALIDATION_ERROR" and reason "Invalid input data"',
          () => {
            state.parseResult = {
              status: "rejected",
              code: "VALIDATION_ERROR",
              reason: "Invalid input data",
            };
          }
        );

        When("the result is validated against CommandRejectedResultSchema", () => {
          const result = CommandRejectedResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Rejected with optional context is accepted", ({ Given, When, Then }) => {
        Given(
          'a rejected result with code "BUSINESS_RULE_VIOLATION", reason "Cannot cancel completed order", and context',
          () => {
            state.parseResult = {
              status: "rejected",
              code: "BUSINESS_RULE_VIOLATION",
              reason: "Cannot cancel completed order",
              context: { orderId: "123", currentStatus: "completed" },
            };
          }
        );

        When("the result is validated against CommandRejectedResultSchema", () => {
          const result = CommandRejectedResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Rejected without reason is rejected", ({ Given, When, Then }) => {
        Given('a rejected result with code "VALIDATION_ERROR" and no reason', () => {
          state.parseResult = {
            status: "rejected",
            code: "VALIDATION_ERROR",
          };
        });

        When("the result is validated against CommandRejectedResultSchema", () => {
          const result = CommandRejectedResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });
    }
  );

  // ===========================================================================
  // Rule: CommandConflictResultSchema validates conflict results
  // ===========================================================================

  Rule(
    "CommandConflictResultSchema validates conflict results with CONCURRENT_MODIFICATION code",
    ({ RuleScenario }) => {
      RuleScenario(
        "Conflict with CONCURRENT_MODIFICATION code is accepted",
        ({ Given, When, Then }) => {
          Given(
            'a conflict result with code "CONCURRENT_MODIFICATION" and currentVersion 5',
            () => {
              state.parseResult = {
                status: "conflict",
                code: "CONCURRENT_MODIFICATION",
                currentVersion: 5,
              };
            }
          );

          When("the result is validated against CommandConflictResultSchema", () => {
            const result = CommandConflictResultSchema.safeParse(state.parseResult);
            state.parseSuccess = result.success;
          });

          Then("the validation succeeds", () => {
            expect(state.parseSuccess).toBe(true);
          });
        }
      );

      RuleScenario("Conflict with wrong code is rejected", ({ Given, When, Then }) => {
        Given('a conflict result with code "OTHER_CODE" and currentVersion 5', () => {
          state.parseResult = {
            status: "conflict",
            code: "OTHER_CODE",
            currentVersion: 5,
          };
        });

        When("the result is validated against CommandConflictResultSchema", () => {
          const result = CommandConflictResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });

      RuleScenario("Conflict without currentVersion is rejected", ({ Given, When, Then }) => {
        Given('a conflict result with code "CONCURRENT_MODIFICATION" and no currentVersion', () => {
          state.parseResult = {
            status: "conflict",
            code: "CONCURRENT_MODIFICATION",
          };
        });

        When("the result is validated against CommandConflictResultSchema", () => {
          const result = CommandConflictResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });
    }
  );

  // ===========================================================================
  // Rule: CommandErrorResultSchema validates error results
  // ===========================================================================

  Rule(
    "CommandErrorResultSchema validates error results requiring a message",
    ({ RuleScenario }) => {
      RuleScenario("Error with message is accepted", ({ Given, When, Then }) => {
        Given('an error result with message "Unexpected database error"', () => {
          state.parseResult = {
            status: "error",
            message: "Unexpected database error",
          };
        });

        When("the result is validated against CommandErrorResultSchema", () => {
          const result = CommandErrorResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation succeeds", () => {
          expect(state.parseSuccess).toBe(true);
        });
      });

      RuleScenario("Error without message is rejected", ({ Given, When, Then }) => {
        Given("an error result with no message", () => {
          state.parseResult = {
            status: "error",
          };
        });

        When("the result is validated against CommandErrorResultSchema", () => {
          const result = CommandErrorResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });
    }
  );

  // ===========================================================================
  // Rule: CommandResultSchema discriminated union correctly routes by status
  // ===========================================================================

  Rule(
    "CommandResultSchema discriminated union correctly routes by status field",
    ({ RuleScenario }) => {
      RuleScenario(
        "Union discriminates success and preserves version",
        ({ Given, When, Then, And }) => {
          Given('a result with status "success", version 1, and data null', () => {
            state.parseResult = {
              status: "success",
              version: 1,
              data: null,
            };
          });

          When("the result is validated against CommandResultSchema", () => {
            const result = CommandResultSchema.safeParse(state.parseResult);
            state.parseSuccess = result.success;
            if (result.success) {
              state.parseResult = result.data;
            }
          });

          Then("the validation succeeds", () => {
            expect(state.parseSuccess).toBe(true);
          });

          And('the parsed result has status "success" and version 1', () => {
            const result = state.parseResult as Record<string, unknown>;
            expect(result.status).toBe("success");
            if (result.status === "success") {
              expect(result.version).toBe(1);
            }
          });
        }
      );

      RuleScenario(
        "Union discriminates rejected and preserves code and reason",
        ({ Given, When, Then, And }) => {
          Given(
            'a result with status "rejected", code "ERROR", and reason "Something went wrong"',
            () => {
              state.parseResult = {
                status: "rejected",
                code: "ERROR",
                reason: "Something went wrong",
              };
            }
          );

          When("the result is validated against CommandResultSchema", () => {
            const result = CommandResultSchema.safeParse(state.parseResult);
            state.parseSuccess = result.success;
            if (result.success) {
              state.parseResult = result.data;
            }
          });

          Then("the validation succeeds", () => {
            expect(state.parseSuccess).toBe(true);
          });

          And(
            'the parsed result has status "rejected", code "ERROR", and reason "Something went wrong"',
            () => {
              const result = state.parseResult as Record<string, unknown>;
              expect(result.status).toBe("rejected");
              if (result.status === "rejected") {
                expect(result.code).toBe("ERROR");
                expect(result.reason).toBe("Something went wrong");
              }
            }
          );
        }
      );

      RuleScenario(
        "Union discriminates conflict and preserves currentVersion",
        ({ Given, When, Then, And }) => {
          Given(
            'a result with status "conflict", code "CONCURRENT_MODIFICATION", and currentVersion 10',
            () => {
              state.parseResult = {
                status: "conflict",
                code: "CONCURRENT_MODIFICATION",
                currentVersion: 10,
              };
            }
          );

          When("the result is validated against CommandResultSchema", () => {
            const result = CommandResultSchema.safeParse(state.parseResult);
            state.parseSuccess = result.success;
            if (result.success) {
              state.parseResult = result.data;
            }
          });

          Then("the validation succeeds", () => {
            expect(state.parseSuccess).toBe(true);
          });

          And('the parsed result has status "conflict" and currentVersion 10', () => {
            const result = state.parseResult as Record<string, unknown>;
            expect(result.status).toBe("conflict");
            if (result.status === "conflict") {
              expect(result.currentVersion).toBe(10);
            }
          });
        }
      );

      RuleScenario(
        "Union discriminates error and preserves message",
        ({ Given, When, Then, And }) => {
          Given('a result with status "error" and message "Internal error"', () => {
            state.parseResult = {
              status: "error",
              message: "Internal error",
            };
          });

          When("the result is validated against CommandResultSchema", () => {
            const result = CommandResultSchema.safeParse(state.parseResult);
            state.parseSuccess = result.success;
            if (result.success) {
              state.parseResult = result.data;
            }
          });

          Then("the validation succeeds", () => {
            expect(state.parseSuccess).toBe(true);
          });

          And('the parsed result has status "error" and message "Internal error"', () => {
            const result = state.parseResult as Record<string, unknown>;
            expect(result.status).toBe("error");
            if (result.status === "error") {
              expect(result.message).toBe("Internal error");
            }
          });
        }
      );

      RuleScenario("Union rejects unknown status", ({ Given, When, Then }) => {
        Given('a result with status "unknown" and data object', () => {
          state.parseResult = {
            status: "unknown",
            data: {},
          };
        });

        When("the result is validated against CommandResultSchema", () => {
          const result = CommandResultSchema.safeParse(state.parseResult);
          state.parseSuccess = result.success;
        });

        Then("the validation fails", () => {
          expect(state.parseSuccess).toBe(false);
        });
      });
    }
  );
});
