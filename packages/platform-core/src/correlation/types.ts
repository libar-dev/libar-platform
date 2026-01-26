/**
 * @libar-docs
 * @libar-docs-pattern CorrelationChainSystem
 * @libar-docs-status completed
 * @libar-docs-phase 09
 * @libar-docs-uses EventStoreFoundation
 * @libar-docs-used-by CommandOrchestrator, SagaOrchestration
 *
 * ## Correlation Chain - Request Tracing
 *
 * Correlation types for tracking causal relationships in command-event flows.
 * Provides structured tracing via commandId, correlationId, and causationId.
 *
 * ### When to Use
 *
 * - Tracking causal relationships between commands and events
 * - Idempotency via commandId in Command Bus
 * - Request tracing across BC boundaries via correlationId
 * - Deriving new correlation chains from parent events (PMs, Sagas)
 */
import type { UnknownRecord } from "../types.js";
import type { CommandId, CorrelationId, CausationId, EventId } from "../ids/branded.js";

/**
 * A correlation chain bundles all tracing identifiers for a request flow.
 *
 * This immutable structure tracks the relationship between commands and events:
 * - `commandId`: The initiating command (for idempotency)
 * - `correlationId`: Links all related events (preserved across reactions)
 * - `causationId`: Points to the direct cause (changes with each step)
 *
 * @example
 * ```
 * // Flow: User submits order -> OrderSubmitted event -> triggers ReserveStock command
 *
 * // Initial chain from SubmitOrder command:
 * {
 *   commandId: "cmd_abc",
 *   correlationId: "corr_xyz",
 *   causationId: "cmd_abc",     // Command is its own cause
 *   userId: "user_123",
 *   initiatedAt: 1703001234567
 * }
 *
 * // Derived chain for ReserveStock (triggered by OrderSubmitted event):
 * {
 *   commandId: "cmd_def",        // New command ID
 *   correlationId: "corr_xyz",   // Same correlation (linked request)
 *   causationId: "evt_abc123",   // Points to OrderSubmitted event
 *   userId: "user_123",
 *   initiatedAt: 1703001234789
 * }
 * ```
 */
export interface CorrelationChain {
  /**
   * Unique identifier for the command instance.
   * Used for idempotency checking in the Command Bus.
   */
  readonly commandId: CommandId;

  /**
   * Links all events and commands in a request flow.
   * Preserved when deriving chains for event reactions.
   */
  readonly correlationId: CorrelationId;

  /**
   * Points to the direct cause of this chain.
   * For initial commands: equals commandId
   * For derived chains: equals the triggering event's ID
   */
  readonly causationId: CausationId;

  /**
   * Optional user ID who initiated the request.
   * Preserved when deriving chains.
   */
  readonly userId?: string;

  /**
   * Timestamp when this chain was created.
   */
  readonly initiatedAt: number;

  /**
   * Optional additional context for tracing.
   * Can include request metadata, feature flags, etc.
   */
  readonly context?: UnknownRecord;
}

/**
 * Options for creating a new correlation chain.
 */
export interface CreateCorrelationChainOptions {
  /**
   * Optional user ID who initiated the request.
   */
  userId?: string;

  /**
   * Optional custom correlation ID.
   * If not provided, one will be generated.
   */
  correlationId?: CorrelationId;

  /**
   * Optional additional context.
   */
  context?: UnknownRecord;

  /**
   * Optional custom timestamp.
   * Defaults to Date.now().
   */
  initiatedAt?: number;
}

/**
 * Options for deriving a correlation chain from a parent event.
 */
export interface DeriveCorrelationChainOptions {
  /**
   * Optional new command ID for the derived chain.
   * If not provided, one will be generated.
   */
  commandId?: CommandId;

  /**
   * Optional additional context to merge with parent context.
   */
  context?: UnknownRecord;

  /**
   * Optional custom timestamp.
   * Defaults to Date.now().
   */
  initiatedAt?: number;
}

/**
 * Minimal event info needed to derive a correlation chain.
 */
export interface CausationSource {
  /**
   * The event ID that becomes the new causationId.
   */
  eventId: EventId;

  /**
   * The correlation ID to preserve.
   */
  correlationId: CorrelationId;

  /**
   * Optional user ID to inherit.
   */
  userId?: string;

  /**
   * Optional context to inherit.
   */
  context?: UnknownRecord;
}

/**
 * Enriched metadata combining correlation chain with event metadata.
 * Used when constructing events from a correlation chain.
 */
export interface CorrelationEnrichedMetadata {
  correlationId: CorrelationId;
  causationId: CausationId;
  userId?: string;
  [key: string]: unknown;
}
