/**
 * Core command types for CQRS command handling.
 */
import type { UnknownRecord } from "../types.js";

/**
 * Metadata attached to every command.
 */
export interface CommandMetadata {
  /** Unique command identifier for idempotency */
  commandId: string;

  /** Type of the command (e.g., "CreateOrder", "AddItem") */
  commandType: string;

  /** ID to correlate related commands and events */
  correlationId: string;

  /** User who initiated the command (optional) */
  userId?: string;

  /** Timestamp when the command was created */
  timestamp: number;
}

/**
 * A command with typed payload.
 */
export interface Command<TPayload = unknown> extends CommandMetadata {
  /** The bounded context this command targets */
  targetContext: string;

  /** The command data/payload */
  payload: TPayload;
}

/**
 * Result of a successful command execution.
 */
export interface CommandSuccessResult<TData = unknown> {
  status: "success";
  data: TData;
  version: number;
}

/**
 * Result when a command is rejected due to business rules.
 */
export interface CommandRejectedResult {
  status: "rejected";
  code: string;
  reason: string;
  context?: UnknownRecord;
}

/**
 * Result when there's a concurrency conflict.
 */
export interface CommandConflictResult {
  status: "conflict";
  code: "CONCURRENT_MODIFICATION";
  currentVersion: number;
}

/**
 * Result when an unexpected error occurs.
 */
export interface CommandErrorResult {
  status: "error";
  message: string;
}

/**
 * Union type for all possible command results.
 */
export type CommandResult<TData = unknown> =
  | CommandSuccessResult<TData>
  | CommandRejectedResult
  | CommandConflictResult
  | CommandErrorResult;

/**
 * Handler function for a command.
 */
export type CommandHandler<TPayload, TResult = unknown> = (
  command: Command<TPayload>
) => Promise<CommandResult<TResult>>;

/**
 * Command status in the command store.
 */
export type CommandStatus = "pending" | "executed" | "rejected" | "failed";

/**
 * Stored command record.
 */
export interface StoredCommand<TPayload = unknown> extends Command<TPayload> {
  /** Current status of the command */
  status: CommandStatus;

  /** The result after execution (if executed) */
  result?: CommandResult;

  /** When the command was executed */
  executedAt?: number;

  /** TTL for cleanup */
  ttl: number;
}

/**
 * Utility type to extract the payload type from a Command.
 *
 * @example
 * ```typescript
 * type CreateOrderCommand = Command<{ orderId: string; customerId: string }>;
 * type Payload = ExtractCommandPayload<CreateOrderCommand>;
 * // Payload is { orderId: string; customerId: string }
 * ```
 */
export type ExtractCommandPayload<T> = T extends Command<infer P> ? P : never;
