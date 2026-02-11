/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentLLMIntegration
 * @libar-docs-target platform-core/src/agent/oncomplete-handler.ts
 *
 * Agent onComplete Handler Factory — DS-2 Stub
 *
 * Creates a Workpool onComplete mutation that persists all agent state
 * after the action handler completes. This is the persistence phase of
 * the action/mutation split.
 *
 * ## Design Decisions
 *
 * - AD-5: onComplete data contract — action returns AgentActionResult,
 *         context carries AgentWorkpoolContext
 * - AD-6: Idempotency — onComplete checks checkpoint position via OCC
 * - AD-7: Persistence ordering — checkpoint updated LAST
 * - AD-8: Separate factory from action handler
 *
 * See: PDR-011 (Agent Action Handler Architecture)
 * Since: DS-2 (Action/Mutation Handler Architecture)
 */

import type { FunctionReference } from "convex/server";

// ============================================================================
// Workpool Context Type
// ============================================================================

/**
 * Event metadata carried through Workpool context.
 *
 * Set when EventBus enqueues the action via Workpool. Available in
 * the onComplete handler as `args.context`.
 *
 * This provides the onComplete handler with everything needed to:
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

  /** Global position in event store — used for checkpoint advancement */
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
// Context Construction — How EventBus Populates AgentWorkpoolContext
// ============================================================================
//
// The EventBus constructs this context at dispatch time using the
// ActionSubscription's `toWorkpoolContext` callback:
//
//   // In ConvexEventBus.publish (action branch):
//   const context = subscription.toWorkpoolContext(event, chain, subscription.name);
//   await workpool.enqueueAction(ctx, handler, args, { context, onComplete, retry });
//
// The subscription factory builds toWorkpoolContext from the agent definition:
//
//   toWorkpoolContext: (event, chain, subscriptionName) => ({
//     agentId: agentDefinition.id,                // From AgentBCConfig.id
//     subscriptionId: subscriptionName,            // Subscription name = unique per agent
//     eventId: event.eventId,                      // From PublishedEvent
//     eventType: event.eventType,                  // From PublishedEvent
//     globalPosition: event.globalPosition,        // From PublishedEvent — used for checkpoint
//     correlationId: chain.correlationId,          // From CorrelationChain
//     causationId: event.eventId,                  // Event that caused this processing
//     streamId: event.streamId,                    // From PublishedEvent
//     streamType: event.streamType,                // From PublishedEvent
//     boundedContext: event.boundedContext,         // From PublishedEvent
//   })
//
// In the onComplete handler, access via `args.context`:
//   const { agentId, subscriptionId, globalPosition, ... } = args.context;
//
// And the action's return value via `args.result`:
//   if (args.result.kind === "success") {
//     const actionResult: AgentActionResult = args.result.returnValue;
//     const { decisionId, decision, analysisMethod, patternId } = actionResult;
//   }

// ============================================================================
// onComplete Args Type
// ============================================================================

/**
 * Arguments received by the onComplete handler.
 *
 * Follows the Workpool onComplete contract:
 * `vOnCompleteArgs(contextValidator)` → `{ workId, context, result }`
 *
 * The `result` is a discriminated union:
 * - `{ kind: "success", returnValue: AgentActionResult }` — action completed
 * - `{ kind: "failed", error: string }` — action threw after all retries
 * - `{ kind: "canceled" }` — work was canceled
 *
 * @example
 * ```typescript
 * // Validator for Convex function args:
 * args: vOnCompleteArgs(v.object({
 *   agentId: v.string(),
 *   subscriptionId: v.string(),
 *   eventId: v.string(),
 *   eventType: v.string(),
 *   globalPosition: v.number(),
 *   correlationId: v.string(),
 *   causationId: v.string(),
 *   streamId: v.string(),
 *   streamType: v.string(),
 *   boundedContext: v.string(),
 * }))
 * ```
 */
export interface AgentOnCompleteArgs {
  /** Workpool work item ID */
  readonly workId: string;

  /** Event metadata set during dispatch */
  readonly context: AgentWorkpoolContext;

  /** Action execution result (discriminated union) */
  readonly result:
    | { readonly kind: "success"; readonly returnValue: AgentActionResult }
    | { readonly kind: "failed"; readonly error: string }
    | { readonly kind: "canceled" };
}

// ============================================================================
// Agent Component API Interface
// ============================================================================

/**
 * Unified API interface for the agent Convex component.
 *
 * All consumers (onComplete handler, lifecycle handlers, command bridge)
 * use this single interface. Each consumer accesses only the subset it needs.
 * TypeScript structural typing ensures type safety without requiring separate interfaces.
 *
 * @see component/checkpoints.ts, component/audit.ts, etc. for implementations
 */
