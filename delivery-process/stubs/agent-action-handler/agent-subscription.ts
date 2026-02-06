/**
 * Agent Subscription Factory — DS-2 Stub
 *
 * Extends the existing `createAgentSubscription` factory to produce
 * `ActionSubscription` variants when an action handler is provided.
 *
 * @target platform-bus/src/agent-subscription.ts (merge with existing)
 *
 * ## Design Decisions
 *
 * - AD-1: Unified action model — agent subscriptions produce ActionSubscription
 * - AD-2: EventSubscription discriminated union — factory sets handlerType
 * - AD-5: onComplete data contract — context carries AgentWorkpoolContext
 * - AD-8: Separate action + onComplete factories
 *
 * ## Merge Strategy
 *
 * This stub defines NEW types to be added alongside the existing code.
 * The existing `CreateAgentSubscriptionOptions` and mutation-based
 * `createAgentSubscription` remain unchanged. New overloads extend
 * the factory to support both mutation and action variants.
 *
 * @see PDR-011 (Agent Action Handler Architecture)
 * @see event-subscription-types.ts (ActionSubscription / MutationSubscription)
 * @since DS-2 (Action/Mutation Handler Architecture)
 */

// ============================================================================
// Existing Types (unchanged, shown for context)
// ============================================================================

// These are the EXISTING types from agent-subscription.ts.
// Shown here for merge-context — NOT modified.
//
// interface AgentDefinitionForSubscription { id, subscriptions, context? }
// interface AgentEventHandlerArgs { eventId, eventType, globalPosition, ... }
// interface CreateAgentSubscriptionOptions<T> { handler (mutation), priority?, ... }
// function createAgentSubscription(def, options): EventSubscription<T>

// ============================================================================
// New: Action Subscription Options
// ============================================================================

/**
 * Options for creating an agent ACTION subscription.
 *
 * Replaces CreateAgentSubscriptionOptions for action-based agents.
 * The key differences from mutation options:
 *
 * | Field | Mutation Options | Action Options |
 * |-------|-----------------|----------------|
 * | handler | mutation ref | N/A (use actionHandler) |
 * | actionHandler | N/A | action ref (required) |
 * | onComplete | N/A | mutation ref (required) |
 * | retry | N/A | optional RetryBehavior |
 *
 * `onComplete` is REQUIRED because actions cannot persist state.
 * All writes happen in the onComplete mutation.
 *
 * @example
 * ```typescript
 * const subscription = createAgentSubscription(churnRiskAgent, {
 *   actionHandler: internal.agents.churnRisk.analyzeEvent,
 *   onComplete: internal.agents.churnRisk.onComplete,
 *   retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
 *   priority: 250,
 * });
 * // Returns ActionSubscription with handlerType: "action"
 * ```
 */
export interface CreateAgentActionSubscriptionOptions<
  THandlerArgs extends UnknownRecord = AgentEventHandlerArgs,
> {
  /**
   * Handler action function reference.
   * This action will be called for each matching event via Workpool.enqueueAction().
   *
   * The action performs analysis (load state, pattern detection, optional LLM)
   * and returns AgentActionResult. No persistence happens in the action.
   */
  readonly actionHandler: FunctionReference<"action", FunctionVisibility, THandlerArgs, unknown>;

  /**
   * onComplete mutation function reference — REQUIRED for actions.
   *
   * Called by Workpool after the action completes (success, failure, or cancel).
   * Persists all state: audit events, commands, approvals, checkpoint.
   *
   * Receives `{ workId, context: AgentWorkpoolContext, result }`.
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
   * If not provided, Workpool defaults apply (5 attempts, 250ms, base 2).
   * Agent-specific recommendation: 3 attempts, 1000ms initial, base 2.
   */
  readonly retry?: RetryBehavior;

  /**
   * Priority for ordering subscriptions (lower runs first).
   * @default 250 (after projections at 100 and PMs at 200)
   */
  readonly priority?: number;

  /**
   * Custom transformer for handler args.
   * If not provided, uses default AgentEventHandlerArgs transformer.
   */
  readonly toHandlerArgs?: (
    event: PublishedEvent,
    chain: CorrelationChain,
    agentId: string
  ) => THandlerArgs;

  /**
   * Custom partition key extractor.
   * If not provided, partitions by streamId.
   */
  readonly getPartitionKey?: (event: PublishedEvent, agentId: string) => PartitionKey;

  /**
   * Optional logger for subscription-level logging.
   */
  readonly logger?: Logger;
}

