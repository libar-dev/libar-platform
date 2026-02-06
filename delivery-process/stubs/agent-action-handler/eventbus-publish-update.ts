/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentLLMIntegration
 *
 * EventBus Publish Update — DS-2 Stub
 *
 * Shows the two changes needed to support the EventSubscription discriminated union:
 * 1. WorkpoolClient interface gains `enqueueAction`
 * 2. ConvexEventBus.publish branches on `subscription.handlerType`
 *
 * This is the highest-complexity implementation change in DS-2 because it
 * modifies the central dispatch path that all subscriptions flow through.
 *
 * Target: platform-core/src/eventbus/ConvexEventBus.ts (modify publish method)
 * Target: platform-core/src/orchestration/types.ts (extend WorkpoolClient interface)
 *
 * See: event-subscription-types.ts (EventSubscription discriminated union)
 * See: PDR-011 (Agent Action Handler Architecture)
 * Since: DS-2 (Action/Mutation Handler Architecture)
 */

// ============================================================================
// WorkpoolClient Interface Extension
// ============================================================================
//
// Current interface (platform-core/src/orchestration/types.ts:483-535):
//   enqueueMutation<TArgs>(ctx, handler, args, options): Promise<string>
//   enqueueMutationBatch?<TArgs>(ctx, items): Promise<string[]>
//
// Add:
//
// interface WorkpoolClient {
//   // ... existing methods unchanged ...
//
//   /**
//    * Enqueue an action for execution in the Workpool.
//    *
//    * Used by ConvexEventBus for ActionSubscription dispatch.
//    * The action receives handler args and returns a result.
//    * The result flows to the onComplete handler via Workpool.
//    *
//    * Maps to Workpool's `pool.enqueueAction()` — see
//    * deps-packages/workpool/src/client/index.ts for the underlying API.
//    */
//   enqueueAction<TArgs extends UnknownRecord>(
//     ctx: RunMutationCtx,
//     actionRef: FunctionReference<"action", FunctionVisibility, TArgs, unknown>,
//     args: TArgs,
//     options: {
//       onComplete: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;
//       context?: Record<string, unknown>;
//       retry?: boolean | RetryBehavior;
//     },
//   ): Promise<string>;
// }
//
// IMPLEMENTATION NOTE: The existing WorkpoolAdapter class
// (platform-core/src/orchestration/WorkpoolAdapter.ts) wraps the
// @convex-dev/workpool client. Add:
//
//   async enqueueAction(ctx, actionRef, args, options) {
//     return this.pool.enqueueAction(ctx, actionRef, args, {
//       onComplete: options.onComplete,
//       context: options.context,
//       retry: options.retry,
//     });
//   }

// ============================================================================
// ConvexEventBus.publish — Branching Logic
// ============================================================================
//
// Current dispatch (ConvexEventBus.ts:185):
//   await this.workpool.enqueueMutation(ctx, subscription.handler, handlerArgs, { ... });
//
// Updated dispatch (replaces line 185):
//
//   if (subscription.handlerType === "action") {
//     // ACTION path — new for DS-2
//     const context = subscription.toWorkpoolContext(event, chain, subscription.name);
//     await this.workpool.enqueueAction(ctx, subscription.handler, handlerArgs, {
//       onComplete: subscription.onComplete,  // REQUIRED for actions
//       retry: subscription.retry,
//       context,
//     });
//   } else {
//     // MUTATION path — existing behavior, unchanged
//     // NOTE: handlerType may be undefined for existing subscriptions (Step 1 of migration).
//     // Treat missing handlerType as "mutation" for backward compatibility.
//     await this.workpool.enqueueMutation(ctx, subscription.handler, handlerArgs, {
//       onComplete: subscription.onComplete,
//       context: {
//         subscriptionName: subscription.name,
//         eventId: event.eventId,
//         eventType: event.eventType,
//         globalPosition: event.globalPosition,
//         partition: subscription.getPartitionKey(event),
//         correlationId: chain.correlationId,
//         causationId: event.eventId,
//       },
//     });
//   }
//
// KEY DIFFERENCES between paths:
//
// | Aspect          | Mutation Path              | Action Path                      |
// |-----------------|---------------------------|----------------------------------|
// | Dispatch method | enqueueMutation           | enqueueAction                    |
// | onComplete      | Optional (default handler) | REQUIRED (no state otherwise)    |
// | Context shape   | Generic (inline)           | Custom (toWorkpoolContext callback)|
// | Retry           | N/A (mutations don't fail) | Configurable (subscription.retry) |
//
// IMPLEMENTATION NOTE on backward compatibility:
//
// During migration Step 1, existing subscriptions lack `handlerType`.
// The type guard should use:
//   if ("handlerType" in subscription && subscription.handlerType === "action")
// OR rely on the union's default (missing = mutation).
//
// After migration Step 5 (handlerType required), simplify to:
//   if (subscription.handlerType === "action")

// ============================================================================
// Workpool Options Mapping
// ============================================================================
//
// The Workpool `enqueueAction` options (deps-packages/workpool/src/client/index.ts):
//
//   interface EnqueueOptions {
//     context?: Record<string, unknown>;  // Passed to onComplete
//     onComplete?: FunctionReference;      // Called when action completes
//   }
//
//   type RetryOption = {
//     retry?: boolean | RetryBehavior;     // Retry configuration
//   }
//
//   // RetryBehavior (from workpool/src/component/shared.ts):
//   interface RetryBehavior {
//     maxAttempts?: number;      // Default: 5
//     initialBackoffMs?: number; // Default: 250
//     base?: number;             // Default: 2
//   }
//
// The EventBus passes subscription-level retry config directly:
//   retry: subscription.retry  // Agent recommendation: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 }

export {};
