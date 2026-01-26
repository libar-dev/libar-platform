/**
 * CommandBus client wrapper for type-safe command handling.
 */
import type {
  FunctionReference,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDataModel,
} from "convex/server";

/**
 * Arguments for recording a command.
 */
export interface RecordCommandArgs {
  commandId: string;
  commandType: string;
  targetContext: string;
  payload: unknown;
  metadata: {
    userId?: string;
    correlationId: string;
    timestamp: number;
  };
  ttl?: number;
  [key: string]: unknown;
}

/**
 * Result of recording a command.
 */
export type RecordCommandResult =
  | { status: "new" }
  | {
      status: "duplicate";
      commandStatus: "pending" | "executed" | "rejected" | "failed";
      result?: unknown;
    };

/**
 * Arguments for updating command result.
 */
export interface UpdateCommandResultArgs {
  commandId: string;
  status: "executed" | "rejected" | "failed";
  result?: unknown;
  [key: string]: unknown;
}

/**
 * Arguments for getting command status.
 */
export interface GetCommandStatusArgs {
  commandId: string;
  [key: string]: unknown;
}

/**
 * Arguments for getting commands by correlation ID.
 */
export interface GetByCorrelationArgs {
  correlationId: string;
  [key: string]: unknown;
}

/**
 * Arguments for cleanup.
 */
export interface CleanupExpiredArgs {
  batchSize?: number;
  [key: string]: unknown;
}

/**
 * Result from cleanup operation.
 */
export interface CleanupExpiredResult {
  commands: number;
  correlations: number;
}

/**
 * Command status info.
 */
export interface CommandStatusInfo {
  commandId: string;
  commandType: string;
  targetContext: string;
  status: "pending" | "executed" | "rejected" | "failed";
  result?: unknown;
  executedAt?: number;
}

/**
 * Command by correlation result.
 */
export interface CommandByCorrelationInfo {
  commandId: string;
  commandType: string;
  targetContext: string;
  status: "pending" | "executed" | "rejected" | "failed";
  result?: unknown;
  executedAt?: number;
  timestamp: number;
}

/**
 * Context type for mutations.
 * Using GenericMutationCtx for proper type safety while remaining
 * compatible with any app's data model.
 */
type MutationCtx = GenericMutationCtx<GenericDataModel>;

/**
 * Context type for queries.
 */
type QueryCtx = GenericQueryCtx<GenericDataModel>;

/**
 * Type for the component API.
 * This will be provided by the consuming application's generated types.
 */
export interface CommandBusApi {
  lib: {
    recordCommand: FunctionReference<
      "mutation",
      "internal",
      RecordCommandArgs,
      RecordCommandResult
    >;
    updateCommandResult: FunctionReference<
      "mutation",
      "internal",
      UpdateCommandResultArgs,
      boolean
    >;
    getCommandStatus: FunctionReference<
      "query",
      "internal",
      GetCommandStatusArgs,
      CommandStatusInfo | null
    >;
    getByCorrelation: FunctionReference<
      "query",
      "internal",
      GetByCorrelationArgs,
      CommandByCorrelationInfo[]
    >;
    cleanupExpired: FunctionReference<
      "mutation",
      "internal",
      CleanupExpiredArgs,
      CleanupExpiredResult
    >;
  };
}

/**
 * @libar-docs
 * @libar-docs-pattern CommandBus
 * @libar-docs-command @libar-docs-overview @libar-docs-core
 * @libar-docs-status completed
 * @libar-docs-usecase "Ensuring command idempotency"
 * @libar-docs-usecase "Tracking command execution status"
 * @libar-docs-used-by CommandOrchestrator
 *
 * ## CommandBus - Command Idempotency Infrastructure
 *
 * Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency. Provides command
 * idempotency at the infrastructure layer, ensuring commands with the same
 * `commandId` are only executed once.
 *
 * ### When to Use
 *
 * - Ensuring commands are only processed once
 * - Tracking command status (pending/executed/rejected/failed)
 * - Recording command-event correlations for audit trails
 *
 * ### Key Features
 *
 * | Feature | Description |
 * |---------|-------------|
 * | **Idempotency** | Duplicate commands return cached results |
 * | **Status Tracking** | `pending` → `executed` / `rejected` / `failed` |
 * | **Correlation** | Commands linked via `correlationId` for tracing |
 * | **TTL Cleanup** | Expired commands cleaned up periodically |
 *
 * ### Command Flow
 *
 * 1. **recordCommand** - Check for duplicate, register if new
 * 2. **Execute handler** - Process the business logic (in bounded context)
 * 3. **updateCommandResult** - Record final status and result
 *
 * This pattern ensures exactly-once semantics even with retries.
 *
 * @example
 * ```typescript
 * import { CommandBus } from "@libar-dev/platform-bus";
 * import { components } from "./_generated/api";
 *
 * const commandBus = new CommandBus(components.commandBus);
 *
 * // 1. Record command (check idempotency)
 * const recordResult = await commandBus.recordCommand(ctx, {
 *   commandId,
 *   commandType: "CreateOrder",
 *   targetContext: "orders",
 *   payload: { customerId, items },
 *   metadata: { correlationId, timestamp: Date.now() },
 * });
 *
 * if (recordResult.status === "duplicate") {
 *   return recordResult.result;  // Return cached result
 * }
 *
 * // 2. Execute handler
 * const result = await handleCreateOrder(ctx, payload);
 *
 * // 3. Update status
 * await commandBus.updateCommandResult(ctx, {
 *   commandId,
 *   status: result.status === "success" ? "executed" : "rejected",
 *   result,
 * });
 * ```
 */
export class CommandBus<TApi extends CommandBusApi = CommandBusApi> {
  constructor(public readonly component: TApi) {}

  /**
   * Record a command for idempotency tracking.
   *
   * If a command with the same commandId already exists, returns
   * the existing status and result.
   */
  async recordCommand(ctx: MutationCtx, args: RecordCommandArgs): Promise<RecordCommandResult> {
    return ctx.runMutation(this.component.lib.recordCommand, args);
  }

  /**
   * Update command result after execution.
   */
  async updateCommandResult(ctx: MutationCtx, args: UpdateCommandResultArgs): Promise<boolean> {
    return ctx.runMutation(this.component.lib.updateCommandResult, args);
  }

  /**
   * Get command status and result.
   */
  async getCommandStatus(
    ctx: QueryCtx,
    args: GetCommandStatusArgs
  ): Promise<CommandStatusInfo | null> {
    return ctx.runQuery(this.component.lib.getCommandStatus, args);
  }

  /**
   * Get commands by correlation ID (for tracing).
   */
  async getByCorrelation(
    ctx: QueryCtx,
    args: GetByCorrelationArgs
  ): Promise<CommandByCorrelationInfo[]> {
    return ctx.runQuery(this.component.lib.getByCorrelation, args);
  }

  /**
   * Cleanup expired commands and correlations.
   * Should be called periodically via cron.
   */
  async cleanupExpired(
    ctx: MutationCtx,
    args: CleanupExpiredArgs = {}
  ): Promise<CleanupExpiredResult> {
    return ctx.runMutation(this.component.lib.cleanupExpired, args);
  }
}
