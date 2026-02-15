/**
 * Pattern Executor - Step Definitions
 *
 * BDD step definitions for the pattern execution pipeline including:
 * - executePatterns: no match, single match, multi-pattern, analyze, error propagation
 * - buildDecisionFromAnalysis: command extraction, approval logic
 * - buildDecisionFromTrigger: heuristic confidence, always requires approval
 *
 * Mechanical migration from tests/unit/agent/pattern-executor.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi, type Mock } from "vitest";

import {
  executePatterns,
  buildDecisionFromAnalysis,
  buildDecisionFromTrigger,
} from "../../../src/agent/pattern-executor.js";
import type { PatternDefinition, PatternAnalysisResult } from "../../../src/agent/patterns.js";
import type { PublishedEvent } from "../../../src/eventbus/types.js";
import type { AgentBCConfig, AgentInterface, AgentDecision } from "../../../src/agent/types.js";

// =============================================================================
// Test Helpers
// =============================================================================

const makeEvent = (overrides?: Partial<PublishedEvent>): PublishedEvent =>
  ({
    eventId: `evt_${Math.random().toString(36).slice(2, 8)}`,
    eventType: "OrderCancelled",
    globalPosition: 1,
    streamType: "Order",
    streamId: "ord_123",
    payload: {},
    timestamp: Date.now(),
    category: "domain",
    boundedContext: "orders",
    schemaVersion: 1,
    correlation: { correlationId: "corr_1", causationId: "evt_1" },
    ...overrides,
  }) as PublishedEvent;

const makePattern = (name: string, overrides?: Partial<PatternDefinition>): PatternDefinition => ({
  name,
  window: { duration: "7d" },
  trigger: () => true,
  ...overrides,
});

const makeConfig = (overrides?: Partial<AgentBCConfig>): AgentBCConfig =>
  ({
    id: "test-agent",
    subscriptions: ["OrderCancelled"],
    patternWindow: { duration: "30d", minEvents: 1 },
    confidenceThreshold: 0.8,
    patterns: [makePattern("test-pattern")],
    ...overrides,
  }) as AgentBCConfig;

const stubAgent: AgentInterface = {
  analyze: async () => ({ patterns: [], confidence: 0, reasoning: "" }),
  reason: async () => ({}),
} as AgentInterface;

// =============================================================================
// Mutable Test State
// =============================================================================

interface TestState {
  events: PublishedEvent[];
  patterns: PatternDefinition[];
  config: AgentBCConfig;
  result: {
    matchedPattern: string | null;
    decision: AgentDecision | null;
    analysisMethod: string;
  } | null;
  error: Error | null;
  // buildDecisionFromAnalysis state
  analysisResult: PatternAnalysisResult | null;
  analysisDecision: AgentDecision | null;
  // buildDecisionFromTrigger state
  triggerEvents: PublishedEvent[];
  triggerPattern: PatternDefinition | null;
  triggerDecision: AgentDecision | null;
  // spies
  secondTriggerSpy: Mock | null;
  minEventsTriggerSpy: Mock | null;
  windowTriggerSpy: Mock | null;
}

function createInitialState(): TestState {
  return {
    events: [],
    patterns: [],
    config: makeConfig(),
    result: null,
    error: null,
    analysisResult: null,
    analysisDecision: null,
    triggerEvents: [],
    triggerPattern: null,
    triggerDecision: null,
    secondTriggerSpy: null,
    minEventsTriggerSpy: null,
    windowTriggerSpy: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/pattern-executor.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Imports are done at module level
    });
  });

  // ===========================================================================
  // Rule: executePatterns returns null for empty patterns
  // ===========================================================================

  Rule("executePatterns returns null for empty patterns", ({ RuleScenario }) => {
    RuleScenario(
      "Returns null matchedPattern and null decision for empty patterns array",
      ({ Given, When, Then, And }) => {
        Given("an event list with 1 default event", () => {
          state.events = [makeEvent()];
        });

        When("executePatterns is called with no patterns", async () => {
          state.result = await executePatterns([], state.events, stubAgent, state.config);
        });

        Then("the matchedPattern is null", () => {
          expect(state.result!.matchedPattern).toBeNull();
        });

        And("the decision is null", () => {
          expect(state.result!.decision).toBeNull();
        });

        And('the analysisMethod is "rule-based"', () => {
          expect(state.result!.analysisMethod).toBe("rule-based");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: executePatterns matches single pattern via trigger
  // ===========================================================================

  Rule("executePatterns matches single pattern via trigger", ({ RuleScenario }) => {
    RuleScenario(
      "Returns rule-based decision when trigger returns true and no analyze",
      ({ Given, When, Then, And }) => {
        Given("an event list with 1 default event", () => {
          state.events = [makeEvent()];
        });

        And('a pattern "churn-risk" with trigger returning true', () => {
          state.patterns = [makePattern("churn-risk", { trigger: () => true })];
        });

        When("executePatterns is called with those patterns", async () => {
          state.result = await executePatterns(
            state.patterns,
            state.events,
            stubAgent,
            state.config
          );
        });

        Then('the matchedPattern is "churn-risk"', () => {
          expect(state.result!.matchedPattern).toBe("churn-risk");
        });

        And("the decision is not null", () => {
          expect(state.result!.decision).not.toBeNull();
        });

        And('the analysisMethod is "rule-based"', () => {
          expect(state.result!.analysisMethod).toBe("rule-based");
        });

        And("the decision command is null", () => {
          expect(state.result!.decision!.command).toBeNull();
        });

        And("the decision requiresApproval is true", () => {
          expect(state.result!.decision!.requiresApproval).toBe(true);
        });
      }
    );

    RuleScenario("Skips pattern when trigger returns false", ({ Given, When, Then, And }) => {
      Given("an event list with 1 default event", () => {
        state.events = [makeEvent()];
      });

      And('a pattern "no-match" with trigger returning false', () => {
        state.patterns = [makePattern("no-match", { trigger: () => false })];
      });

      When("executePatterns is called with those patterns", async () => {
        state.result = await executePatterns(state.patterns, state.events, stubAgent, state.config);
      });

      Then("the matchedPattern is null", () => {
        expect(state.result!.matchedPattern).toBeNull();
      });

      And("the decision is null", () => {
        expect(state.result!.decision).toBeNull();
      });
    });
  });

  // ===========================================================================
  // Rule: executePatterns delegates to analyze when present
  // ===========================================================================

  Rule("executePatterns delegates to analyze when present", ({ RuleScenario }) => {
    RuleScenario(
      "Returns llm decision when analyze returns detected",
      ({ Given, When, Then, And }) => {
        Given('an event list with 1 event with eventId "evt_1"', () => {
          state.events = [makeEvent({ eventId: "evt_1" })];
        });

        And(
          'a pattern "churn-risk" with trigger true and analyze returning detected with confidence 0.92',
          () => {
            const analysisResult: PatternAnalysisResult = {
              detected: true,
              confidence: 0.92,
              reasoning: "High churn risk detected",
              matchingEventIds: ["evt_1"],
              command: {
                type: "SuggestOutreach",
                payload: { urgency: "high" },
              },
            };
            state.patterns = [
              makePattern("churn-risk", {
                trigger: () => true,
                analyze: vi.fn().mockResolvedValue(analysisResult),
              }),
            ];
          }
        );

        When("executePatterns is called with those patterns", async () => {
          state.result = await executePatterns(
            state.patterns,
            state.events,
            stubAgent,
            state.config
          );
        });

        Then('the matchedPattern is "churn-risk"', () => {
          expect(state.result!.matchedPattern).toBe("churn-risk");
        });

        And('the analysisMethod is "llm"', () => {
          expect(state.result!.analysisMethod).toBe("llm");
        });

        And("the decision is not null", () => {
          expect(state.result!.decision).not.toBeNull();
        });

        And('the decision command is "SuggestOutreach"', () => {
          expect(state.result!.decision!.command).toBe("SuggestOutreach");
        });

        And("the decision confidence is 0.92", () => {
          expect(state.result!.decision!.confidence).toBe(0.92);
        });

        And('the decision reason is "High churn risk detected"', () => {
          expect(state.result!.decision!.reason).toBe("High churn risk detected");
        });
      }
    );

    RuleScenario(
      "Continues to next pattern when analyze returns not detected",
      ({ Given, When, Then, And }) => {
        Given("an event list with 1 default event", () => {
          state.events = [makeEvent()];
        });

        And('a pattern "first" with trigger true and analyze returning not-detected', () => {
          const notDetectedResult: PatternAnalysisResult = {
            detected: false,
            confidence: 0.2,
            reasoning: "No pattern found",
            matchingEventIds: [],
          };
          state.patterns = [
            makePattern("first", {
              trigger: () => true,
              analyze: vi.fn().mockResolvedValue(notDetectedResult),
            }),
          ];
        });

        And('a pattern "second" with trigger returning true', () => {
          state.patterns.push(makePattern("second", { trigger: () => true }));
        });

        When("executePatterns is called with those patterns", async () => {
          state.result = await executePatterns(
            state.patterns,
            state.events,
            stubAgent,
            state.config
          );
        });

        Then('the matchedPattern is "second"', () => {
          expect(state.result!.matchedPattern).toBe("second");
        });

        And('the analysisMethod is "rule-based"', () => {
          expect(state.result!.analysisMethod).toBe("rule-based");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: executePatterns propagates analyze errors
  // ===========================================================================

  Rule("executePatterns propagates analyze errors", ({ RuleScenario }) => {
    RuleScenario("Propagates error when analyze throws", ({ Given, When, And }) => {
      Given("an event list with 1 default event", () => {
        state.events = [makeEvent()];
      });

      And('a pattern "risky" with trigger true and analyze that throws "LLM API timeout"', () => {
        state.patterns = [
          makePattern("risky", {
            trigger: () => true,
            analyze: vi.fn().mockRejectedValue(new Error("LLM API timeout")),
          }),
        ];
      });

      When(
        'executePatterns is called with those patterns it rejects with "LLM API timeout"',
        async () => {
          await expect(
            executePatterns(state.patterns, state.events, stubAgent, state.config)
          ).rejects.toThrow("LLM API timeout");
        }
      );
    });
  });

  // ===========================================================================
  // Rule: executePatterns short-circuits on first match
  // ===========================================================================

  Rule("executePatterns short-circuits on first match", ({ RuleScenario }) => {
    RuleScenario("Stops after first matching pattern", ({ Given, When, Then, And }) => {
      Given("an event list with 1 default event", () => {
        state.events = [makeEvent()];
      });

      And('a pattern "first" with trigger returning true', () => {
        state.patterns = [makePattern("first", { trigger: () => true })];
      });

      And('a spy pattern "second" with trigger spy', () => {
        state.secondTriggerSpy = vi.fn().mockReturnValue(true);
        state.patterns.push(makePattern("second", { trigger: state.secondTriggerSpy }));
      });

      When("executePatterns is called with those patterns", async () => {
        state.result = await executePatterns(state.patterns, state.events, stubAgent, state.config);
      });

      Then('the matchedPattern is "first"', () => {
        expect(state.result!.matchedPattern).toBe("first");
      });

      And("the second trigger spy was not called", () => {
        expect(state.secondTriggerSpy).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Rule: executePatterns falls through non-matching patterns
  // ===========================================================================

  Rule("executePatterns falls through non-matching patterns", ({ RuleScenario }) => {
    RuleScenario(
      "Falls through to second pattern when first trigger is false",
      ({ Given, When, Then, And }) => {
        Given("an event list with 1 default event", () => {
          state.events = [makeEvent()];
        });

        And('a pattern "first" with trigger returning false', () => {
          state.patterns = [makePattern("first", { trigger: () => false })];
        });

        And('a pattern "second" with trigger returning true', () => {
          state.patterns.push(makePattern("second", { trigger: () => true }));
        });

        When("executePatterns is called with those patterns", async () => {
          state.result = await executePatterns(
            state.patterns,
            state.events,
            stubAgent,
            state.config
          );
        });

        Then('the matchedPattern is "second"', () => {
          expect(state.result!.matchedPattern).toBe("second");
        });

        And('the analysisMethod is "rule-based"', () => {
          expect(state.result!.analysisMethod).toBe("rule-based");
        });
      }
    );
  });

  // ===========================================================================
  // Rule: executePatterns enforces minEvents
  // ===========================================================================

  Rule("executePatterns enforces minEvents", ({ RuleScenario }) => {
    RuleScenario("Skips pattern when minEvents is not met", ({ Given, When, Then, And }) => {
      Given("an event list with 1 default event", () => {
        state.events = [makeEvent()];
      });

      And('a pattern "needs-many" with minEvents 5 and a trigger spy', () => {
        state.minEventsTriggerSpy = vi.fn().mockReturnValue(true);
        state.patterns = [
          makePattern("needs-many", {
            window: { duration: "7d", minEvents: 5 },
            trigger: state.minEventsTriggerSpy,
          }),
        ];
      });

      When("executePatterns is called with those patterns", async () => {
        state.result = await executePatterns(state.patterns, state.events, stubAgent, state.config);
      });

      Then("the matchedPattern is null", () => {
        expect(state.result!.matchedPattern).toBeNull();
      });

      And("the decision is null", () => {
        expect(state.result!.decision).toBeNull();
      });

      And("the minEvents trigger spy was not called", () => {
        expect(state.minEventsTriggerSpy).not.toHaveBeenCalled();
      });
    });

    RuleScenario("Processes pattern when minEvents is met", ({ Given, When, Then, And }) => {
      Given("an event list with 5 events", () => {
        state.events = Array.from({ length: 5 }, (_, i) =>
          makeEvent({ eventId: `evt_${i}`, globalPosition: i + 1 })
        );
      });

      And('a pattern "needs-five" with minEvents 5 and trigger returning true', () => {
        state.patterns = [
          makePattern("needs-five", {
            window: { duration: "7d", minEvents: 5 },
            trigger: () => true,
          }),
        ];
      });

      When("executePatterns is called with those patterns", async () => {
        state.result = await executePatterns(state.patterns, state.events, stubAgent, state.config);
      });

      Then('the matchedPattern is "needs-five"', () => {
        expect(state.result!.matchedPattern).toBe("needs-five");
      });
    });
  });

  // ===========================================================================
  // Rule: executePatterns applies window filtering
  // ===========================================================================

  Rule("executePatterns applies window filtering", ({ RuleScenario }) => {
    RuleScenario("Excludes events outside the pattern window", ({ Given, When, Then, And }) => {
      const now = new Date("2024-06-15T12:00:00Z").getTime();

      Given('an event from 1 hour ago with eventId "recent"', () => {
        state.events.push(
          makeEvent({
            eventId: "recent",
            timestamp: now - 60 * 60 * 1000,
          })
        );
      });

      And('an event from 2 days ago with eventId "old"', () => {
        state.events.push(
          makeEvent({
            eventId: "old",
            timestamp: now - 2 * 24 * 60 * 60 * 1000,
          })
        );
      });

      And('a pattern "short-window" with 1-day window and a trigger spy', () => {
        state.windowTriggerSpy = vi.fn().mockReturnValue(true);
        state.patterns = [
          makePattern("short-window", {
            window: { duration: "1d" },
            trigger: state.windowTriggerSpy,
          }),
        ];
      });

      When("executePatterns is called with those patterns and both events", async () => {
        state.result = await executePatterns(state.patterns, state.events, stubAgent, state.config);
      });

      Then('the matchedPattern is "short-window"', () => {
        expect(state.result!.matchedPattern).toBe("short-window");
      });

      And('the trigger spy was called once with 1 event having eventId "recent"', () => {
        expect(state.windowTriggerSpy).toHaveBeenCalledTimes(1);
        const receivedEvents = state.windowTriggerSpy!.mock.calls[0][0] as PublishedEvent[];
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0].eventId).toBe("recent");
      });
    });

    RuleScenario(
      "Returns no match when all events are outside the window",
      ({ Given, When, Then, And }) => {
        const now = new Date("2024-06-15T12:00:00Z").getTime();

        Given('an event from 2 days ago with eventId "old"', () => {
          state.events = [
            makeEvent({
              eventId: "old",
              timestamp: now - 2 * 24 * 60 * 60 * 1000,
            }),
          ];
        });

        And('a pattern "short-window" with 1-day window and minEvents 1', () => {
          state.patterns = [
            makePattern("short-window", {
              window: { duration: "1d", minEvents: 1 },
              trigger: () => true,
            }),
          ];
        });

        When("executePatterns is called with those patterns and the old event", async () => {
          state.result = await executePatterns(
            state.patterns,
            state.events,
            stubAgent,
            state.config
          );
        });

        Then("the matchedPattern is null", () => {
          expect(state.result!.matchedPattern).toBeNull();
        });

        And("the decision is null", () => {
          expect(state.result!.decision).toBeNull();
        });
      }
    );
  });

  // ===========================================================================
  // Rule: buildDecisionFromAnalysis extracts command and payload
  // ===========================================================================

  Rule("buildDecisionFromAnalysis extracts command and payload", ({ RuleScenario }) => {
    RuleScenario("Extracts command type from analysis result", ({ Given, When, Then, And }) => {
      Given(
        'an analysis result with command "SuggestOutreach" and payload urgency "high" and confidence 0.95',
        () => {
          state.analysisResult = {
            detected: true,
            confidence: 0.95,
            reasoning: "Pattern detected",
            matchingEventIds: ["evt_1"],
            command: {
              type: "SuggestOutreach",
              payload: { urgency: "high" },
            },
          };
        }
      );

      When('buildDecisionFromAnalysis is called with pattern "churn-risk"', () => {
        state.analysisDecision = buildDecisionFromAnalysis(
          state.analysisResult!,
          "churn-risk",
          makeConfig()
        );
      });

      Then('the decision command is "SuggestOutreach"', () => {
        expect(state.analysisDecision!.command).toBe("SuggestOutreach");
      });

      And('the decision payload equals urgency "high"', () => {
        expect(state.analysisDecision!.payload).toEqual({
          urgency: "high",
        });
      });

      And("the decision confidence is 0.95", () => {
        expect(state.analysisDecision!.confidence).toBe(0.95);
      });

      And('the decision reason is "Pattern detected"', () => {
        expect(state.analysisDecision!.reason).toBe("Pattern detected");
      });

      And('the decision triggeringEvents equals "evt_1"', () => {
        expect(state.analysisDecision!.triggeringEvents).toEqual(["evt_1"]);
      });
    });

    RuleScenario("Returns null command when no command present", ({ Given, When, Then }) => {
      Given("an analysis result with no command and confidence 0.7", () => {
        state.analysisResult = {
          detected: true,
          confidence: 0.7,
          reasoning: "Detected but no action",
          matchingEventIds: ["evt_3"],
        };
      });

      When('buildDecisionFromAnalysis is called with pattern "no-command"', () => {
        state.analysisDecision = buildDecisionFromAnalysis(
          state.analysisResult!,
          "no-command",
          makeConfig()
        );
      });

      Then("the decision command is null", () => {
        expect(state.analysisDecision!.command).toBeNull();
      });
    });

    RuleScenario("Uses command payload when command is present", ({ Given, When, Then }) => {
      Given('an analysis result with command "Cmd" and specific payload', () => {
        state.analysisResult = {
          detected: true,
          confidence: 0.9,
          reasoning: "Test payload",
          matchingEventIds: [],
          command: { type: "Cmd", payload: { specific: "data" } },
        };
      });

      When('buildDecisionFromAnalysis is called with pattern "payload-test"', () => {
        state.analysisDecision = buildDecisionFromAnalysis(
          state.analysisResult!,
          "payload-test",
          makeConfig()
        );
      });

      Then('the decision payload equals specific "data"', () => {
        expect(state.analysisDecision!.payload).toEqual({
          specific: "data",
        });
      });
    });

    RuleScenario("Uses result data as payload when no command present", ({ Given, When, Then }) => {
      Given('an analysis result with no command but with data extra "info"', () => {
        state.analysisResult = {
          detected: true,
          confidence: 0.9,
          reasoning: "Test data fallback",
          matchingEventIds: [],
          data: { extra: "info" },
        };
      });

      When('buildDecisionFromAnalysis is called with pattern "data-fallback"', () => {
        state.analysisDecision = buildDecisionFromAnalysis(
          state.analysisResult!,
          "data-fallback",
          makeConfig()
        );
      });

      Then('the decision payload equals extra "info"', () => {
        expect(state.analysisDecision!.payload).toEqual({
          extra: "info",
        });
      });
    });
  });

  // ===========================================================================
  // Rule: buildDecisionFromAnalysis determines requiresApproval from confidence threshold
  // ===========================================================================

  Rule(
    "buildDecisionFromAnalysis determines requiresApproval from confidence threshold",
    ({ RuleScenario }) => {
      RuleScenario(
        "Requires approval when confidence is below threshold",
        ({ Given, When, Then }) => {
          Given('an analysis result with command "SomeAction" and confidence 0.5', () => {
            state.analysisResult = {
              detected: true,
              confidence: 0.5,
              reasoning: "Low confidence",
              matchingEventIds: [],
              command: { type: "SomeAction", payload: {} },
            };
          });

          When("buildDecisionFromAnalysis is called with confidence threshold 0.8", () => {
            state.analysisDecision = buildDecisionFromAnalysis(
              state.analysisResult!,
              "low-conf",
              makeConfig({ confidenceThreshold: 0.8 })
            );
          });

          Then("the decision requiresApproval is true", () => {
            expect(state.analysisDecision!.requiresApproval).toBe(true);
          });
        }
      );

      RuleScenario(
        "Does not require approval when confidence meets threshold",
        ({ Given, When, Then }) => {
          Given('an analysis result with command "SafeAction" and confidence 0.9', () => {
            state.analysisResult = {
              detected: true,
              confidence: 0.9,
              reasoning: "High confidence",
              matchingEventIds: [],
              command: { type: "SafeAction", payload: {} },
            };
          });

          When("buildDecisionFromAnalysis is called with confidence threshold 0.8", () => {
            state.analysisDecision = buildDecisionFromAnalysis(
              state.analysisResult!,
              "high-conf",
              makeConfig({ confidenceThreshold: 0.8 })
            );
          });

          Then("the decision requiresApproval is false", () => {
            expect(state.analysisDecision!.requiresApproval).toBe(false);
          });
        }
      );

      RuleScenario(
        "Does not require approval when confidence equals threshold",
        ({ Given, When, Then }) => {
          Given('an analysis result with command "ExactAction" and confidence 0.8', () => {
            state.analysisResult = {
              detected: true,
              confidence: 0.8,
              reasoning: "At threshold",
              matchingEventIds: [],
              command: { type: "ExactAction", payload: {} },
            };
          });

          When("buildDecisionFromAnalysis is called with confidence threshold 0.8", () => {
            state.analysisDecision = buildDecisionFromAnalysis(
              state.analysisResult!,
              "exact",
              makeConfig({ confidenceThreshold: 0.8 })
            );
          });

          Then("the decision requiresApproval is false", () => {
            expect(state.analysisDecision!.requiresApproval).toBe(false);
          });
        }
      );

      RuleScenario(
        "Always requires approval when no command is present",
        ({ Given, When, Then }) => {
          Given("an analysis result with no command and confidence 0.99", () => {
            state.analysisResult = {
              detected: true,
              confidence: 0.99,
              reasoning: "High confidence but no command",
              matchingEventIds: [],
            };
          });

          When('buildDecisionFromAnalysis is called with pattern "no-cmd"', () => {
            state.analysisDecision = buildDecisionFromAnalysis(
              state.analysisResult!,
              "no-cmd",
              makeConfig()
            );
          });

          Then("the decision requiresApproval is true", () => {
            expect(state.analysisDecision!.requiresApproval).toBe(true);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: buildDecisionFromAnalysis respects humanInLoop overrides
  // ===========================================================================

  Rule("buildDecisionFromAnalysis respects humanInLoop overrides", ({ RuleScenario }) => {
    RuleScenario(
      "Forces approval when command is in requiresApproval list",
      ({ Given, When, Then }) => {
        Given('an analysis result with command "DangerousAction" and confidence 0.99', () => {
          state.analysisResult = {
            detected: true,
            confidence: 0.99,
            reasoning: "Should still require approval",
            matchingEventIds: [],
            command: { type: "DangerousAction", payload: {} },
          };
        });

        When(
          'buildDecisionFromAnalysis is called with humanInLoop requiresApproval "DangerousAction"',
          () => {
            state.analysisDecision = buildDecisionFromAnalysis(
              state.analysisResult!,
              "forced-approval",
              makeConfig({
                confidenceThreshold: 0.5,
                humanInLoop: {
                  requiresApproval: ["DangerousAction"],
                },
              })
            );
          }
        );

        Then("the decision requiresApproval is true", () => {
          expect(state.analysisDecision!.requiresApproval).toBe(true);
        });
      }
    );

    RuleScenario("Skips approval when command is in autoApprove list", ({ Given, When, Then }) => {
      Given('an analysis result with command "SafeAction" and confidence 0.3', () => {
        state.analysisResult = {
          detected: true,
          confidence: 0.3,
          reasoning: "Should auto-approve anyway",
          matchingEventIds: [],
          command: { type: "SafeAction", payload: {} },
        };
      });

      When('buildDecisionFromAnalysis is called with humanInLoop autoApprove "SafeAction"', () => {
        state.analysisDecision = buildDecisionFromAnalysis(
          state.analysisResult!,
          "auto-approved",
          makeConfig({
            confidenceThreshold: 0.8,
            humanInLoop: {
              autoApprove: ["SafeAction"],
            },
          })
        );
      });

      Then("the decision requiresApproval is false", () => {
        expect(state.analysisDecision!.requiresApproval).toBe(false);
      });
    });

    RuleScenario(
      "requiresApproval takes precedence over autoApprove for same command",
      ({ Given, When, Then }) => {
        Given('an analysis result with command "ConflictAction" and confidence 0.99', () => {
          state.analysisResult = {
            detected: true,
            confidence: 0.99,
            reasoning: "Conflict test",
            matchingEventIds: [],
            command: { type: "ConflictAction", payload: {} },
          };
        });

        When(
          'buildDecisionFromAnalysis is called with humanInLoop both lists for "ConflictAction"',
          () => {
            state.analysisDecision = buildDecisionFromAnalysis(
              state.analysisResult!,
              "conflict",
              makeConfig({
                confidenceThreshold: 0.5,
                humanInLoop: {
                  requiresApproval: ["ConflictAction"],
                  autoApprove: ["ConflictAction"],
                },
              })
            );
          }
        );

        Then("the decision requiresApproval is true", () => {
          expect(state.analysisDecision!.requiresApproval).toBe(true);
        });
      }
    );
  });

  // ===========================================================================
  // Rule: buildDecisionFromTrigger returns basic trigger-only decision
  // ===========================================================================

  Rule("buildDecisionFromTrigger returns basic trigger-only decision", ({ RuleScenario }) => {
    RuleScenario("Returns null command for trigger-only decision", ({ Given, When, Then, And }) => {
      Given("1 default event for trigger decision", () => {
        state.triggerEvents = [makeEvent()];
      });

      And('a trigger pattern named "basic"', () => {
        state.triggerPattern = makePattern("basic");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then("the trigger decision command is null", () => {
        expect(state.triggerDecision!.command).toBeNull();
      });

      And("the trigger decision payload is empty", () => {
        expect(state.triggerDecision!.payload).toEqual({});
      });
    });

    RuleScenario(
      "Always requires approval for trigger-only decision",
      ({ Given, When, Then, And }) => {
        Given("1 default event for trigger decision", () => {
          state.triggerEvents = [makeEvent()];
        });

        And('a trigger pattern named "basic"', () => {
          state.triggerPattern = makePattern("basic");
        });

        When("buildDecisionFromTrigger is called", () => {
          state.triggerDecision = buildDecisionFromTrigger(
            state.triggerEvents,
            state.triggerPattern!,
            makeConfig()
          );
        });

        Then("the trigger decision requiresApproval is true", () => {
          expect(state.triggerDecision!.requiresApproval).toBe(true);
        });
      }
    );

    RuleScenario(
      "Includes pattern name in trigger decision reason",
      ({ Given, When, Then, And }) => {
        Given("1 default event for trigger decision", () => {
          state.triggerEvents = [makeEvent()];
        });

        And('a trigger pattern named "churn-risk"', () => {
          state.triggerPattern = makePattern("churn-risk");
        });

        When("buildDecisionFromTrigger is called", () => {
          state.triggerDecision = buildDecisionFromTrigger(
            state.triggerEvents,
            state.triggerPattern!,
            makeConfig()
          );
        });

        Then('the trigger decision reason contains "churn-risk"', () => {
          expect(state.triggerDecision!.reason).toContain("churn-risk");
        });
      }
    );

    RuleScenario(
      "Includes event count in trigger decision reason",
      ({ Given, When, Then, And }) => {
        Given("3 default events for trigger decision", () => {
          state.triggerEvents = [makeEvent(), makeEvent(), makeEvent()];
        });

        And('a trigger pattern named "multi-event"', () => {
          state.triggerPattern = makePattern("multi-event");
        });

        When("buildDecisionFromTrigger is called", () => {
          state.triggerDecision = buildDecisionFromTrigger(
            state.triggerEvents,
            state.triggerPattern!,
            makeConfig()
          );
        });

        Then('the trigger decision reason contains "3 events"', () => {
          expect(state.triggerDecision!.reason).toContain("3 events");
        });
      }
    );

    RuleScenario("Includes all event IDs in triggeringEvents", ({ Given, When, Then, And }) => {
      Given('events with IDs "evt_a" and "evt_b" for trigger decision', () => {
        state.triggerEvents = [makeEvent({ eventId: "evt_a" }), makeEvent({ eventId: "evt_b" })];
      });

      And('a trigger pattern named "trigger-test"', () => {
        state.triggerPattern = makePattern("trigger-test");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then('the trigger decision triggeringEvents are "evt_a" and "evt_b"', () => {
        expect(state.triggerDecision!.triggeringEvents).toEqual(["evt_a", "evt_b"]);
      });
    });
  });

  // ===========================================================================
  // Rule: buildDecisionFromTrigger computes heuristic confidence
  // ===========================================================================

  Rule("buildDecisionFromTrigger computes heuristic confidence", ({ RuleScenario }) => {
    RuleScenario("Returns 0.6 confidence for 1 event", ({ Given, When, Then, And }) => {
      Given("1 default event for trigger decision", () => {
        state.triggerEvents = [makeEvent()];
      });

      And('a trigger pattern named "t"', () => {
        state.triggerPattern = makePattern("t");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then("the trigger decision confidence is approximately 0.6", () => {
        expect(state.triggerDecision!.confidence).toBeCloseTo(0.6, 5);
      });
    });

    RuleScenario("Returns 0.7 confidence for 2 events", ({ Given, When, Then, And }) => {
      Given("2 default events for trigger decision", () => {
        state.triggerEvents = [makeEvent(), makeEvent()];
      });

      And('a trigger pattern named "t"', () => {
        state.triggerPattern = makePattern("t");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then("the trigger decision confidence is approximately 0.7", () => {
        expect(state.triggerDecision!.confidence).toBeCloseTo(0.7, 5);
      });
    });

    RuleScenario("Returns 0.8 confidence for 3 events", ({ Given, When, Then, And }) => {
      Given("3 default events for trigger decision", () => {
        state.triggerEvents = [makeEvent(), makeEvent(), makeEvent()];
      });

      And('a trigger pattern named "t"', () => {
        state.triggerPattern = makePattern("t");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then("the trigger decision confidence is approximately 0.8", () => {
        expect(state.triggerDecision!.confidence).toBeCloseTo(0.8, 5);
      });
    });

    RuleScenario("Caps at 0.85 for 4 events", ({ Given, When, Then, And }) => {
      Given("4 default events for trigger decision", () => {
        state.triggerEvents = Array.from({ length: 4 }, () => makeEvent());
      });

      And('a trigger pattern named "t"', () => {
        state.triggerPattern = makePattern("t");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then("the trigger decision confidence is approximately 0.85", () => {
        expect(state.triggerDecision!.confidence).toBeCloseTo(0.85, 5);
      });
    });

    RuleScenario("Caps at 0.85 for 10 events", ({ Given, When, Then, And }) => {
      Given("10 default events for trigger decision", () => {
        state.triggerEvents = Array.from({ length: 10 }, () => makeEvent());
      });

      And('a trigger pattern named "t"', () => {
        state.triggerPattern = makePattern("t");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then("the trigger decision confidence is approximately 0.85", () => {
        expect(state.triggerDecision!.confidence).toBeCloseTo(0.85, 5);
      });
    });

    RuleScenario("Returns 0.5 for 0 events edge case", ({ Given, When, Then, And }) => {
      Given("0 events for trigger decision", () => {
        state.triggerEvents = [];
      });

      And('a trigger pattern named "t"', () => {
        state.triggerPattern = makePattern("t");
      });

      When("buildDecisionFromTrigger is called", () => {
        state.triggerDecision = buildDecisionFromTrigger(
          state.triggerEvents,
          state.triggerPattern!,
          makeConfig()
        );
      });

      Then("the trigger decision confidence is approximately 0.5", () => {
        expect(state.triggerDecision!.confidence).toBeCloseTo(0.5, 5);
      });
    });
  });
});
