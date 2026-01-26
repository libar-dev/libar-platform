/**
 * Domain Validation Middleware
 *
 * Pre-handler business rule validation.
 * Validates domain invariants before command execution.
 */
import type {
  Middleware,
  MiddlewareContext,
  MiddlewareBeforeResult,
  DomainValidationConfig,
  DomainValidator,
} from "./types.js";

/** Middleware execution order for domain validation */
export const DOMAIN_VALIDATION_ORDER = 20;

/**
 * Create a domain validation middleware.
 *
 * Runs pre-handler business rule checks.
 * Useful for validating invariants that don't require database state.
 *
 * @param config - Configuration with validator functions
 * @returns A middleware that validates business rules
 *
 * @example
 * ```typescript
 * const domainMiddleware = createDomainValidationMiddleware({
 *   validators: {
 *     AddOrderItem: async (args) => {
 *       if ((args.quantity as number) > 100) {
 *         return "Quantity cannot exceed 100 items";
 *       }
 *       return undefined; // Valid
 *     },
 *     CreateOrder: async (args) => {
 *       if (!(args.customerId as string).startsWith("cust_")) {
 *         return "Customer ID must start with 'cust_'";
 *       }
 *       return undefined;
 *     },
 *   },
 * });
 * ```
 */
export function createDomainValidationMiddleware(config: DomainValidationConfig): Middleware {
  return {
    name: "domainValidation",
    order: DOMAIN_VALIDATION_ORDER,

    async before(ctx: MiddlewareContext): Promise<MiddlewareBeforeResult> {
      const { command } = ctx;
      const validator = config.validators[command.type];

      // If no validator registered, skip
      if (!validator) {
        return { continue: true, ctx };
      }

      const errorMessage = await validator(command.args, ctx);

      if (errorMessage) {
        return {
          continue: false,
          result: {
            status: "rejected",
            code: "DOMAIN_VALIDATION_ERROR",
            reason: errorMessage,
          },
        };
      }

      return { continue: true, ctx };
    },
  };
}

/**
 * Combine multiple domain validators into one.
 *
 * Runs all validators and returns the first error found.
 *
 * @param validators - Array of validator functions
 * @returns A combined validator function
 *
 * @example
 * ```typescript
 * const validateQuantity: DomainValidator = async (args) => {
 *   if ((args.quantity as number) <= 0) return "Quantity must be positive";
 *   return undefined;
 * };
 *
 * const validatePrice: DomainValidator = async (args) => {
 *   if ((args.unitPrice as number) < 0) return "Price cannot be negative";
 *   return undefined;
 * };
 *
 * const combinedValidator = combineDomainValidators([
 *   validateQuantity,
 *   validatePrice,
 * ]);
 * ```
 */
export function combineDomainValidators(validators: DomainValidator[]): DomainValidator {
  return async (args, ctx) => {
    for (const validator of validators) {
      const error = await validator(args, ctx);
      if (error) {
        return error;
      }
    }
    return undefined;
  };
}

/**
 * Common domain validators that can be composed.
 */
export const CommonValidators = {
  /**
   * Validate that a field is a non-empty string.
   */
  requiredString(fieldName: string, errorMessage?: string): DomainValidator {
    return async (args) => {
      const value = args[fieldName];
      if (typeof value !== "string" || value.trim() === "") {
        return errorMessage ?? `${fieldName} is required`;
      }
      return undefined;
    };
  },

  /**
   * Validate that a numeric field is positive.
   */
  positiveNumber(fieldName: string, errorMessage?: string): DomainValidator {
    return async (args) => {
      const value = args[fieldName];
      if (typeof value !== "number" || value <= 0) {
        return errorMessage ?? `${fieldName} must be a positive number`;
      }
      return undefined;
    };
  },

  /**
   * Validate that a numeric field is non-negative.
   */
  nonNegativeNumber(fieldName: string, errorMessage?: string): DomainValidator {
    return async (args) => {
      const value = args[fieldName];
      if (typeof value !== "number" || value < 0) {
        return errorMessage ?? `${fieldName} cannot be negative`;
      }
      return undefined;
    };
  },

  /**
   * Validate that a numeric field is within a range.
   */
  numberRange(fieldName: string, min: number, max: number, errorMessage?: string): DomainValidator {
    return async (args) => {
      const value = args[fieldName];
      if (typeof value !== "number" || value < min || value > max) {
        return errorMessage ?? `${fieldName} must be between ${min} and ${max}`;
      }
      return undefined;
    };
  },

  /**
   * Validate that a string field matches a pattern.
   */
  matchesPattern(fieldName: string, pattern: RegExp, errorMessage?: string): DomainValidator {
    return async (args) => {
      const value = args[fieldName];
      if (typeof value !== "string" || !pattern.test(value)) {
        return errorMessage ?? `${fieldName} has invalid format`;
      }
      return undefined;
    };
  },

  /**
   * Validate that a field starts with a prefix.
   */
  startsWithPrefix(fieldName: string, prefix: string, errorMessage?: string): DomainValidator {
    return async (args) => {
      const value = args[fieldName];
      if (typeof value !== "string" || !value.startsWith(prefix)) {
        return errorMessage ?? `${fieldName} must start with '${prefix}'`;
      }
      return undefined;
    };
  },
} as const;
