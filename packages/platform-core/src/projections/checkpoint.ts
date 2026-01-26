import { z } from "zod";
import type { ProjectionCheckpoint } from "./types.js";

/**
 * Schema for projection checkpoint.
 */
export const ProjectionCheckpointSchema = z.object({
  projectionName: z.string(),
  partitionKey: z.string(),
  lastGlobalPosition: z.number().int().min(-1), // -1 is sentinel for "no events processed"
  lastEventId: z.string(),
  updatedAt: z.number(),
});

/**
 * Schema for projection status.
 */
export const ProjectionStatusSchema = z.enum(["active", "rebuilding", "paused", "error"]);

/**
 * Schema for projection state.
 */
export const ProjectionStateSchema = z.object({
  projectionName: z.string(),
  status: ProjectionStatusSchema,
  lastGlobalPosition: z.number().int().min(-1), // -1 is sentinel for "no events processed"
  eventsProcessed: z.number().int().nonnegative(),
  eventsFailed: z.number().int().nonnegative(),
  lastUpdatedAt: z.number(),
  errorMessage: z.string().optional(),
});

/**
 * Schema for dead letter status.
 */
export const DeadLetterStatusSchema = z.enum(["pending", "replayed", "ignored"]);

/**
 * Schema for projection dead letter.
 */
export const ProjectionDeadLetterSchema = z.object({
  eventId: z.string(),
  projectionName: z.string(),
  error: z.string(),
  attemptCount: z.number().int().positive(),
  status: DeadLetterStatusSchema,
  failedAt: z.number(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Schema for projection process result.
 */
export const ProjectionProcessResultSchema = z.object({
  status: z.enum(["processed", "skipped", "failed"]),
  error: z.string().optional(),
});

/**
 * Helper to check if an event should be processed based on checkpoint.
 *
 * @param eventGlobalPosition - The global position of the event
 * @param checkpointGlobalPosition - The last processed global position
 * @returns true if the event should be processed
 */
export function shouldProcessEvent(
  eventGlobalPosition: number,
  checkpointGlobalPosition: number
): boolean {
  return eventGlobalPosition > checkpointGlobalPosition;
}

/**
 * Create initial checkpoint for a new projection partition.
 *
 * Uses globalPosition: -1 as sentinel value (all real events have globalPosition >= 0)
 * and empty string for lastEventId (no events processed yet).
 */
export function createInitialCheckpoint(
  projectionName: string,
  partitionKey: string
): ProjectionCheckpoint {
  return {
    projectionName,
    partitionKey,
    lastGlobalPosition: -1, // All real events have globalPosition >= 0
    lastEventId: "", // No events processed yet
    updatedAt: Date.now(),
  };
}

/**
 * Type inference helpers.
 */
export type ProjectionCheckpointSchemaType = z.infer<typeof ProjectionCheckpointSchema>;
export type ProjectionStatusSchemaType = z.infer<typeof ProjectionStatusSchema>;
export type ProjectionStateSchemaType = z.infer<typeof ProjectionStateSchema>;
export type DeadLetterStatusSchemaType = z.infer<typeof DeadLetterStatusSchema>;
export type ProjectionDeadLetterSchemaType = z.infer<typeof ProjectionDeadLetterSchema>;
export type ProjectionProcessResultSchemaType = z.infer<typeof ProjectionProcessResultSchema>;