// ============================================================================
// Workpool Context for Agent Actions
// ============================================================================

/**
 * Context passed through Workpool for agent action subscriptions.
 *
 * When EventBus dispatches an agent action, it sets this as the
 * Workpool `context` option. The onComplete handler receives it
 * as `args.context`.
 *
 * This is the SAME type as AgentWorkpoolContext in oncomplete-handler.ts,
 * referenced here for the subscription factory's dispatch logic.
 *
 * @example
 * ```typescript
 * // In EventBus dispatch (ConvexEventBus.ts):
 * if (subscription.handlerType === "action") {
 *   await workpool.enqueueAction(ctx, subscription.handler, handlerArgs, {
 *     onComplete: subscription.onComplete,
 *     retry: subscription.retry,
 *     context: {
 *       agentId: "churn-risk-agent",
 *       subscriptionId: subscription.name,
 *       eventId: event.eventId,
 *       eventType: event.eventType,
 *       globalPosition: event.globalPosition,
 *       correlationId: chain.correlationId,
 *       causationId: event.eventId,
 *       streamId: event.streamId,
 *       streamType: event.streamType,
 *       boundedContext: event.boundedContext,
 *     },
 *   });
 * }
 * ```
 */
// AgentWorkpoolContext is defined in oncomplete-handler.ts — reuse that type.

// ============================================================================
// Factory Overload (Action Variant)
// ============================================================================

/**
 * Create an EventBus subscription from an agent definition — ACTION variant.
 *
 * When `actionHandler` is provided instead of `handler`, the factory
 * produces an `ActionSubscription` with `handlerType: "action"`.
 *
 * The key difference from the existing mutation factory:
 * - Sets `handlerType: "action"` on the returned subscription
 * - Uses `actionHandler` as the `handler` field
 * - Includes `onComplete` (required) and `retry` (optional)
 *
 * @param definition - Agent definition with id and subscriptions
 * @param options - Action subscription options (with actionHandler + onComplete)
 * @returns ActionSubscription for the EventBus
 *
 * @example
 * ```typescript
 * // Action-based agent subscription (DS-2)
 * const subscription = createAgentSubscription(churnRiskAgent, {
 *   actionHandler: internal.agents.churnRisk.analyzeEvent,
 *   onComplete: internal.agents.churnRisk.onComplete,
 *   retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
 * });
 *
 * // Mutation-based agent subscription (existing, unchanged)
 * const legacySub = createAgentSubscription(ruleOnlyAgent, {
 *   handler: internal.agents.ruleOnly.handleEvent,
 * });
 * ```
 *
 * ## Overload Resolution
 *
 * The factory determines the subscription variant by which options type
 * is provided:
 *
 * | Options has | Produces | handlerType |
 * |-------------|----------|-------------|
 * | `handler` (mutation) | MutationSubscription | `"mutation"` |
 * | `actionHandler` (action) | ActionSubscription | `"action"` |
 *
 * At the implementation level, this is an overloaded function:
 *
 * ```typescript
 * // Overload 1: Action subscription
 * function createAgentSubscription<T>(
 *   definition: AgentDefinitionForSubscription,
 *   options: CreateAgentActionSubscriptionOptions<T>
 * ): ActionSubscription<T>;
 *
 * // Overload 2: Mutation subscription (existing)
 * function createAgentSubscription<T>(
 *   definition: AgentDefinitionForSubscription,
 *   options: CreateAgentSubscriptionOptions<T>
 * ): MutationSubscription<T>;
 * ```
 *
 * Implementation notes (deferred to coding session):
 *
 * ```typescript
 * function createAgentSubscription(definition, options) {
 *   if ("actionHandler" in options) {
 *     // Action path — produce ActionSubscription
 *     return {
 *       handlerType: "action",
 *       name: subscriptionName,
 *       filter: { eventTypes: [...definition.subscriptions] },
 *       handler: options.actionHandler,
 *       onComplete: options.onComplete,
 *       retry: options.retry,
 *       toHandlerArgs: ..., // same logic as mutation path
 *       getPartitionKey: ..., // same logic as mutation path
 *       priority: options.priority ?? DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
 *     };
 *   }
 *   // Mutation path — existing behavior unchanged
 *   return {
 *     handlerType: "mutation",
 *     name: subscriptionName,
 *     filter: { eventTypes: [...definition.subscriptions] },
 *     handler: options.handler,
 *     onComplete: options.onComplete, // optional for mutations
 *     toHandlerArgs: ...,
 *     getPartitionKey: ...,
 *     priority: options.priority ?? DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
 *   };
 * }
 * ```
 */
