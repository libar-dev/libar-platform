/**
 * @libar-docs
 * @libar-docs-pattern InvariantFramework
 * @libar-docs-status completed
 * @libar-docs-phase 11
 * @libar-docs-ddd
 * @libar-docs-uses BoundedContextFoundation
 *
 * ## Invariant Framework - Declarative Business Rules
 *
 * Factory for declarative business rule validation with typed error codes.
 * Creates invariants with check(), assert(), and validate() methods from
 * a single configuration object for consistent, type-safe validation.
 *
 * ### When to Use
 *
 * - Defining domain business rules that must hold true for valid state
 * - Both throwing (assert) and non-throwing (check, validate) validation
 * - Typed error codes and context for debugging invariant failures
 *
 * @example
 * ```typescript
 * const orderIsDraft = createInvariant<OrderCMS, OrderErrorCode>({
 *   name: "orderIsDraft",
 *   code: OrderErrorCodes.ORDER_NOT_IN_DRAFT,
 *   check: (order) => order.status === "draft",
 *   message: (order) => `Order must be in draft. Current: ${order.status}`,
 *   context: (order) => ({ orderId: order.orderId, currentStatus: order.status }),
 * }, OrderInvariantError);
 *
 * // All three methods available:
 * if (!orderIsDraft.check(cms)) { ... }
 * orderIsDraft.assert(cms);  // throws OrderInvariantError
 * const result = orderIsDraft.validate(cms);
 * ```
 */

import type { UnknownRecord } from "../types.js";
import type { Invariant, InvariantErrorConstructor, InvariantResult } from "./types.js";

/**
 * Configuration for creating an invariant.
 *
 * @typeParam TState - The state type being validated
 * @typeParam TCode - The error code type
 * @typeParam TParams - Additional parameters beyond state
 */
export interface InvariantConfig<TState, TCode extends string, TParams extends unknown[] = []> {
  /** Unique name for this invariant (for introspection/debugging) */
  name: string;

  /** Error code when invariant is violated */
  code: TCode;

  /**
   * Predicate that returns true if state is valid.
   *
   * @param state - The state to check
   * @param params - Additional parameters if needed
   * @returns true if invariant holds, false otherwise
   */
  check: (state: TState, ...params: TParams) => boolean;

  /**
   * Function to generate error message when invariant is violated.
   *
   * @param state - The invalid state
   * @param params - Additional parameters if provided
   * @returns Human-readable error message
   */
  message: (state: TState, ...params: TParams) => string;

  /**
   * Optional function to generate error context for debugging.
   *
   * @param state - The invalid state
   * @param params - Additional parameters if provided
   * @returns Object with relevant context for error reporting
   */
  context?: (state: TState, ...params: TParams) => UnknownRecord;
}

/**
 * Create a typed invariant from configuration.
 *
 * This factory generates an Invariant object with three methods:
 * - `check()`: Non-throwing boolean check
 * - `assert()`: Throws on violation
 * - `validate()`: Returns structured result
 *
 * @param config - Configuration for the invariant
 * @param ErrorClass - Context-specific error class (from InvariantError.forContext())
 * @returns A fully-typed Invariant object
 *
 * @example
 * ```typescript
 * // Simple invariant (no extra params)
 * const orderIsDraft = createInvariant<OrderCMS, OrderErrorCode>({
 *   name: "orderIsDraft",
 *   code: "ORDER_NOT_IN_DRAFT",
 *   check: (order) => order.status === "draft",
 *   message: (order) => `Expected draft, got ${order.status}`,
 * }, OrderInvariantError);
 *
 * // Parameterized invariant
 * const itemExists = createInvariant<OrderCMS, OrderErrorCode, [string]>({
 *   name: "itemExists",
 *   code: "ITEM_NOT_FOUND",
 *   check: (order, productId) => order.items.some(i => i.productId === productId),
 *   message: (order, productId) => `Item ${productId} not found`,
 *   context: (order, productId) => ({ orderId: order.orderId, productId }),
 * }, OrderInvariantError);
 *
 * // Usage:
 * itemExists.assert(order, "prod-123");
 * ```
 */
export function createInvariant<TState, TCode extends string, TParams extends unknown[] = []>(
  config: InvariantConfig<TState, TCode, TParams>,
  ErrorClass: InvariantErrorConstructor<TCode>
): Invariant<TState, TCode, TParams> {
  const { name, code, check, message, context } = config;

  return {
    name,
    code,

    check(state: TState, ...params: TParams): boolean {
      return check(state, ...params);
    },

    assert(state: TState, ...params: TParams): void {
      if (!check(state, ...params)) {
        const errorMessage = message(state, ...params);
        const errorContext = context?.(state, ...params);
        throw new ErrorClass(code, errorMessage, errorContext);
      }
    },

    validate(state: TState, ...params: TParams): InvariantResult<TCode> {
      if (check(state, ...params)) {
        return { valid: true };
      }

      const errorMessage = message(state, ...params);
      const errorContext = context?.(state, ...params);

      // Only include context if provided (satisfies exactOptionalPropertyTypes)
      if (errorContext !== undefined) {
        return { valid: false, code, message: errorMessage, context: errorContext };
      }
      return { valid: false, code, message: errorMessage };
    },
  };
}
