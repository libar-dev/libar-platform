/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 * @libar-docs-core
 *
 * ## Event Store Durability Types
 *
 * Core types for durable event persistence patterns:
 * - Outbox pattern for action result capture
 * - Idempotent event append
 * - Durable cross-context publication
 * - Intent/completion bracketing
 * - Poison event handling
 *
 * ### When to Use
 *
 * Import these types when implementing any durability pattern. They provide
 * the shared vocabulary for event append operations, outbox handling,
 * cross-context publication, and failure recovery.
 *
 * @libar-docs-uses EventStoreFoundation, DurableFunctionAdapters, Workpool
 * @libar-docs-used-by idempotentAppend, outbox, durableAppend, publication, intentCompletion, poisonEvent
 */

import type { SafeMutationRef, SafeQueryRef } from "../function-refs/types.js";

// =============================================================================
// Base Context Types
// =============================================================================

/**
 * Base context interface for durability handler operations.
 *
 * Provides type-safe runQuery and runMutation methods that all
 * durability pattern handlers require. Extend this for specific
 * context needs (e.g., adding db access).
 */
export interface BaseHandlerContext {
  runQuery: <T>(ref: SafeQueryRef, args: Record<string, unknown>) => Promise<T>;
  runMutation: <T>(ref: SafeMutationRef, args: Record<string, unknown>) => Promise<T>;
}

// =============================================================================
// Idempotent Append Types
// =============================================================================

/**
 * Result of an idempotent append operation.
 */
export type IdempotentAppendResult =
  | { status: "appended"; eventId: string; version: number }
  | { status: "duplicate"; eventId: string; version: number };

/**
 * Event data for idempotent append.
 *
 * @typeParam TData - Type of the event data payload. Defaults to Record<string, unknown>
 *                   for flexibility, but can be narrowed for type-safe event handling.
 *
 * @example
 * ```typescript
 * interface OrderCreatedData {
 *   orderId: string;
 *   customerId: string;
 * }
 *
 * const event: IdempotentAppendEventData<OrderCreatedData> = {
 *   idempotencyKey: "order-123",
 *   eventType: "OrderCreated",
 *   eventData: { orderId: "123", customerId: "cust-1" }, // Type-safe
 *   // ...
 * };
 * ```
 */
export interface IdempotentAppendEventData<TData = Record<string, unknown>> {
  /** Unique key for idempotency check */
  idempotencyKey: string;
  /** Stream to append to */
  streamType: string;
  streamId: string;
  /** Event data */
  eventType: string;
  eventData: TData;
  /** Bounded context name */
  boundedContext: string;
  /** Optional metadata */
  correlationId?: string;
  causationId?: string;
  /** Expected stream version (0 for new streams) */
  expectedVersion?: number;
}

/**
 * Dependencies for idempotent append operation.
 *
 * These function references should come from the mounted event store component.
 * Example: components.eventStore.lib.getByIdempotencyKey
 */
export interface IdempotentAppendDependencies {
  /** Query to check for existing event by idempotency key */
  getByIdempotencyKey: SafeQueryRef;
  /** Mutation to append events to stream */
  appendToStream: SafeMutationRef;
}

/**
 * Configuration for idempotent event append.
 */
export interface IdempotentAppendConfig {
  /** Event data to append */
  event: IdempotentAppendEventData;
  /** Event store function references */
  dependencies: IdempotentAppendDependencies;
}

// =============================================================================
// Outbox Types
// =============================================================================

/**
 * Result from an action execution (passed to onComplete).
 */
export type ActionResult<T = unknown> =
  | { kind: "success"; returnValue: T }
  | { kind: "failed"; error: string }
  | { kind: "canceled" };

/**
 * Configuration for outbox handler factory.
 */
export interface OutboxHandlerConfig<TContext, TResult> {
  /** Function to extract idempotency key from context */
  getIdempotencyKey: (context: TContext) => string;
  /** Function to build event from result and context */
  buildEvent: (
    result: ActionResult<TResult>,
    context: TContext
  ) => {
    eventType: string;
    eventData: Record<string, unknown>;
    streamType: string;
    streamId: string;
  };
}

// =============================================================================
// Publication Types
// =============================================================================

/**
 * Publication status for cross-context event delivery.
 */
export type PublicationStatus = "pending" | "delivered" | "failed" | "dead_letter" | "retried";

/**
 * Publication tracking record.
 */
export interface EventPublication {
  eventId: string;
  sourceContext: string;
  targetContext: string;
  status: PublicationStatus;
  attempts: number;
  lastAttemptAt?: number;
  deliveredAt?: number;
  error?: string;
  createdAt: number;
}

/**
 * Configuration for durable event publisher.
 */
export interface DurablePublisherConfig {
  /** Maximum delivery attempts before dead letter */
  maxAttempts: number;
  /** Initial backoff in ms */
  initialBackoffMs: number;
  /** Backoff multiplier base */
  base: number;
}

// =============================================================================
// Intent/Completion Types
// =============================================================================

/**
 * Intent event marker - records start of long-running operation.
 */
export interface IntentEvent {
  intentKey: string;
  operationType: string;
  startedAt: number;
  timeoutMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Completion status for intent events.
 */
export type CompletionStatus = "success" | "failure" | "abandoned";

/**
 * Completion event marker - records end of long-running operation.
 */
export interface CompletionEvent {
  intentKey: string;
  status: CompletionStatus;
  completedAt: number;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Configuration for intent/completion pattern.
 */
export interface IntentCompletionConfig {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Action to take on timeout */
  onTimeout: "abandon" | "alert" | "retry";
}

// =============================================================================
// Poison Event Types
// =============================================================================

/**
 * Poison event tracking record.
 */
export interface PoisonEventRecord {
  eventId: string;
  projectionName: string;
  attempts: number;
  lastError: string;
  quarantinedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Configuration for poison event handling.
 */
export interface PoisonEventConfig {
  /** Number of failures before quarantine */
  maxAttempts: number;
  /** Whether to alert on quarantine */
  alertOnQuarantine: boolean;
}

// =============================================================================
// Dead Letter Types
// =============================================================================

/**
 * Dead letter record for failed appends or publications.
 */
export interface DeadLetterRecord {
  type: "append" | "publication";
  /** Original operation details */
  operation: Record<string, unknown>;
  /** Error that caused dead letter */
  error: string;
  /** Number of attempts before dead letter */
  attempts: number;
  /** Current status */
  status: "pending" | "retried" | "ignored";
  createdAt: number;
  updatedAt: number;
}

/**
 * Statistics for dead letters by category.
 */
export interface DeadLetterStats {
  total: number;
  pending: number;
  retried: number;
  ignored: number;
  byContext?: Record<string, number>;
}
