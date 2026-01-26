import type { UnknownRecord } from "../types.js";

/**
 * Base invariant error class for domain rule violations.
 *
 * This class provides a generic base for domain-specific invariant errors,
 * allowing bounded contexts to create their own typed error classes while
 * sharing common structure and behavior.
 *
 * @example
 * ```typescript
 * // Create a context-specific error class
 * const OrderInvariantError = InvariantError.forContext<OrderErrorCode>("Order");
 *
 * // Use in domain logic
 * throw new OrderInvariantError(
 *   "ORDER_NOT_FOUND",
 *   "Order not found",
 *   { orderId }
 * );
 * ```
 */
export class InvariantError<TCode extends string = string> extends Error {
  /**
   * Error code for programmatic handling.
   * Should be a string constant from the context's error codes.
   */
  public readonly code: TCode;

  /**
   * Additional context for debugging and error reporting.
   * Can include relevant entity IDs, state values, etc.
   */
  public readonly context?: UnknownRecord;

  constructor(code: TCode, message: string, context?: UnknownRecord) {
    super(message);
    this.code = code;
    // Only set context if provided (satisfies exactOptionalPropertyTypes)
    if (context !== undefined) {
      this.context = context;
    }
    this.name = "InvariantError";
  }

  /**
   * Factory for creating context-specific error subclasses.
   *
   * This allows each bounded context to have its own typed error class
   * while inheriting the common structure.
   *
   * @param contextName - Name of the bounded context (e.g., "Order", "Inventory")
   * @returns A constructor for context-specific invariant errors
   *
   * @example
   * ```typescript
   * // Define error codes
   * export const OrderErrorCodes = {
   *   ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
   *   ORDER_ALREADY_EXISTS: "ORDER_ALREADY_EXISTS",
   * } as const;
   * export type OrderErrorCode = (typeof OrderErrorCodes)[keyof typeof OrderErrorCodes];
   *
   * // Create typed error class
   * export const OrderInvariantError = InvariantError.forContext<OrderErrorCode>("Order");
   *
   * // Usage
   * throw new OrderInvariantError(
   *   OrderErrorCodes.ORDER_NOT_FOUND,
   *   "Order not found",
   *   { orderId: "123" }
   * );
   * ```
   */
  static forContext<TCode extends string>(
    contextName: string
  ): new (code: TCode, message: string, context?: UnknownRecord) => InvariantError<TCode> {
    // Create a named class for better debugging
    const ContextInvariantError = class extends InvariantError<TCode> {
      constructor(code: TCode, message: string, context?: UnknownRecord) {
        super(code, message, context);
        this.name = `${contextName}InvariantError`;
      }
    };

    // Set the class name for debugging
    Object.defineProperty(ContextInvariantError, "name", {
      value: `${contextName}InvariantError`,
      configurable: true,
    });

    return ContextInvariantError;
  }

  /**
   * Type guard to check if an error is an InvariantError.
   */
  static isInvariantError(error: unknown): error is InvariantError {
    return error instanceof InvariantError;
  }

  /**
   * Type guard to check if an error is an InvariantError with a specific code.
   */
  static hasCode<T extends string>(error: unknown, code: T): error is InvariantError<T> {
    return InvariantError.isInvariantError(error) && error.code === code;
  }
}
