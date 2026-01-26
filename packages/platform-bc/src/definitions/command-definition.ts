/**
 * Command Definition Interface
 *
 * Formal metadata for commands in a bounded context.
 * Complements Zod schemas with documentation and introspection.
 *
 * Commands represent user intent to change state (CQRS pattern).
 * They target Aggregate Roots for state changes.
 *
 * @example
 * ```typescript
 * const CreateOrderDef = defineCommand({
 *   commandType: "CreateOrder",
 *   description: "Creates a new order in draft status",
 *   targetAggregate: "Order",
 *   createsAggregate: true,
 *   producesEvents: ["OrderCreated"],
 *   errorCodes: ["ORDER_ALREADY_EXISTS"],
 * });
 * ```
 */

/**
 * Metadata for a command type.
 *
 * This interface captures command documentation without
 * replacing the Zod schema (which remains the validation source).
 *
 * @template TCommandType - Literal string type for the command
 */
export interface CommandDefinition<TCommandType extends string = string> {
  /**
   * Command type name (e.g., "CreateOrder", "SubmitOrder").
   * Should follow verb-first naming convention.
   */
  readonly commandType: TCommandType;

  /**
   * Human-readable description of what this command does.
   */
  readonly description: string;

  /**
   * Target aggregate type that this command modifies (e.g., "Order").
   */
  readonly targetAggregate: string;

  /**
   * Whether this command creates a new aggregate instance.
   * true for commands like "CreateOrder", false for "SubmitOrder".
   */
  readonly createsAggregate: boolean;

  /**
   * Events this command may produce on success.
   */
  readonly producesEvents: readonly string[];

  /**
   * Error codes this command may throw on failure.
   */
  readonly errorCodes?: readonly string[];

  /**
   * Whether this is an internal/system command (not exposed to users).
   * Examples: ExpireReservation, CleanupExpiredCommands.
   */
  readonly internal?: boolean;
}

/**
 * Helper to define a command with type inference.
 *
 * This is a simple identity function that provides better TypeScript inference,
 * preserving all literal types including commandType, producesEvents, and errorCodes.
 *
 * @param definition - Command definition
 * @returns The same definition with all literal types preserved
 *
 * @example
 * ```typescript
 * const SubmitOrderDef = defineCommand({
 *   commandType: "SubmitOrder",
 *   description: "Submits a draft order for processing",
 *   targetAggregate: "Order",
 *   createsAggregate: false,
 *   producesEvents: ["OrderSubmitted"],
 *   errorCodes: ["ORDER_NOT_FOUND", "ORDER_NOT_IN_DRAFT", "ORDER_HAS_NO_ITEMS"],
 * });
 *
 * // SubmitOrderDef.commandType is "SubmitOrder" (literal), not string
 * // SubmitOrderDef.producesEvents is readonly ["OrderSubmitted"] (literal tuple)
 * ```
 */
export function defineCommand<const T extends CommandDefinition<string>>(definition: T): T {
  return definition;
}

/**
 * Registry of command definitions for a bounded context.
 *
 * Maps command type strings to their definitions.
 *
 * @template TCommandTypes - Tuple of command type strings
 *
 * @example
 * ```typescript
 * const ORDER_COMMANDS = ["CreateOrder", "SubmitOrder"] as const;
 *
 * const OrderCommandDefs: CommandDefinitionRegistry<typeof ORDER_COMMANDS> = {
 *   CreateOrder: defineCommand({ ... }),
 *   SubmitOrder: defineCommand({ ... }),
 * };
 * ```
 */
export type CommandDefinitionRegistry<TCommandTypes extends readonly string[]> = {
  readonly [K in TCommandTypes[number]]: CommandDefinition<K>;
};
