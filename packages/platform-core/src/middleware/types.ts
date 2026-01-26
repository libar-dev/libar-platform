/**
 * Middleware Pipeline Types
 *
 * Defines the middleware interface and execution context for the command pipeline.
 * Middlewares can intercept commands before and after handler execution.
 */
import type { CommandCategory, AggregateTarget } from "../commands/categories.js";
import type { CommandHandlerResult } from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";
import type { CommandId, CorrelationId } from "../ids/branded.js";
import type { Logger } from "../logging/types.js";

/**
 * Metadata available to middleware during command execution.
 * Uses branded types for compile-time safety of identifiers.
 */
export interface MiddlewareCommandInfo {
  /** Command type (e.g., "CreateOrder") */
  type: string;

  /** Bounded context (e.g., "orders") */
  boundedContext: string;

  /** Command category */
  category: CommandCategory;

  /** Target aggregate (for aggregate commands) */
  targetAggregate?: AggregateTarget;

  /** Target process (for process commands) */
  targetProcess?: string;

  /** Command arguments */
  args: UnknownRecord;

  /** Unique command ID */
  commandId: CommandId;

  /** Correlation ID for tracing */
  correlationId: CorrelationId;
}

/**
 * Context passed through the middleware pipeline.
 *
 * @template TCustom - Type for custom context data shared between middlewares
 */
export interface MiddlewareContext<TCustom = UnknownRecord> {
  /** Command information */
  command: MiddlewareCommandInfo;

  /** Custom context data shared between middlewares */
  custom: TCustom;

  /** Timestamp when pipeline started */
  startedAt: number;

  /**
   * Raw Convex mutation context.
   *
   * Provides access to the underlying Convex ctx for middlewares that need
   * direct database access or component integration (e.g., rate limiters).
   * Use sparingly - prefer operating on MiddlewareContext abstractions.
   */
  raw?: unknown;
}

/**
 * Result returned by middleware before hook.
 */
export type MiddlewareBeforeResult<TCustom = UnknownRecord> =
  | {
      /** Continue to next middleware or handler */
      continue: true;
      /** Updated context to pass forward */
      ctx: MiddlewareContext<TCustom>;
    }
  | {
      /** Short-circuit - stop pipeline and return result */
      continue: false;
      /** Result to return (e.g., validation error) */
      result: CommandHandlerResult<unknown>;
    };

/**
 * Middleware interface for command pipeline.
 *
 * Middlewares can:
 * - Validate commands before execution (before hook)
 * - Transform or log results after execution (after hook)
 * - Short-circuit the pipeline (return continue: false)
 *
 * @example
 * ```typescript
 * const loggingMiddleware: Middleware = {
 *   name: "logging",
 *   order: 40,
 *   before: async (ctx) => {
 *     console.log(`Executing ${ctx.command.type}`);
 *     return { continue: true, ctx };
 *   },
 *   after: async (ctx, result) => {
 *     console.log(`${ctx.command.type} completed: ${result.status}`);
 *     return result;
 *   },
 * };
 * ```
 */
export interface Middleware<TCustom = UnknownRecord> {
  /** Unique middleware name for identification */
  name: string;

  /** Execution order (lower = earlier). Standard orders:
   * - 10: Structure validation
   * - 20: Domain validation
   * - 30: Authorization
   * - 40: Logging
   * - 50: Rate limiting
   */
  order: number;

  /**
   * Called before command handler execution.
   * Can modify context or short-circuit the pipeline.
   *
   * @param ctx - Current middleware context
   * @returns Continue with updated context, or short-circuit with result
   */
  before?(ctx: MiddlewareContext<TCustom>): Promise<MiddlewareBeforeResult<TCustom>>;

  /**
   * Called after command handler execution.
   * Can transform or log the result.
   *
   * @param ctx - Current middleware context
   * @param result - Handler result
   * @returns Possibly modified result
   */
  after?(
    ctx: MiddlewareContext<TCustom>,
    result: CommandHandlerResult<unknown>
  ): Promise<CommandHandlerResult<unknown>>;
}

/**
 * Error information passed to the after-hook error handler.
 */
export interface AfterHookError {
  /** Name of the middleware that failed */
  middlewareName: string;

