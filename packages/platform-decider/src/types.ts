/**
 * @libar-docs
 * @libar-docs-pattern HandlerFactories
 * @libar-docs-status completed
 * @libar-docs-phase 14
 * @libar-docs-decider
 * @libar-docs-uses DeciderPattern
 *
 * ## Handler Factories - Decider-to-Handler Wrappers
 *
 * ## Decider Pattern - Pure Domain Decision Logic
 *
 * The **Decider** pattern separates pure business logic from infrastructure concerns,
 * enabling unit testing without database dependencies.
 *
 * ### When to Use
 *
 * - Command validation requires complex business rules
 * - You want property-based testing of domain invariants
 * - Multiple handlers share similar decision logic
 * - Decoupling domain logic from Convex mutation context
 *
 * ### Core Types
 *
 * | Type | Purpose |
 * |------|---------|
 * | `DeciderOutput` | Union of success, rejected, or failed |
 * | `DeciderSuccess` | Successful decision with event and state update |
 * | `DeciderRejected` | Validation failure, no event emitted |
 * | `DeciderFailed` | Business failure WITH event (e.g., `ReservationFailed`) |
 * | `DeciderContext` | Timestamp, commandId, correlationId |
 *
 * ### Helper Functions
 *
 * | Function | Returns | Purpose |
 * |----------|---------|---------|
 * | `success()` | `DeciderSuccess` | Build successful output |
 * | `rejected()` | `DeciderRejected` | Build validation failure |
 * | `failed()` | `DeciderFailed` | Build business failure with event |
 * | `isSuccess()` | `boolean` | Type guard for success |
 * | `isRejected()` | `boolean` | Type guard for rejection |
 * | `isFailed()` | `boolean` | Type guard for failure |
 *
 * ### Decider vs Handler
 *
 * | Concern | Decider (**Pure**) | Handler (Effectful) |
 * |---------|-------------------|---------------------|
 * | I/O | None | Load CMS, persist, enqueue |
 * | Testability | Unit tests | Integration tests |
 * | Side effects | Never | Always |
 * | Returns | `DeciderOutput` | `CommandHandlerResult` |
 *
 * ### Relationship to Other Patterns
 *
 * - Uses **FSM** for state transition validation
 * - Wrapped by **createDeciderHandler** factory
 * - Called by **CommandOrchestrator** through handlers
 *
 * @example
 * ```typescript
 * import { success, rejected, type DeciderOutput } from "@libar-dev/platform-decider";
 *
 * // Pure decider function - no I/O, fully testable
 * export function decideSubmitOrder(
 *   state: OrderCMS,
 *   command: { orderId: string },
 *   context: DeciderContext
 * ): DeciderOutput<OrderSubmittedEvent, SubmitOrderData, OrderStateUpdate> {
 *   // Validate invariants (pure)
 *   if (state.status !== "draft") {
 *     return rejected("ORDER_NOT_IN_DRAFT", `Order is ${state.status}`);
 *   }
 *   if (state.items.length === 0) {
 *     return rejected("ORDER_HAS_NO_ITEMS", "Order must have items");
 *   }
 *
 *   // Build success response (pure)
 *   return success({
 *     data: { orderId: state.orderId, totalAmount: state.totalAmount },
 *     event: {
 *       eventType: "OrderSubmitted",
 *       payload: { orderId: state.orderId, items: state.items },
 *     },
 *     stateUpdate: { status: "submitted" },
 *   });
 * }
 * ```
 *
 * @module @libar-dev/platform-decider
 */

// =============================================================================
// Core Type Aliases (duplicated from platform-core for Layer 0 independence)
// =============================================================================

/**
 * Alias for Record<string, unknown>.
 *
 * Used for:
 * - Command args
 * - Handler args
 * - Event payloads
 * - Generic object types where structure is unknown at compile time
 */
export type UnknownRecord = Record<string, unknown>;

// =============================================================================
// Core Decider Types
// =============================================================================

