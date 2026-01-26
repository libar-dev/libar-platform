/**
 * Decider Output Assertion Helpers
 *
 * Type-safe assertion functions for validating DeciderOutput in BDD tests.
 * These use vitest's expect() for consistent test output formatting.
 *
 * @module @libar-dev/platform-decider/testing
 */

import { expect } from "vitest";
import type {
  DeciderOutput,
  DeciderSuccess,
  DeciderRejected,
  DeciderFailed,
  DeciderEvent,
} from "../types.js";

/**
 * Internal type alias for any DeciderEvent.
 */
type AnyEvent = DeciderEvent;

/**
 * Internal type alias for any DeciderOutput.
 */
type AnyDeciderOutput = DeciderOutput<AnyEvent, unknown, unknown, AnyEvent>;

// =============================================================================
// Status Assertions
// =============================================================================

/**
 * Assert that a decider output is a success.
 *
 * @param result - The decider output to check
 * @throws AssertionError if result is null or not a success
 *
 * @example
 * ```typescript
 * const result = decideCreateOrder(state, command, context);
 * assertDecisionSuccess(result);
 * // result is now narrowed to DeciderSuccess
 * ```
 */
export function assertDecisionSuccess(
  result: AnyDeciderOutput | null
): asserts result is DeciderSuccess<AnyEvent, unknown, unknown> {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("success");
}

/**
 * Assert that a decider output is a rejection.
 *
 * @param result - The decider output to check
 * @param expectedCode - Optional expected rejection code
 * @throws AssertionError if result is null or not a rejection
 *
 * @example
 * ```typescript
 * const result = decideSubmitOrder(draftlessOrder, command, context);
 * assertDecisionRejected(result, "ORDER_NOT_IN_DRAFT");
 * ```
 */
export function assertDecisionRejected(
  result: AnyDeciderOutput | null,
  expectedCode?: string
): asserts result is DeciderRejected {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("rejected");

  if (expectedCode && result!.status === "rejected") {
    expect(result!.code).toBe(expectedCode);
  }
}

/**
 * Assert that a decider output is a failure (business failure with event).
 *
 * @param result - The decider output to check
 * @param expectedReason - Optional substring expected in the reason
 * @throws AssertionError if result is null or not a failure
 *
 * @example
 * ```typescript
 * const result = decideReserveStock(lowStockState, command, context);
 * assertDecisionFailed(result, "Insufficient stock");
 * ```
 */
export function assertDecisionFailed(
  result: AnyDeciderOutput | null,
  expectedReason?: string
): asserts result is DeciderFailed<AnyEvent> {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("failed");

  if (expectedReason && result!.status === "failed") {
    expect(result!.reason).toContain(expectedReason);
  }
}

// =============================================================================
// Success Data Extractors
// =============================================================================

/**
 * Get the data from a success result (with type narrowing).
 *
 * @param result - The decider output
 * @returns The success data
 * @throws AssertionError if result is not a success
 *
 * @example
 * ```typescript
 * const result = decideCreateOrder(state, command, context);
 * const data = getSuccessData<CreateOrderData>(result);
 * expect(data.orderId).toBe("ord_123");
 * ```
 */
export function getSuccessData<TData>(result: AnyDeciderOutput | null): TData {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("success");

  if (result!.status !== "success") {
    throw new Error(`Expected success but got ${result!.status}`);
  }

  return result!.data as TData;
}

/**
 * Get the event from a success result.
 *
 * @param result - The decider output
 * @returns The success event
 * @throws AssertionError if result is not a success
 *
 * @example
 * ```typescript
 * const result = decideCreateOrder(state, command, context);
 * const event = getSuccessEvent<OrderCreatedEvent>(result);
 * expect(event.eventType).toBe("OrderCreated");
 * ```
 */
export function getSuccessEvent<TEvent extends AnyEvent = AnyEvent>(
  result: AnyDeciderOutput | null
): TEvent {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("success");

  if (result!.status !== "success") {
    throw new Error(`Expected success but got ${result!.status}`);
  }

  return result!.event as TEvent;
}

/**
 * Get the state update from a success result.
 *
 * @param result - The decider output
 * @returns The state update partial
 * @throws AssertionError if result is not a success
 *
 * @example
 * ```typescript
 * const result = decideSubmitOrder(state, command, context);
 * const update = getSuccessStateUpdate<Partial<OrderCMS>>(result);
 * expect(update.status).toBe("submitted");
 * ```
 */
export function getSuccessStateUpdate<TStateUpdate>(result: AnyDeciderOutput | null): TStateUpdate {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("success");

  if (result!.status !== "success") {
    throw new Error(`Expected success but got ${result!.status}`);
  }

  return result!.stateUpdate as TStateUpdate;
}

