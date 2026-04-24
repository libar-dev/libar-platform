/**
 * Branded Types for Domain IDs
 *
 * Branded types (also called "nominal types" or "opaque types") prevent
 * accidentally mixing different ID types at compile time. For example,
 * passing a `CorrelationId` where a `CommandId` is expected will cause
 * a TypeScript error, even though both are strings at runtime.
 *
 * @example
 * ```typescript
 * function processCommand(commandId: CommandId, correlationId: CorrelationId) { ... }
 *
 * const cmd = toCommandId("cmd_123");
 * const corr = toCorrelationId("corr_456");
 *
 * processCommand(cmd, corr);  // OK
 * processCommand(corr, cmd);  // TypeScript error! Types are incompatible
 * ```
 *
 * @module
 */

// ============================================
// BRANDED TYPE DECLARATIONS
// ============================================

/**
 * Unique symbol for CommandId branding.
 * @internal
 */
declare const CommandIdBrand: unique symbol;

/**
 * A branded string type for command identifiers.
 * Ensures commands are uniquely identified and not confused with other ID types.
 */
export type CommandId = string & { readonly [CommandIdBrand]: void };

/**
 * Unique symbol for CorrelationId branding.
 * @internal
 */
declare const CorrelationIdBrand: unique symbol;

/**
 * A branded string type for correlation identifiers.
 * Links related commands and events in a causal chain.
 */
export type CorrelationId = string & { readonly [CorrelationIdBrand]: void };

/**
 * Unique symbol for CausationId branding.
 * @internal
 */
declare const CausationIdBrand: unique symbol;

/**
 * A branded string type for causation identifiers.
 * Identifies the direct cause (command or event) that triggered an action.
 */
export type CausationId = string & { readonly [CausationIdBrand]: void };

/**
 * Unique symbol for EventId branding.
 * @internal
 */
declare const EventIdBrand: unique symbol;

/**
 * A branded string type for event identifiers.
 * Uniquely identifies domain events in the event store.
 */
export type EventId = string & { readonly [EventIdBrand]: void };

/**
 * Unique symbol for StreamId branding.
 * @internal
 */
declare const StreamIdBrand: unique symbol;

/**
 * A branded string type for event stream identifiers.
 * Identifies an aggregate's event stream (e.g., "Order-123").
 */
export type StreamId = string & { readonly [StreamIdBrand]: void };

/**
 * Unique symbol for ApprovalId branding.
 * @internal
 */
declare const ApprovalIdBrand: unique symbol;

/**
 * A branded string type for human approval identifiers.
 */
export type ApprovalId = string & { readonly [ApprovalIdBrand]: void };

/**
 * Unique symbol for DecisionId branding.
 * @internal
 */
declare const DecisionIdBrand: unique symbol;

/**
 * A branded string type for agent decision identifiers.
 */
export type DecisionId = string & { readonly [DecisionIdBrand]: void };

/**
 * Unique symbol for AgentSubscriptionId branding.
 * @internal
 */
declare const AgentSubscriptionIdBrand: unique symbol;

/**
 * A branded string type for agent subscription identifiers.
 */
export type AgentSubscriptionId = string & { readonly [AgentSubscriptionIdBrand]: void };

/**
 * Unique symbol for LifecycleDecisionId branding.
 * @internal
 */
declare const LifecycleDecisionIdBrand: unique symbol;

/**
 * A branded string type for lifecycle audit decision identifiers.
 */
export type LifecycleDecisionId = string & { readonly [LifecycleDecisionIdBrand]: void };

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Convert a plain string to a CommandId.
 *
 * @param id - The string to brand as a CommandId
 * @returns The branded CommandId
 * @throws Error if the id is not a valid non-empty string
 *
 * @example
 * ```typescript
 * const commandId = toCommandId(generateCommandId());
 * ```
 */
export function toCommandId(id: string): CommandId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid CommandId: must be a non-empty string");
  }
  return id as CommandId;
}

/**
 * Convert a plain string to a CorrelationId.
 *
 * @param id - The string to brand as a CorrelationId
 * @returns The branded CorrelationId
 * @throws Error if the id is not a valid non-empty string
 *
 * @example
 * ```typescript
 * const correlationId = toCorrelationId(crypto.randomUUID());
 * ```
 */
export function toCorrelationId(id: string): CorrelationId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid CorrelationId: must be a non-empty string");
  }
  return id as CorrelationId;
}

/**
 * Convert a plain string to a CausationId.
 *
 * @param id - The string to brand as a CausationId
 * @returns The branded CausationId
 * @throws Error if the id is not a valid non-empty string
 */
export function toCausationId(id: string): CausationId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid CausationId: must be a non-empty string");
  }
  return id as CausationId;
}

/**
 * Convert a plain string to an EventId.
 *
 * @param id - The string to brand as an EventId
 * @returns The branded EventId
 * @throws Error if the id is not a valid non-empty string
 */
export function toEventId(id: string): EventId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid EventId: must be a non-empty string");
  }
  return id as EventId;
}

/**
 * Convert a plain string to a StreamId.
 *
 * @param id - The string to brand as a StreamId
 * @returns The branded StreamId
 * @throws Error if the id is not a valid non-empty string
 */
export function toStreamId(id: string): StreamId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid StreamId: must be a non-empty string");
  }
  return id as StreamId;
}

/**
 * Convert a plain string to an ApprovalId.
 */
export function toApprovalId(id: string): ApprovalId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid ApprovalId: must be a non-empty string");
  }
  return id as ApprovalId;
}

/**
 * Convert a plain string to a DecisionId.
 */
export function toDecisionId(id: string): DecisionId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid DecisionId: must be a non-empty string");
  }
  return id as DecisionId;
}

/**
 * Convert a plain string to an AgentSubscriptionId.
 */
export function toAgentSubscriptionId(id: string): AgentSubscriptionId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid AgentSubscriptionId: must be a non-empty string");
  }
  return id as AgentSubscriptionId;
}

/**
 * Convert a plain string to a LifecycleDecisionId.
 */
export function toLifecycleDecisionId(id: string): LifecycleDecisionId {
  if (!isValidIdString(id)) {
    throw new Error("Invalid LifecycleDecisionId: must be a non-empty string");
  }
  return id as LifecycleDecisionId;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a value is a valid ID string (non-empty).
 * Note: This only validates the string is non-empty, not that it's properly branded.
 *
 * @param value - The value to check
 * @returns True if the value is a non-empty string
 */
export function isValidIdString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