  /** The error that occurred */
  error: unknown;

  /** Command being processed when error occurred */
  commandType: string;

  /** Command ID for correlation */
  commandId: string;
}

/**
 * Callback invoked when an after-hook throws an error.
 *
 * After-hook errors don't fail the command (the handler already succeeded),
 * but they should be logged/monitored for debugging.
 */
export type AfterHookErrorHandler = (errorInfo: AfterHookError) => void;

/**
 * Options for creating a middleware pipeline.
 */
export interface MiddlewarePipelineOptions {
  /** Enable debug logging */
  debug?: boolean;

  /**
   * Callback invoked when an after-hook throws an error.
   *
   * After-hooks run after the command handler completes. If an after-hook
   * fails, the command result is preserved (not failed), but the error
   * should be logged for debugging.
   *
   * @example
   * ```typescript
   * const pipeline = createMiddlewarePipeline({
   *   onAfterHookError: (info) => {
   *     console.error(`After-hook failed in ${info.middlewareName}:`, info.error);
   *     // Send to monitoring service
   *   },
   * });
   * ```
   */
  onAfterHookError?: AfterHookErrorHandler;
}

/**
 * Configuration for structure validation middleware.
 */
export interface StructureValidationConfig {
  /** Map of command type to Zod schema */
  schemas: Record<string, import("zod").ZodType<unknown>>;

  /** Strip unknown properties from payload (default: false) */
  stripUnknown?: boolean;
}

/**
 * Domain validator function type.
 * Returns undefined if valid, or error message if invalid.
 */
export type DomainValidator = (
  args: UnknownRecord,
  ctx: MiddlewareContext
) => Promise<string | undefined>;

/**
 * Configuration for domain validation middleware.
 */
export interface DomainValidationConfig {
  /** Map of command type to validator function */
  validators: Record<string, DomainValidator>;
}

/**
 * Authorization check result.
 */
export interface AuthorizationResult {
  /** Whether the action is allowed */
  allowed: boolean;

  /** Reason for denial (if not allowed) */
  reason?: string;
}

/**
 * Authorization checker function type.
 */
export type AuthorizationChecker = (ctx: MiddlewareContext) => Promise<AuthorizationResult>;

/**
 * Configuration for authorization middleware.
 */
export interface AuthorizationConfig {
  /** Function to check authorization */
  checker: AuthorizationChecker;

  /** Command types to skip authorization for */
  skipFor?: string[];
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Milliseconds until retry is allowed (if rate limited) */
  retryAfterMs?: number;
}

/**
 * Rate limit checker function type.
 */
export type RateLimitChecker = (key: string) => Promise<RateLimitResult>;

/**
 * Configuration for rate limiting middleware.
 *
 * Uses a factory pattern to support integration with Convex components
 * that require the raw mutation context (e.g., @convex-dev/rate-limiter).
 *
 * @example
 * ```typescript
 * // With createConvexRateLimitAdapter
 * createRateLimitMiddleware({
 *   checkerFactory: (ctx) =>
 *     createConvexRateLimitAdapter(rateLimiter, "commandDispatch")(ctx.raw),
 *   getKey: RateLimitKeys.byUserAndCommand((ctx) => ctx.custom.userId),
 *   skipFor: ["GetSystemHealth"],
 * });
 * ```
 */
export interface RateLimitConfig {
  /**
   * Factory function that creates a rate limit checker per-request.
   *
   * The factory receives the full MiddlewareContext and should return
   * a RateLimitChecker bound to the appropriate backend. Use `ctx.raw`
   * to access the Convex mutation context for component integration.
   */
  checkerFactory: (ctx: MiddlewareContext) => RateLimitChecker;

  /** Function to derive rate limit key from context */
  getKey: (ctx: MiddlewareContext) => string;

  /** Command types to skip rate limiting for */
  skipFor?: string[];
}

/**
 * Configuration for logging middleware.
 */
export interface LoggingConfig {
  /**
   * Logger instance using the full 6-level hierarchy aligned with Workpool.
   */
  logger: Logger;

  /** Include command payload in logs (default: false for security) */
  includePayload?: boolean;

  /** Include timing metrics (default: true) */
  includeTiming?: boolean;
}