// =============================================================================
// Event Assertions
// =============================================================================

/**
 * Assert the event type matches expected.
 *
 * @param result - The decider output (must be success)
 * @param expectedType - Expected event type string
 * @throws AssertionError if result is not success or type doesn't match
 *
 * @example
 * ```typescript
 * assertEventType(result, "OrderSubmitted");
 * ```
 */
export function assertEventType(result: AnyDeciderOutput | null, expectedType: string): void {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("success");

  if (result!.status === "success") {
    expect(result!.event.eventType).toBe(expectedType);
  }
}

/**
 * Assert the event payload contains a field with expected value.
 *
 * @param result - The decider output (must be success)
 * @param field - Payload field name
 * @param expectedValue - Expected field value
 * @throws AssertionError if assertion fails
 *
 * @example
 * ```typescript
 * assertEventPayload(result, "orderId", "ord_123");
 * assertEventPayload(result, "items", [{ productId: "prod_1", quantity: 2 }]);
 * ```
 */
export function assertEventPayload(
  result: AnyDeciderOutput | null,
  field: string,
  expectedValue: unknown
): void {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("success");

  if (result!.status === "success") {
    const payload = result!.event.payload as Record<string, unknown>;
    expect(payload[field]).toEqual(expectedValue);
  }
}

// =============================================================================
// State Update Assertions
// =============================================================================

/**
 * Assert the state update contains a field with expected value.
 *
 * @param result - The decider output (must be success)
 * @param field - State update field name
 * @param expectedValue - Expected field value
 * @throws AssertionError if assertion fails
 *
 * @example
 * ```typescript
 * assertStateUpdate(result, "status", "submitted");
 * assertStateUpdate(result, "totalAmount", 99.99);
 * ```
 */
export function assertStateUpdate(
  result: AnyDeciderOutput | null,
  field: string,
  expectedValue: unknown
): void {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("success");

  if (result!.status === "success") {
    const stateUpdate = result!.stateUpdate as Record<string, unknown>;
    expect(stateUpdate[field]).toEqual(expectedValue);
  }
}

// =============================================================================
// Rejection Assertions
// =============================================================================

/**
 * Assert the rejection code matches.
 *
 * @param result - The decider output (must be rejected)
 * @param expectedCode - Expected rejection code
 * @throws AssertionError if result is not rejected or code doesn't match
 *
 * @example
 * ```typescript
 * assertRejectionCode(result, "ORDER_NOT_IN_DRAFT");
 * ```
 */
export function assertRejectionCode(result: AnyDeciderOutput | null, expectedCode: string): void {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("rejected");

  if (result!.status === "rejected") {
    expect(result!.code).toBe(expectedCode);
  }
}

/**
 * Assert the rejection message contains a substring.
 *
 * @param result - The decider output (must be rejected)
 * @param expectedSubstring - Substring expected in the message
 * @throws AssertionError if result is not rejected or message doesn't contain substring
 *
 * @example
 * ```typescript
 * assertRejectionMessage(result, "must be in draft");
 * ```
 */
export function assertRejectionMessage(
  result: AnyDeciderOutput | null,
  expectedSubstring: string
): void {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("rejected");

  if (result!.status === "rejected") {
    expect(result!.message).toContain(expectedSubstring);
  }
}

// =============================================================================
// Failure Assertions
// =============================================================================

/**
 * Assert the failure reason contains a substring.
 *
 * @param result - The decider output (must be failed)
 * @param expectedSubstring - Substring expected in the reason
 * @throws AssertionError if result is not failed or reason doesn't contain substring
 *
 * @example
 * ```typescript
 * assertFailureReason(result, "Insufficient stock");
 * ```
 */
export function assertFailureReason(
  result: AnyDeciderOutput | null,
  expectedSubstring: string
): void {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("failed");

  if (result!.status === "failed") {
    expect(result!.reason).toContain(expectedSubstring);
  }
}

/**
 * Assert the failure event type matches.
 *
 * @param result - The decider output (must be failed)
 * @param expectedType - Expected failure event type
 * @throws AssertionError if result is not failed or event type doesn't match
 *
 * @example
 * ```typescript
 * assertFailureEventType(result, "ReservationFailed");
 * ```
 */
export function assertFailureEventType(
  result: AnyDeciderOutput | null,
  expectedType: string
): void {
  expect(result).not.toBeNull();
  expect(result!.status).toBe("failed");

  if (result!.status === "failed") {
    expect(result!.event.eventType).toBe(expectedType);
  }
}
