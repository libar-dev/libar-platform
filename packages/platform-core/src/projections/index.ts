/**
 * Provides checkpoint management, dead letter handling, and processing
 * helpers for building event-driven CQRS read models.
 */

// Types
export type {
  ProjectionCheckpoint,
  ProjectionStatus,
  ProjectionState,
  ProjectionDeadLetter,
  ProjectionProcessResult,
  ProjectionRebuildOptions,
} from "./types.js";

// Schemas
export {
  ProjectionCheckpointSchema,
  ProjectionStatusSchema,
  ProjectionStateSchema,
  DeadLetterStatusSchema,
  ProjectionDeadLetterSchema,
  ProjectionProcessResultSchema,
  shouldProcessEvent,
  createInitialCheckpoint,
} from "./checkpoint.js";

export type {
  ProjectionCheckpointSchemaType,
  ProjectionStatusSchemaType,
  ProjectionStateSchemaType,
  DeadLetterStatusSchemaType,
  ProjectionDeadLetterSchemaType,
  ProjectionProcessResultSchemaType,
} from "./checkpoint.js";

// Checkpoint helpers
export { withCheckpoint, createCheckpointHelper } from "./withCheckpoint.js";
export type { CheckpointProcessResult, WithCheckpointConfig } from "./withCheckpoint.js";

// Registry
export type { ProjectionRegistry } from "./registry.js";
export { createProjectionRegistry } from "./registry.js";

// Validation
export type {
  ProjectionValidationErrorCode,
  ProjectionValidationError,
  ProjectionCategoryValidationResult,
} from "./validation.js";
export {
  PROJECTION_VALIDATION_ERRORS,
  validateProjectionCategory,
  assertValidCategory,
} from "./validation.js";

// Lifecycle State Machine
export type {
  ProjectionLifecycleState,
  ProjectionLifecycleEvent,
  StateTransition,
} from "./lifecycle.js";
export {
  isValidTransition,
  transitionState,
  getValidEventsFrom,
  getAllTransitions,
  assertValidTransition,
} from "./lifecycle.js";

// Roadmap Patterns (Phase 15, 17)
// Re-export from @libar-dev/platform-bc to maintain backwards compatibility
export type { ProjectionCategory } from "@libar-dev/platform-bc";
export {
  PROJECTION_CATEGORIES,
  ProjectionCategorySchema,
  isProjectionCategory,
  isLogicProjection,
  isViewProjection,
  isReportingProjection,
  isIntegrationProjection,
  isClientExposed,
} from "@libar-dev/platform-bc";

// Reactive Projections (Phase 17)
export type {
  ReactiveDomainEvent,
  EvolveFunction,
  ReactiveProjectionConfig,
  ReactiveProjectionResult,
  ReactiveProjectionError,
  ReactiveProjectionErrorCode,
  ReactiveConfigValidationResult,
} from "./reactive.js";
export {
  REACTIVE_PROJECTION_ERRORS,
  isReactiveEligible,
  validateReactiveConfig,
  mergeProjectionWithEvents,
  createInitialReactiveResult,
  createReactiveResult,
  useReactiveProjection,
} from "./reactive.js";

// Conflict Detection (Phase 17)
export type {
  ConflictDetectionConfig,
  ConflictResult,
  ConflictResolution,
  OptimisticState,
  DurableState,
  ConflictType,
  ConflictDetails,
  ResolvedState,
  AppliedOptimisticEvent,
} from "./conflict.js";
export {
  CONFLICT_RESOLUTIONS,
  detectConflict,
  resolveConflict,
  isOptimisticAhead,
  hasConflict,
  createOptimisticState,
  addOptimisticEvent,
  clearConfirmedEvents,
} from "./conflict.js";

// Replay Infrastructure (Phase 18b-1)
export type {
  ReplayStatus,
  ReplayCheckpoint,
  ReplayProgress,
  TriggerRebuildArgs,
  ProcessChunkArgs,
  ChunkProcessResult,
  TriggerRebuildResult,
  CancelRebuildResult,
  // Replay handler types
  StoredEventForReplay,
  ReplayHandlerEntry,
  ProjectionReplayHandlers,
  ReplayHandlerRegistry,
} from "./replay/index.js";

export {
  ReplayStatusSchema,
  calculateProgress,
  estimateRemainingTime,
  calculatePercentComplete,
  isActiveReplay,
  isTerminalReplayStatus,
  // Replay handler registry factory
  createReplayHandlerRegistry,
} from "./replay/index.js";
