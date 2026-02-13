/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    approvals: {
      approve: FunctionReference<
        "mutation",
        "internal",
        { approvalId: string; reviewNote?: string; reviewerId: string },
        any,
        Name
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          action: { payload: any; type: string };
          agentId: string;
          approvalId: string;
          confidence: number;
          decisionId: string;
          expiresAt: number;
          reason: string;
          triggeringEventIds: Array<string>;
        },
        any,
        Name
      >;
      expirePending: FunctionReference<"mutation", "internal", {}, any, Name>;
      getById: FunctionReference<
        "query",
        "internal",
        { approvalId: string },
        any,
        Name
      >;
      queryApprovals: FunctionReference<
        "query",
        "internal",
        {
          agentId?: string;
          limit?: number;
          status?: "pending" | "approved" | "rejected" | "expired";
        },
        any,
        Name
      >;
      reject: FunctionReference<
        "mutation",
        "internal",
        { approvalId: string; reviewNote?: string; reviewerId: string },
        any,
        Name
      >;
    };
    audit: {
      getByDecisionId: FunctionReference<
        "query",
        "internal",
        { decisionId: string },
        any,
        Name
      >;
      queryByAgent: FunctionReference<
        "query",
        "internal",
        {
          agentId: string;
          eventType?:
            | "PatternDetected"
            | "CommandEmitted"
            | "ApprovalRequested"
            | "ApprovalGranted"
            | "ApprovalRejected"
            | "ApprovalExpired"
            | "DeadLetterRecorded"
            | "CheckpointUpdated"
            | "AgentCommandRouted"
            | "AgentCommandRoutingFailed"
            | "AgentStarted"
            | "AgentPaused"
            | "AgentResumed"
            | "AgentStopped"
            | "AgentReconfigured"
            | "AgentErrorRecoveryStarted"
            | "AgentAnalysisFailed";
          limit?: number;
        },
        any,
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          decisionId: string;
          eventType:
            | "PatternDetected"
            | "CommandEmitted"
            | "ApprovalRequested"
            | "ApprovalGranted"
            | "ApprovalRejected"
            | "ApprovalExpired"
            | "DeadLetterRecorded"
            | "CheckpointUpdated"
            | "AgentCommandRouted"
            | "AgentCommandRoutingFailed"
            | "AgentStarted"
            | "AgentPaused"
            | "AgentResumed"
            | "AgentStopped"
            | "AgentReconfigured"
            | "AgentErrorRecoveryStarted"
            | "AgentAnalysisFailed";
          payload: any;
          timestamp: number;
        },
        any,
        Name
      >;
    };
    checkpoints: {
      getByAgentAndSubscription: FunctionReference<
        "query",
        "internal",
        { agentId: string; subscriptionId: string },
        any,
        Name
      >;
      getByAgentId: FunctionReference<
        "query",
        "internal",
        { agentId: string },
        any,
        Name
      >;
      listActive: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        any,
        Name
      >;
      loadOrCreate: FunctionReference<
        "mutation",
        "internal",
        { agentId: string; subscriptionId: string },
        any,
        Name
      >;
      patchConfigOverrides: FunctionReference<
        "mutation",
        "internal",
        { agentId: string; configOverrides: any },
        any,
        Name
      >;
      transitionLifecycle: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          auditEvent: {
            decisionId: string;
            eventType:
              | "PatternDetected"
              | "CommandEmitted"
              | "ApprovalRequested"
              | "ApprovalGranted"
              | "ApprovalRejected"
              | "ApprovalExpired"
              | "DeadLetterRecorded"
              | "CheckpointUpdated"
              | "AgentCommandRouted"
              | "AgentCommandRoutingFailed"
              | "AgentStarted"
              | "AgentPaused"
              | "AgentResumed"
              | "AgentStopped"
              | "AgentReconfigured"
              | "AgentErrorRecoveryStarted"
              | "AgentAnalysisFailed";
            payload: any;
            timestamp: number;
          };
          status: "active" | "paused" | "stopped" | "error_recovery";
        },
        any,
        Name
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          incrementEventsProcessed?: boolean;
          lastEventId: string;
          lastProcessedPosition: number;
          subscriptionId: string;
        },
        any,
        Name
      >;
      updateStatus: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          status: "active" | "paused" | "stopped" | "error_recovery";
        },
        any,
        Name
      >;
    };
    commands: {
      getByDecisionId: FunctionReference<
        "query",
        "internal",
        { decisionId: string },
        any,
        Name
      >;
      getPending: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        any,
        Name
      >;
      queryByAgent: FunctionReference<
        "query",
        "internal",
        {
          agentId: string;
          limit?: number;
          status?: "pending" | "processing" | "completed" | "failed";
        },
        any,
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          confidence: number;
          correlationId?: string;
          decisionId: string;
          patternId?: string;
          payload: any;
          reason: string;
          routingAttempts?: number;
          triggeringEventIds: Array<string>;
          type: string;
        },
        any,
        Name
      >;
      updateStatus: FunctionReference<
        "mutation",
        "internal",
        {
          decisionId: string;
          error?: string;
          incrementRoutingAttempts?: boolean;
          status: "pending" | "processing" | "completed" | "failed";
        },
        any,
        Name
      >;
    };
    deadLetters: {
      getStats: FunctionReference<"query", "internal", {}, any, Name>;
      queryByAgent: FunctionReference<
        "query",
        "internal",
        {
          agentId: string;
          limit?: number;
          status?: "pending" | "replayed" | "ignored";
        },
        any,
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          agentId: string;
          attemptCount: number;
          context?: {
            correlationId?: string;
            errorCode?: string;
            ignoreReason?: string;
          };
          error: string;
          eventId: string;
          globalPosition: number;
          subscriptionId: string;
          workId?: string;
        },
        any,
        Name
      >;
      updateStatus: FunctionReference<
        "mutation",
        "internal",
        {
          eventId: string;
          ignoreReason?: string;
          newStatus: "pending" | "replayed" | "ignored";
        },
        any,
        Name
      >;
    };
  };
