// Types
export type {
  CommandMetadata,
  Command,
  CommandSuccessResult,
  CommandRejectedResult,
  CommandConflictResult,
  CommandErrorResult,
  CommandResult,
  CommandHandler,
  CommandStatus,
  StoredCommand,
  ExtractCommandPayload,
} from "./types.js";

// Schemas
export {
  CommandMetadataSchema,
  CommandSchema,
  createCommandSchema,
  CommandSuccessResultSchema,
  CommandRejectedResultSchema,
  CommandConflictResultSchema,
  CommandErrorResultSchema,
  CommandResultSchema,
  CommandStatusSchema,
  StoredCommandSchema,
} from "./schemas.js";

export type {
  TypedCommandSchema,
  CommandMetadataSchemaType,
  CommandSchemaType,
  CommandResultSchemaType,
  CommandStatusSchemaType,
  StoredCommandSchemaType,
} from "./schemas.js";

// Categories
export type { CommandCategory, AggregateTarget } from "./categories.js";
export {
  COMMAND_CATEGORIES,
  CommandCategorySchema,
  DEFAULT_COMMAND_CATEGORY,
  isCommandCategory,
  normalizeCommandCategory,
  isAggregateCommand,
  isProcessCommand,
  isSystemCommand,
  isBatchCommand,
  AggregateTargetSchema,
} from "./categories.js";

// Naming Policy
export type { CommandNamePrefix, CommandNameValidationResult } from "./naming.js";
export {
  CommandNamingPolicy,
  COMMAND_NAME_PREFIXES,
  validateCommandName,
  generateNameSuggestions,
  isValidCommandName,
  getCommandPrefix,
  formatCommandName,
} from "./naming.js";

// Errors
export type { ErrorCategoryType, CommandErrorJSON } from "./errors.js";
export {
  ErrorCategory,
  ERROR_CATEGORIES,
  isErrorCategory,
  CommandError,
  CommandErrors,
  isCommandErrorOfCategory,
  isRecoverableError,
  getRetryDelay,
} from "./errors.js";

// Type Guards
export { isSuccessResult, isRejectedResult, isFailedResult } from "./guards.js";

// Category Factories
export type {
  TypedAggregateCommandSchema,
  AggregateCommandSchemaConfig,
  TypedProcessCommandSchema,
  ProcessCommandSchemaConfig,
  TypedSystemCommandSchema,
  SystemCommandSchemaConfig,
  TypedBatchCommandSchema,
  BatchCommandSchemaConfig,
} from "./factories.js";
export {
  EnhancedCommandMetadataSchema,
  createAggregateCommandSchema,
  createProcessCommandSchema,
  createSystemCommandSchema,
  createBatchCommandSchema,
  getCommandCategoryFromSchema,
} from "./factories.js";
