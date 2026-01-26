/**
 * Orchestration module for command execution.
 *
 * Provides the CommandOrchestrator class for reducing boilerplate
 * in the dual-write + projection pattern.
 */

// Types
export type {
  MutationCtx,
  EventData,
  EventDataMetadata,
  CommandHandlerSuccess,
  CommandHandlerRejected,
  CommandHandlerFailed,
  CommandHandlerResult,
  RecordCommandResult,
  CommandMutationResult,
  ProjectionConfig,
  FailedProjectionConfig,
  CommandConfig,
  SagaRouteConfig,
  SagaRouteArgs,
  EventStoreClient,
  CommandBusClient,
  WorkpoolClient,
  OrchestratorDependencies,
  CommandCategoryLookup,
} from "./types.js";

// Class
export { CommandOrchestrator } from "./CommandOrchestrator.js";

// Validation
export type {
  PartitionValidationErrorCode,
  PartitionValidationError,
  ConfigValidationResult,
} from "./validation.js";
export { validateCommandConfigPartitions, assertValidPartitionKeys } from "./validation.js";
