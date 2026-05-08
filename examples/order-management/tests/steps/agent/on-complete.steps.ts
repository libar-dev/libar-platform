/**
 * Agent onComplete Handler - Step Definitions
 *
 * BDD step definitions for the agent onComplete handler that routes
 * success/canceled/failed results and manages dead letter entries.
 *
 * Uses convex-test for isolated testing with mocked DB.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { createUnitTestContext } from "../../support/setup";
import type { WorkId } from "@convex-dev/workpool";

// =============================================================================
// Test State
// =============================================================================

type UnitTestContext = ReturnType<typeof createUnitTestContext>;

const AGENT_ID = "churn-risk-agent";

const baseContext = {
  agentId: AGENT_ID,
  subscriptionId: "sub_churn-risk",
  eventId: "evt_test_1",
  eventType: "OrderCancelled",
  globalPosition: 100,
  correlationId: "corr_1",
  causationId: "cause_1",
  streamId: "order_test_1",
  streamType: "Order",
  boundedContext: "orders",
};

interface TestState {
  t: UnitTestContext;
  deadLetterCount: number;
  deadLetter: {
    attemptCount: number;
    status: string;
    error: string;
    globalPosition: number;
    [key: string]: unknown;
  } | null;
  approvalId: string | null;
  approval: Record<string, unknown> | null;
  approvalActionResult: { success: boolean; error?: string } | null;
  decisionId: string | null;
  command: Record<string, unknown> | null;
  outreachTask: Record<string, unknown> | null;
  outreachEvents: Array<Record<string, unknown>>;
  currentCustomerId: string | null;
}

function createInitialState(): TestState {
  return {
    t: createUnitTestContext(),
    deadLetterCount: 0,
    deadLetter: null,
    approvalId: null,
    approval: null,
    approvalActionResult: null,
    decisionId: null,
    command: null,
    outreachTask: null,
    outreachEvents: [],
    currentCustomerId: null,
  };
}

function toWorkId(value: string): WorkId {
  return value as WorkId;
}

let state: TestState = createInitialState();

// =============================================================================
// Helpers
// =============================================================================

async function queryDeadLetters(t: UnitTestContext) {
  return await t.query(api.queries.agent.getDeadLetters, {
    agentId: AGENT_ID,
    limit: 1000,
  });
}

async function refreshDeadLetterState() {
  const results = await queryDeadLetters(state.t);
  state.deadLetterCount = results.length;
  state.deadLetter =
    (results.find(
      (dl: { eventId: string }) => dl.eventId === baseContext.eventId
    ) as TestState["deadLetter"]) ?? null;
}

function parseExpectedValue(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;

  const numeric = Number(value);
  return Number.isNaN(numeric) ? value : numeric;
}

function expectRecordToMatch(
  record: Record<string, unknown> | null,
  table: Array<{ field: string; value: string }>
) {
  expect(record).not.toBeNull();
  for (const row of table) {
    expect(record![row.field]).toBe(parseExpectedValue(row.value));
  }
}

async function invokeSuccessfulOnComplete(args: {
  workId: string;
  decisionId: string;
  customerId: string;
  riskLevel?: "high" | "medium" | "low";
  cancellationCount?: number;
  confidence?: number;
  requiresApproval: boolean;
}) {
  state.decisionId = args.decisionId;
  state.currentCustomerId = args.customerId;
  state.approvalId = args.requiresApproval ? `apr_${args.decisionId}` : null;

  await state.t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
    workId: toWorkId(args.workId),
    context: baseContext,
    result: {
      kind: "success",
      returnValue: {
        decisionId: args.decisionId,
        decision: {
          command: "SuggestCustomerOutreach",
          payload: {
            customerId: args.customerId,
            riskLevel: args.riskLevel ?? "high",
            cancellationCount: args.cancellationCount ?? 4,
          },
          confidence: args.confidence ?? 0.92,
          reason: "Customer crossed churn threshold",
          requiresApproval: args.requiresApproval,
          triggeringEvents: [baseContext.eventId],
        },
        analysisMethod: "rule-based",
        patternId: "churn-risk-threshold",
      },
    },
  });
}

async function refreshApprovalState() {
  if (!state.approvalId) {
    state.approval = null;
    return;
  }

  const approval = await state.t.query(api.queries.agent.getApprovalById, {
    approvalId: state.approvalId,
  });
  state.approval = (approval as Record<string, unknown> | null) ?? null;
}

async function refreshCommandState() {
  if (!state.decisionId) {
    state.command = null;
    return;
  }

  const command = await state.t.query(api.testingFunctions.getAgentCommandByDecisionId, {
    decisionId: state.decisionId,
  });
  state.command = (command as Record<string, unknown> | null) ?? null;
}

async function refreshOutreachState() {
  if (!state.currentCustomerId) {
    state.outreachTask = null;
    state.outreachEvents = [];
    return;
  }

  const outreachTasks = await state.t.query(api.testing.getTestOutreachTasks, {
    customerId: state.currentCustomerId,
    limit: 10,
  });

  const outreachTask = (outreachTasks[0] ?? null) as Record<string, unknown> | null;
  state.outreachTask = outreachTask;

  if (!outreachTask || typeof outreachTask["outreachId"] !== "string") {
    state.outreachEvents = [];
    return;
  }

  const events = await state.t.query(api.testingFunctions.getEventsForStream, {
    streamType: "Outreach",
    streamId: outreachTask["outreachId"],
  });

  state.outreachEvents = events as Array<Record<string, unknown>>;
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/on-complete.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  Background(({ Given }) => {
    Given("a fresh unit test context", () => {
      expect(state.t).toBeDefined();
    });
  });

  // ===========================================================================
  // Rule: Successful and canceled results do not create dead letters
  // ===========================================================================

  Rule("Successful and canceled results do not create dead letters", ({ RuleScenario }) => {
    RuleScenario("No dead letter on success", ({ When, Then, And }) => {
      When("the onComplete handler receives a success result", async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: toWorkId("work_1"),
            context: baseContext,
            result: { kind: "success", returnValue: null },
          }
        );
        await refreshDeadLetterState();
      });

      Then("the dead letter count should be 0", () => {
        expect(state.deadLetterCount).toBe(0);
      });

      And("the checkpoint should advance to the event global position", async () => {
        const checkpoint = await state.t.query(api.queries.agent.getCheckpoint, {
          agentId: AGENT_ID,
        });
        expect(checkpoint).not.toBeNull();
        expect(checkpoint?.lastProcessedPosition).toBe(baseContext.globalPosition);
      });
    });

    RuleScenario("No dead letter on canceled", ({ When, Then }) => {
      When("the onComplete handler receives a canceled result", async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: toWorkId("work_2"),
            context: baseContext,
            result: { kind: "canceled" },
          }
        );
        await refreshDeadLetterState();
      });

      Then("the dead letter count should be 0", () => {
        expect(state.deadLetterCount).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Rule: Failed results create dead letters with error details
  // ===========================================================================

  Rule("Failed results create dead letters with error details", ({ RuleScenario }) => {
    RuleScenario("Creates dead letter on failure", ({ When, Then, And }) => {
      When('the onComplete handler receives a failed result with error "Test error"', async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: toWorkId("work_3"),
            context: baseContext,
            result: { kind: "failed", error: "Test error" },
          }
        );
        await refreshDeadLetterState();
      });

      Then("the dead letter count should be 1", () => {
        expect(state.deadLetterCount).toBe(1);
      });

      And(
        "the dead letter for the event should have:",
        (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          expectRecordToMatch(state.deadLetter, table);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Repeated failures increment attempt count
  // ===========================================================================

  Rule("Repeated failures increment attempt count", ({ RuleScenario }) => {
    RuleScenario("Increments attemptCount on repeated failure", ({ Given, When, Then, And }) => {
      Given('a first failure with error "First error"', async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: toWorkId("work_4a"),
            context: baseContext,
            result: { kind: "failed", error: "First error" },
          }
        );
      });

      When(
        'the onComplete handler receives a failed result with error "Second error"',
        async () => {
          await state.t.mutation(
            internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
            {
              workId: toWorkId("work_4b"),
              context: baseContext,
              result: { kind: "failed", error: "Second error" },
            }
          );
          await refreshDeadLetterState();
        }
      );

      Then("the dead letter count should be 1", () => {
        expect(state.deadLetterCount).toBe(1);
      });

      And(
        "the dead letter for the event should have:",
        (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          expectRecordToMatch(state.deadLetter, table);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Terminal dead letters are not updated
  // ===========================================================================

  Rule("Terminal dead letters are not updated", ({ RuleScenario }) => {
    RuleScenario("Does not update dead letter in terminal state", ({ Given, And, When, Then }) => {
      Given('a first failure with error "Original error"', async () => {
        await state.t.mutation(
          internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
          {
            workId: toWorkId("work_5a"),
            context: baseContext,
            result: { kind: "failed", error: "Original error" },
          }
        );
      });

      And('the dead letter is marked as ignored with reason "Test ignore"', async () => {
        await state.t.mutation(internal.contexts.agent.handlers.onComplete.ignoreDeadLetter, {
          eventId: "evt_test_1",
          reason: "Test ignore",
        });
      });

      When(
        'the onComplete handler receives a failed result with error "Should not overwrite"',
        async () => {
          await state.t.mutation(
            internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
            {
              workId: toWorkId("work_5b"),
              context: baseContext,
              result: { kind: "failed", error: "Should not overwrite" },
            }
          );
          await refreshDeadLetterState();
        }
      );

      Then(
        "the dead letter for the event should have:",
        (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          expectRecordToMatch(state.deadLetter, table);
        }
      );
    });
  });

  // ===========================================================================
  // Rule: Approvals expire after configured timeout
  // ===========================================================================

  Rule("Approvals expire after configured timeout", ({ RuleScenario }) => {
    RuleScenario("Cron expires approval after timeout", ({ When, And, Then }) => {
      When(
        'the onComplete handler records a pending approval for customer "cust_expired"',
        async () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

          await invokeSuccessfulOnComplete({
            workId: "work_6a",
            decisionId: "dec_expired_approval",
            customerId: "cust_expired",
            requiresApproval: true,
            confidence: 0.74,
          });
          await refreshApprovalState();
        }
      );

      And("approval expiration runs after the timeout elapses", async () => {
        vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
        await state.t.mutation(api.testingFunctions.testExpirePendingApprovals, {});
        await refreshApprovalState();
      });

      Then(
        "the pending approval should have:",
        (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
          expectRecordToMatch(state.approval, table);
        }
      );

      And('an "ApprovalExpired" audit event should exist for the pending approval', async () => {
        expect(state.approvalId).not.toBeNull();
        const auditEvents = await state.t.query(api.queries.agent.getAuditEvents, {
          agentId: AGENT_ID,
          eventType: "ApprovalExpired",
          limit: 20,
        });

        expect(
          auditEvents.some(
            (event: { payload?: { approvalId?: string } }) =>
              event.payload?.approvalId === state.approvalId
          )
        ).toBe(true);
      });
    });

    RuleScenario("Expired approval cannot be approved", ({ When, And, Then }) => {
      When(
        'the onComplete handler records a pending approval for customer "cust_expired_review"',
        async () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

          await invokeSuccessfulOnComplete({
            workId: "work_6b",
            decisionId: "dec_expired_review",
            customerId: "cust_expired_review",
            requiresApproval: true,
            confidence: 0.71,
          });
          await refreshApprovalState();
        }
      );

      And("approval expiration runs after the timeout elapses", async () => {
        vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
        await state.t.mutation(api.testingFunctions.testExpirePendingApprovals, {});
        await refreshApprovalState();
      });

      And('reviewer "reviewer_late" attempts to approve the expired action', async () => {
        expect(state.approvalId).not.toBeNull();
        state.approvalActionResult = await state.t.mutation(
          api.testingFunctions.testApproveAgentAction,
          {
            approvalId: state.approvalId!,
            reviewerId: "reviewer_late",
          }
        );
      });

      Then('the approval action should fail with error "INVALID_STATUS_TRANSITION"', () => {
        expect(state.approvalActionResult).toEqual({
          success: false,
          error: "INVALID_STATUS_TRANSITION",
        });
      });
    });
  });

  // ===========================================================================
  // Rule: Emitted commands create real domain records
  // ===========================================================================

  Rule("Emitted commands create real domain records", ({ RuleScenario }) => {
    RuleScenario(
      "SuggestCustomerOutreach creates outreach record and emits event",
      ({ When, And, Then }) => {
        When(
          'the onComplete handler auto-executes a SuggestCustomerOutreach command for customer "cust_outreach_123"',
          async () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));

            await invokeSuccessfulOnComplete({
              workId: "work_7a",
              decisionId: "dec_auto_outreach",
              customerId: "cust_outreach_123",
              requiresApproval: false,
              confidence: 0.95,
            });
            await refreshCommandState();
          }
        );

        And("scheduled command routing completes", async () => {
          await state.t.finishAllScheduledFunctions(vi.runAllTimers);
          await refreshCommandState();
          await refreshOutreachState();
        });

        Then(
          "the recorded command should have:",
          (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
            expectRecordToMatch(state.command, table);
          }
        );

        And(
          "the outreach task should have:",
          (_ctx: unknown, table: Array<{ field: string; value: string }>) => {
            expectRecordToMatch(state.outreachTask, table);
          }
        );

        And('an "OutreachCreated" event should be emitted for the outreach task', () => {
          expect(state.outreachEvents.length).toBeGreaterThan(0);

          const createdEvent = state.outreachEvents.find(
            (event) => event["eventType"] === "OutreachCreated"
          );

          expect(createdEvent).toBeDefined();
          expect((createdEvent?.payload as Record<string, unknown>)?.customerId).toBe(
            "cust_outreach_123"
          );
          expect((createdEvent?.payload as Record<string, unknown>)?.agentId).toBe(AGENT_ID);
          expect((createdEvent?.payload as Record<string, unknown>)?.riskLevel).toBe("high");
          expect((createdEvent?.payload as Record<string, unknown>)?.cancellationCount).toBe(4);
          expect((createdEvent?.payload as Record<string, unknown>)?.correlationId).toBe(
            baseContext.correlationId
          );
        });
      }
    );
  });
});
