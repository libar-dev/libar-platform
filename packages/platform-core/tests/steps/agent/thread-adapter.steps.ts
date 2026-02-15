/**
 * Thread Adapter - Step Definitions
 *
 * BDD step definitions for createThreadAdapter() including:
 * - analyze: JSON response parsing with patterns, confidence, reasoning
 * - analyze: Handling non-JSON and malformed responses
 * - analyze: Error re-throwing from generateText
 * - analyze: Timing tracking in llmContext
 * - analyze: threadId presence/absence in llmContext
 * - analyze: Missing usage handling
 * - reason: JSON response parsing
 * - reason: Raw text fallback
 * - reason: Error re-throwing
 * - reason: Logging
 *
 * Mechanical migration from tests/unit/agent/thread-adapter.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi, type Mock } from "vitest";

import {
  createThreadAdapter,
  type ThreadAdapterConfig,
  type GenerateTextResult,
} from "../../../src/agent/thread-adapter.js";
import type { PublishedEvent } from "../../../src/eventbus/types.js";
import type { Logger } from "../../../src/logging/types.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestEvent(overrides: Partial<PublishedEvent> = {}): PublishedEvent {
  return {
    eventId: "evt_test_123",
    eventType: "OrderCancelled",
    streamId: "order-001",
    streamType: "Order",
    globalPosition: 100,
    timestamp: Date.now(),
    payload: { orderId: "order-001", reason: "customer_request" },
    schemaVersion: 1,
    boundedContext: "orders",
    category: "domain",
    ...overrides,
  };
}

function createTestConfig(overrides: Partial<ThreadAdapterConfig> = {}): ThreadAdapterConfig {
  return {
    agentId: "test-agent",
    model: "anthropic/claude-sonnet-4-5-20250929",
    generateText: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        patterns: [],
        confidence: 0,
        reasoning: "No patterns detected",
      }),
      usage: { totalTokens: 50 },
    }),
    ...overrides,
  };
}

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    flush: vi.fn(),
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  adapter: ReturnType<typeof createThreadAdapter> | null;
  generateText: Mock | null;
  analyzeResult: Awaited<ReturnType<ReturnType<typeof createThreadAdapter>["analyze"]>> | null;
  reasonResult: unknown;
  caughtError: Error | null;
  logger: Logger | null;
}

function createInitialState(): TestState {
  return {
    adapter: null,
    generateText: null,
    analyzeResult: null,
    reasonResult: null,
    caughtError: null,
    logger: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/thread-adapter.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Rule: analyze() parses JSON responses with patterns, confidence, reasoning
  // ===========================================================================

  Rule(
    "analyze() parses JSON responses with patterns, confidence, and reasoning",
    ({ RuleScenario }) => {
      RuleScenario(
        "Calls generateText and parses a valid JSON response",
        ({ Given, When, Then, And }) => {
          Given("a generateText mock returning a churn-risk JSON response with 100 tokens", () => {
            state.generateText = vi.fn().mockResolvedValue({
              text: JSON.stringify({
                patterns: [
                  {
                    name: "churn-risk",
                    confidence: 0.85,
                    matchingEventIds: ["evt_1", "evt_2"],
                    data: { cancellationCount: 3 },
                  },
                ],
                confidence: 0.8,
                reasoning: "Customer shows churn risk indicators",
              }),
              usage: { totalTokens: 100 },
            } satisfies GenerateTextResult);

            const config = createTestConfig({
              generateText: state.generateText,
            });
            state.adapter = createThreadAdapter(config);
          });

          When('I call analyze with prompt "Detect churn risk" and 2 events', async () => {
            const events = [createTestEvent(), createTestEvent({ eventId: "evt_2" })];
            state.analyzeResult = await state.adapter!.analyze("Detect churn risk", events);
          });

          Then("generateText was called exactly 1 time", () => {
            expect(state.generateText).toHaveBeenCalledTimes(1);
          });

          And(
            "the analyze result has the following properties:",
            (_ctx: unknown, dataTable: unknown) => {
              const rows = getDataTableRows<{
                property: string;
                value: string;
              }>(dataTable);
              const r = state.analyzeResult!;
              for (const row of rows) {
                const prop = row["property"];
                const expected = row["value"];
                if (prop === "patterns.length") {
                  expect(r.patterns).toHaveLength(Number(expected));
                } else if (prop === "patterns[0].name") {
                  expect(r.patterns[0].name).toBe(expected);
                } else if (prop === "patterns[0].confidence") {
                  expect(r.patterns[0].confidence).toBe(Number(expected));
                } else if (prop === "confidence") {
                  expect(r.confidence).toBe(Number(expected));
                } else if (prop === "reasoning") {
                  expect(r.reasoning).toBe(expected);
                } else if (prop === "llmContext.model") {
                  expect(r.llmContext!.model).toBe(expected);
                } else if (prop === "llmContext.tokens") {
                  expect(r.llmContext!.tokens).toBe(Number(expected));
                }
              }
            }
          );

          And('the first pattern matchingEventIds are "evt_1" and "evt_2"', () => {
            expect(state.analyzeResult!.patterns[0].matchingEventIds).toEqual(["evt_1", "evt_2"]);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: analyze() handles non-JSON and malformed responses gracefully
  // ===========================================================================

  Rule("analyze() handles non-JSON and malformed responses gracefully", ({ RuleScenario }) => {
    RuleScenario("Handles non-JSON response with defaults", ({ Given, When, Then }) => {
      Given(
        'a generateText mock returning plain text "This is plain text, not JSON" with 30 tokens',
        () => {
          state.generateText = vi.fn().mockResolvedValue({
            text: "This is plain text, not JSON",
            usage: { totalTokens: 30 },
          } satisfies GenerateTextResult);
          const config = createTestConfig({
            generateText: state.generateText,
          });
          state.adapter = createThreadAdapter(config);
        }
      );

      When('I call analyze with prompt "Analyze events" and 1 event', async () => {
        state.analyzeResult = await state.adapter!.analyze("Analyze events", [createTestEvent()]);
      });

      Then('the analyze result has defaults with reasoning "This is plain text, not JSON"', () => {
        expect(state.analyzeResult!.patterns).toEqual([]);
        expect(state.analyzeResult!.confidence).toBe(0);
        expect(state.analyzeResult!.reasoning).toBe("This is plain text, not JSON");
        expect(state.analyzeResult!.llmContext).toBeDefined();
      });
    });

    RuleScenario("Handles malformed JSON gracefully", ({ Given, When, Then }) => {
      Given(
        'a generateText mock returning plain text "{ not valid json }}}" with 20 tokens',
        () => {
          state.generateText = vi.fn().mockResolvedValue({
            text: "{ not valid json }}}",
            usage: { totalTokens: 20 },
          } satisfies GenerateTextResult);
          const config = createTestConfig({
            generateText: state.generateText,
          });
          state.adapter = createThreadAdapter(config);
        }
      );

      When('I call analyze with prompt "Analyze events" and 1 event', async () => {
        state.analyzeResult = await state.adapter!.analyze("Analyze events", [createTestEvent()]);
      });

      Then('the analyze result has defaults with reasoning "{ not valid json }}}"', () => {
        expect(state.analyzeResult!.patterns).toEqual([]);
        expect(state.analyzeResult!.confidence).toBe(0);
        expect(state.analyzeResult!.reasoning).toBe("{ not valid json }}}");
      });
    });
  });

  // ===========================================================================
  // Rule: analyze() re-throws generateText errors
  // ===========================================================================

  Rule("analyze() re-throws generateText errors", ({ RuleScenario }) => {
    RuleScenario("Re-throws generateText errors", ({ Given, When, Then }) => {
      Given('a generateText mock that rejects with "API rate limit exceeded"', () => {
        state.generateText = vi.fn().mockRejectedValue(new Error("API rate limit exceeded"));
        const config = createTestConfig({
          generateText: state.generateText,
        });
        state.adapter = createThreadAdapter(config);
      });

      When("I call analyze expecting an error", async () => {
        try {
          await state.adapter!.analyze("Analyze events", [createTestEvent()]);
        } catch (e) {
          state.caughtError = e as Error;
        }
      });

      Then('the error message is "API rate limit exceeded"', () => {
        expect(state.caughtError).toBeDefined();
        expect(state.caughtError!.message).toBe("API rate limit exceeded");
      });
    });
  });

  // ===========================================================================
  // Rule: analyze() tracks timing in llmContext
  // ===========================================================================

  Rule("analyze() tracks timing in llmContext", ({ RuleScenario }) => {
    RuleScenario("Tracks timing in llmContext", ({ Given, When, Then }) => {
      Given("a generateText mock that takes 250ms and returns 50 tokens", () => {
        state.generateText = vi.fn().mockImplementation(async () => {
          vi.advanceTimersByTime(250);
          return {
            text: JSON.stringify({
              patterns: [],
              confidence: 0,
              reasoning: "test",
            }),
            usage: { totalTokens: 50 },
          };
        });
        const config = createTestConfig({
          generateText: state.generateText,
        });
        state.adapter = createThreadAdapter(config);
      });

      When('I call analyze with prompt "Analyze" and 1 event', async () => {
        state.analyzeResult = await state.adapter!.analyze("Analyze", [createTestEvent()]);
      });

      Then(
        "the llmContext has the following timing properties:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          const ctx = state.analyzeResult!.llmContext!;
          for (const row of rows) {
            const prop = row["property"];
            const expected = row["value"];
            if (prop === "model") {
              expect(ctx.model).toBe(expected);
            } else if (prop === "tokens") {
              expect(ctx.tokens).toBe(Number(expected));
            } else if (prop === "durationMs") {
              expect(ctx.durationMs).toBe(Number(expected));
            }
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: analyze() handles threadId presence and absence in llmContext
  // ===========================================================================

  Rule("analyze() handles threadId presence and absence in llmContext", ({ RuleScenario }) => {
    RuleScenario("Includes threadId in llmContext when present", ({ Given, When, Then }) => {
      Given(
        'a generateText mock returning JSON with threadId "thread_abc123" and 50 tokens',
        () => {
          state.generateText = vi.fn().mockResolvedValue({
            text: JSON.stringify({
              patterns: [],
              confidence: 0,
              reasoning: "test",
            }),
            usage: { totalTokens: 50 },
            threadId: "thread_abc123",
          } satisfies GenerateTextResult);
          const config = createTestConfig({
            generateText: state.generateText,
          });
          state.adapter = createThreadAdapter(config);
        }
      );

      When('I call analyze with prompt "Analyze" and 1 event', async () => {
        state.analyzeResult = await state.adapter!.analyze("Analyze", [createTestEvent()]);
      });

      Then('the llmContext threadId is "thread_abc123"', () => {
        expect(state.analyzeResult!.llmContext!.threadId).toBe("thread_abc123");
      });
    });

    RuleScenario("Omits threadId from llmContext when not present", ({ Given, When, Then }) => {
      Given("a generateText mock returning JSON without threadId and 50 tokens", () => {
        state.generateText = vi.fn().mockResolvedValue({
          text: JSON.stringify({
            patterns: [],
            confidence: 0,
            reasoning: "test",
          }),
          usage: { totalTokens: 50 },
        } satisfies GenerateTextResult);
        const config = createTestConfig({
          generateText: state.generateText,
        });
        state.adapter = createThreadAdapter(config);
      });

      When('I call analyze with prompt "Analyze" and 1 event', async () => {
        state.analyzeResult = await state.adapter!.analyze("Analyze", [createTestEvent()]);
      });

      Then("the llmContext does not contain threadId", () => {
        expect(state.analyzeResult!.llmContext).toBeDefined();
        expect("threadId" in state.analyzeResult!.llmContext!).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: analyze() handles missing usage in generateText result
  // ===========================================================================

  Rule("analyze() handles missing usage in generateText result", ({ RuleScenario }) => {
    RuleScenario("Handles missing usage with zero tokens", ({ Given, When, Then }) => {
      Given("a generateText mock returning JSON without usage", () => {
        state.generateText = vi.fn().mockResolvedValue({
          text: JSON.stringify({
            patterns: [],
            confidence: 0.5,
            reasoning: "test",
          }),
        } satisfies GenerateTextResult);
        const config = createTestConfig({
          generateText: state.generateText,
        });
        state.adapter = createThreadAdapter(config);
      });

      When('I call analyze with prompt "Analyze" and 1 event', async () => {
        state.analyzeResult = await state.adapter!.analyze("Analyze", [createTestEvent()]);
      });

      Then("the llmContext tokens is 0", () => {
        expect(state.analyzeResult!.llmContext!.tokens).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Rule: reason() parses JSON and returns structured data
  // ===========================================================================

  Rule("reason() parses JSON and returns structured data", ({ RuleScenario }) => {
    RuleScenario(
      "Calls generateText and parses JSON response for reason",
      ({ Given, When, Then }) => {
        Given("a generateText mock returning a reasoning JSON response with 80 tokens", () => {
          const jsonResponse = {
            observation: "Customer cancelled order after long delay",
            implications: ["potential churn risk"],
            suggestedAction: "follow-up",
          };
          state.generateText = vi.fn().mockResolvedValue({
            text: JSON.stringify(jsonResponse),
            usage: { totalTokens: 80 },
          } satisfies GenerateTextResult);
          const config = createTestConfig({
            generateText: state.generateText,
          });
          state.adapter = createThreadAdapter(config);
        });

        When("I call reason with a test event", async () => {
          state.reasonResult = await state.adapter!.reason(createTestEvent());
        });

        Then("the reason result is a structured object with observation and implications", () => {
          expect(state.generateText).toHaveBeenCalledTimes(1);
          expect(state.reasonResult).toEqual({
            observation: "Customer cancelled order after long delay",
            implications: ["potential churn risk"],
            suggestedAction: "follow-up",
          });
        });
      }
    );
  });

  // ===========================================================================
  // Rule: reason() falls back to raw text for non-JSON responses
  // ===========================================================================

  Rule("reason() falls back to raw text for non-JSON responses", ({ RuleScenario }) => {
    RuleScenario("Returns raw text when response is not JSON", ({ Given, When, Then }) => {
      Given(
        'a generateText mock returning plain text "This event indicates a potential issue with order fulfillment." with 40 tokens',
        () => {
          state.generateText = vi.fn().mockResolvedValue({
            text: "This event indicates a potential issue with order fulfillment.",
            usage: { totalTokens: 40 },
          } satisfies GenerateTextResult);
          const config = createTestConfig({
            generateText: state.generateText,
          });
          state.adapter = createThreadAdapter(config);
        }
      );

      When("I call reason with a test event", async () => {
        state.reasonResult = await state.adapter!.reason(createTestEvent());
      });

      Then(
        'the reason result is the raw text "This event indicates a potential issue with order fulfillment."',
        () => {
          expect(state.reasonResult).toBe(
            "This event indicates a potential issue with order fulfillment."
          );
        }
      );
    });
  });

  // ===========================================================================
  // Rule: reason() re-throws generateText errors
  // ===========================================================================

  Rule("reason() re-throws generateText errors", ({ RuleScenario }) => {
    RuleScenario("Re-throws generateText errors from reason", ({ Given, When, Then }) => {
      Given('a generateText mock that rejects with "Network error"', () => {
        state.generateText = vi.fn().mockRejectedValue(new Error("Network error"));
        const config = createTestConfig({
          generateText: state.generateText,
        });
        state.adapter = createThreadAdapter(config);
      });

      When("I call reason expecting an error", async () => {
        try {
          await state.adapter!.reason(createTestEvent());
        } catch (e) {
          state.caughtError = e as Error;
        }
      });

      Then('the error message is "Network error"', () => {
        expect(state.caughtError).toBeDefined();
        expect(state.caughtError!.message).toBe("Network error");
      });
    });
  });

  // ===========================================================================
  // Rule: reason() logs reasoning start and completion
  // ===========================================================================

  Rule("reason() logs reasoning start and completion", ({ RuleScenario }) => {
    RuleScenario("Logs reasoning start and completion", ({ Given, When, Then, And }) => {
      Given("a generateText mock returning JSON with 30 tokens and a mock logger", () => {
        state.generateText = vi.fn().mockResolvedValue({
          text: JSON.stringify({ note: "test" }),
          usage: { totalTokens: 30 },
        } satisfies GenerateTextResult);
        state.logger = createMockLogger();
        const config = createTestConfig({
          generateText: state.generateText,
          logger: state.logger,
        });
        state.adapter = createThreadAdapter(config);
      });

      When("I call reason with a PaymentFailed event", async () => {
        await state.adapter!.reason(createTestEvent({ eventType: "PaymentFailed" }));
      });

      Then(
        'the logger debug was called with "Starting reasoning" and agentId "test-agent" and eventType "PaymentFailed"',
        () => {
          expect(state.logger!.debug).toHaveBeenCalledWith(
            "Starting reasoning",
            expect.objectContaining({
              agentId: "test-agent",
              eventType: "PaymentFailed",
            })
          );
        }
      );

      And(
        'the logger info was called with "Reasoning completed" and agentId "test-agent" and model "anthropic/claude-sonnet-4-5-20250929"',
        () => {
          expect(state.logger!.info).toHaveBeenCalledWith(
            "Reasoning completed",
            expect.objectContaining({
              agentId: "test-agent",
              model: "anthropic/claude-sonnet-4-5-20250929",
            })
          );
        }
      );
    });
  });
});
