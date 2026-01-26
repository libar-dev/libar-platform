/**
 * @libar-docs
 * @libar-docs-implements EventReplayInfrastructure
 * @libar-docs-status completed
 *
 * Progress calculation utilities for replay operations.
 */

import type { ReplayCheckpoint, ReplayProgress } from "./types.js";

/**
 * Calculate replay progress including estimated remaining time.
 */
export function calculateProgress(
  checkpoint: ReplayCheckpoint,
  totalEvents: number
): ReplayProgress {
  const percentComplete = calculatePercentComplete(checkpoint.eventsProcessed, totalEvents);

  const estimatedRemainingMs =
    checkpoint.status === "running"
      ? estimateRemainingTime(
          checkpoint.eventsProcessed,
          Date.now() - checkpoint.startedAt,
          totalEvents
        )
      : undefined;

  const result: ReplayProgress = {
    replayId: checkpoint.replayId,
    projectionName: checkpoint.projection,
    status: checkpoint.status,
    eventsProcessed: checkpoint.eventsProcessed,
    totalEvents,
    percentComplete,
    chunksCompleted: checkpoint.chunksCompleted,
    startedAt: checkpoint.startedAt,
    updatedAt: checkpoint.updatedAt,
  };

  // Only add optional properties when defined (exactOptionalPropertyTypes)
  if (checkpoint.completedAt !== undefined) {
    result.completedAt = checkpoint.completedAt;
  }
  if (estimatedRemainingMs !== undefined) {
    result.estimatedRemainingMs = estimatedRemainingMs;
  }
  if (checkpoint.error !== undefined) {
    result.error = checkpoint.error;
  }

  return result;
}

/**
 * Estimate remaining time based on current throughput.
 */
export function estimateRemainingTime(
  eventsProcessed: number,
  elapsedMs: number,
  totalEvents: number
): number | undefined {
  if (eventsProcessed === 0 || elapsedMs === 0) {
    return undefined;
  }

  const eventsPerMs = eventsProcessed / elapsedMs;
  const remainingEvents = totalEvents - eventsProcessed;

  if (remainingEvents <= 0) {
    return 0;
  }

  return Math.round(remainingEvents / eventsPerMs);
}

/**
 * Calculate completion percentage.
 */
export function calculatePercentComplete(eventsProcessed: number, totalEvents: number): number {
  if (totalEvents === 0) {
    return 100; // No events to process = complete
  }
  return Math.round((eventsProcessed / totalEvents) * 100 * 10) / 10; // 1 decimal place
}

/**
 * Determine if a replay is active (can be cancelled).
 */
export function isActiveReplay(status: string): boolean {
  return status === "running" || status === "paused";
}

/**
 * Determine if a replay is terminal (cannot be modified).
 */
export function isTerminalReplayStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