/**
 * Base type for event payloads - allows any object type.
 *
 * Uses `object` as the constraint rather than `Record<string, unknown>`
 * to allow concrete interfaces without requiring index signatures.
 * The typed payload interfaces (e.g., OrderSubmittedPayload) extend
 * this implicitly as they are object types.
 */
export type EventPayload = object;

/**
 * Event payload for decider output.
 *
 * Minimal event structure that the decider produces.
 * The handler wrapper adds infrastructure fields (eventId, streamId, metadata).
 *
 * @typeParam TPayload - The typed event payload
 */
export interface DeciderEvent<TPayload extends EventPayload = EventPayload> {
  /**
   * Event type name (e.g., "OrderSubmitted").
   */
  eventType: string;

  /**
   * Event payload data.
   */
  payload: TPayload;
}

/**
 * Successful decider output.
 *
 * Contains the event to emit, data to return, and state updates to apply.
 *
 * @typeParam TEvent - The event type with typed payload
 * @typeParam TData - The typed success data returned to caller
 * @typeParam TStateUpdate - Partial state update to apply to CMS
 */
export interface DeciderSuccess<
  TEvent extends DeciderEvent = DeciderEvent,
  TData = UnknownRecord,
  TStateUpdate = UnknownRecord,
> {
  status: "success";

  /**
   * Data returned to the caller (what goes in CommandHandlerSuccess.data).
   */
  data: TData;

  /**
   * Event to emit (eventType + payload only, infrastructure adds the rest).
   */
  event: TEvent;

  /**
   * Partial state update to apply to CMS.
   * Handler wrapper merges this with version increment and timestamp.
   */
  stateUpdate: TStateUpdate;
}

/**
 * Rejected decider output (validation failure, no event emitted).
 *
 * Maps to CommandHandlerRejected - validation errors that don't emit events.
 */
export interface DeciderRejected {
  status: "rejected";

  /**
   * Error code (e.g., "ORDER_NOT_IN_DRAFT").
   */
  code: string;

  /**
   * Human-readable error message.
   */
  message: string;

  /**
   * Optional context for error details.
   */
  context?: UnknownRecord;
}

/**
 * Failed decider output (business failure with event).
 *
 * Maps to CommandHandlerFailed - business failures that DO emit events.
 * Example: ReserveStock failing due to insufficient stock emits ReservationFailed.
 *
 * @typeParam TEvent - The failure event type
 */
export interface DeciderFailed<TEvent extends DeciderEvent = DeciderEvent> {
  status: "failed";

  /**
   * Reason for the failure.
   */
  reason: string;

  /**
   * Failure event to emit.
   */
  event: TEvent;

  /**
   * Optional context for failure details.
   */
  context?: UnknownRecord;
}

/**
 * Combined output type from a decider function.
 *
 * @typeParam TEvent - Event type for success
 * @typeParam TData - Success data type
 * @typeParam TStateUpdate - State update type
 * @typeParam TFailEvent - Event type for failures (optional)
 */
export type DeciderOutput<
  TEvent extends DeciderEvent = DeciderEvent,
  TData = UnknownRecord,
  TStateUpdate = UnknownRecord,
  TFailEvent extends DeciderEvent = DeciderEvent,
> = DeciderSuccess<TEvent, TData, TStateUpdate> | DeciderRejected | DeciderFailed<TFailEvent>;

// =============================================================================
// Decider Function Types
// =============================================================================

/**
 * Context provided to decider functions.
 *
 * Contains metadata needed for event construction that the pure function
 * shouldn't have to generate (like timestamps, IDs).
 */
export interface DeciderContext {
  /**
   * Current timestamp (Date.now()).
   */
  now: number;

  /**
   * Command ID for causation tracking.
   */
  commandId: string;

  /**
   * Correlation ID for request tracing.
   */
  correlationId: string;
}

/**
 * A pure decider function.
 *
 * Takes current state and command input, returns decision output.
 * Must be pure: no side effects, no I/O, deterministic for same inputs.
 *
 * @typeParam TState - Current state type (e.g., OrderCMS)
 * @typeParam TCommand - Command input type (excluding commandId/correlationId)
 * @typeParam TEvent - Event type for success
 * @typeParam TData - Success data type
 * @typeParam TStateUpdate - State update type
 */
