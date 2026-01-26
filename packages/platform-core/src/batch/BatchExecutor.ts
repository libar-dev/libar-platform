/**
 * Batch Executor
 *
 * Executes multiple commands as a batch operation.
 * Supports atomic (single-aggregate) and partial (best-effort) modes.
 */
import type {
  BatchCommand,
  BatchOptions,
  BatchResult,
  BatchItemResult,
  BatchSummary,
  BatchExecutorConfig,
  CommandExecutor,
} from "./types.js";
import { validateBatch } from "./validation.js";
import { generateCommandId, generateCorrelationId } from "../ids/generator.js";
import type { CorrelationId } from "../ids/branded.js";
import { assertNever, type UnknownRecord } from "../types.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/**
 * Default maximum concurrency for partial mode.
 */
const DEFAULT_MAX_CONCURRENCY = 10;

/**
 * Calculate batch summary from collected results.
 * This ensures accurate counts by deriving from actual results,
 * avoiding any potential issues with concurrent counter updates.
 */
function calculateSummary<TData>(
  results: BatchItemResult<TData>[],
  totalDurationMs: number
): BatchSummary {
  let succeeded = 0;
  let failed = 0;
  let rejected = 0;
  let skipped = 0;

  for (const result of results) {
    switch (result.status) {
      case "success":
        succeeded++;
        break;
      case "failed":
        failed++;
        break;
      case "rejected":
        rejected++;
        break;
      case "skipped":
        skipped++;
        break;
      default:
        // Exhaustiveness check - TypeScript will error if a new status is added
        assertNever(result.status);
    }
  }

  return {
    total: results.length,
    succeeded,
    failed,
    rejected,
    skipped,
    totalDurationMs,
  };
}

/**
 * Batch command executor.
 *
 * Executes multiple commands with support for:
 * - Atomic mode: Sequential execution, single-aggregate scope
 * - Partial mode: Concurrent execution, continue on errors
 *
 * @example
 * ```typescript
 * const executor = new BatchExecutor({
 *   executor: async (type, args, opts) => {
 *     return orchestrator.execute(ctx, getConfig(type), args, opts);
 *   },
 *   getRegistration: (type) => registry.get(type),
 * });
 *
 * const result = await executor.execute([
 *   { commandType: "AddOrderItem", args: { orderId: "ord_1", ... } },
 *   { commandType: "AddOrderItem", args: { orderId: "ord_1", ... } },
 * ], {
 *   mode: "atomic",
 *   aggregateId: "ord_1",
 * });
 * ```
 */
export class BatchExecutor {
  private readonly executor: CommandExecutor;
  private readonly getRegistration: BatchExecutorConfig["getRegistration"];
  private readonly defaultBoundedContext?: string;
  private readonly logger: Logger;

  constructor(config: BatchExecutorConfig) {
    this.executor = config.executor;
    this.getRegistration = config.getRegistration;
    this.logger = config.logger ?? createPlatformNoOpLogger();
    if (config.defaultBoundedContext !== undefined) {
      this.defaultBoundedContext = config.defaultBoundedContext;
    }
  }

  /**
   * Execute a batch of commands.
   *
   * @param commands - Commands to execute
   * @param options - Batch execution options
   * @returns Batch result with individual command results
   */
  async execute<TData = unknown>(
    commands: BatchCommand[],
    options: BatchOptions
  ): Promise<BatchResult<TData>> {
    const startTime = Date.now();
    const correlationId: CorrelationId = options.correlationId ?? generateCorrelationId();

    this.logger.debug("Batch execution started", {
      mode: options.mode,
      commandCount: commands.length,
      correlationId,
    });

    // Pre-flight validation
    // Build options with resolved bounded context
    const resolvedBoundedContext = options.boundedContext ?? this.defaultBoundedContext;
    const validationOptions: BatchOptions = {
      ...options,
    };
    if (resolvedBoundedContext !== undefined) {
      validationOptions.boundedContext = resolvedBoundedContext;
    }
    const validation = validateBatch(commands, validationOptions, this.getRegistration);

    if (!validation.valid) {
      const errorMessage = validation.errors.map((e) => e.message).join("; ");
      this.logger.warn("Batch validation failed", {
        error: errorMessage,
        commandCount: commands.length,
        correlationId,
      });
      // Return failed batch with validation errors
      return this.createFailedBatch<TData>(
        commands,
        errorMessage,
        correlationId,
        Date.now() - startTime
      );
    }

    // Execute based on mode
    if (options.mode === "atomic") {
      return this.executeAtomic<TData>(commands, options, correlationId, startTime);
    } else {
      return this.executePartial<TData>(commands, options, correlationId, startTime);
    }
  }

