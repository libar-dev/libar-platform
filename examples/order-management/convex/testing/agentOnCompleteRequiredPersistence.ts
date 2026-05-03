import { internalAction, internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { vOnCompleteValidator } from "@convex-dev/workpool";
import {
  ensureTestEnvironment,
  createPlatformNoOpLogger,
  createAgentOnCompleteHandler,
} from "@libar-dev/platform-core";
import { compatGlobalPositionValidator } from "../lib/globalPosition";
import {
  parseApprovalTimeout,
  DEFAULT_APPROVAL_TIMEOUT_MS,
} from "../../../../packages/platform-core/src/agent/approval.js";
import { churnRiskAgentConfig } from "../contexts/agent/_config.js";
import { agentComponent } from "../contexts/agent/_component.js";
import { agentPool } from "../pools.js";

const MODE_VALIDATOR = v.union(
  v.literal("auditFailure"),
  v.literal("commandFailure"),
  v.literal("approvalFailure"),
  v.literal("nullResult")
);

const onCompleteContextValidator = v.object({
  agentId: v.string(),
  subscriptionId: v.string(),
  eventId: v.string(),
  eventType: v.string(),
  globalPosition: compatGlobalPositionValidator,
  correlationId: v.string(),
  causationId: v.string(),
  streamId: v.string(),
  streamType: v.string(),
  boundedContext: v.string(),
});

const actionRef = makeFunctionReference<"action">(
  "testing/agentOnCompleteRequiredPersistence:testAgentOnCompleteAction"
) as unknown as FunctionReference<"action", "internal">;

const onCompleteAuditFailureRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:onCompleteAuditFailure"
) as unknown as FunctionReference<"mutation", "internal">;

const onCompleteCommandFailureRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:onCompleteCommandFailure"
) as unknown as FunctionReference<"mutation", "internal">;

const onCompleteApprovalFailureRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:onCompleteApprovalFailure"
) as unknown as FunctionReference<"mutation", "internal">;

const onCompleteNullResultRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:onCompleteNullResult"
) as unknown as FunctionReference<"mutation", "internal">;

const onCompleteRefsByMode = {
  auditFailure: onCompleteAuditFailureRef,
  commandFailure: onCompleteCommandFailureRef,
  approvalFailure: onCompleteApprovalFailureRef,
  nullResult: onCompleteNullResultRef,
} as const;

const approvalTimeoutMs = churnRiskAgentConfig.humanInLoop?.approvalTimeout
  ? (parseApprovalTimeout(churnRiskAgentConfig.humanInLoop.approvalTimeout) ??
    DEFAULT_APPROVAL_TIMEOUT_MS)
  : DEFAULT_APPROVAL_TIMEOUT_MS;

const failAuditRecordRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:failAuditRecord"
) as unknown as FunctionReference<"mutation">;

const failCommandRecordRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:failCommandRecord"
) as unknown as FunctionReference<"mutation">;

const failApprovalCreateRef = makeFunctionReference<"mutation">(
  "testing/agentOnCompleteRequiredPersistence:failApprovalCreate"
) as unknown as FunctionReference<"mutation">;

function buildActionResult(
  mode: "auditFailure" | "commandFailure" | "approvalFailure",
  decisionId: string,
  eventId: string
) {
  if (mode === "auditFailure") {
    return {
      decisionId,
      decision: {
        command: null,
        payload: {},
        confidence: 0.61,
        reason: "Audit persistence should fail before command creation",
        requiresApproval: false,
        triggeringEvents: [eventId],
      },
      analysisMethod: "rule-based" as const,
      patternId: `pattern_${mode}`,
    };
  }

  if (mode === "commandFailure") {
    return {
      decisionId,
      decision: {
        command: "SuggestCustomerOutreach",
        payload: { customerId: `cust_${decisionId}` },
        confidence: 0.84,
        reason: "Command persistence should fail after audit succeeds",
        requiresApproval: false,
        triggeringEvents: [eventId],
      },
      analysisMethod: "rule-based" as const,
      patternId: `pattern_${mode}`,
    };
  }

  return {
    decisionId,
    decision: {
      command: "SuggestCustomerOutreach",
      payload: { customerId: `cust_${decisionId}` },
      confidence: 0.91,
      reason: "Approval persistence should fail after audit and command succeed",
      requiresApproval: true,
      triggeringEvents: [eventId],
    },
    analysisMethod: "rule-based" as const,
    patternId: `pattern_${mode}`,
  };
}

function createOnCompleteMutation(overrides?: {
  auditRecord?: FunctionReference<"mutation">;
  commandRecord?: FunctionReference<"mutation">;
  approvalCreate?: FunctionReference<"mutation">;
}) {
  const commands = {
    record: overrides?.commandRecord ?? agentComponent.commands.record,
    ...(agentComponent.commands.updateStatus
      ? { updateStatus: agentComponent.commands.updateStatus }
      : {}),
  };

  return createAgentOnCompleteHandler<MutationCtx>({
    agentComponent: {
      checkpoints: agentComponent.checkpoints,
      audit: { record: overrides?.auditRecord ?? agentComponent.audit.record },
      commands,
      approvals: { create: overrides?.approvalCreate ?? agentComponent.approvals.create },
      deadLetters: agentComponent.deadLetters,
    },
    logger: createPlatformNoOpLogger(),
    approvalTimeoutMs,
  });
}