export type DeciderFn<TState, TCommand, TEvent extends DeciderEvent, TData, TStateUpdate> = (
  state: TState,
  command: TCommand,
  context: DeciderContext
) => DeciderOutput<TEvent, TData, TStateUpdate>;

/**
 * Full Decider definition with decide and evolve functions.
 *
 * While `decide` is the primary function, `evolve` enables testing
 * state transitions and can be used for projections.
 *
 * @typeParam TState - State type
 * @typeParam TCommand - Command input type
 * @typeParam TEvent - Event type
 * @typeParam TData - Success data type
 * @typeParam TStateUpdate - State update type
 */
export interface Decider<
  TState,
  TCommand,
  TEvent extends DeciderEvent,
  TData = UnknownRecord,
  TStateUpdate = Partial<TState>,
> {
  /**
   * Decide what events to emit based on current state and command.
   */
  decide: DeciderFn<TState, TCommand, TEvent, TData, TStateUpdate>;

  /**
   * Evolve state by applying an event.
   * Used for projections and testing.
   */
  evolve: (state: TState, event: TEvent) => TState;
}

// =============================================================================
// Helper Functions for Creating Outputs
// =============================================================================

/**
 * Create a success output from a decider.
 *
 * @example
 * ```typescript
 * return success({
 *   data: { orderId, totalAmount },
 *   event: { eventType: "OrderSubmitted", payload: { orderId, items } },
 *   stateUpdate: { status: "submitted" },
 * });
 * ```
 */
export function success<TEvent extends DeciderEvent, TData, TStateUpdate>(
  output: Omit<DeciderSuccess<TEvent, TData, TStateUpdate>, "status">
): DeciderSuccess<TEvent, TData, TStateUpdate> {
  return { status: "success", ...output };
}

/**
 * Create a rejected output from a decider.
 *
 * @example
 * ```typescript
 * return rejected("ORDER_NOT_IN_DRAFT", "Order must be in draft status");
 * ```
 */
export function rejected(code: string, message: string, context?: UnknownRecord): DeciderRejected {
  const result: DeciderRejected = { status: "rejected", code, message };
  if (context !== undefined) {
    result.context = context;
  }
  return result;
}

/**
 * Create a failed output from a decider (business failure with event).
 *
 * @example
 * ```typescript
 * return failed(
 *   "Insufficient stock available",
 *   { eventType: "ReservationFailed", payload: { orderId, reason: "insufficient_stock" } },
 * );
 * ```
 */
export function failed<TEvent extends DeciderEvent>(
  reason: string,
  event: TEvent,
  context?: UnknownRecord
): DeciderFailed<TEvent> {
  const result: DeciderFailed<TEvent> = { status: "failed", reason, event };
  if (context !== undefined) {
    result.context = context;
  }
  return result;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if decider output is a success.
 * Uses broad type constraint to work with any DeciderOutput variant.
 */
export function isSuccess<
  TEvent extends DeciderEvent = DeciderEvent,
  TData = unknown,
  TStateUpdate = unknown,
>(
  output: DeciderOutput<TEvent, TData, TStateUpdate>
): output is DeciderSuccess<TEvent, TData, TStateUpdate> {
  return output.status === "success";
}

/**
 * Check if decider output is a rejection.
 */
export function isRejected<
  TEvent extends DeciderEvent = DeciderEvent,
  TData = unknown,
  TStateUpdate = unknown,
>(output: DeciderOutput<TEvent, TData, TStateUpdate>): output is DeciderRejected {
  return output.status === "rejected";
}

/**
 * Check if decider output is a failure.
 */
export function isFailed<
  TEvent extends DeciderEvent = DeciderEvent,
  TData = unknown,
  TStateUpdate = unknown,
  TFailEvent extends DeciderEvent = DeciderEvent,
>(
  output: DeciderOutput<TEvent, TData, TStateUpdate, TFailEvent>
): output is DeciderFailed<TFailEvent> {
  return output.status === "failed";
}