  /**
   * Execute commands atomically (sequentially, stop on first failure).
   */
  private async executeAtomic<TData>(
    commands: BatchCommand[],
    _options: BatchOptions,
    batchCorrelationId: CorrelationId,
    startTime: number
  ): Promise<BatchResult<TData>> {
    const results: BatchItemResult<TData>[] = [];

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]!;
      const commandStartTime = Date.now();
      const commandId = command.commandId ?? generateCommandId();
      const correlationId = command.correlationId ?? batchCorrelationId;

      try {
        const result = await this.executor<UnknownRecord, TData>(
          command.commandType,
          command.args,
          { commandId, correlationId }
        );

        const durationMs = Date.now() - commandStartTime;
        const itemResult: BatchItemResult<TData> = {
          index: i,
          commandType: command.commandType,
          commandId,
          status: result.status === "success" ? "success" : result.status,
          result,
          durationMs,
        };

        if (result.status === "rejected" || result.status === "failed") {
          itemResult.error = result.reason;
          this.logger.warn("Command failed", {
            index: i,
            commandType: command.commandType,
            status: result.status,
            error: result.reason,
            durationMs,
          });
        } else {
          this.logger.debug("Command executed", {
            index: i,
            commandType: command.commandType,
            durationMs,
          });
        }

        results.push(itemResult);

        // In atomic mode, stop on any non-success
        if (result.status !== "success") {
          const skippedCount = commands.length - i - 1;
          if (skippedCount > 0) {
            this.logger.info("Atomic batch stopped early", {
              index: i,
              failedCommand: command.commandType,
              skippedCount,
            });
          }
          // Mark remaining commands as skipped
          for (let j = i + 1; j < commands.length; j++) {
            const skippedCommand = commands[j]!;
            results.push({
              index: j,
              commandType: skippedCommand.commandType,
              commandId: skippedCommand.commandId ?? generateCommandId(),
              status: "skipped",
              error: "Skipped due to earlier failure in atomic batch",
            });
          }
          break;
        }
      } catch (error) {
        const durationMs = Date.now() - commandStartTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.logger.warn("Command failed", {
          index: i,
          commandType: command.commandType,
          status: "failed",
          error: errorMessage,
          durationMs,
        });

        // Unexpected error
        results.push({
          index: i,
          commandType: command.commandType,
          commandId,
          status: "failed",
          error: errorMessage,
          durationMs,
        });

        const skippedCount = commands.length - i - 1;
        if (skippedCount > 0) {
          this.logger.info("Atomic batch stopped early", {
            index: i,
            failedCommand: command.commandType,
            skippedCount,
          });
        }

        // Mark remaining as skipped
        for (let j = i + 1; j < commands.length; j++) {
          const skippedCommand = commands[j]!;
          results.push({
            index: j,
            commandType: skippedCommand.commandType,
            commandId: skippedCommand.commandId ?? generateCommandId(),
            status: "skipped",
            error: "Skipped due to earlier failure in atomic batch",
          });
        }
        break;
      }
    }

    // Calculate summary from collected results for accuracy
    const summary = calculateSummary(results, Date.now() - startTime);
    const status = summary.succeeded === commands.length ? "success" : "failed";

    this.logger.info("Batch execution completed", {
      status,
      mode: "atomic",
      succeeded: summary.succeeded,
      failed: summary.failed,
      rejected: summary.rejected,
      skipped: summary.skipped,
      totalDurationMs: summary.totalDurationMs,
    });

    return {
      status,
      results,
      summary,
      correlationId: batchCorrelationId,
    };
  }

  /**
   * Execute commands in partial mode (continue on errors, with concurrency).
   *
   * Commands are executed in chunks of `maxConcurrency`. Within each chunk,
   * commands run concurrently. When `continueOnError` is false, execution
   * stops after the current chunk completes if any command fails.
   *
   * Note: Within a concurrent chunk, all started commands complete even if
   * one fails. This is intentional - stopping mid-chunk would require
   * cancellation which isn't supported. The `stopExecution` flag prevents
   * starting NEW chunks after a failure.
   */
  private async executePartial<TData>(
    commands: BatchCommand[],
    options: BatchOptions,
    batchCorrelationId: CorrelationId,
    startTime: number
  ): Promise<BatchResult<TData>> {
    const maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const continueOnError = options.continueOnError ?? true;

    const results: BatchItemResult<TData>[] = new Array(commands.length);

    // Flag to stop processing new chunks after a failure (when continueOnError=false)
    // Note: This flag is checked BETWEEN chunks, not within a concurrent chunk.
    // Commands already started in a chunk will complete regardless of this flag.
    let stopAfterCurrentChunk = false;

    // Execute in chunks of maxConcurrency
    for (let i = 0; i < commands.length && !stopAfterCurrentChunk; i += maxConcurrency) {
      const chunk = commands.slice(i, i + maxConcurrency);

      // Track if any command in this chunk failed (for stopAfterCurrentChunk decision)
      let chunkHadFailure = false;

      const chunkPromises = chunk.map(async (command, chunkIndex) => {
        const index = i + chunkIndex;
        const commandStartTime = Date.now();
        const commandId = command.commandId ?? generateCommandId();
        const correlationId = command.correlationId ?? batchCorrelationId;

        try {
          const result = await this.executor<UnknownRecord, TData>(
            command.commandType,
            command.args,
            { commandId, correlationId }
          );

          const durationMs = Date.now() - commandStartTime;
          const itemResult: BatchItemResult<TData> = {
            index,
            commandType: command.commandType,
            commandId,
            status: result.status === "success" ? "success" : result.status,
            result,
            durationMs,
          };

          if (result.status === "rejected" || result.status === "failed") {
            itemResult.error = result.reason;
            chunkHadFailure = true;
            this.logger.warn("Command failed", {
              index,
              commandType: command.commandType,
              status: result.status,
              error: result.reason,
              durationMs,
            });
          } else {
            this.logger.debug("Command executed", {
              index,
              commandType: command.commandType,
              durationMs,
            });
          }

          return itemResult;
        } catch (error) {
          chunkHadFailure = true;
          const durationMs = Date.now() - commandStartTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          this.logger.warn("Command failed", {
            index,
            commandType: command.commandType,
            status: "failed",
            error: errorMessage,
            durationMs,
          });

          return {
            index,
            commandType: command.commandType,
            commandId,
            status: "failed" as const,
            error: errorMessage,
            durationMs,
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      for (const result of chunkResults) {
        results[result.index] = result;
      }

      // After chunk completes, decide whether to continue to next chunk
      if (chunkHadFailure && !continueOnError) {
        stopAfterCurrentChunk = true;
      }
    }

    // Mark any remaining unexecuted commands as skipped
    for (let i = 0; i < results.length; i++) {
      if (results[i] === undefined) {
        const command = commands[i]!;
        results[i] = {
          index: i,
          commandType: command.commandType,
          commandId: command.commandId ?? generateCommandId(),
          status: "skipped",
          error: "Skipped due to earlier failure",
        };
      }
    }

    // Calculate summary from collected results for accuracy
    const summary = calculateSummary(results as BatchItemResult<TData>[], Date.now() - startTime);

    // Determine overall status
    let status: "success" | "partial" | "failed";
    if (summary.succeeded === commands.length) {
      status = "success";
    } else if (summary.succeeded > 0) {
      status = "partial";
    } else {
      status = "failed";
    }

    this.logger.info("Batch execution completed", {
      status,
      mode: "partial",
      succeeded: summary.succeeded,
      failed: summary.failed,
      rejected: summary.rejected,
      skipped: summary.skipped,
      totalDurationMs: summary.totalDurationMs,
    });

    return {
      status,
      results: results as BatchItemResult<TData>[],
      summary,
      correlationId: batchCorrelationId,
    };
  }

  /**
   * Create a failed batch result for validation errors.
   */
  private createFailedBatch<TData>(
    commands: BatchCommand[],
    error: string,
    correlationId: CorrelationId,
    durationMs: number
  ): BatchResult<TData> {
    const results: BatchItemResult<TData>[] = commands.map((cmd, i) => ({
      index: i,
      commandType: cmd.commandType,
      commandId: cmd.commandId ?? generateCommandId(),
      status: "rejected" as const,
      error: `Batch validation failed: ${error}`,
    }));

    return {
      status: "failed",
      results,
      summary: calculateSummary(results, durationMs),
      correlationId,
    };
  }
}

/**
 * Create a batch executor.
 *
 * @param config - Executor configuration
 * @returns A new BatchExecutor instance
 */
export function createBatchExecutor(config: BatchExecutorConfig): BatchExecutor {
  return new BatchExecutor(config);
}
