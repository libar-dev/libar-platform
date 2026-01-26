/**
 * Factory for creating invariant sets (grouped invariants).
 *
 * An InvariantSet allows multiple invariants to be validated together,
 * with support for both fail-fast (assertAll) and collect-all (validateAll) modes.
 *
 * @example
 * ```typescript
 * const submitInvariants = createInvariantSet([orderIsDraft, orderHasItems]);
 *
 * // Fail-fast: throws on first violation
 * submitInvariants.assertAll(cms);
 *
 * // Collect all violations
 * const result = submitInvariants.validateAll(cms);
 * if (!result.valid) {
 *   console.log(`${result.violations.length} violations found`);
 * }
 * ```
 */

import type { UnknownRecord } from "../types.js";
import type { Invariant, InvariantSet, InvariantSetResult } from "./types.js";

/**
 * Create an invariant set from an array of invariants.
 *
 * The set provides three validation modes:
 * - `checkAll()`: Returns boolean (non-throwing)
 * - `assertAll()`: Throws on first failure (fail-fast)
 * - `validateAll()`: Collects all violations (for detailed reporting)
 *
 * Each invariant in the set already has its own error class configured,
 * so errors thrown by `assertAll()` use the per-invariant error class.
 *
 * @param invariants - Array of invariants to include in the set
 * @returns An InvariantSet with all three validation modes
 *
 * @example
 * ```typescript
 * // Define individual invariants
 * const orderIsDraft = createInvariant<OrderCMS, OrderErrorCode>({...}, OrderInvariantError);
 * const orderHasItems = createInvariant<OrderCMS, OrderErrorCode>({...}, OrderInvariantError);
 *
 * // Combine into a set
 * const submitInvariants = createInvariantSet([orderIsDraft, orderHasItems]);
 *
 * // Use in handler
 * try {
 *   submitInvariants.assertAll(cms);
 *   // All invariants passed, proceed...
 * } catch (error) {
 *   if (error instanceof OrderInvariantError) {
 *     return rejectedResult(error.code, error.message, error.context);
 *   }
 *   throw error;
 * }
 * ```
 */
export function createInvariantSet<TState, TCode extends string>(
  invariants: Array<Invariant<TState, TCode, []>>
): InvariantSet<TState, TCode> {
  // Create immutable copy to prevent external mutation affecting the set
  const frozenInvariants = Object.freeze([...invariants]);

  return {
    invariants: frozenInvariants,

    checkAll(state: TState): boolean {
      return frozenInvariants.every((inv) => inv.check(state));
    },

    assertAll(state: TState): void {
      // Fail-fast: check each invariant in order, throw on first failure
      for (const inv of frozenInvariants) {
        inv.assert(state);
      }
    },

    validateAll(state: TState): InvariantSetResult<TCode> {
      // Collect all violations (no short-circuit)
      const violations: Array<{ code: TCode; message: string; context?: UnknownRecord }> = [];

      for (const inv of frozenInvariants) {
        const result = inv.validate(state);
        if (!result.valid) {
          // Build violation object, only including context if present
          const violation: { code: TCode; message: string; context?: UnknownRecord } = {
            code: result.code,
            message: result.message,
          };
          if (result.context !== undefined) {
            violation.context = result.context;
          }
          violations.push(violation);
        }
      }

      if (violations.length === 0) {
        return { valid: true };
      }

      return { valid: false, violations };
    },
  };
}
