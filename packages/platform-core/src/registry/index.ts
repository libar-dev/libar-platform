/**
 * Command Registry Module
 *
 * Provides type-safe command registration, discovery, and introspection.
 */

// Types
export type {
  CommandDefinitionMetadata,
  CommandRegistration,
  CommandInfo,
  ValidationResult,
} from "./types.js";

// Registry
export { CommandRegistry, globalRegistry } from "./CommandRegistry.js";

// Define helpers
export type {
  ProjectionDefinition,
  SagaRouteDefinition,
  AggregateCommandDefinition,
  AggregateCommandResult,
  ProcessCommandDefinition,
  SystemCommandDefinition,
  SystemCommandResult,
} from "./defineCommand.js";
export {
  defineAggregateCommand,
  defineProcessCommand,
  defineSystemCommand,
} from "./defineCommand.js";