export function createAgentSubscription<THandlerArgs extends UnknownRecord = AgentEventHandlerArgs>(
  _definition: AgentDefinitionForSubscription,
  _options: CreateAgentActionSubscriptionOptions<THandlerArgs>
): void /* ActionSubscription<THandlerArgs> */ {
  // Stub: implementation deferred to coding session
  //
  // This is the ACTION overload. The mutation overload (existing) is unchanged.
  // At implementation time, merge into a single function with overloads.
}

// ============================================================================
// Batch Factory Extension — DEFERRED
// ============================================================================

// NOTE: Batch factory `createAgentActionSubscriptions` deferred until
// multi-agent support is needed. Only one agent (churn-risk) exists today.
// The single-subscription factory above is sufficient. Adding the batch
// factory prematurely would introduce untested abstraction overhead.
//
// When a second agent is added, implement:
//   function createAgentActionSubscriptions<THandlerArgs>(
//     definitions: AgentDefinitionForSubscription[],
//     handlerMap: Record<string, { actionHandler, onComplete }>,
//     options?: CommonOptions,
//   ): ActionSubscription<THandlerArgs>[]

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

// From platform-bus/src/agent-subscription.ts (existing):
//   - AgentDefinitionForSubscription (unchanged)
//   - AgentEventHandlerArgs (unchanged)
//   - CreateAgentSubscriptionOptions (unchanged)
//   - defaultAgentTransform (unchanged)
//   - DEFAULT_AGENT_SUBSCRIPTION_PRIORITY (unchanged)
//
// From platform-core/src/eventbus/types.ts:
//   - EventSubscription, MutationSubscription, ActionSubscription (DS-2 update)
//   - SubscriptionFilter, PartitionKey, PublishedEvent
//   - CorrelationChain
//
// From platform-core/src/agent/oncomplete-handler.ts:
//   - AgentWorkpoolContext
//
// From deps-packages/workpool:
//   - RetryBehavior, WorkpoolOnCompleteArgs
//
// From convex/server:
//   - FunctionReference, FunctionVisibility

type UnknownRecord = Record<string, unknown>;
type AgentEventHandlerArgs = UnknownRecord & { agentId: string };
type AgentDefinitionForSubscription = {
  readonly id: string;
  readonly subscriptions: readonly string[];
  readonly context?: string;
};
type FunctionReference<_T extends string, _V = unknown, _A = unknown, _R = unknown> = unknown;
type FunctionVisibility = unknown;
type PublishedEvent = unknown;
type CorrelationChain = unknown;
type PartitionKey = unknown;
type RetryBehavior = unknown;
type WorkpoolOnCompleteArgs = unknown;
type Logger = unknown;
