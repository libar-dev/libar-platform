/**
 * Central registry for command definitions.
 *
 * Provides:
 * - Type-safe command lookup
 * - Discovery/introspection APIs
 * - Duplicate detection
 * - Category-based filtering
 */
import type { CommandCategory } from "../commands/categories.js";
import type { CommandRegistration, CommandInfo, ValidationResult } from "./types.js";
import type { CommandConfig, CommandHandlerResult } from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Convert a registration to a CommandInfo for introspection.
 */
function toCommandInfo(reg: CommandRegistration<UnknownRecord, unknown>): CommandInfo {
  const info: CommandInfo = {
    commandType: reg.metadata.commandType,
    boundedContext: reg.metadata.boundedContext,
    category: reg.metadata.category,
    schemaVersion: reg.metadata.schemaVersion,
    tags: reg.metadata.tags ?? [],
    hasProjection: true, // Always required in CommandConfig
    hasSecondaryProjections: (reg.config.secondaryProjections?.length ?? 0) > 0,
    hasSagaRoute: reg.config.sagaRoute !== undefined,
    hasFailedProjection: reg.config.failedProjection !== undefined,
  };

  // Conditionally add optional properties to satisfy exactOptionalPropertyTypes
  if (reg.metadata.targetAggregate?.type !== undefined) {
    info.targetAggregate = reg.metadata.targetAggregate.type;
  }
  if (reg.metadata.targetProcess !== undefined) {
    info.targetProcess = reg.metadata.targetProcess;
  }
  if (reg.metadata.description !== undefined) {
    info.description = reg.metadata.description;
  }

  return info;
}

/**
 * Central registry for command definitions.
 *
 * Uses singleton pattern for app-wide registration at module load time.
 *
 * @example
 * ```typescript
 * // Get registry instance
 * const registry = CommandRegistry.getInstance();
 *
 * // Lookup command
 * const config = registry.getConfig("CreateOrder");
 *
 * // List all commands
 * const allCommands = registry.list();
 *
 * // Filter by category
 * const aggregateCommands = registry.listByCategory("aggregate");
 * ```
 */
export class CommandRegistry {
  private static instance: CommandRegistry | null = null;
  private commands: Map<string, CommandRegistration<UnknownRecord, unknown>> = new Map();

  private constructor() {}

  /**
   * Get singleton instance.
   * Registry uses singleton pattern for module-load-time registration.
   */
  static getInstance(): CommandRegistry {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry();
    }
    return CommandRegistry.instance;
  }

  /**
   * Reset registry (for testing only).
   */
  static resetForTesting(): void {
    CommandRegistry.instance = null;
  }

  /**
   * Register a command.
   *
   * The `registeredAt` timestamp is automatically added if not provided.
   *
   * @throws Error if command with same type already registered
   */
  register<TArgs extends UnknownRecord, TData>(
    registration: Omit<CommandRegistration<TArgs, TData>, "registeredAt"> & {
      registeredAt?: number;
    }
  ): void {
    const { commandType } = registration.metadata;
    if (this.commands.has(commandType)) {
      const existing = this.commands.get(commandType)!;
      throw new Error(
        `Duplicate command registration: "${commandType}" is already registered in context "${existing.metadata.boundedContext}"`
      );
    }

    // Auto-add registeredAt if not provided
    const fullRegistration: CommandRegistration<TArgs, TData> = {
      ...registration,
      registeredAt: registration.registeredAt ?? Date.now(),
    };

    this.commands.set(commandType, fullRegistration as CommandRegistration<UnknownRecord, unknown>);
  }

  /**
   * Unregister a command (primarily for testing).
   *
   * @returns True if command was registered and removed
   */
  unregister(commandType: string): boolean {
    return this.commands.delete(commandType);
  }

  /**
   * Get command configuration by type.
   *
   * @returns CommandConfig or undefined if not found
   */
  getConfig<TArgs extends UnknownRecord, TData>(
    commandType: string
  ):
    | CommandConfig<TArgs, UnknownRecord, CommandHandlerResult<TData>, UnknownRecord, TData>
    | undefined {
    const reg = this.commands.get(commandType);
    return reg?.config as
      | CommandConfig<TArgs, UnknownRecord, CommandHandlerResult<TData>, UnknownRecord, TData>
      | undefined;
  }

  /**
   * Get full registration including metadata.
   */
  getRegistration(commandType: string): CommandRegistration<UnknownRecord, unknown> | undefined {
    return this.commands.get(commandType);
  }

  /**
   * Check if command is registered.
   */
  has(commandType: string): boolean {
    return this.commands.has(commandType);
  }

  /**
   * Alias for getRegistration - Get full registration by command type.
   */
  get(commandType: string): CommandRegistration<UnknownRecord, unknown> | undefined {
    return this.getRegistration(commandType);
  }

  /**
   * Get commands by bounded context.
   */
  getByContext(boundedContext: string): CommandRegistration<UnknownRecord, unknown>[] {
    return Array.from(this.commands.values()).filter(
      (reg) => reg.metadata.boundedContext === boundedContext
    );
  }

  /**
   * Validate a command payload against its registered schema.
   *
   * @returns Validation result with errors if invalid
   */
  validate(commandType: string, payload: unknown): ValidationResult {
    const registration = this.commands.get(commandType);

    if (!registration) {
      return {
        valid: false,
        errors: [
          {
            path: "",
            message: `Unknown command type: ${commandType}`,
            code: "UNKNOWN_COMMAND",
          },
        ],
      };
    }

    const result = registration.argsSchema.safeParse(payload);

    if (result.success) {
      return {
        valid: true,
        data: result.data,
      };
    }

    return {
      valid: false,
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    };
  }

  /**
   * List all registered commands (for introspection).
   */
  list(): CommandInfo[] {
    return Array.from(this.commands.values()).map(toCommandInfo);
  }

  /**
   * List commands by category.
   */
  listByCategory(category: CommandCategory): CommandInfo[] {
    return this.list().filter((cmd) => cmd.category === category);
  }

  /**
   * List commands by bounded context.
   */
  listByContext(boundedContext: string): CommandInfo[] {
    return this.list().filter((cmd) => cmd.boundedContext === boundedContext);
  }

  /**
   * List commands by tag.
   */
  listByTag(tag: string): CommandInfo[] {
    return this.list().filter((cmd) => cmd.tags.includes(tag));
  }

  /**
   * Get commands grouped by bounded context.
   */
  groupByContext(): Map<string, CommandInfo[]> {
    const groups = new Map<string, CommandInfo[]>();
    for (const cmd of this.list()) {
      const existing = groups.get(cmd.boundedContext) ?? [];
      existing.push(cmd);
      groups.set(cmd.boundedContext, existing);
    }
    return groups;
  }

  /**
   * Get count of registered commands.
   */
  size(): number {
    return this.commands.size;
  }

  /**
   * Clear all registrations (for testing only).
   */
  clear(): void {
    this.commands.clear();
  }
}

/**
 * Global registry instance for app-wide command registration.
 */
export const globalRegistry = CommandRegistry.getInstance();
