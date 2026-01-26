/**
 * Types for the declarative invariant framework.
 *
 * This module defines interfaces for creating composable, type-safe
 * invariant checks that can be used in dual-write command handlers.
 *
 * @example
 * ```typescript
 * // Create a typed invariant
 * const orderIsDraft = createInvariant<OrderCMS, OrderErrorCode>({
 *   name: "orderIsDraft",
 *   code: "ORDER_NOT_IN_DRAFT",
 *   check: (order) => order.status === "draft",
 *   message: (order) => `Order must be in draft. Current: ${order.status}`,
 * }, OrderInvariantError);
 *
 * // Three ways to use:
 * orderIsDraft.check(order);     // boolean
 * orderIsDraft.assert(order);    // throws or void
 * orderIsDraft.validate(order);  // InvariantResult
 * ```
 */

import type { UnknownRecord } from "../types.js";
import type { InvariantError } from "./InvariantError.js";

/**
 * Type for context-specific InvariantError constructor.
 *
 * This matches the return type of InvariantError.forContext().
 * Used by createInvariant() and createInvariantSet() factories.
 */
export type InvariantErrorConstructor<TCode extends string> = new (
  code: TCode,
  message: string,
  context?: UnknownRecord
) => InvariantError<TCode>;

/**
 * A single invariant rule that can be checked against state.
 *
 * Designed for the dual-write pattern where invariants validate CMS state
 * before applying changes and recording events.
 *
 * @typeParam TState - The state type being validated (e.g., OrderCMS)
 * @typeParam TCode - The error code type (e.g., OrderErrorCode)
 * @typeParam TParams - Additional parameters beyond state (default: none)
 */
export interface Invariant<TState, TCode extends string = string, TParams extends unknown[] = []> {
  /** Unique identifier for this invariant (for introspection) */
  readonly name: string;

  /** Error code thrown when invariant is violated */
  readonly code: TCode;

  /**
   * Check if the invariant holds (non-throwing).
   *
   * @param state - The state to validate
   * @param params - Additional parameters if required
   * @returns true if state satisfies invariant, false otherwise
   */
  check(state: TState, ...params: TParams): boolean;

  /**
   * Assert that the invariant holds (throws on violation).
   *
   * @param state - The state to validate
   * @param params - Additional parameters if required
   * @throws InvariantError if state violates invariant
   */
  assert(state: TState, ...params: TParams): void;

  /**
   * Validate and return a structured result (non-throwing).
   *
   * Useful for collecting all violations before deciding how to respond,
   * or for returning structured validation results to callers.
   *
   * @param state - The state to validate
   * @param params - Additional parameters if required
   * @returns Structured result indicating validity and violation details
   */
  validate(state: TState, ...params: TParams): InvariantResult<TCode>;
}

/**
 * Result of validating a single invariant.
 */
export type InvariantResult<TCode extends string = string> =
  | { valid: true }
  | { valid: false; code: TCode; message: string; context?: UnknownRecord };

/**
 * A set of invariants that can be checked together.
 *
 * Supports two validation modes:
 * - `assertAll`: Throws on first failure (fail-fast, efficient)
 * - `validateAll`: Collects all violations (useful for validation UIs)
 *
 * @typeParam TState - The state type being validated
 * @typeParam TCode - The union of all error codes in the set
 *
 * @example
 * ```typescript
 * const submitInvariants = createInvariantSet([orderIsDraft, orderHasItems]);
 *
 * // In handler:
 * submitInvariants.assertAll(cms);  // throws on first failure
 *
 * // Or collect all:
 * const result = submitInvariants.validateAll(cms);
 * if (!result.valid) {
 *   console.log(result.violations);  // all failures
 * }
 * ```
 */
export interface InvariantSet<TState, TCode extends string = string> {
  /** All invariants in this set (for introspection) */
  readonly invariants: ReadonlyArray<Invariant<TState, TCode, []>>;

  /**
   * Assert all invariants hold (throws on first failure).
   *
   * Invariants are checked in array order; stops at first violation.
   * This is the most efficient mode for command validation.
   *
   * @param state - The state to validate
   * @throws InvariantError if any invariant is violated
   */
  assertAll(state: TState): void;

  /**
   * Check if all invariants hold (non-throwing).
   *
   * @param state - The state to validate
   * @returns true if all invariants pass, false if any fails
   */
  checkAll(state: TState): boolean;

  /**
   * Validate all invariants and collect results.
   *
   * Does NOT short-circuit; collects all violations.
   * Useful for validation UIs or detailed error reporting.
   *
   * @param state - The state to validate
   * @returns Structured result with all violations if any
   */
  validateAll(state: TState): InvariantSetResult<TCode>;
}

/**
 * Result of validating an invariant set.
 */
export type InvariantSetResult<TCode extends string = string> =
  | { valid: true }
  | {
      valid: false;
      violations: Array<{ code: TCode; message: string; context?: UnknownRecord }>;
    };
