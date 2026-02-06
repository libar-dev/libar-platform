/**
 * EventSubscription Discriminated Union — DS-2 Stub
 *
 * Extends EventSubscription from a single-interface (mutation-only) to a
 * discriminated union supporting both mutation and action handlers.
 *
 * @target platform-core/src/eventbus/types.ts (replace EventSubscription definition)
 *
 * ## Design Decision
 *
 * - AD-2: EventSubscription as discriminated union with handlerType discriminant
 *
 * Follows the codebase's established pattern for variant types:
 * - DeciderOutput = DeciderSuccess | DeciderRejected | DeciderFailed (platform-decider)
 * - ActionResult = { kind: "success" } | { kind: "failed" } | { kind: "canceled" } (durability)
 * - WorkpoolRunResult (same pattern, orchestration)
 *
 * @see PDR-011 (Agent Action Handler Architecture)
 * @since DS-2 (Action/Mutation Handler Architecture)
 */

// ============================================================================
// Base Subscription (shared fields)
// ============================================================================

/**
 * Common fields for all subscription variants.
 *
 * Extracted from the current EventSubscription interface.
 * Both MutationSubscription and ActionSubscription extend this.
 */
export interface BaseSubscription<THandlerArgs extends UnknownRecord = UnknownRecord> {
  /** Unique name for this subscription (e.g., "pm:orders:orderNotification") */
  readonly name: string;

  /** Filter to determine which events this subscription receives */
  readonly filter: SubscriptionFilter;

  /**
   * Transform a published event into handler arguments.
   * Called by ConvexEventBus before dispatching to Workpool.
   */
  readonly toHandlerArgs: (event: PublishedEvent, chain: CorrelationChain) => THandlerArgs;

  /**
   * Extract the partition key for ordering.
   *
   * NOTE: Partition-key ordering is NOT yet implemented in Workpool.
   * The key is used for context/debugging and future ordering support.
   * See ConvexEventBus.ts:179-183 for the caveat.
   */
  readonly getPartitionKey: (event: PublishedEvent) => PartitionKey;

  /**
   * Priority for ordering subscriptions (lower runs first).
   * Projections: 100 (default), PMs: 200, Agents: 250, Sagas: 300.
   * @default 100
   */
  readonly priority?: number;
}

// ============================================================================
// Mutation Subscription (existing behavior)
// ============================================================================

/**
 * Subscription that dispatches events to a Convex mutation.
 *
 * This is the existing behavior — projections, process managers, and
 * sagas all use mutation handlers. EventBus dispatches via
 * `workpool.enqueueMutation()`.
 *
 * @example
 * ```typescript
 * // Projection subscription (existing pattern)
 * const sub: MutationSubscription<OrderSummaryArgs> = {
 *   handlerType: "mutation",
 *   name: "projection:orderSummary:onOrderSubmitted",
 *   filter: { eventTypes: ["OrderSubmitted"] },
 *   handler: internal.projections.orders.orderSummary.onOrderSubmitted,
 *   onComplete: internal.projections.deadLetters.onProjectionComplete,
 *   toHandlerArgs: (event, chain) => ({ ... }),
 *   getPartitionKey: (event) => ({ name: "orderId", value: event.streamId }),
 * };
 * ```
 */
export interface MutationSubscription<
  THandlerArgs extends UnknownRecord = UnknownRecord,
> extends BaseSubscription<THandlerArgs> {
  /** Discriminant: this is a mutation-based subscription */
  readonly handlerType: "mutation";

  /**
   * Reference to the handler mutation.
   * Dispatched via workpool.enqueueMutation().
   */
  readonly handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>;

  /**
   * Optional onComplete handler for dead letter tracking.
   * If not provided, the EventBus defaultOnComplete is used.
   */
  readonly onComplete?: FunctionReference<
    "mutation",
    FunctionVisibility,
    WorkpoolOnCompleteArgs,
    unknown
  >;
}

// ============================================================================
// Action Subscription (new for agents)
// ============================================================================

/**
 * Subscription that dispatches events to a Convex action.
 *
 * New variant for agent handlers that need to call external APIs (LLM).
 * EventBus dispatches via `workpool.enqueueAction()`.
 *
 * `onComplete` is REQUIRED because actions cannot persist state directly.
 * All writes happen in the onComplete mutation callback.
 *
 * @example
 * ```typescript
 * // Agent subscription (new pattern)
 * const sub: ActionSubscription<AgentEventHandlerArgs> = {
 *   handlerType: "action",
 *   name: "agent:orders:churn-risk-agent",
 *   filter: { eventTypes: ["OrderCancelled", "OrderRefunded"] },
 *   handler: internal.contexts.agent.handlers.analyzeEvent,
 *   onComplete: internal.contexts.agent.handlers.onComplete,
 *   retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
 *   toHandlerArgs: (event, chain) => ({ ... }),
 *   getPartitionKey: (event) => ({ name: "streamId", value: event.streamId }),
 *   priority: 250,
 * };
 * ```
 */
