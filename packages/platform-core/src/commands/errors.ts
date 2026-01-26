/**
 * Command error categorization and structured error types.
 *
 * Error categories provide semantic meaning for error handling:
 * - Client can determine if retry is appropriate
 * - Monitoring can categorize errors by type
 * - UI can show appropriate error messages
 */

import type { UnknownRecord } from "../types.js";

/**
 * V8-specific Error interface with captureStackTrace support.
 * This provides type safety for the V8-specific stack trace capture method.
 *
 * Note: constructorOpt is typed as `object` because:
 * 1. V8 doesn't call it - it only uses it as a reference marker for stack frame filtering
 * 2. All JavaScript functions (including class constructors) are objects
 * 3. This avoids the banned `Function` type while remaining type-safe
 */
interface V8ErrorConstructor extends ErrorConstructor {
  captureStackTrace?(target: object, constructorOpt?: object): void;
}

/**
 * Typed reference to Error with V8 extensions.
 */
const V8Error: V8ErrorConstructor = Error;

/**
 * Error categories with recovery semantics.
 *
 * | Category     | Recovery                  | Retry Strategy              | Example                    |
 * |--------------|---------------------------|-----------------------------|----------------------------|
 * | domain       | User action required      | No automatic retry          | Order already submitted    |
 * | validation   | Fix input and resubmit    | No retry without change     | Invalid email format       |
 * | concurrency  | Retry with new commandId  | Automatic retry possible    | OCC conflict               |
 * | infra        | Wait and retry            | Exponential backoff         | Database unavailable       |
 */
export const ErrorCategory = {
  /** Business rule violation - requires user action to resolve */
  DOMAIN: "domain",
  /** Input validation error - requires fixing input data */
  VALIDATION: "validation",
  /** Concurrency conflict - retriable with new commandId */
  CONCURRENCY: "concurrency",
  /** Infrastructure error - may be retriable after delay */
  INFRASTRUCTURE: "infra",
} as const;

/**
 * Type representing error categories.
 */
export type ErrorCategoryType = (typeof ErrorCategory)[keyof typeof ErrorCategory];

/**
 * All valid error categories.
 */
export const ERROR_CATEGORIES = Object.values(ErrorCategory);

/**
 * Check if a value is a valid error category.
 */
