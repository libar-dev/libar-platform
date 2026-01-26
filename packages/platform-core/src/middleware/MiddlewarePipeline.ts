/**
 * @libar-docs
 * @libar-docs-pattern MiddlewarePipeline
 * @libar-docs-status completed
 * @libar-docs-phase 10
 * @libar-docs-command
 * @libar-docs-uses CommandBusFoundation
 * @libar-docs-used-by CommandOrchestrator
 *
 * ## Middleware Pipeline - Command Execution Hooks
 *
 * Orchestrates middleware execution in the correct order.
 * Supports before/after hooks and short-circuiting.
 *
 * ### When to Use
 *
 * - Adding validation, authorization, or logging to commands
 * - Implementing cross-cutting concerns without modifying handlers
 * - Short-circuiting command execution for policy enforcement
 */
import type {
  Middleware,
  MiddlewareContext,
  MiddlewarePipelineOptions,
  MiddlewareCommandInfo,
} from "./types.js";
import type { CommandHandlerResult } from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Pipeline for executing command middlewares in order.
 *
 * Middlewares are sorted by `order` and executed sequentially.
 * Before hooks run in order, after hooks run in reverse order.
 *
 * @example
 * ```typescript
 * const pipeline = new MiddlewarePipeline();
 * pipeline.use(structureValidationMiddleware);
 * pipeline.use(loggingMiddleware);
 * pipeline.use(authorizationMiddleware);
 *
 * const result = await pipeline.execute(
 *   commandInfo,
 *   { customerId: "cust_123" },
 *   async () => handler(ctx, args)
 * );
 * ```
 */
export class MiddlewarePipeline<TCustom = UnknownRecord> {
  private middlewares: Array<Middleware<TCustom>> = [];
  private sorted = false;
  private readonly options: MiddlewarePipelineOptions;

  constructor(options: MiddlewarePipelineOptions = {}) {
    this.options = options;
  }

  /**
   * Add a middleware to the pipeline.
   * Middlewares are automatically sorted by `order` before execution.
   *
   * @param middleware - The middleware to add
   * @returns This pipeline for chaining
   */
  use(middleware: Middleware<TCustom>): this {
    this.middlewares.push(middleware);
    this.sorted = false;
    return this;
  }

  /**
   * Remove a middleware by name.
   *
   * @param name - The middleware name to remove
   * @returns True if middleware was found and removed
   */
  remove(name: string): boolean {
    const index = this.middlewares.findIndex((m) => m.name === name);
    if (index >= 0) {
      this.middlewares.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Check if a middleware with the given name exists.
   */
  has(name: string): boolean {
    return this.middlewares.some((m) => m.name === name);
  }

  /**
   * Get middleware names in execution order.
   */
  getMiddlewareNames(): string[] {
    this.ensureSorted();
    return this.middlewares.map((m) => m.name);
  }

  /**
   * Get the number of middlewares in the pipeline.
   */
  size(): number {
    return this.middlewares.length;
  }

  /**
   * Execute the middleware pipeline around a handler.
   *
   * @param commandInfo - Information about the command being executed
   * @param customContext - Custom context data to pass through middlewares
   * @param handler - The actual command handler to execute
   * @param rawCtx - Optional raw Convex mutation context for middlewares that need it
   * @returns The command result (possibly modified by after hooks)
   */
  async execute(
    commandInfo: MiddlewareCommandInfo,
    customContext: TCustom,
    handler: () => Promise<CommandHandlerResult<unknown>>,
    rawCtx?: unknown
  ): Promise<CommandHandlerResult<unknown>> {
    this.ensureSorted();

    // Build initial context
    let ctx: MiddlewareContext<TCustom> = {
      command: commandInfo,
      custom: customContext,
      startedAt: Date.now(),
      raw: rawCtx,
    };

    // Track which middlewares executed before (for after hooks)
    const executedMiddlewares: Array<Middleware<TCustom>> = [];

    // Execute before hooks
    for (const middleware of this.middlewares) {
      if (!middleware.before) {
        executedMiddlewares.push(middleware);
        continue;
      }

      try {
        const beforeResult = await middleware.before(ctx);

        if (!beforeResult.continue) {
          // Short-circuit: run after hooks in reverse for executed middlewares
          return this.runAfterHooks(executedMiddlewares, ctx, beforeResult.result);
        }

        // Update context for next middleware
        ctx = beforeResult.ctx;
        executedMiddlewares.push(middleware);
      } catch (error) {
        // Middleware error - treat as rejected (infrastructure error)
        // Note: Debug logging should be handled via custom middleware or external logger
        return {
          status: "rejected",
          code: "MIDDLEWARE_ERROR",
          reason: error instanceof Error ? error.message : String(error),
          context: { middleware: middleware.name },
        };
      }
    }

    // Execute handler
    let result: CommandHandlerResult<unknown>;
    try {
      result = await handler();
    } catch (error) {
      // Handler threw - wrap as rejected result
      result = {
        status: "rejected",
        code: "HANDLER_ERROR",
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    // Execute after hooks in reverse order
    return this.runAfterHooks(executedMiddlewares, ctx, result);
  }

  /**
   * Run after hooks in reverse order.
   */
  private async runAfterHooks(
    middlewares: Array<Middleware<TCustom>>,
    ctx: MiddlewareContext<TCustom>,
    result: CommandHandlerResult<unknown>
  ): Promise<CommandHandlerResult<unknown>> {
    let currentResult = result;

    // Run after hooks in reverse order
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      if (middleware === undefined || !middleware.after) {
        continue;
      }

      try {
        currentResult = await middleware.after(ctx, currentResult);
      } catch (error) {
        // After hook error - continue with current result but notify via callback
        // This allows monitoring/logging of after-hook failures without failing the command
        if (this.options.onAfterHookError) {
          this.options.onAfterHookError({
            middlewareName: middleware.name,
            error,
            commandType: ctx.command.type,
            commandId: ctx.command.commandId,
          });
        }
        // Continue with current result
      }
    }

    return currentResult;
  }

  /**
   * Ensure middlewares are sorted by order.
   */
  private ensureSorted(): void {
    if (this.sorted) {
      return;
    }
    this.middlewares.sort((a, b) => a.order - b.order);
    this.sorted = true;
  }

  /**
   * Clear all middlewares from the pipeline.
   */
  clear(): void {
    this.middlewares = [];
    this.sorted = true;
  }

  /**
   * Create a copy of this pipeline.
   */
  clone(): MiddlewarePipeline<TCustom> {
    const cloned = new MiddlewarePipeline<TCustom>(this.options);
    for (const middleware of this.middlewares) {
      cloned.use(middleware);
    }
    return cloned;
  }
}

/**
 * Create a new middleware pipeline.
 *
 * @param options - Pipeline configuration options
 * @returns A new MiddlewarePipeline instance
 */
export function createMiddlewarePipeline<TCustom = UnknownRecord>(
  options: MiddlewarePipelineOptions = {}
): MiddlewarePipeline<TCustom> {
  return new MiddlewarePipeline<TCustom>(options);
}
