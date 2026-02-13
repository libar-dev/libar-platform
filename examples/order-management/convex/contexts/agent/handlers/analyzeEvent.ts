/**
 * @libar-docs
 * @libar-docs-pattern AgentActionHandler
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role command-handler
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer application
 * @libar-docs-uses AgentLLMIntegration, AgentBCComponentIsolation
 *
 * Agent action handler for churn risk detection.
 * This is the ACTION half of the action/mutation split pattern.
 * Runs in Workpool action context -- can call external APIs (LLM).
 * All persistence happens in the onComplete mutation.
 *
 * Architecture:
 * - internalAction (NOT mutation) -- actions can call external APIs
 * - Uses createAgentActionHandler factory from platform-core/agent
 * - Loads state via ctx.runQuery (actions cannot use ctx.db)
 * - Returns AgentActionResult (no persistence -- that is onComplete's job)
 *
 * @see onComplete.ts for the mutation half (persistence)
 * @since Phase 22b (AgentLLMIntegration)
 */

"use node";

import { internalAction } from "../../../_generated/server.js";
import type { ActionCtx } from "../../../_generated/server.js";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "../../../_generated/api.js";
import {
  createAgentActionHandler,
  type AgentActionResult,
  type AgentEventHandlerArgs,
} from "@libar-dev/platform-core/agent";
import { createOpenRouterAgentRuntime } from "../_llm/index.js";
import { churnRiskAgentConfig } from "../_config.js";
import {
  createPlatformNoOpLogger,
  type PublishedEvent,
  type SafeQueryRef,
} from "@libar-dev/platform-core";

// TS2589 Prevention: Declare function references at module level
const getCancellationsByCustomerRef = makeFunctionReference<"query">(
  "projections/customers/customerCancellations:getByCustomerId"
) as SafeQueryRef;

// ============================================================================
// Action Handler
// ============================================================================

/**
 * Analyze churn risk for an incoming event.
 *
 * This action:
 * 1. Loads the agent checkpoint from the agent component
 * 2. Checks idempotency (skips already-processed events)
 * 3. Calls the agent's pattern-based handler for rule-based decisions
 * 4. Optionally enriches with LLM analysis (when OPENROUTER_API_KEY is set)
 * 5. Returns AgentActionResult (NO persistence -- that is onComplete's job)
 *
 * The Workpool dispatches this action and calls onComplete when it finishes.
 * On success, onComplete persists audit, command, approval, and checkpoint.
 * On failure, onComplete creates a dead letter entry.
 *
 * @example
 * ```typescript
 * // Registered via EventBus subscription (action variant)
 * const subscription = createAgentSubscription(churnRiskAgentConfig, {
 *   actionHandler: analyzeChurnRiskEventRef,
 *   onComplete: handleChurnRiskOnCompleteRef,
 *   retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
 * });
 * ```
 */
export const analyzeChurnRiskEvent = internalAction({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    globalPosition: v.number(),
    correlationId: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    payload: v.any(),
    timestamp: v.number(),
    category: v.string(),
    boundedContext: v.string(),
    agentId: v.string(),
  },
  handler: async (ctx, args): Promise<AgentActionResult | null> => {
    // Create runtime with API key from environment (available in actions)
    // Use typed global access pattern (same as infrastructure.ts)
    const safeGlobal = globalThis as { process?: { env: Record<string, string | undefined> } };
    const apiKey = safeGlobal.process?.env?.["OPENROUTER_API_KEY"];
    const runtime = createOpenRouterAgentRuntime(apiKey);
    const logger = createPlatformNoOpLogger();

    // Create handler using the factory
    const handler = createAgentActionHandler<ActionCtx>({
      agentConfig: churnRiskAgentConfig,
      runtime,
      logger,
      loadState: async (actionCtx: ActionCtx, handlerArgs: AgentEventHandlerArgs) => {
        // Load checkpoint from agent component via query (read-only in action path).
        // The onComplete mutation handles loadOrCreate for the write path.
        const checkpoint = await actionCtx.runQuery(
          components.agentBC.checkpoints.getByAgentAndSubscription,
          {
            agentId: handlerArgs.agentId,
            subscriptionId: `sub_${handlerArgs.agentId}`,
          }
        );

        // Load cancellation history from projection for churn risk pattern detection.
        // The pattern handler needs 3+ OrderCancelled events to trigger.
        const payload = handlerArgs.payload as Record<string, unknown> | undefined;
        const customerId =
          typeof payload?.["customerId"] === "string" ? payload["customerId"] : undefined;

        let eventHistory: PublishedEvent[] = [];

        if (customerId) {
          const cancellationData = await actionCtx.runQuery(getCancellationsByCustomerRef, {
            customerId,
          });

          if (cancellationData) {
            const typed = cancellationData as {
              cancellations: Array<{
                orderId: string;
                eventId: string;
                globalPosition: number;
                reason: string;
                timestamp: number;
              }>;
              count: number;
            };

            eventHistory = typed.cancellations.map(
              (c): PublishedEvent => ({
                eventType: "OrderCancelled",
                streamType: "Order",
                streamId: c.orderId,
                eventId: c.eventId,
                globalPosition: c.globalPosition,
                timestamp: c.timestamp,
                payload: {
                  orderId: c.orderId,
                  customerId,
                  reason: c.reason,
                },
                category: "domain",
                boundedContext: "orders",
                schemaVersion: 1,
                correlation: {
                  correlationId: c.eventId,
                  causationId: c.eventId,
                },
              })
            );
          }
        }

        return {
          checkpoint: checkpoint ?? null,
          eventHistory,
          injectedData: {},
        };
      },
    });

    return handler(ctx, args);
  },
});
