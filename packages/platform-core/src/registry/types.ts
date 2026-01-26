/**
 * Types for the Command Registry.
 *
 * Provides type-safe command registration and introspection.
 */
import type { z } from "zod";
import type { CommandCategory, AggregateTarget } from "../commands/categories.js";
import type { CommandConfig, CommandHandlerResult } from "../orchestration/types.js";
import type { UnknownRecord } from "../types.js";

/**
 * Metadata for a registered command definition.
 * (Named differently from commands/types.ts CommandMetadata which is runtime metadata)
 */
export interface CommandDefinitionMetadata {
  /** Unique command type identifier (e.g., "CreateOrder") */
  commandType: string;

  /** Target bounded context (e.g., "orders") */
  boundedContext: string;

  /** Command category for routing and introspection */
  category: CommandCategory;

  /** Target aggregate (for aggregate commands) */
  targetAggregate?: AggregateTarget;

  /** Target process type (for process commands) */
  targetProcess?: string;

  /** Target subsystem (for system commands) */
  subsystem?: string;

  /** Human-readable description */
  description?: string;

  /** Schema version for this command definition */
  schemaVersion: number;

  /** Tags for filtering/grouping */
  tags?: string[];
}

/**
 * Full command registration including config and metadata.
 *
 * @template TArgs - The command arguments type
 * @template TData - The success data type
 */
export interface CommandRegistration<TArgs extends UnknownRecord = UnknownRecord, TData = unknown> {
  /** Command metadata for introspection */
  metadata: CommandDefinitionMetadata;

  /** Zod schema for validating command args */
  argsSchema: z.ZodType<TArgs>;

  /** The executable command configuration */
  config: CommandConfig<TArgs, UnknownRecord, CommandHandlerResult<TData>, UnknownRecord, TData>;

  /** Registration timestamp for debugging */
  registeredAt: number;
}

/**
 * Result type for command introspection queries.
 */
export interface CommandInfo {
  /** Command type name */
  commandType: string;

  /** Bounded context */
  boundedContext: string;

  /** Command category */
  category: CommandCategory;

  /** Target aggregate type (for aggregate commands) */
  targetAggregate?: string;

  /** Target process type (for process commands) */
  targetProcess?: string;

  /** Description */
  description?: string;

  /** Schema version */
  schemaVersion: number;

  /** Tags */
  tags: string[];

  /** Whether command has primary projection */
  hasProjection: boolean;

  /** Whether command has secondary projections */
  hasSecondaryProjections: boolean;

  /** Whether command has saga routing */
  hasSagaRoute: boolean;

  /** Whether command has failed projection */
  hasFailedProjection: boolean;
}

/**
 * Validation result from schema validation.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validated data (if valid) */
  data?: unknown;

  /** Validation errors (if invalid) */
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
}
