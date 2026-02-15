/**
 * Correlation Chain - Step Definitions
 *
 * BDD step definitions for correlation chain utilities:
 * - createCorrelationChain: Initialize a chain from a command
 * - deriveCorrelationChain: Derive a chain from a parent event
 * - toEventMetadata: Extract event metadata from chain
 * - isCorrelated / isCausedBy: Relationship checks
 *
 * Mechanical migration from tests/unit/correlation/chain.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  createCorrelationChain,
  deriveCorrelationChain,
  toEventMetadata,
  isCorrelated,
  isCausedBy,
} from "../../../src/correlation/chain.js";
import type { CorrelationChain, CausationSource } from "../../../src/correlation/types.js";
import {
  toCommandId,
  toCorrelationId,
  toCausationId,
  toEventId,
} from "../../../src/ids/branded.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  chain: CorrelationChain | null;
  derivedChain: CorrelationChain | null;
  metadata: Record<string, unknown> | null;
  causationSource: CausationSource | null;
  chainA: CorrelationChain | null;
  chainB: CorrelationChain | null;
  parentChain: CorrelationChain | null;
  childChain: CorrelationChain | null;
  boolResult: boolean | null;
  // Flow scenario state
  submitChain: CorrelationChain | null;
  submitMetadata: Record<string, unknown> | null;
  sagaChain: CorrelationChain | null;
  initialChain: CorrelationChain | null;
  chain2: CorrelationChain | null;
  chain3: CorrelationChain | null;
}

function createInitialState(): TestState {
  return {
    chain: null,
    derivedChain: null,
    metadata: null,
    causationSource: null,
    chainA: null,
    chainB: null,
    parentChain: null,
    childChain: null,
    boolResult: null,
    submitChain: null,
    submitMetadata: null,
    sagaChain: null,
    initialChain: null,
    chain2: null,
    chain3: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/correlation/chain.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Background
  // ===========================================================================

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Imports are at module level
    });
  });

  // ===========================================================================
  // createCorrelationChain with only commandId
  // ===========================================================================

  Rule("createCorrelationChain with only commandId sets defaults", ({ RuleScenario }) => {
    RuleScenario(
      "Chain uses commandId as causationId and generates correlationId",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        When('a correlation chain is created with commandId "cmd_test_123"', () => {
          state.chain = createCorrelationChain(toCommandId("cmd_test_123"));
        });

        Then("the chain has the following properties:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          for (const row of rows) {
            const actual = (state.chain as unknown as Record<string, unknown>)[row.property];
            const expected = row.property === "initiatedAt" ? Number(row.value) : row.value;
            expect(actual).toBe(expected);
          }
        });

        And('the chain correlationId starts with "corr_"', () => {
          expect(state.chain!.correlationId).toBeDefined();
          expect(state.chain!.correlationId).toMatch(/^corr_/);
        });

        And("the chain userId is undefined", () => {
          expect(state.chain!.userId).toBeUndefined();
        });

        And("the chain context is undefined", () => {
          expect(state.chain!.context).toBeUndefined();
        });
      }
    );
  });

  // ===========================================================================
  // createCorrelationChain with options
  // ===========================================================================

  Rule("createCorrelationChain with options uses provided values", ({ RuleScenario }) => {
    RuleScenario("Chain uses provided correlationId", ({ Given, When, Then }) => {
      Given("the system time is fixed at 1703001234567", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1703001234567);
      });

      When(
        'a correlation chain is created with commandId "cmd_test_123" and correlationId "corr_custom_456"',
        () => {
          state.chain = createCorrelationChain(toCommandId("cmd_test_123"), {
            correlationId: toCorrelationId("corr_custom_456"),
          });
        }
      );

      Then('the chain correlationId is "corr_custom_456"', () => {
        expect(state.chain!.correlationId).toBe("corr_custom_456");
      });
    });

    RuleScenario("Chain uses provided userId", ({ Given, When, Then }) => {
      Given("the system time is fixed at 1703001234567", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1703001234567);
      });

      When(
        'a correlation chain is created with commandId "cmd_test_123" and userId "user_abc"',
        () => {
          state.chain = createCorrelationChain(toCommandId("cmd_test_123"), {
            userId: "user_abc",
          });
        }
      );

      Then('the chain userId is "user_abc"', () => {
        expect(state.chain!.userId).toBe("user_abc");
      });
    });

    RuleScenario("Chain uses provided context", ({ Given, When, Then }) => {
      Given("the system time is fixed at 1703001234567", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1703001234567);
      });

      When(
        'a correlation chain is created with commandId "cmd_test_123" and context source "api" version "v1"',
        () => {
          state.chain = createCorrelationChain(toCommandId("cmd_test_123"), {
            context: { source: "api", version: "v1" },
          });
        }
      );

      Then('the chain context equals source "api" version "v1"', () => {
        expect(state.chain!.context).toEqual({
          source: "api",
          version: "v1",
        });
      });
    });

    RuleScenario("Chain uses provided initiatedAt", ({ When, Then }) => {
      When(
        'a correlation chain is created with commandId "cmd_test_123" and initiatedAt 1700000000000',
        () => {
          state.chain = createCorrelationChain(toCommandId("cmd_test_123"), {
            initiatedAt: 1700000000000,
          });
        }
      );

      Then("the chain initiatedAt is 1700000000000", () => {
        expect(state.chain!.initiatedAt).toBe(1700000000000);
      });
    });

    RuleScenario("Chain accepts all options together", ({ When, Then, And }) => {
      When(
        'a correlation chain is created with all options commandId "cmd_test_123" correlationId "corr_custom" userId "user_xyz" context key "value" and initiatedAt 1699999999999',
        () => {
          state.chain = createCorrelationChain(toCommandId("cmd_test_123"), {
            correlationId: toCorrelationId("corr_custom"),
            userId: "user_xyz",
            context: { key: "value" },
            initiatedAt: 1699999999999,
          });
        }
      );

      Then("the chain equals the full expected object:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const actual = (state.chain as unknown as Record<string, unknown>)[row.property];
          const expected = row.property === "initiatedAt" ? Number(row.value) : row.value;
          expect(actual).toBe(expected);
        }
      });

      And('the chain context equals key "value"', () => {
        expect(state.chain!.context).toEqual({ key: "value" });
      });
    });
  });

  // ===========================================================================
  // deriveCorrelationChain basic derivation
  // ===========================================================================

  Rule(
    "deriveCorrelationChain basic derivation preserves correlation and sets causation",
    ({ RuleScenario }) => {
      RuleScenario(
        "Derived chain preserves correlationId and uses eventId as causationId",
        ({ Given, When, Then, And }) => {
          Given("the system time is fixed at 1703001234567", () => {
            vi.useFakeTimers();
            vi.setSystemTime(1703001234567);
          });

          And(
            'a causation source with eventId "evt_abc123" and correlationId "corr_original"',
            () => {
              state.causationSource = {
                eventId: toEventId("evt_abc123"),
                correlationId: toCorrelationId("corr_original"),
              };
            }
          );

          When("a correlation chain is derived from the source", () => {
            state.derivedChain = deriveCorrelationChain(state.causationSource!);
          });

          Then(
            "the derived chain has the following properties:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{
                property: string;
                value: string;
              }>(dataTable);
              for (const row of rows) {
                const actual = (state.derivedChain as unknown as Record<string, unknown>)[
                  row.property
                ];
                const expected = row.property === "initiatedAt" ? Number(row.value) : row.value;
                expect(actual).toBe(expected);
              }
            }
          );

          And('the derived chain commandId starts with "cmd_"', () => {
            expect(state.derivedChain!.commandId).toBeDefined();
            expect(state.derivedChain!.commandId).toMatch(/^cmd_/);
          });
        }
      );

      RuleScenario("Derived chain inherits userId from source", ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" correlationId "corr_original" and userId "user_inherited"',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
              userId: "user_inherited",
            };
          }
        );

        When("a correlation chain is derived from the source", () => {
          state.derivedChain = deriveCorrelationChain(state.causationSource!);
        });

        Then('the derived chain userId is "user_inherited"', () => {
          expect(state.derivedChain!.userId).toBe("user_inherited");
        });
      });
    }
  );

  // ===========================================================================
  // deriveCorrelationChain context merging
  // ===========================================================================

  Rule("deriveCorrelationChain merges context from source and options", ({ RuleScenario }) => {
    RuleScenario("Derived chain inherits context from source", ({ Given, When, Then, And }) => {
      Given("the system time is fixed at 1703001234567", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1703001234567);
      });

      And(
        'a causation source with eventId "evt_abc123" correlationId "corr_original" and context parentKey "parentValue"',
        () => {
          state.causationSource = {
            eventId: toEventId("evt_abc123"),
            correlationId: toCorrelationId("corr_original"),
            context: { parentKey: "parentValue" },
          };
        }
      );

      When("a correlation chain is derived from the source", () => {
        state.derivedChain = deriveCorrelationChain(state.causationSource!);
      });

      Then('the derived chain context equals parentKey "parentValue"', () => {
        expect(state.derivedChain!.context).toEqual({
          parentKey: "parentValue",
        });
      });
    });

    RuleScenario(
      "Derived chain merges source and option contexts",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" correlationId "corr_original" and context parentKey "parentValue"',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
              context: { parentKey: "parentValue" },
            };
          }
        );

        When(
          'a correlation chain is derived from the source with context childKey "childValue"',
          () => {
            state.derivedChain = deriveCorrelationChain(state.causationSource!, {
              context: { childKey: "childValue" },
            });
          }
        );

        Then(
          'the derived chain context equals parentKey "parentValue" and childKey "childValue"',
          () => {
            expect(state.derivedChain!.context).toEqual({
              parentKey: "parentValue",
              childKey: "childValue",
            });
          }
        );
      }
    );

    RuleScenario(
      "Option context takes precedence over source context",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" correlationId "corr_original" and context key "sourceValue"',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
              context: { key: "sourceValue" },
            };
          }
        );

        When(
          'a correlation chain is derived from the source with context key "optionValue"',
          () => {
            state.derivedChain = deriveCorrelationChain(state.causationSource!, {
              context: { key: "optionValue" },
            });
          }
        );

        Then('the derived chain context equals key "optionValue"', () => {
          expect(state.derivedChain!.context).toEqual({
            key: "optionValue",
          });
        });
      }
    );

    RuleScenario(
      "Source context preserved when options have no context",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" correlationId "corr_original" and context key "value"',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
              context: { key: "value" },
            };
          }
        );

        When("a correlation chain is derived from the source with empty options", () => {
          state.derivedChain = deriveCorrelationChain(state.causationSource!, {});
        });

        Then('the derived chain context equals key "value"', () => {
          expect(state.derivedChain!.context).toEqual({ key: "value" });
        });
      }
    );

    RuleScenario(
      "Options context used when source has no context",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" and correlationId "corr_original"',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
            };
          }
        );

        When('a correlation chain is derived from the source with context key "value"', () => {
          state.derivedChain = deriveCorrelationChain(state.causationSource!, {
            context: { key: "value" },
          });
        });

        Then('the derived chain context equals key "value"', () => {
          expect(state.derivedChain!.context).toEqual({ key: "value" });
        });
      }
    );

    RuleScenario(
      "Context is undefined when neither source nor options have context",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" and correlationId "corr_original"',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
            };
          }
        );

        When("a correlation chain is derived from the source", () => {
          state.derivedChain = deriveCorrelationChain(state.causationSource!);
        });

        Then("the derived chain context is undefined", () => {
          expect(state.derivedChain!.context).toBeUndefined();
        });
      }
    );

    RuleScenario("Both empty contexts merge to empty object", ({ Given, When, Then, And }) => {
      Given("the system time is fixed at 1703001234567", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1703001234567);
      });

      And(
        'a causation source with eventId "evt_abc123" correlationId "corr_original" and empty context',
        () => {
          state.causationSource = {
            eventId: toEventId("evt_abc123"),
            correlationId: toCorrelationId("corr_original"),
            context: {},
          };
        }
      );

      When("a correlation chain is derived from the source with empty context", () => {
        state.derivedChain = deriveCorrelationChain(state.causationSource!, { context: {} });
      });

      Then("the derived chain context is an empty object", () => {
        expect(state.derivedChain!.context).toEqual({});
      });
    });

    RuleScenario(
      "Source context preserved when options context is empty",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" correlationId "corr_original" and context key "value"',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
              context: { key: "value" },
            };
          }
        );

        When("a correlation chain is derived from the source with empty context", () => {
          state.derivedChain = deriveCorrelationChain(state.causationSource!, { context: {} });
        });

        Then('the derived chain context equals key "value"', () => {
          expect(state.derivedChain!.context).toEqual({ key: "value" });
        });
      }
    );

    RuleScenario(
      "Options context used when source context is empty",
      ({ Given, When, Then, And }) => {
        Given("the system time is fixed at 1703001234567", () => {
          vi.useFakeTimers();
          vi.setSystemTime(1703001234567);
        });

        And(
          'a causation source with eventId "evt_abc123" correlationId "corr_original" and empty context',
          () => {
            state.causationSource = {
              eventId: toEventId("evt_abc123"),
              correlationId: toCorrelationId("corr_original"),
              context: {},
            };
          }
        );

        When('a correlation chain is derived from the source with context key "value"', () => {
          state.derivedChain = deriveCorrelationChain(state.causationSource!, {
            context: { key: "value" },
          });
        });

        Then('the derived chain context equals key "value"', () => {
          expect(state.derivedChain!.context).toEqual({ key: "value" });
        });
      }
    );
  });

  // ===========================================================================
  // deriveCorrelationChain with options
  // ===========================================================================

  Rule("deriveCorrelationChain with options uses provided overrides", ({ RuleScenario }) => {
    RuleScenario("Derived chain uses provided commandId", ({ Given, When, Then, And }) => {
      Given("the system time is fixed at 1703001234567", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1703001234567);
      });

      And('a causation source with eventId "evt_abc123" and correlationId "corr_original"', () => {
        state.causationSource = {
          eventId: toEventId("evt_abc123"),
          correlationId: toCorrelationId("corr_original"),
        };
      });

      When('a correlation chain is derived from the source with commandId "cmd_custom_999"', () => {
        state.derivedChain = deriveCorrelationChain(state.causationSource!, {
          commandId: toCommandId("cmd_custom_999"),
        });
      });

      Then('the derived chain commandId is "cmd_custom_999"', () => {
        expect(state.derivedChain!.commandId).toBe("cmd_custom_999");
      });
    });

    RuleScenario("Derived chain uses provided initiatedAt", ({ Given, When, Then, And }) => {
      Given("the system time is fixed at 1703001234567", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1703001234567);
      });

      And('a causation source with eventId "evt_abc123" and correlationId "corr_original"', () => {
        state.causationSource = {
          eventId: toEventId("evt_abc123"),
          correlationId: toCorrelationId("corr_original"),
        };
      });

      When("a correlation chain is derived from the source with initiatedAt 1700000000000", () => {
        state.derivedChain = deriveCorrelationChain(state.causationSource!, {
          initiatedAt: 1700000000000,
        });
      });

      Then("the derived chain initiatedAt is 1700000000000", () => {
        expect(state.derivedChain!.initiatedAt).toBe(1700000000000);
      });
    });
  });

  // ===========================================================================
  // toEventMetadata
  // ===========================================================================

  Rule("toEventMetadata extracts correlationId and causationId from chain", ({ RuleScenario }) => {
    RuleScenario("Extracts correlationId and causationId", ({ Given, When, Then }) => {
      Given(
        'a correlation chain with commandId "cmd_123" correlationId "corr_456" and causationId "evt_789"',
        () => {
          state.chain = {
            commandId: toCommandId("cmd_123"),
            correlationId: toCorrelationId("corr_456"),
            causationId: toCausationId("evt_789"),
            initiatedAt: Date.now(),
          };
        }
      );

      When("toEventMetadata is called on the chain", () => {
        state.metadata = toEventMetadata(state.chain!);
      });

      Then('the metadata has correlationId "corr_456" and causationId "evt_789"', () => {
        expect(state.metadata!.correlationId).toBe("corr_456");
        expect(state.metadata!.causationId).toBe("evt_789");
      });
    });

    RuleScenario("Includes userId when present", ({ Given, When, Then }) => {
      Given(
        'a correlation chain with commandId "cmd_123" correlationId "corr_456" causationId "cmd_123" and userId "user_abc"',
        () => {
          state.chain = {
            commandId: toCommandId("cmd_123"),
            correlationId: toCorrelationId("corr_456"),
            causationId: toCausationId("cmd_123"),
            userId: "user_abc",
            initiatedAt: Date.now(),
          };
        }
      );

      When("toEventMetadata is called on the chain", () => {
        state.metadata = toEventMetadata(state.chain!);
      });

      Then('the metadata userId is "user_abc"', () => {
        expect(state.metadata!.userId).toBe("user_abc");
      });
    });

    RuleScenario("Excludes userId when undefined", ({ Given, When, Then }) => {
      Given(
        'a correlation chain with commandId "cmd_123" correlationId "corr_456" and causationId "cmd_123"',
        () => {
          state.chain = {
            commandId: toCommandId("cmd_123"),
            correlationId: toCorrelationId("corr_456"),
            causationId: toCausationId("cmd_123"),
            initiatedAt: Date.now(),
          };
        }
      );

      When("toEventMetadata is called on the chain", () => {
        state.metadata = toEventMetadata(state.chain!);
      });

      Then("the metadata does not contain userId", () => {
        expect("userId" in state.metadata!).toBe(false);
      });
    });

    RuleScenario("Merges additional metadata", ({ Given, When, Then, And }) => {
      Given(
        'a correlation chain with commandId "cmd_123" correlationId "corr_456" and causationId "cmd_123"',
        () => {
          state.chain = {
            commandId: toCommandId("cmd_123"),
            correlationId: toCorrelationId("corr_456"),
            causationId: toCausationId("cmd_123"),
            initiatedAt: Date.now(),
          };
        }
      );

      When(
        'toEventMetadata is called with additional metadata requestId "req_xyz" and customField 42',
        () => {
          state.metadata = toEventMetadata(state.chain!, {
            requestId: "req_xyz",
            customField: 42,
          });
        }
      );

      Then('the metadata has correlationId "corr_456" and causationId "cmd_123"', () => {
        expect(state.metadata!.correlationId).toBe("corr_456");
        expect(state.metadata!.causationId).toBe("cmd_123");
      });

      And('the metadata has requestId "req_xyz" and customField 42', () => {
        expect(state.metadata!.requestId).toBe("req_xyz");
        expect(state.metadata!.customField).toBe(42);
      });
    });

    RuleScenario(
      "Does not include context, initiatedAt, or commandId from chain",
      ({ Given, When, Then }) => {
        Given(
          'a correlation chain with commandId "cmd_123" correlationId "corr_456" causationId "cmd_123" and context key "value"',
          () => {
            state.chain = {
              commandId: toCommandId("cmd_123"),
              correlationId: toCorrelationId("corr_456"),
              causationId: toCausationId("cmd_123"),
              initiatedAt: Date.now(),
              context: { key: "value" },
            };
          }
        );

        When("toEventMetadata is called on the chain", () => {
          state.metadata = toEventMetadata(state.chain!);
        });

        Then(
          "the metadata does not contain excluded fields:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ field: string }>(dataTable);
            for (const row of rows) {
              expect(row.field in state.metadata!).toBe(false);
            }
          }
        );
      }
    );
  });

  // ===========================================================================
  // isCorrelated
  // ===========================================================================

  Rule("isCorrelated compares correlationIds of two chains", ({ RuleScenario }) => {
    RuleScenario(
      "Returns true for chains with same correlationId",
      ({ Given, When, Then, And }) => {
        Given(
          'chain A with commandId "cmd_1" correlationId "corr_shared" and causationId "cmd_1"',
          () => {
            state.chainA = {
              commandId: toCommandId("cmd_1"),
              correlationId: toCorrelationId("corr_shared"),
              causationId: toCausationId("cmd_1"),
              initiatedAt: Date.now(),
            };
          }
        );

        And(
          'chain B with commandId "cmd_2" correlationId "corr_shared" and causationId "evt_1"',
          () => {
            state.chainB = {
              commandId: toCommandId("cmd_2"),
              correlationId: toCorrelationId("corr_shared"),
              causationId: toCausationId("evt_1"),
              initiatedAt: Date.now(),
            };
          }
        );

        When("isCorrelated is called with chain A and chain B", () => {
          state.boolResult = isCorrelated(state.chainA!, state.chainB!);
        });

        Then("the result is true", () => {
          expect(state.boolResult).toBe(true);
        });
      }
    );

    RuleScenario(
      "Returns false for chains with different correlationIds",
      ({ Given, When, Then, And }) => {
        Given(
          'chain A with commandId "cmd_1" correlationId "corr_first" and causationId "cmd_1"',
          () => {
            state.chainA = {
              commandId: toCommandId("cmd_1"),
              correlationId: toCorrelationId("corr_first"),
              causationId: toCausationId("cmd_1"),
              initiatedAt: Date.now(),
            };
          }
        );

        And(
          'chain B with commandId "cmd_2" correlationId "corr_second" and causationId "evt_1"',
          () => {
            state.chainB = {
              commandId: toCommandId("cmd_2"),
              correlationId: toCorrelationId("corr_second"),
              causationId: toCausationId("evt_1"),
              initiatedAt: Date.now(),
            };
          }
        );

        When("isCorrelated is called with chain A and chain B", () => {
          state.boolResult = isCorrelated(state.chainA!, state.chainB!);
        });

        Then("the result is false", () => {
          expect(state.boolResult).toBe(false);
        });
      }
    );
  });

  // ===========================================================================
  // isCausedBy
  // ===========================================================================

  Rule("isCausedBy checks if child causationId matches parent commandId", ({ RuleScenario }) => {
    RuleScenario(
      "Returns true when child causationId matches parent commandId",
      ({ Given, When, Then, And }) => {
        Given(
          'a parent chain with commandId "cmd_parent" correlationId "corr_shared" and causationId "cmd_parent"',
          () => {
            state.parentChain = {
              commandId: toCommandId("cmd_parent"),
              correlationId: toCorrelationId("corr_shared"),
              causationId: toCausationId("cmd_parent"),
              initiatedAt: Date.now(),
            };
          }
        );

        And(
          'a child chain with commandId "cmd_child" correlationId "corr_shared" and causationId "cmd_parent"',
          () => {
            state.childChain = {
              commandId: toCommandId("cmd_child"),
              correlationId: toCorrelationId("corr_shared"),
              causationId: toCausationId("cmd_parent"),
              initiatedAt: Date.now(),
            };
          }
        );

        When("isCausedBy is called with parent and child", () => {
          state.boolResult = isCausedBy(state.parentChain!, state.childChain!);
        });

        Then("the result is true", () => {
          expect(state.boolResult).toBe(true);
        });
      }
    );

    RuleScenario(
      "Returns false when child causationId does not match",
      ({ Given, When, Then, And }) => {
        Given(
          'a parent chain with commandId "cmd_parent" correlationId "corr_shared" and causationId "cmd_parent"',
          () => {
            state.parentChain = {
              commandId: toCommandId("cmd_parent"),
              correlationId: toCorrelationId("corr_shared"),
              causationId: toCausationId("cmd_parent"),
              initiatedAt: Date.now(),
            };
          }
        );

        And(
          'a child chain with commandId "cmd_child" correlationId "corr_shared" and causationId "evt_other"',
          () => {
            state.childChain = {
              commandId: toCommandId("cmd_child"),
              correlationId: toCorrelationId("corr_shared"),
              causationId: toCausationId("evt_other"),
              initiatedAt: Date.now(),
            };
          }
        );

        When("isCausedBy is called with parent and child", () => {
          state.boolResult = isCausedBy(state.parentChain!, state.childChain!);
        });

        Then("the result is false", () => {
          expect(state.boolResult).toBe(false);
        });
      }
    );

    RuleScenario(
      "Returns true for same chain where command is its own cause",
      ({ Given, When, Then }) => {
        Given(
          'a self-referencing chain with commandId "cmd_1" correlationId "corr_1" and causationId "cmd_1"',
          () => {
            state.parentChain = {
              commandId: toCommandId("cmd_1"),
              correlationId: toCorrelationId("corr_1"),
              causationId: toCausationId("cmd_1"),
              initiatedAt: Date.now(),
            };
          }
        );

        When("isCausedBy is called with the same chain as both parent and child", () => {
          state.boolResult = isCausedBy(state.parentChain!, state.parentChain!);
        });

        Then("the result is true", () => {
          expect(state.boolResult).toBe(true);
        });
      }
    );
  });

  // ===========================================================================
  // Correlation Flow Scenarios
  // ===========================================================================

  Rule(
    "Correlation chains trace full request flows across command-event boundaries",
    ({ RuleScenario }) => {
      RuleScenario(
        "Full request flow tracing from user command through saga reaction",
        ({ Given, When, Then, And }) => {
          Given("the system time is fixed at 1703001234567", () => {
            vi.useFakeTimers();
            vi.setSystemTime(1703001234567);
          });

          When(
            'a correlation chain is created with commandId "cmd_submit_001" userId "user_123" and context source "web-ui"',
            () => {
              state.submitChain = createCorrelationChain(toCommandId("cmd_submit_001"), {
                userId: "user_123",
                context: { source: "web-ui" },
              });
            }
          );

          Then('the chain commandId is "cmd_submit_001"', () => {
            expect(state.submitChain!.commandId).toBe("cmd_submit_001");
          });

          And('the chain causationId is "cmd_submit_001"', () => {
            expect(state.submitChain!.causationId).toBe("cmd_submit_001");
          });

          When("toEventMetadata is called on the submit chain", () => {
            state.submitMetadata = toEventMetadata(state.submitChain!);
          });

          Then("the submit metadata correlationId matches the chain correlationId", () => {
            expect(state.submitMetadata!.correlationId).toBe(state.submitChain!.correlationId);
          });

          When(
            'a saga derives a chain from event "evt_order_submitted_001" using the submit chain',
            () => {
              const orderSubmittedEvent: CausationSource = {
                eventId: toEventId("evt_order_submitted_001"),
                correlationId: state.submitChain!.correlationId,
                userId: state.submitChain!.userId,
                context: state.submitChain!.context,
              };
              state.sagaChain = deriveCorrelationChain(orderSubmittedEvent);
            }
          );

          Then("the saga chain correlationId matches the submit chain correlationId", () => {
            expect(state.sagaChain!.correlationId).toBe(state.submitChain!.correlationId);
          });

          And('the saga chain causationId is "evt_order_submitted_001"', () => {
            expect(state.sagaChain!.causationId).toBe("evt_order_submitted_001");
          });

          And('the saga chain userId is "user_123"', () => {
            expect(state.sagaChain!.userId).toBe("user_123");
          });

          And('the saga chain context equals source "web-ui"', () => {
            expect(state.sagaChain!.context).toEqual({ source: "web-ui" });
          });

          And("the submit chain and saga chain are correlated", () => {
            expect(isCorrelated(state.submitChain!, state.sagaChain!)).toBe(true);
          });
        }
      );

      RuleScenario(
        "Multi-step saga preserves correlationId across three links",
        ({ Given, When, Then, And }) => {
          Given("the system time is fixed at 1703001234567", () => {
            vi.useFakeTimers();
            vi.setSystemTime(1703001234567);
          });

          When(
            'an initial chain is created with commandId "cmd_1" and correlationId "corr_saga_flow"',
            () => {
              state.initialChain = createCorrelationChain(toCommandId("cmd_1"), {
                correlationId: toCorrelationId("corr_saga_flow"),
              });
            }
          );

          And('chain2 is derived from event "evt_1" using the initial chain correlationId', () => {
            const event1: CausationSource = {
              eventId: toEventId("evt_1"),
              correlationId: state.initialChain!.correlationId,
            };
            state.chain2 = deriveCorrelationChain(event1);
          });

          And('chain3 is derived from event "evt_2" using chain2 correlationId', () => {
            const event2: CausationSource = {
              eventId: toEventId("evt_2"),
              correlationId: state.chain2!.correlationId,
            };
            state.chain3 = deriveCorrelationChain(event2);
          });

          Then('all three chains share correlationId "corr_saga_flow"', () => {
            expect(state.chain2!.correlationId).toBe("corr_saga_flow");
            expect(state.chain3!.correlationId).toBe("corr_saga_flow");
          });

          And('chain2 causationId is "evt_1"', () => {
            expect(state.chain2!.causationId).toBe("evt_1");
          });

          And('chain3 causationId is "evt_2"', () => {
            expect(state.chain3!.causationId).toBe("evt_2");
          });

          And("all three chains are pairwise correlated", () => {
            expect(isCorrelated(state.initialChain!, state.chain2!)).toBe(true);
            expect(isCorrelated(state.chain2!, state.chain3!)).toBe(true);
            expect(isCorrelated(state.initialChain!, state.chain3!)).toBe(true);
          });
        }
      );
    }
  );
});