export interface ActionSubscription<
  THandlerArgs extends UnknownRecord = UnknownRecord,
> extends BaseSubscription<THandlerArgs> {
  /** Discriminant: this is an action-based subscription */
  readonly handlerType: "action";

  /**
   * Reference to the handler action.
   * Dispatched via workpool.enqueueAction().
   */
  readonly handler: FunctionReference<"action", FunctionVisibility, THandlerArgs, unknown>;

  /**
   * onComplete handler for persistence — REQUIRED for actions.
   *
   * Actions cannot write to the database directly. All state changes
   * (checkpoint, audit, commands, approvals, dead letters) happen
   * in this onComplete mutation.
   *
   * The handler receives:
   * - workId: Workpool work item ID
   * - context: AgentWorkpoolContext (event metadata set during dispatch)
   * - result: { kind: "success", returnValue } | { kind: "failed", error } | { kind: "canceled" }
   */
  readonly onComplete: FunctionReference<
    "mutation",
    FunctionVisibility,
    WorkpoolOnCompleteArgs,
    unknown
  >;

  /**
   * Retry configuration for the action.
   *
   * Actions may fail due to transient errors (LLM API timeouts, rate limits).
   * Workpool retries per this configuration before calling onComplete with
   * `result.kind === "failed"`.
   *
   * Default Workpool behavior: 5 attempts, 250ms initial backoff, base 2.
   * Agent-specific recommendation: 3 attempts, 1000ms initial, base 2.
   */
  readonly retry?: RetryBehavior;

  /**
   * Transform event + subscription metadata into Workpool context.
   *
   * Called by EventBus when dispatching to construct the context object
   * passed through Workpool to the onComplete handler. This keeps EventBus
   * generic — the agent subscription factory defines the context shape,
   * not EventBus.
   *
   * Required for action subscriptions. Mutation subscriptions use the
   * default EventBus context shape (subscriptionName, eventId, eventType,
   * partition, correlationId, causationId).
   *
   * @example
   * ```typescript
   * toWorkpoolContext: (event, chain, subscriptionName) => ({
   *   agentId: extractAgentId(subscriptionName),
   *   subscriptionId: subscriptionName,
   *   eventId: event.eventId,
   *   eventType: event.eventType,
   *   globalPosition: event.globalPosition,
   *   correlationId: chain.correlationId,
   *   causationId: event.eventId,
   *   streamId: event.streamId,
   *   streamType: event.streamType,
   *   boundedContext: event.boundedContext,
   * })
   * ```
   */
  readonly toWorkpoolContext: (
    event: PublishedEvent,
    chain: CorrelationChain,
    subscriptionName: string
  ) => Record<string, unknown>;
}

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * An event subscription that defines how to handle published events.
 *
 * Discriminated union with `handlerType` as the discriminant:
 * - `"mutation"`: Handler is a Convex mutation (existing behavior)
 * - `"action"`: Handler is a Convex action (new for agents/LLM)
 *
 * ConvexEventBus narrows via:
 * ```typescript
 * if (subscription.handlerType === "action") {
 *   const context = subscription.toWorkpoolContext(event, chain, subscription.name);
 *   await workpool.enqueueAction(ctx, subscription.handler, args, {
 *     onComplete: subscription.onComplete,
 *     retry: subscription.retry,
 *     context,
 *   });
 * } else {
 *   await workpool.enqueueMutation(ctx, subscription.handler, args, {
 *     onComplete: subscription.onComplete,
 *   });
 * }
 * ```
 */
export type EventSubscription<THandlerArgs extends UnknownRecord = UnknownRecord> =
  | MutationSubscription<THandlerArgs>
  | ActionSubscription<THandlerArgs>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a subscription is action-based.
 */
export function isActionSubscription<T extends UnknownRecord>(
  sub: EventSubscription<T>
): sub is ActionSubscription<T> {
  return sub.handlerType === "action";
}

/**
 * Check if a subscription is mutation-based.
 */
export function isMutationSubscription<T extends UnknownRecord>(
  sub: EventSubscription<T>
): sub is MutationSubscription<T> {
  return sub.handlerType === "mutation";
}

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

// From platform-core/src/eventbus/types.ts:
//   - SubscriptionFilter, PartitionKey, PublishedEvent (unchanged)
//
// From platform-core/src/correlation/types.ts:
//   - CorrelationChain (unchanged)
//
// From platform-core/src/orchestration/types.ts:
//   - WorkpoolOnCompleteArgs (unchanged)
//
// From convex/server:
//   - FunctionReference, FunctionVisibility
//
// From deps-packages/workpool:
//   - RetryBehavior

type UnknownRecord = Record<string, unknown>;
type SubscriptionFilter = unknown;
type PartitionKey = unknown;
type PublishedEvent = unknown;
type CorrelationChain = unknown;
type WorkpoolOnCompleteArgs = unknown;
type FunctionReference<_T extends string, _V = unknown, _A = unknown, _R = unknown> = unknown;
type FunctionVisibility = unknown;
type RetryBehavior = unknown;
