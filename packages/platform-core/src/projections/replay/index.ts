/**
 * Event Replay Infrastructure - Durable Projection Rebuilding
 *
 * Provides checkpoint-based replay for projection recovery and schema migration.
 *
 * @architect
 * @architect-implements EventReplayInfrastructure
 */

// Types
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
} from "./types.js";

export { ReplayStatusSchema, createReplayHandlerRegistry } from "./types.js";

// Progress calculation
export {
  calculateProgress,
  estimateRemainingTime,
  calculatePercentComplete,
  isActiveReplay,
  isTerminalReplayStatus,
} from "./progress.js";
