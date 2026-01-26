/**
 * Invariant utilities for domain rule enforcement.
 *
 * Provides:
 * - InvariantError: Base class for context-specific domain errors
 * - createInvariant: Factory for declarative invariant objects
 * - createInvariantSet: Builder for grouped invariant validation
 *
 * @example
 * ```typescript
 * // Create context-specific error class
 * const OrderInvariantError = InvariantError.forContext<OrderErrorCode>("Order");
 *
 * // Create declarative invariant
 * const orderIsDraft = createInvariant<OrderCMS, OrderErrorCode>({
 *   name: "orderIsDraft",
 *   code: "ORDER_NOT_IN_DRAFT",
 *   check: (order) => order.status === "draft",
 *   message: (order) => `Expected draft, got ${order.status}`,
 * }, OrderInvariantError);
 *
 * // Group invariants into a set
 * const submitInvariants = createInvariantSet([orderIsDraft, orderHasItems]);
 *
 * // Use in handler
 * submitInvariants.assertAll(cms);
 * ```
 */

// Base error class
export { InvariantError } from "./InvariantError.js";

// Types
export type {
  Invariant,
  InvariantErrorConstructor,
  InvariantResult,
  InvariantSet,
  InvariantSetResult,
} from "./types.js";

// Factories
export { createInvariant, type InvariantConfig } from "./createInvariant.js";
export { createInvariantSet } from "./createInvariantSet.js";