export interface AgentComponentAPI {
  /** Checkpoint API — ctx.runQuery/runMutation(components.agentBC.checkpoints.*) */
  readonly checkpoints: {
    /** Idempotent load-or-create for first-event handling */
    readonly loadOrCreate: FunctionReference<"mutation">;
    /** Advance checkpoint position after successful processing */
    readonly update: FunctionReference<"mutation">;
    /** Update checkpoint status (lifecycle transitions, DS-5) */
    readonly updateStatus: FunctionReference<"mutation">;
    /** Combined lifecycle transition: update status + record audit in one component call (DS-5 review fix) */
    readonly transitionLifecycle: FunctionReference<"mutation">;
    /** Patch checkpoint config overrides (ReconfigureAgent, DS-5) */
    readonly patchConfigOverrides: FunctionReference<"mutation">;
    /** Primary lookup by (agentId, subscriptionId) — O(1) via compound index */
    readonly getByAgentAndSubscription: FunctionReference<"query">;
    /** Admin/monitoring queries — returns all checkpoints for an agent */
    readonly getByAgentId: FunctionReference<"query">;
    /** List all active checkpoints (monitoring, DS-5) */
    readonly listActive: FunctionReference<"query">;
  };

  /** Audit API — ctx.runQuery/runMutation(components.agentBC.audit.*) */
  readonly audit: {
    /** Record an audit event (idempotent by decisionId) */
    readonly record: FunctionReference<"mutation">;
    /** Query audit events by agent */
    readonly queryByAgent: FunctionReference<"query">;
    /** Correlate audit events with commands via decisionId */
    readonly getByDecisionId: FunctionReference<"query">;
  };

  /** Commands API — ctx.runQuery/runMutation(components.agentBC.commands.*) */
  readonly commands: {
    /** Record a command emitted by an agent */
    readonly record: FunctionReference<"mutation">;
    /** Update command status (pending → processing → completed/failed) */
    readonly updateStatus: FunctionReference<"mutation">;
    /** Load command by decisionId (DS-4 routing) */
    readonly getByDecisionId: FunctionReference<"query">;
    /** Query commands by agent */
    readonly queryByAgent: FunctionReference<"query">;
    /** Get pending commands (DS-4 sweep recovery) */
    readonly getPending: FunctionReference<"query">;
  };

  /** Approvals API — ctx.runQuery/runMutation(components.agentBC.approvals.*) */
  readonly approvals: {
    /** Create a pending approval request */
    readonly create: FunctionReference<"mutation">;
    /** Approve a pending approval */
    readonly approve: FunctionReference<"mutation">;
    /** Reject a pending approval */
    readonly reject: FunctionReference<"mutation">;
    /** Query approvals by agent and status */
    readonly queryApprovals: FunctionReference<"query">;
  };

  /** Dead Letters API — ctx.runQuery/runMutation(components.agentBC.deadLetters.*) */
  readonly deadLetters: {
    /** Record a dead letter for failed event processing */
    readonly record: FunctionReference<"mutation">;
    /** Update dead letter status (pending → replayed/ignored) */
    readonly updateStatus: FunctionReference<"mutation">;
    /** Query dead letters by agent */
    readonly queryByAgent: FunctionReference<"query">;
    /** Get dead letter statistics for monitoring */
    readonly getStats: FunctionReference<"query">;
  };
}

// ============================================================================
// Factory Configuration
// ============================================================================

/**
 * Configuration for the onComplete handler factory.
 *
 * The factory creates an internalMutation that:
 * 1. Checks result.kind
 * 2. On success: persists audit → command → approval → checkpoint (LAST)
 * 3. On failure: creates dead letter, does NOT advance checkpoint
 * 4. On canceled: logs, does NOT advance checkpoint
 *
 * All persistence uses the agent component API (AD-7).
 */
export interface AgentOnCompleteConfig {
  /**
   * Agent component API references.
   * Provides typed access to component mutation/query handlers.
   */
  readonly agentComponent: AgentComponentAPI;

  /**
   * Logger instance for onComplete operations.
   */
  readonly logger?: Logger;

