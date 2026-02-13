/**
 * Agent onComplete Handler Factory — Action/Mutation Split Pattern
 *
 * Creates the MUTATION half of the Workpool action/mutation split.
 * The onComplete handler:
 * - Receives the AgentActionResult from the action via Workpool
 * - Persists audit events, commands, approvals via the agent component API
 * - Updates the checkpoint LAST (maximizes OCC conflict detection window)
 * - Never throws (NO-THROW ZONE) -- failures are dead-lettered
 *
 * Design decisions:
 * - AD-5: onComplete data contract -- action returns AgentActionResult,
 *         context carries AgentWorkpoolContext
 * - AD-6: Idempotency -- onComplete checks checkpoint position via OCC
 * - AD-7: Persistence ordering -- checkpoint updated LAST
 * - AD-8: Separate factory from action handler
 *
 * @module agent/oncomplete-handler
 */

import type { FunctionReference } from "convex/server";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";
import type { AgentActionResult } from "./action-handler.js";
import { DEFAULT_APPROVAL_TIMEOUT_MS } from "./approval.js";
import type { AgentComponentAPI, RunMutationCtx } from "./handler-types.js";

// ============================================================================
// Workpool Context Type
// ============================================================================

/**
 * Event metadata carried through Workpool context.
 *
 * Set when EventBus enqueues the action via Workpool. Available in
 * the onComplete handler as `args.context`.
 *
 * Provides the onComplete handler with everything needed to:
 * - Update the checkpoint (agentId, subscriptionId, globalPosition)
 * - Record audit events (eventId, eventType, correlationId)
 * - Create dead letters (all fields)
 *
 * @example
 * ```typescript
 * // Set during EventBus dispatch:
 * await workpool.enqueueAction(ctx, handler, args, {
 *   onComplete: onCompleteRef,
 *   context: {
 *     agentId: "churn-risk-agent",
 *     subscriptionId: "sub_churn-risk-agent_1706140800000",
 *     eventId: "evt_abc123",
 *     eventType: "OrderCancelled",
 *     globalPosition: 42,
 *     correlationId: "corr_xyz",
 *     causationId: "evt_abc123",
 *     streamId: "ord_456",
 *     streamType: "Order",
 *     boundedContext: "orders",
 *   },
 * });
 * ```
 */
export interface AgentWorkpoolContext {
  /** Agent BC identifier */
  readonly agentId: string;

  /** Subscription identifier for checkpoint tracking */
  readonly subscriptionId: string;

  /** Event ID that triggered this processing */
  readonly eventId: string;

  /** Event type (e.g., "OrderCancelled") */
  readonly eventType: string;

  /** Global position in event store -- used for checkpoint advancement */
  readonly globalPosition: number;

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** Causation ID (typically the event ID) */
  readonly causationId: string;

  /** Stream instance ID (e.g., "ord_456") */
  readonly streamId: string;

  /** Stream type (e.g., "Order") */
  readonly streamType: string;

  /** Bounded context that emitted the event */
  readonly boundedContext: string;
}

// ============================================================================
// onComplete Args Type
// ============================================================================

/**
 * Arguments received by the onComplete handler.
 *
 * Follows the Workpool onComplete contract:
 * `vOnCompleteArgs(contextValidator)` -> `{ workId, context, result }`
 *
 * The `result` is a discriminated union:
 * - `{ kind: "success", returnValue: AgentActionResult | null }` -- action completed
 * - `{ kind: "failed", error: string }` -- action threw after all retries
 * - `{ kind: "canceled" }` -- work was canceled
 */
export interface AgentOnCompleteArgs {
  /** Workpool work item ID */
  readonly workId: string;

  /** Event metadata set during dispatch */
  readonly context: AgentWorkpoolContext;

  /** Action execution result (discriminated union) */
  readonly result:
    | { readonly kind: "success"; readonly returnValue: AgentActionResult | null }
    | { readonly kind: "failed"; readonly error: string }
    | { readonly kind: "canceled" };
}

// Re-export AgentComponentAPI so existing imports from this module still work
export type { AgentComponentAPI } from "./handler-types.js";

// ============================================================================
// Factory Configuration
// ============================================================================

/**
 * Configuration for the onComplete handler factory.
 *
 * The factory creates a handler function that:
 * 1. Checks result.kind
 * 2. On success: persists audit -> command -> approval -> checkpoint (LAST)
 * 3. On failure: creates dead letter, does NOT advance checkpoint
 * 4. On canceled: logs, does NOT advance checkpoint
 *
 * All persistence uses the agent component API (AD-7).
 */
export interface AgentOnCompleteConfig {
  /**
   * Agent component API references.
   * Provides access to component mutation/query handlers.
   */
  readonly agentComponent: AgentComponentAPI;

  /**
   * Logger instance for onComplete operations.
   */
  readonly logger?: Logger;

  /** Approval timeout in milliseconds. Defaults to 24 hours (86400000ms). */
  readonly approvalTimeoutMs?: number;

