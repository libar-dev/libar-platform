/**
 * TS2589-Safe Function Reference Types.
 *
 * These types provide simplified function reference aliases that prevent
 * TypeScript from triggering "Type instantiation is excessively deep" (TS2589)
 * errors when resolving Convex's FilterApi recursive conditional types.
 *
 * ## Why TS2589 Occurs
 *
 * When accessing `internal.path.to.function` or `api.path.to.function`,
 * TypeScript must resolve `FilterApi<typeof fullApi, FunctionReference<...>>`
 * recursively across all 40+ modules. This easily exceeds TypeScript's
 * ~50-100 recursion depth limit.
 *
 * ## Solution: makeFunctionReference + Type Cast
 *
 * ```typescript
 * import { makeFunctionReference } from "convex/server";
 * import type { SafeMutationRef } from "@libar-dev/platform-core";
 *
 * // Module-level constant - bypasses FilterApi entirely
 * const myHandler = makeFunctionReference<"mutation">(
 *   "projections/orders/orderSummary:onOrderCreated"
 * ) as SafeMutationRef;
 * ```
 *
 * The TS2589 prevention happens at reference creation time (the cast truncates
 * type resolution), NOT at call time. Direct `ctx.runMutation(myHandler, args)`
 * calls are safe once the reference is pre-cast.
 *
 * @module @libar-dev/platform-core/function-refs
 * @see docs/external/deep-research/TS2589-compact.md
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";

/**
 * TS2589-safe mutation reference type.
 *
 * Use for projections, sagas, handlers, process managers, and any mutation
 * function references that would otherwise cause TS2589 errors.
 *
 * @example
 * ```typescript
 * const handler = makeFunctionReference<"mutation">(
 *   "projections/orders/orderSummary:onOrderCreated"
 * ) as SafeMutationRef;
 * ```
 */
export type SafeMutationRef = FunctionReference<"mutation", FunctionVisibility>;

/**
 * TS2589-safe query reference type.
 *
 * Use for query function references called from workflows, actions, or
 * other contexts that would otherwise cause TS2589 errors.
 *
 * @example
 * ```typescript
 * const query = makeFunctionReference<"query">(
 *   "orders:getOrderById"
 * ) as SafeQueryRef;
 * ```
 */
export type SafeQueryRef = FunctionReference<"query", FunctionVisibility>;

/**
 * TS2589-safe action reference type.
 *
 * Use for action function references called from workflows or other
 * contexts that would otherwise cause TS2589 errors.
 *
 * @example
 * ```typescript
 * const action = makeFunctionReference<"action">(
 *   "notifications:sendEmail"
 * ) as SafeActionRef;
 * ```
 */
export type SafeActionRef = FunctionReference<"action", FunctionVisibility>;
