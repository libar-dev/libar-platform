/**
 * Agent onComplete Handler Factory — DS-2 Stub
 *
 * Creates a Workpool onComplete mutation that persists all agent state
 * after the action handler completes. This is the persistence phase of
 * the action/mutation split.
 *
 * @target platform-core/src/agent/oncomplete-handler.ts
 *
 * ## Design Decisions
 *
 * - AD-5: onComplete data contract — action returns AgentActionResult,
 *         context carries AgentWorkpoolContext
 * - AD-6: Idempotency — onComplete checks checkpoint position via OCC
 * - AD-7: Persistence ordering — checkpoint updated LAST
 * - AD-8: Separate factory from action handler
 *
 * @see PDR-011 (Agent Action Handler Architecture)
 * @since DS-2 (Action/Mutation Handler Architecture)
 */

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
 * Typed interface to the agent component's public API.
 *
 * The onComplete handler uses this to persist state via the agent component,
 * respecting component isolation (no `ctx.db` access to component tables).
 *
 * These correspond to the DS-1 stubs:
 * - checkpoints.ts: loadOrCreate, update
 * - audit.ts: record
 * - commands.ts: record
 * - approvals.ts: create
 * - deadLetters.ts: record
 */
export interface AgentComponentAPI {
  /** Checkpoint API — ctx.runQuery/runMutation(components.agent.checkpoints.*) */
  readonly checkpoints: {
    /** Primary lookup by (agentId, subscriptionId) — O(1) via compound index */
    readonly getByAgentAndSubscription: FunctionRef;
    /** Admin/monitoring queries — returns all checkpoints for an agent */
    readonly getByAgentId: FunctionRef;
    /** Advance checkpoint position after successful processing */
    readonly update: FunctionRef;
    /** Idempotent load-or-create for first-event handling */
    readonly loadOrCreate: FunctionRef;
  };

  /** Audit API — ctx.runMutation(components.agent.audit.*) */
  readonly audit: {
    readonly record: FunctionRef;
  };

  /** Commands API — ctx.runMutation(components.agent.commands.*) */
  readonly commands: {
    readonly record: FunctionRef;
  };

  /** Approvals API — ctx.runMutation(components.agent.approvals.*) */
  readonly approvals: {
    readonly create: FunctionRef;
  };

  /** Dead Letters API — ctx.runMutation(components.agent.deadLetters.*) */
  readonly deadLetters: {
    readonly record: FunctionRef;
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

  /**
   * Optional custom dead letter handler.
   * If not provided, uses the standard agent component deadLetters.record API.
   * Useful for agents that need custom error categorization.
   */
  readonly onDeadLetter?: (ctx: MutationCtx, deadLetter: AgentDeadLetterInput) => Promise<void>;
}

/**
 * Dead letter input for custom handlers.
 */
export interface AgentDeadLetterInput {
  readonly agentId: string;
  readonly subscriptionId: string;
  readonly eventId: string;
  readonly globalPosition: number;
  readonly error: string;
  readonly correlationId: string;
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
 *       getByAgentAndSubscription: components.agent.checkpoints.getByAgentAndSubscription,
 *       getByAgentId: components.agent.checkpoints.getByAgentId,
 *       update: components.agent.checkpoints.update,
 *       loadOrCreate: components.agent.checkpoints.loadOrCreate,
 *     },
 *     audit: { record: components.agent.audit.record },
 *     commands: { record: components.agent.commands.record },
 *     approvals: { create: components.agent.approvals.create },
 *     deadLetters: { record: components.agent.deadLetters.record },
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
// Placeholder for Convex FunctionReference.
// IMPLEMENTATION NOTE: At implementation time, replace with properly typed refs:
//   readonly getByAgentAndSubscription: FunctionReference<"query", "internal">;
//   readonly update: FunctionReference<"mutation", "internal">;
//   readonly loadOrCreate: FunctionReference<"mutation", "internal">;
//   readonly record: FunctionReference<"mutation", "internal">;
//   readonly create: FunctionReference<"mutation", "internal">;
// This prevents mis-assigning refs (e.g., audit.record in checkpoints.update slot).
type FunctionRef = unknown;
type MutationCtx = unknown; // Placeholder for Convex MutationCtx
type Logger = unknown;