const auditFailureHandler = createOnCompleteMutation({ auditRecord: failAuditRecordRef });
const commandFailureHandler = createOnCompleteMutation({ commandRecord: failCommandRecordRef });
const approvalFailureHandler = createOnCompleteMutation({ approvalCreate: failApprovalCreateRef });
const nullResultHandler = createOnCompleteMutation();

export const testAgentOnCompleteAction = internalAction({
  args: {
    mode: MODE_VALIDATOR,
    decisionId: v.string(),
    eventId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      decisionId: v.string(),
      decision: v.union(
        v.null(),
        v.object({
          command: v.union(v.string(), v.null()),
          payload: v.any(),
          confidence: v.number(),
          reason: v.string(),
          requiresApproval: v.boolean(),
          triggeringEvents: v.array(v.string()),
        })
      ),
      analysisMethod: v.union(v.literal("llm"), v.literal("rule-based")),
      patternId: v.optional(v.string()),
      llmMetrics: v.optional(
        v.object({
          model: v.string(),
          tokens: v.number(),
          durationMs: v.number(),
          threadId: v.optional(v.string()),
        })
      ),
      error: v.optional(v.string()),
    })
  ),
  handler: async (_ctx, { mode, decisionId, eventId }) => {
    ensureTestEnvironment();

    if (mode === "nullResult") {
      return null;
    }

    return buildActionResult(mode, decisionId, eventId);
  },
});

export const failAuditRecord = internalMutation({
  args: v.any(),
  returns: v.null(),
  handler: async () => {
    ensureTestEnvironment();
    throw new Error("Audit store unavailable");
  },
});

export const failCommandRecord = internalMutation({
  args: v.any(),
  returns: v.null(),
  handler: async () => {
    ensureTestEnvironment();
    throw new Error("Command store unavailable");
  },
});

export const failApprovalCreate = internalMutation({
  args: v.any(),
  returns: v.null(),
  handler: async () => {
    ensureTestEnvironment();
    throw new Error("Approval store unavailable");
  },
});

export const onCompleteAuditFailure = internalMutation({
  args: vOnCompleteValidator(onCompleteContextValidator),
  returns: v.null(),
  handler: async (ctx, args) => {
    await auditFailureHandler(ctx, args);
    return null;
  },
});

export const onCompleteCommandFailure = internalMutation({
  args: vOnCompleteValidator(onCompleteContextValidator),
  returns: v.null(),
  handler: async (ctx, args) => {
    await commandFailureHandler(ctx, args);
    return null;
  },
});

export const onCompleteApprovalFailure = internalMutation({
  args: vOnCompleteValidator(onCompleteContextValidator),
  returns: v.null(),
  handler: async (ctx, args) => {
    await approvalFailureHandler(ctx, args);
    return null;
  },
});

export const onCompleteNullResult = internalMutation({
  args: vOnCompleteValidator(onCompleteContextValidator),
  returns: v.null(),
  handler: async (ctx, args) => {
    await nullResultHandler(ctx, args);
    return null;
  },
});

export const enqueueAgentOnCompleteRequiredPersistenceWork = mutation({
  args: {
    mode: MODE_VALIDATOR,
    agentId: v.string(),
    subscriptionId: v.string(),
    eventId: v.string(),
    globalPosition: compatGlobalPositionValidator,
    correlationId: v.string(),
    streamId: v.string(),
    streamType: v.string(),
    boundedContext: v.string(),
  },
  returns: v.object({
    enqueued: v.boolean(),
    decisionId: v.string(),
    approvalId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const decisionId = `dec_${args.agentId}_${args.globalPosition}_${args.mode}`;
    const onCompleteRef = onCompleteRefsByMode[args.mode];

    await agentPool.enqueueAction(
      ctx,
      actionRef,
      {
        mode: args.mode,
        decisionId,
        eventId: args.eventId,
      },
      {
        onComplete: onCompleteRef,
        retry: false,
        context: {
          agentId: args.agentId,
          subscriptionId: args.subscriptionId,
          eventId: args.eventId,
          eventType: "OrderCancelled",
          globalPosition: args.globalPosition,
          correlationId: args.correlationId,
          causationId: args.eventId,
          streamId: args.streamId,
          streamType: args.streamType,
          boundedContext: args.boundedContext,
        },
      }
    );

    return {
      enqueued: true,
      decisionId,
      ...(args.mode === "approvalFailure" ? { approvalId: `apr_${decisionId}` } : {}),
    };
  },
});
