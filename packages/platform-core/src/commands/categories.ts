import { z } from "zod";

/**
 * Command category taxonomy per DDD/CQRS patterns.
 *
 * | Category  | Target              | Scope                    | Use Case                       |
 * |-----------|---------------------|--------------------------|--------------------------------|
 * | aggregate | Aggregate Root      | Single entity state      | CreateOrder, AddOrderItem      |
 * | process   | Process Manager     | Saga/Workflow            | StartOrderFulfillment          |
 * | system    | Infrastructure      | Admin/maintenance        | CleanupExpiredCommands         |
 * | batch     | Multiple entities   | Bulk operations          | BulkCreateOrders               |
 */
export type CommandCategory = "aggregate" | "process" | "system" | "batch";

/**
 * All valid command categories as a readonly tuple.
 */
export const COMMAND_CATEGORIES = ["aggregate", "process", "system", "batch"] as const;

/**
 * Zod schema for command category validation.
 */
export const CommandCategorySchema = z.enum(COMMAND_CATEGORIES);

/**
 * Default command category for commands without explicit category.
 */
export const DEFAULT_COMMAND_CATEGORY: CommandCategory = "aggregate";

/**
 * Type guard to check if a value is a valid CommandCategory.
 *
 * @param value - Value to check
 * @returns True if value is a valid CommandCategory
 *
 * @example
 * ```typescript
 * const category = "aggregate";
 * if (isCommandCategory(category)) {
 *   // category is typed as CommandCategory
 * }
 * ```
 */
export function isCommandCategory(value: unknown): value is CommandCategory {
  return typeof value === "string" && (COMMAND_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Normalize a category value to CommandCategory with default fallback.
 *
 * @param category - Category value (may be undefined)
 * @returns Valid CommandCategory
 *
 * @example
 * ```typescript
 * normalizeCommandCategory(undefined) // "aggregate"
 * normalizeCommandCategory("process") // "process"
 * normalizeCommandCategory("invalid") // "aggregate"
 * ```
 */
export function normalizeCommandCategory(category: unknown): CommandCategory {
  if (isCommandCategory(category)) {
    return category;
  }
  return DEFAULT_COMMAND_CATEGORY;
}

/**
 * Check if a command category targets an aggregate root.
 *
 * Aggregate commands modify the state of a single aggregate root
 * and are subject to optimistic concurrency control.
 *
 * @param category - Command category
 * @returns True if category targets aggregates
 */
export function isAggregateCommand(category: CommandCategory): boolean {
  return category === "aggregate";
}

/**
 * Check if a command category is for process management (sagas/workflows).
 *
 * Process commands coordinate work across multiple aggregates or contexts
 * and typically trigger compensation on failure.
 *
 * @param category - Command category
 * @returns True if category is for process management
 */
export function isProcessCommand(category: CommandCategory): boolean {
  return category === "process";
}

/**
 * Check if a command category is for system/infrastructure operations.
 *
 * System commands handle administrative tasks like cleanup, migration,
 * or health checks. They may not require idempotency or event emission.
 *
 * @param category - Command category
 * @returns True if category is for system operations
 */
export function isSystemCommand(category: CommandCategory): boolean {
  return category === "system";
}

/**
 * Check if a command category is for batch operations.
 *
 * Batch commands operate on multiple entities and have special
 * transaction semantics (atomic within single aggregate, partial across).
 *
 * @param category - Command category
 * @returns True if category is for batch operations
 */
export function isBatchCommand(category: CommandCategory): boolean {
  return category === "batch";
}

/**
 * Target aggregate metadata for aggregate commands.
 */
export interface AggregateTarget {
  /** The aggregate type name (e.g., "Order", "Product") */
  type: string;
  /** The field name used as aggregate ID (e.g., "orderId", "productId") */
  idField: string;
}

/**
 * Zod schema for aggregate target validation.
 */
export const AggregateTargetSchema = z.object({
  type: z.string().min(1, "Aggregate type is required"),
  idField: z.string().min(1, "Aggregate ID field is required"),
});
