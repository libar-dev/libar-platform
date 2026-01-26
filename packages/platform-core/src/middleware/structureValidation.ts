/**
 * Structure Validation Middleware
 *
 * Validates command arguments against Zod schemas before handler execution.
 * Short-circuits the pipeline on validation failure.
 */
import type { z } from "zod";
import type {
  Middleware,
  MiddlewareContext,
  MiddlewareBeforeResult,
  StructureValidationConfig,
} from "./types.js";
import type { UnknownRecord } from "../types.js";

/** Middleware execution order for structure validation */
export const STRUCTURE_VALIDATION_ORDER = 10;

/**
 * Create a structure validation middleware.
 *
 * Validates command payloads against registered Zod schemas.
 * This should typically be the first middleware in the pipeline.
 *
 * @param config - Configuration with schemas and options
 * @returns A middleware that validates command structure
 *
 * @example
 * ```typescript
 * const validationMiddleware = createStructureValidationMiddleware({
 *   schemas: {
 *     CreateOrder: z.object({
 *       orderId: z.string(),
 *       customerId: z.string(),
 *     }),
 *     AddOrderItem: z.object({
 *       orderId: z.string(),
 *       productId: z.string(),
 *       quantity: z.number().positive(),
 *     }),
 *   },
 * });
 * ```
 */
export function createStructureValidationMiddleware(config: StructureValidationConfig): Middleware {
  return {
    name: "structureValidation",
    order: STRUCTURE_VALIDATION_ORDER,

    async before(ctx: MiddlewareContext): Promise<MiddlewareBeforeResult> {
      const { command } = ctx;
      const schema = config.schemas[command.type];

      // If no schema registered, skip validation
      if (!schema) {
        return { continue: true, ctx };
      }

      // Validate against schema
      const result = schema.safeParse(command.args);

      if (!result.success) {
        // Format Zod errors into readable format
        const errors = result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        }));

        return {
          continue: false,
          result: {
            status: "rejected",
            code: "VALIDATION_ERROR",
            reason: `Invalid command arguments: ${errors.map((e) => e.message).join(", ")}`,
            context: { errors },
          },
        };
      }

      // If stripping unknown properties, update command args with validated data
      if (config.stripUnknown) {
        return {
          continue: true,
          ctx: {
            ...ctx,
            command: {
              ...command,
              args: result.data as UnknownRecord,
            },
          },
        };
      }

      return { continue: true, ctx };
    },
  };
}

/**
 * Create a structure validation middleware from a CommandRegistry.
 *
 * Automatically uses schemas from registered commands.
 *
 * @param registry - The command registry to get schemas from
 * @param options - Additional options
 * @returns A middleware that validates against registry schemas
 *
 * @example
 * ```typescript
 * import { globalRegistry } from "@libar-dev/platform-core";
 *
 * const validationMiddleware = createRegistryValidationMiddleware(
 *   globalRegistry,
 *   { stripUnknown: true }
 * );
 * ```
 */
export function createRegistryValidationMiddleware(
  registry: {
    getRegistration(commandType: string): { argsSchema: z.ZodType<unknown> } | undefined;
  },
  options: { stripUnknown?: boolean } = {}
): Middleware {
  return {
    name: "registryValidation",
    order: STRUCTURE_VALIDATION_ORDER,

    async before(ctx: MiddlewareContext): Promise<MiddlewareBeforeResult> {
      const { command } = ctx;
      const registration = registry.getRegistration(command.type);

      // If command not registered, skip validation
      if (!registration) {
        return { continue: true, ctx };
      }

      const result = registration.argsSchema.safeParse(command.args);

      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        }));

        return {
          continue: false,
          result: {
            status: "rejected",
            code: "VALIDATION_ERROR",
            reason: `Invalid command arguments: ${errors.map((e) => e.message).join(", ")}`,
            context: { errors },
          },
        };
      }

      if (options.stripUnknown) {
        return {
          continue: true,
          ctx: {
            ...ctx,
            command: {
              ...command,
              args: result.data as UnknownRecord,
            },
          },
        };
      }

      return { continue: true, ctx };
    },
  };
}