  // Custom dead letter handlers deferred — global handler suffices for now
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an agent onComplete handler.
 *
 * Returns an internalMutation for Workpool's onComplete callback.
 *
 * ⚠️  NO-THROW ZONE: If the onComplete mutation throws a non-OCC error, it rolls
 * back silently. The Workpool considers the work "done" — no re-dispatch occurs.
 * Every operation MUST be wrapped in try-catch. Failures must be logged and
 * dead-lettered, never thrown. See: Finding C in DS-1/DS-2 review.
 *
 * Persistence order (AD-7 — checkpoint read FIRST, updated LAST):
 * 1. On success:
 *    a. Record audit event via agent component (idempotent by decisionId)
 *    b. Record command if decision includes one (idempotent by decisionId)
 *    c. Create approval if decision.requiresApproval (idempotent by approvalId)
 *    d. Update checkpoint to event's globalPosition (LAST)
 * 2. On failure:
 *    a. Record dead letter via agent component
 *    b. Record AgentAnalysisFailed audit event
 *    c. Do NOT advance checkpoint (event eligible for replay)
 * 3. On canceled:
 *    a. Log cancellation
 *    b. Do NOT advance checkpoint
 *
 * Idempotency (AD-6):
 * The onComplete mutation checks if the checkpoint has already been advanced
 * past this event's globalPosition (OCC-serialized by Convex). If so, it
 * skips all persistence (concurrent action already handled this event).
 *
 * @param config - onComplete handler configuration
 * @returns An internalMutation to be registered as a Convex mutation
 *
 * @example
 * ```typescript
 * // In convex/contexts/agent/handlers/onComplete.ts
 * export const onAgentComplete = createAgentOnCompleteHandler({
 *   agentComponent: {
 *     checkpoints: {
 *       getByAgentAndSubscription: components.agentBC.checkpoints.getByAgentAndSubscription,
 *       getByAgentId: components.agentBC.checkpoints.getByAgentId,
 *       update: components.agentBC.checkpoints.update,
 *       loadOrCreate: components.agentBC.checkpoints.loadOrCreate,
 *     },
 *     audit: { record: components.agentBC.audit.record },
 *     commands: { record: components.agentBC.commands.record },
 *     approvals: { create: components.agentBC.approvals.create },
 *     deadLetters: { record: components.agentBC.deadLetters.record },
 *   },
 * });
 * ```
 */
export function createAgentOnCompleteHandler(
  _config: AgentOnCompleteConfig
): void /* RegisteredMutation<"internal", AgentOnCompleteArgs, void> */ {
  // Stub: implementation deferred to coding session
  //
  // ⚠️  NO-THROW ZONE: Every operation in onComplete MUST be wrapped in try-catch.
  // If the onComplete mutation throws a non-OCC error, it rolls back silently.
  // The Workpool considers the work "done" — no re-dispatch occurs.
  // Failures must be logged and dead-lettered, never thrown.
  //
  // Internal flow:
  // 1. const { context, result } = args;
  //
  // 2. // Idempotency check (AD-6) — use loadOrCreate for first-event handling
  //    // loadOrCreate is idempotent: returns existing checkpoint or creates one.
  //    // Using a mutation (not query) means the checkpoint enters the OCC write set
  //    // immediately, which is correct since we always want to update it.
  //    const { checkpoint } = await ctx.runMutation(
  //      component.checkpoints.loadOrCreate,
  //      { agentId: context.agentId, subscriptionId: context.subscriptionId }
  //    );
  //    if (checkpoint.lastProcessedPosition >= context.globalPosition) return;
  //
  // 3. if (result.kind === "failed") { recordDeadLetter(); return; }
  //    if (result.kind === "canceled") { return; }
  //
  // 4. const { decisionId, decision, analysisMethod, llmMetrics } = result.returnValue;
  //
  // 5. if (decision) {
  //      await ctx.runMutation(component.audit.record, { decisionId, ... });
  //      if (decision.command) await ctx.runMutation(component.commands.record, { decisionId, ... });
  //
  //      // DS-4 EXTENSION POINT: Schedule command routing (PDR-012 step 2b)
  //      // if (decision.command) {
  //      //   await ctx.scheduler.runAfter(0, routeAgentCommandRef, {
  //      //     decisionId, commandType: decision.command, agentId: context.agentId,
  //      //     correlationId: context.correlationId, patternId: result.returnValue.patternId,
  //      //   });
  //      // }
  //      // See: stubs/agent-command-routing/command-bridge.ts for full integration
  //
  //      if (decision.requiresApproval) await ctx.runMutation(component.approvals.create, { decisionId, ... });
  //    }
  //
  // 6. await ctx.runMutation(component.checkpoints.update, {
  //      agentId: context.agentId,
  //      subscriptionId: context.subscriptionId,
  //      lastProcessedPosition: context.globalPosition,
  //      lastEventId: context.eventId,
  //      incrementEventsProcessed: true,
  //    }); // LAST — ensures OCC conflict detection window is maximized
}

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

type AgentActionResult = import("./action-handler.js").AgentActionResult;
type MutationCtx = unknown; // Placeholder for Convex MutationCtx
type Logger = unknown;