  /**
   * Reference to the command bridge mutation.
   *
   * When provided, the onComplete handler schedules command routing
   * via ctx.scheduler.runAfter(0, routeCommandRef, args) for any
   * agent decision that emits a command (and does not require approval).
   *
   * If not provided, commands remain in "pending" status and must be
   * routed manually or by an external process.
   */
  readonly routeCommandRef?: FunctionReference<"mutation">;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an agent onComplete handler.
 *
 * Returns the handler function (NOT a registered internalMutation -- registration
 * happens at the app level using `internalMutation({ args, handler })`).
 *
 * WARNING -- NO-THROW ZONE: If the onComplete mutation throws a non-OCC error,
 * it rolls back silently. The Workpool considers the work "done" -- no
 * re-dispatch occurs. Every operation MUST be wrapped in try-catch. Failures
 * must be logged and dead-lettered, never thrown.
 *
 * Persistence order (AD-7 -- checkpoint updated LAST):
 * 1. On success:
 *    a. Load-or-create checkpoint (idempotency check)
 *    b. Record audit event via agent component (idempotent by decisionId)
 *    c. Record command if decision includes one (idempotent by decisionId)
 *    d. Create approval if decision.requiresApproval
 *    e. Update checkpoint to event's globalPosition (LAST)
 * 2. On failure:
 *    a. Record dead letter via agent component
 *    b. Record AgentAnalysisFailed audit event
 *    c. Do NOT advance checkpoint (event eligible for replay)
 * 3. On canceled:
 *    a. Log cancellation
 *    b. Do NOT advance checkpoint
 *
 * @typeParam TCtx - The mutation context type (e.g., Convex MutationCtx)
 * @param config - onComplete handler configuration
 * @returns Handler function to wrap in internalMutation
 *
 * @example
 * ```typescript
 * const handler = createAgentOnCompleteHandler({
 *   agentComponent: {
 *     checkpoints: {
 *       loadOrCreate: components.agentBC.checkpoints.loadOrCreate,
 *       update: components.agentBC.checkpoints.update,
 *     },
 *     audit: { record: components.agentBC.audit.record },
 *     commands: { record: components.agentBC.commands.record },
 *     approvals: { create: components.agentBC.approvals.create },
 *     deadLetters: { record: components.agentBC.deadLetters.record },
 *   },
 * });
 *
 * // Register at the app level:
 * export const onAgentComplete = internalMutation({
 *   args: vOnCompleteArgs(agentWorkpoolContextValidator),
 *   handler,
 * });
 * ```
 */
export function createAgentOnCompleteHandler<TCtx = unknown>(
  config: AgentOnCompleteConfig
): (ctx: TCtx, args: AgentOnCompleteArgs) => Promise<void> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const comp = config.agentComponent;
  const approvalTimeoutMs = config.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;

