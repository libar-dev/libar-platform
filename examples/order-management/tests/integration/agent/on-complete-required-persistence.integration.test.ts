import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { waitUntil, DEFAULT_TIMEOUT_MS } from "../../support/localBackendHelpers";
import { testMutation, testQuery } from "../../support/integrationHelpers";

declare const process: {
  env: Record<string, string | undefined>;
};

const enqueueRequiredPersistenceWorkRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:enqueueAgentOnCompleteRequiredPersistenceWork"
) as unknown as FunctionReference<"mutation">;

type RequiredPersistenceMode = "auditFailure" | "commandFailure" | "approvalFailure" | "nullResult";

const TEST_TIMEOUT_MS = DEFAULT_TIMEOUT_MS * 1.5;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForPendingDeadLetter(t: ConvexTestingHelper, agentId: string, eventId: string) {
  return await waitUntil(
    async () => {
      const deadLetters = (await testQuery(t, api.queries.agent.getDeadLetters, {
        agentId,
        status: "pending",
        limit: 20,
      })) as Array<{ eventId: string; context?: { correlationId?: string; errorCode?: string } }>;

      return (
        deadLetters.find((deadLetter: { eventId: string }) => deadLetter.eventId === eventId) ??
        null
      );
    },
    {
      message: `pending dead letter for ${agentId}/${eventId}`,
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: 200,
    }
  );
}

async function waitForCheckpointPosition(
  t: ConvexTestingHelper,
  agentId: string,
  expectedPosition: number
) {
  return await waitUntil(
    async () => {
      const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
        agentId,
      });

      return checkpoint?.lastProcessedPosition === expectedPosition ? checkpoint : null;
    },
    {
      message: `checkpoint ${agentId} to reach ${expectedPosition}`,
      timeoutMs: TEST_TIMEOUT_MS,
      pollIntervalMs: 200,
    }
  );
}

async function enqueueScenario(
  t: ConvexTestingHelper,
  mode: RequiredPersistenceMode,
  overrides: Partial<{
    agentId: string;
    subscriptionId: string;
    eventId: string;
    globalPosition: number;
    correlationId: string;
    streamId: string;
  }> = {}
) {
  const agentId = overrides.agentId ?? generateId("agent");
  const subscriptionId = overrides.subscriptionId ?? generateId("sub");
  const eventId = overrides.eventId ?? generateId("evt");
  const globalPosition = overrides.globalPosition ?? Math.floor(Date.now() % 1000000);
  const correlationId = overrides.correlationId ?? generateId("corr");
  const streamId = overrides.streamId ?? generateId("ord");

  const enqueueResult = await testMutation(t, enqueueRequiredPersistenceWorkRef, {
    mode,
    agentId,
    subscriptionId,
    eventId,
    globalPosition,
    correlationId,
    streamId,
    streamType: "Order",
    boundedContext: "orders",
  });

  return {
    agentId,
    subscriptionId,
    eventId,
    globalPosition,
    correlationId,
    streamId,
    enqueueResult,
  };
}

describe("Agent onComplete required persistence integration", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    });
  });

  afterEach(async () => {
    await t.close();
  });

  it("dead-letters and skips checkpoint advancement when audit persistence fails", async () => {
    const run = await enqueueScenario(t, "auditFailure");

    const deadLetter = await waitForPendingDeadLetter(t, run.agentId, run.eventId);
    if (!deadLetter) {
      throw new Error("expected audit failure dead letter");
    }
    expect(deadLetter.context?.correlationId).toBe(run.correlationId);
    expect(deadLetter.context?.errorCode).toBe("AGENT_ONCOMPLETE_REQUIRED_PERSISTENCE_FAILED");

    const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
      agentId: run.agentId,
    });
    expect(checkpoint?.lastProcessedPosition).toBe(-1);
    expect(checkpoint?.eventsProcessed).toBe(0);

    const audit = await testQuery(t, api.testingFunctions.getAgentAuditEventByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });
    const command = await testQuery(t, api.testingFunctions.getAgentCommandByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });

    expect(audit).toBeNull();
    expect(command).toBeNull();
  });

  it("dead-letters after audit when command persistence fails and leaves checkpoint unchanged", async () => {
    const run = await enqueueScenario(t, "commandFailure");

    const deadLetter = await waitForPendingDeadLetter(t, run.agentId, run.eventId);
    if (!deadLetter) {
      throw new Error("expected command failure dead letter");
    }
    expect(deadLetter.context?.errorCode).toBe("AGENT_ONCOMPLETE_REQUIRED_PERSISTENCE_FAILED");

    const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
      agentId: run.agentId,
    });
    expect(checkpoint?.lastProcessedPosition).toBe(-1);
    expect(checkpoint?.eventsProcessed).toBe(0);

    const audit = await testQuery(t, api.testingFunctions.getAgentAuditEventByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });
    const command = await testQuery(t, api.testingFunctions.getAgentCommandByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });

    expect(audit).not.toBeNull();
    expect(command).toBeNull();
  });

  it("dead-letters after audit and command when approval persistence fails", async () => {
    const run = await enqueueScenario(t, "approvalFailure");

    const deadLetter = await waitForPendingDeadLetter(t, run.agentId, run.eventId);
    if (!deadLetter) {
      throw new Error("expected approval failure dead letter");
    }
    expect(deadLetter.context?.errorCode).toBe("AGENT_ONCOMPLETE_REQUIRED_PERSISTENCE_FAILED");

    const checkpoint = await testQuery(t, api.queries.agent.getCheckpoint, {
      agentId: run.agentId,
    });
    expect(checkpoint?.lastProcessedPosition).toBe(-1);
    expect(checkpoint?.eventsProcessed).toBe(0);

    const audit = await testQuery(t, api.testingFunctions.getAgentAuditEventByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });
    const command = await testQuery(t, api.testingFunctions.getAgentCommandByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });
    const approval = await testQuery(t, api.queries.agent.getApprovalById, {
      approvalId: run.enqueueResult.approvalId!,
    });

    expect(audit).not.toBeNull();
    expect(command).not.toBeNull();
    expect(approval).toBeNull();
  });

  it("advances checkpoint once for null results without dead-lettering", async () => {
    const run = await enqueueScenario(t, "nullResult");

    const checkpoint = await waitForCheckpointPosition(t, run.agentId, run.globalPosition);
    expect(checkpoint.eventsProcessed).toBe(1);
    expect(checkpoint.lastEventId).toBe(run.eventId);

    const deadLetters = (await testQuery(t, api.queries.agent.getDeadLetters, {
      agentId: run.agentId,
      status: "pending",
      limit: 20,
    })) as Array<{ eventId: string }>;
    const audit = await testQuery(t, api.testingFunctions.getAgentAuditEventByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });
    const command = await testQuery(t, api.testingFunctions.getAgentCommandByDecisionId, {
      decisionId: run.enqueueResult.decisionId,
    });

    expect(
      deadLetters.find((deadLetter: { eventId: string }) => deadLetter.eventId === run.eventId)
    ).toBeUndefined();
    expect(audit).toBeNull();
    expect(command).toBeNull();
  });
});
