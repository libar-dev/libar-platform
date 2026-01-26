/**
 * Correlation chain functions for creating and deriving chains.
 *
 * These functions implement the causation graph pattern where:
 * - correlationId links all related operations (preserved)
 * - causationId tracks direct cause-effect relationships (changes)
 */

import { generateCommandId, generateCorrelationId } from "../ids/index.js";
import { toCausationId, type CommandId } from "../ids/branded.js";
import type {
  CorrelationChain,
  CreateCorrelationChainOptions,
  DeriveCorrelationChainOptions,
  CausationSource,
  CorrelationEnrichedMetadata,
} from "./types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Create a new correlation chain for an initiating command.
 *
 * This is used at the start of a request flow when a command is received.
 * The commandId becomes both the identifier and the initial causationId.
 *
 * @param commandId - The command identifier (use generateCommandId() to create)
 * @param options - Optional configuration
 * @returns A new CorrelationChain
 *
 * @example
 * ```typescript
 * // In CommandOrchestrator.execute():
 * const commandId = generateCommandId();
 * const chain = createCorrelationChain(commandId, {
 *   userId: ctx.auth?.userId,
 *   context: { source: "api", version: "v1" }
 * });
 *
 * // chain.correlationId is auto-generated
 * // chain.causationId === commandId (command is its own cause)
 * ```
 */
export function createCorrelationChain(
  commandId: CommandId,
  options?: CreateCorrelationChainOptions
): CorrelationChain {
  const correlationId = options?.correlationId ?? generateCorrelationId();

  // Build chain with conditional spread for optional properties.
  // This pattern complies with exactOptionalPropertyTypes by only
  // including properties when they have defined values.
  const chain: CorrelationChain = {
    commandId,
    correlationId,
    causationId: toCausationId(commandId), // Initial command is its own cause
    initiatedAt: options?.initiatedAt ?? Date.now(),
    ...(options?.userId !== undefined && { userId: options.userId }),
    ...(options?.context !== undefined && { context: options.context }),
  };

  return chain;
}

/**
 * Derive a correlation chain from a parent event.
 *
 * This is used when an event triggers a subsequent command (event reaction).
 * The correlationId is preserved to maintain the request trace, while
 * the causationId is updated to point to the triggering event.
 *
 * @param source - The event that caused this chain
 * @param options - Optional configuration
 * @returns A derived CorrelationChain
 *
 * @example
 * ```typescript
 * // In a saga or event handler reacting to OrderSubmitted:
 * const parentEvent = {
 *   eventId: "evt_abc123",
 *   correlationId: "corr_xyz",
 *   userId: "user_123"
 * };
 *
 * const chain = deriveCorrelationChain(parentEvent);
 *
 * // chain.correlationId === "corr_xyz" (preserved)
 * // chain.causationId === "evt_abc123" (points to parent event)
 * // chain.commandId is auto-generated
 * ```
 */
export function deriveCorrelationChain(
  source: CausationSource,
  options?: DeriveCorrelationChainOptions
): CorrelationChain {
  const commandId = options?.commandId ?? generateCommandId();

  // Merge parent context with new context (new context takes precedence)
  // Only create merged context if at least one source has context
  const hasSourceContext = source.context !== undefined;
  const hasOptionsContext = options?.context !== undefined;
  const mergedContext =
    hasSourceContext || hasOptionsContext ? { ...source.context, ...options?.context } : undefined;

  // Build chain with conditional spread for optional properties.
  // This pattern complies with exactOptionalPropertyTypes by only
  // including properties when they have defined values.
  const chain: CorrelationChain = {
    commandId,
    correlationId: source.correlationId, // Preserved from parent
    causationId: toCausationId(source.eventId), // Points to triggering event
    initiatedAt: options?.initiatedAt ?? Date.now(),
    ...(source.userId !== undefined && { userId: source.userId }),
    ...(mergedContext !== undefined && { context: mergedContext }),
  };

  return chain;
}

/**
 * Extract correlation-enriched metadata from a chain.
 *
 * This creates the metadata object expected by event constructors,
 * including correlationId, causationId, and optional userId.
 *
 * @param chain - The correlation chain
 * @param additionalMetadata - Optional additional metadata to include
 * @returns Metadata object for event construction
 *
 * @example
 * ```typescript
 * const chain = createCorrelationChain(commandId, { userId: "user_123" });
 *
 * const event = {
 *   eventId,
 *   eventType: "OrderCreated",
 *   payload: { orderId, items },
 *   metadata: toEventMetadata(chain, { requestId: "req_xyz" })
 * };
 *
 * // metadata = {
 * //   correlationId: "corr_...",
 * //   causationId: "cmd_...",
 * //   userId: "user_123",
 * //   requestId: "req_xyz"
 * // }
 * ```
 */
export function toEventMetadata(
  chain: CorrelationChain,
  additionalMetadata?: UnknownRecord
): CorrelationEnrichedMetadata {
  const metadata: CorrelationEnrichedMetadata = {
    correlationId: chain.correlationId,
    causationId: chain.causationId,
  };

  if (chain.userId !== undefined) {
    metadata.userId = chain.userId;
  }

  if (additionalMetadata) {
    // Exclude reserved correlation fields to prevent accidental overwrites
    for (const [key, value] of Object.entries(additionalMetadata)) {
      if (key !== "correlationId" && key !== "causationId") {
        (metadata as UnknownRecord)[key] = value;
      }
    }
  }

  return metadata;
}

/**
 * Check if two chains share the same correlation (part of same request flow).
 *
 * @param chainA - First chain
 * @param chainB - Second chain
 * @returns True if chains share the same correlationId
 *
 * @example
 * ```typescript
 * const initial = createCorrelationChain(generateCommandId());
 * const derived = deriveCorrelationChain({ eventId: "evt_1", correlationId: initial.correlationId });
 *
 * isCorrelated(initial, derived); // true
 * ```
 */
export function isCorrelated(chainA: CorrelationChain, chainB: CorrelationChain): boolean {
  return chainA.correlationId === chainB.correlationId;
}

/**
 * Check if chainB was caused by chainA.
 *
 * This checks if chainB's causationId points to any event that would have
 * been created with chainA (by comparing to chainA's commandId).
 *
 * Note: This is a heuristic check - for precise causation tracking,
 * you should track the full causation chain via event IDs.
 *
 * @param parent - Potential parent chain
 * @param child - Potential child chain
 * @returns True if child's causationId matches parent's commandId
 */
export function isCausedBy(parent: CorrelationChain, child: CorrelationChain): boolean {
  // Compare underlying string values since CausationId may hold a CommandId value
  return (child.causationId as string) === (parent.commandId as string);
}