  return async (ctx: TCtx, { workId, context, result }: AgentOnCompleteArgs): Promise<void> => {
    const { agentId, subscriptionId, eventId, globalPosition } = context;
    const mutCtx = ctx as RunMutationCtx;

    // ----------------------------------------------------------------
    // Handle canceled -- nothing to persist
    // ----------------------------------------------------------------
    if (result.kind === "canceled") {
      logger.debug("Agent work canceled", { agentId, eventId, workId });
      return;
    }

    // ----------------------------------------------------------------
    // Handle failure -- create dead letter, do NOT advance checkpoint
    // ----------------------------------------------------------------
    if (result.kind === "failed") {
      logger.warn("Agent action failed", {
        agentId,
        eventId,
        error: result.error,
        workId,
      });
      try {
        // Record dead letter
        await mutCtx.runMutation(comp.deadLetters.record, {
          agentId,
          subscriptionId,
          eventId,
          globalPosition,
          error: result.error,
          // Workpool's onComplete does not surface the retry attempt count.
          // The actual retry count is tracked internally by Workpool.
          attemptCount: 1,
          workId,
        });
      } catch (dlError) {
        // NO-THROW: log but do not rethrow
        logger.error("Failed to record dead letter for action failure", {
          agentId,
          eventId,
          error: dlError instanceof Error ? dlError.message : String(dlError),
        });
      }

      try {
        // Record failure audit event
        await mutCtx.runMutation(comp.audit.record, {
          eventType: "AgentAnalysisFailed",
          agentId,
          decisionId: `fail_${agentId}_${globalPosition}`,
          timestamp: Date.now(),
          payload: {
            error: result.error,
            sourceEventId: eventId,
          },
        });
      } catch (auditError) {
        // NO-THROW: log but do not rethrow
        logger.error("Failed to record failure audit event", {
          agentId,
          eventId,
          error: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }
      return;
    }

    // ----------------------------------------------------------------
    // Success path
    // ----------------------------------------------------------------
    const actionResult = result.returnValue;

    // Null result means event was skipped (idempotency/inactive agent)
    if (!actionResult) {
      return;
    }

    const { decisionId, decision, analysisMethod, llmMetrics } = actionResult;

    try {
      // Idempotency check (AD-6) -- load-or-create enters the OCC write set
      // immediately, which is correct since we always want to update the checkpoint.
      const checkpointResult = await mutCtx.runMutation(comp.checkpoints.loadOrCreate, {
        agentId,
        subscriptionId,
      });

      // Extract checkpoint from the component response
      const checkpoint = (checkpointResult as { checkpoint?: { lastProcessedPosition: number } })
        ?.checkpoint;
      if (!checkpoint) {
        logger.error("Checkpoint unavailable in onComplete success path", { agentId, eventId });
        return;
      }

      if (checkpoint.lastProcessedPosition >= globalPosition) {
        logger.debug("Event already processed in onComplete, skipping", {
          agentId,
          eventId,
          globalPosition,
          checkpointPosition: checkpoint.lastProcessedPosition,
        });
        return;
      }

      // 1. Record audit event (idempotent by decisionId)
      if (decision) {
        try {
          await mutCtx.runMutation(comp.audit.record, {
            eventType: "PatternDetected",
            agentId,
            decisionId,
            timestamp: Date.now(),
            payload: {
              patternDetected: decision.command ? decision.command : null,
              confidence: decision.confidence,
              reasoning: decision.reason,
              analysisMethod,
              action: decision.command
                ? {
                    type: decision.command,
                    executionMode: decision.requiresApproval ? "flag-for-review" : "auto-execute",
                  }
                : null,
              triggeringEvents: decision.triggeringEvents,
              sourceEventId: eventId,
              ...(llmMetrics ? { llmMetrics } : {}),
            },
          });
        } catch (auditError) {
          logger.error("Failed to record audit in onComplete", {
            agentId,
            decisionId,
            error: auditError instanceof Error ? auditError.message : String(auditError),
          });
          // Continue -- do not fail the whole onComplete for audit
        }

        // 2. Record command if decision includes one
        if (decision.command) {
          try {
            await mutCtx.runMutation(comp.commands.record, {
              agentId,
              decisionId,
              commandType: decision.command,
              payload: {
                confidence: decision.confidence,
                reason: decision.reason,
                triggeringEventIds: decision.triggeringEvents ?? [],
              },
              status: decision.requiresApproval ? "pending_approval" : "pending",
            });
          } catch (cmdError) {
            logger.error("Failed to record command in onComplete", {
              agentId,
              decisionId,
              error: cmdError instanceof Error ? cmdError.message : String(cmdError),
            });
          }

          // 2b. Enqueue command routing (if bridge configured and not pending approval)
          if (config.routeCommandRef && !decision.requiresApproval) {
            try {
              await mutCtx.scheduler!.runAfter(0, config.routeCommandRef, {
                decisionId,
                commandType: decision.command,
                agentId,
                correlationId: context.correlationId,
                ...(actionResult.patternId ? { patternId: actionResult.patternId } : {}),
              });
            } catch (routeErr) {
              // NO-THROW: routing failure does not block checkpoint advancement
              logger.warn("Failed to enqueue command routing", {
                agentId,
                decisionId,
                error: routeErr instanceof Error ? routeErr.message : String(routeErr),
              });
            }
          }
        }

        // 3. Create approval if needed
        if (decision.requiresApproval && decision.command) {
          try {
            await mutCtx.runMutation(comp.approvals.create, {
              approvalId: `apr_${decisionId}`,
              agentId,
              decisionId,
              action: { type: decision.command ?? "unknown" },
              confidence: decision.confidence,
              reason: decision.reason,
              triggeringEventIds: decision.triggeringEvents ?? [],
              expiresAt: Date.now() + approvalTimeoutMs,
            });
          } catch (aprError) {
            logger.error("Failed to create approval in onComplete", {
              agentId,
              decisionId,
              error: aprError instanceof Error ? aprError.message : String(aprError),
            });
          }
        }
      }

      // 4. Update checkpoint -- LAST (maximizes OCC conflict detection window, AD-7)
      await mutCtx.runMutation(comp.checkpoints.update, {
        agentId,
        subscriptionId,
        lastProcessedPosition: globalPosition,
        lastEventId: eventId,
        incrementEventsProcessed: true,
      });
    } catch (error) {
      // NO-THROW: Catch-all for unexpected errors in the success path
      logger.error("Unexpected error in agent onComplete", {
        agentId,
        eventId,
        decisionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Try to create a dead letter as last resort
      try {
        await mutCtx.runMutation(comp.deadLetters.record, {
          agentId,
          subscriptionId,
          eventId,
          globalPosition,
          error: error instanceof Error ? error.message : String(error),
          // Workpool's onComplete does not surface the retry attempt count.
          // The actual retry count is tracked internally by Workpool.
          attemptCount: 1,
          workId,
        });
      } catch (dlFallbackError) {
        // Truly nothing more we can do
        logger.error("Failed to record dead letter in catch-all", {
          agentId,
          eventId,
          error:
            dlFallbackError instanceof Error ? dlFallbackError.message : String(dlFallbackError),
        });
      }
    }
  };
}
