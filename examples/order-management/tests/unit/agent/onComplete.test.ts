/**
 * Unit tests for Agent onComplete handler.
 *
 * Tests the three result branches (success, canceled, failed)
 * and the attemptCount increment pattern for EventBus redelivery.
 *
 * Uses convex-test for isolated testing with mocked DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { createUnitTestContext } from "../../support/setup";

type TestContext = ReturnType<typeof createUnitTestContext>;

// Agent ID used by the onComplete handler
const AGENT_ID = "churn-risk-agent";

describe("Agent onComplete handler", () => {
  let t: TestContext;

  beforeEach(() => {
    t = createUnitTestContext();
  });

  const baseContext = {
    eventId: "evt_test_1",
    subscriptionName: "churn-risk",
    eventType: "OrderCancelled",
    globalPosition: 100,
    correlationId: "corr_1",
    causationId: "cause_1",
  };

  /**
   * Count dead letters via the app-level query that delegates to the agentBC component.
   */
  async function countDeadLetters(t: TestContext): Promise<number> {
    const results = await t.query(api.queries.agent.getDeadLetters, {
      agentId: AGENT_ID,
      limit: 1000,
    });
    return results.length;
  }

  /**
   * Get dead letter by eventId via the component query.
   */
  async function getDeadLetterByEventId(t: TestContext, eventId: string) {
    const results = await t.query(api.queries.agent.getDeadLetters, {
      agentId: AGENT_ID,
      limit: 1000,
    });
    return results.find((dl: { eventId: string }) => dl.eventId === eventId) ?? null;
  }

  it("does not create dead letter on success", async () => {
    await t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
      workId: "work_1",
      context: baseContext,
      result: { kind: "success", returnValue: null },
    });

    expect(await countDeadLetters(t)).toBe(0);
  });

  it("does not create dead letter on canceled", async () => {
    await t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
      workId: "work_2",
      context: baseContext,
      result: { kind: "canceled" },
    });

    expect(await countDeadLetters(t)).toBe(0);
  });

  it("creates dead letter on failure", async () => {
    await t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
      workId: "work_3",
      context: baseContext,
      result: { kind: "failed", error: "Test error" },
    });

    expect(await countDeadLetters(t)).toBe(1);
    const dl = await getDeadLetterByEventId(t, "evt_test_1");
    expect(dl).not.toBeNull();
    expect(dl!.attemptCount).toBe(1);
    expect(dl!.status).toBe("pending");
    expect(dl!.error).toBe("Test error");
    expect(dl!.globalPosition).toBe(100);
  });

  it("increments attemptCount on repeated failure for same eventId", async () => {
    // First failure — creates new dead letter
    await t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
      workId: "work_4a",
      context: baseContext,
      result: { kind: "failed", error: "First error" },
    });

    // Second failure — same eventId, should increment
    await t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
      workId: "work_4b",
      context: baseContext,
      result: { kind: "failed", error: "Second error" },
    });

    // Should still be 1 dead letter, not 2
    expect(await countDeadLetters(t)).toBe(1);
    const dl = await getDeadLetterByEventId(t, "evt_test_1");
    expect(dl!.attemptCount).toBe(2);
    expect(dl!.error).toBe("Second error");
  });

  it("does not update dead letter in terminal state", async () => {
    // Create dead letter via failure
    await t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
      workId: "work_5a",
      context: baseContext,
      result: { kind: "failed", error: "Original error" },
    });

    // Mark as ignored via the component API (through app-level mutation)
    await t.mutation(internal.contexts.agent.handlers.onComplete.ignoreDeadLetter, {
      eventId: "evt_test_1",
      reason: "Test ignore",
    });

    // Another failure for same eventId — should NOT update (terminal state)
    await t.mutation(internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete, {
      workId: "work_5b",
      context: baseContext,
      result: { kind: "failed", error: "Should not overwrite" },
    });

    const updated = await getDeadLetterByEventId(t, "evt_test_1");
    expect(updated!.status).toBe("ignored");
    expect(updated!.attemptCount).toBe(1);
    expect(updated!.error).toBe("Original error");
  });
});