export function isErrorCategory(value: unknown): value is ErrorCategoryType {
  return typeof value === "string" && (ERROR_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Structured command error with category and recovery information.
 *
 * @example
 * ```typescript
 * throw new CommandError(
 *   ErrorCategory.DOMAIN,
 *   "ORDER_ALREADY_SUBMITTED",
 *   "Order has already been submitted and cannot be modified",
 *   false, // not recoverable without user action
 *   { orderId: "ord_123", currentStatus: "submitted" }
 * );
 * ```
 */
export class CommandError extends Error {
  public override readonly name = "CommandError";

  constructor(
    /** Error category for classification */
    public readonly category: ErrorCategoryType,
    /** Machine-readable error code (e.g., "ORDER_NOT_FOUND") */
    public readonly code: string,
    /** Human-readable error message */
    message: string,
    /** Whether automatic retry may succeed */
    public readonly recoverable: boolean,
    /** Additional context for debugging/logging */
    public readonly context?: UnknownRecord
  ) {
    super(message);
    // Maintains proper stack trace for where error was thrown (V8 engines)
    // V8's captureStackTrace is not in standard TypeScript lib, so we use a typed interface
    if (typeof V8Error.captureStackTrace === "function") {
      V8Error.captureStackTrace(this, CommandError);
    }
  }

  /**
   * Create a CommandError from an unknown error.
   *
   * @param error - The caught error
   * @param defaultCode - Default error code if not a CommandError
   * @returns A CommandError instance
   */
  static from(error: unknown, defaultCode = "UNKNOWN_ERROR"): CommandError {
    if (error instanceof CommandError) {
      return error;
    }

    if (error instanceof Error) {
      return new CommandError(
        ErrorCategory.INFRASTRUCTURE,
        defaultCode,
        error.message,
        true, // Infrastructure errors are generally retriable
        { originalError: error.name, stack: error.stack }
      );
    }

    return new CommandError(ErrorCategory.INFRASTRUCTURE, defaultCode, String(error), true, {
      originalValue: error,
    });
  }

  /**
   * Convert to a plain object for serialization.
   */
  toJSON(): CommandErrorJSON {
    const json: CommandErrorJSON = {
      name: this.name,
      category: this.category,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
    };
    if (this.context !== undefined) {
      json.context = this.context;
    }
    return json;
  }
}

/**
 * JSON representation of CommandError for serialization.
 */
export interface CommandErrorJSON {
  name: string;
  category: ErrorCategoryType;
  code: string;
  message: string;
  recoverable: boolean;
  context?: UnknownRecord;
}

/**
 * Factory functions for common error types.
 */
export const CommandErrors = {
  /**
   * Create a domain error (business rule violation).
   */
  domain(code: string, message: string, context?: UnknownRecord): CommandError {
    return new CommandError(ErrorCategory.DOMAIN, code, message, false, context);
  },

  /**
   * Create a validation error (input validation failure).
   */
  validation(code: string, message: string, context?: UnknownRecord): CommandError {
    return new CommandError(ErrorCategory.VALIDATION, code, message, false, context);
  },

  /**
   * Create a concurrency error (OCC conflict).
   */
  concurrency(code: string, message: string, context?: UnknownRecord): CommandError {
    return new CommandError(
      ErrorCategory.CONCURRENCY,
      code,
      message,
      true, // Concurrency errors are recoverable with new commandId
      context
    );
  },

  /**
   * Create an infrastructure error (system failure).
   */
  infrastructure(code: string, message: string, context?: UnknownRecord): CommandError {
    return new CommandError(
      ErrorCategory.INFRASTRUCTURE,
      code,
      message,
      true, // Infrastructure errors may be recovered by retry
      context
    );
  },

  /**
   * Create a "not found" error.
   */
  notFound(entityType: string, entityId: string, context?: UnknownRecord): CommandError {
    return new CommandError(
      ErrorCategory.DOMAIN,
      `${entityType.toUpperCase()}_NOT_FOUND`,
      `${entityType} with ID "${entityId}" was not found`,
      false,
      { entityType, entityId, ...context }
    );
  },

  /**
   * Create an "already exists" error.
   */
  alreadyExists(entityType: string, entityId: string, context?: UnknownRecord): CommandError {
    return new CommandError(
      ErrorCategory.DOMAIN,
      `${entityType.toUpperCase()}_ALREADY_EXISTS`,
      `${entityType} with ID "${entityId}" already exists`,
      false,
      { entityType, entityId, ...context }
    );
  },

  /**
   * Create an "invalid state" error.
   */
  invalidState(
    entityType: string,
    currentState: string,
    requiredState: string,
    context?: UnknownRecord
  ): CommandError {
    return new CommandError(
      ErrorCategory.DOMAIN,
      `INVALID_${entityType.toUpperCase()}_STATE`,
      `${entityType} is in "${currentState}" state but "${requiredState}" is required`,
      false,
      { entityType, currentState, requiredState, ...context }
    );
  },

  /**
   * Create an "unauthorized" error.
   */
  unauthorized(action: string, context?: UnknownRecord): CommandError {
    return new CommandError(
      ErrorCategory.DOMAIN,
      "UNAUTHORIZED",
      `Not authorized to perform action: ${action}`,
      false,
      { action, ...context }
    );
  },

  /**
   * Create a "rate limited" error.
   */
  rateLimited(retryAfterMs?: number, context?: UnknownRecord): CommandError {
    return new CommandError(
      ErrorCategory.INFRASTRUCTURE,
      "RATE_LIMITED",
      "Too many requests, please try again later",
      true,
      { retryAfterMs, ...context }
    );
  },
} as const;

/**
 * Check if an error is a CommandError with a specific category.
 */
export function isCommandErrorOfCategory(
  error: unknown,
  category: ErrorCategoryType
): error is CommandError {
  return error instanceof CommandError && error.category === category;
}

/**
 * Check if an error is recoverable (may succeed on retry).
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof CommandError) {
    return error.recoverable;
  }
  // Unknown errors are assumed recoverable (infrastructure issues)
  return true;
}

/**
 * Get retry delay recommendation based on error category.
 *
 * @param error - The error
 * @param attempt - The retry attempt number (1-based)
 * @returns Recommended delay in milliseconds, or -1 if no retry
 */
export function getRetryDelay(error: unknown, attempt: number = 1): number {
  if (error instanceof CommandError) {
    if (!error.recoverable) {
      return -1; // No retry
    }

    switch (error.category) {
      case ErrorCategory.CONCURRENCY:
        // Quick retry for OCC conflicts
        return Math.min(50 * Math.pow(2, attempt - 1), 500);

      case ErrorCategory.INFRASTRUCTURE:
        // Exponential backoff for infrastructure issues
        return Math.min(1000 * Math.pow(2, attempt - 1), 30000);

      case ErrorCategory.DOMAIN:
      case ErrorCategory.VALIDATION:
        // Domain and validation errors require user action, no automatic retry
        return -1;
    }
  }

  // Default exponential backoff for unknown errors
  return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
}
