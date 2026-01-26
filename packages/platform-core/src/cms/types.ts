/**
 * @libar-docs
 * @libar-docs-pattern CMSDualWrite
 * @libar-docs-status completed
 * @libar-docs-phase 01
 * @libar-docs-core
 * @libar-docs-used-by CommandOrchestrator, CMSRepository
 *
 * ## CMS Dual-Write Pattern - O(1) State + Full Audit
 *
 * Core types for Command Model State - the continuously updated aggregate snapshot
 * maintained atomically alongside events in the dual-write pattern.
 *
 * ### When to Use
 *
 * - Defining aggregate state shapes (extend BaseCMS)
 * - Schema evolution with CMSUpcaster and CMSVersionConfig
 * - Timestamped records (use TimestampedCMS)
 * - Loading CMS with potential upcasting (use CMSLoadResult)
 */

/**
 * Base interface for all CMS (Command Model State) records.
 *
 * Every aggregate's CMS should extend this interface to ensure
 * proper version tracking for schema evolution.
 */
export interface BaseCMS {
  /**
   * Schema version for CMS lazy migration.
   * Increment this when the CMS structure changes.
   */
  stateVersion: number;

  /**
   * Stream version for optimistic concurrency control.
   * Incremented with each event appended to the stream.
   */
  version: number;
}

/**
 * Interface for CMS records with timestamps.
 */
export interface TimestampedCMS extends BaseCMS {
  /** When the aggregate was created */
  createdAt: number;

  /** When the aggregate was last updated */
  updatedAt: number;
}

/**
 * Type for an upcaster function that migrates CMS from one version to another.
 */
export type CMSUpcaster<TFrom, TTo> = (oldState: TFrom) => TTo;

/**
 * Configuration for CMS schema evolution.
 */
export interface CMSVersionConfig<T extends BaseCMS> {
  /** Current schema version */
  currentVersion: number;

  /** Function to upcast from any older version to current */
  upcast: (state: unknown) => T;
}

/**
 * Result of loading and potentially upcasting CMS.
 */
export interface CMSLoadResult<T extends BaseCMS> {
  /** The (potentially upcasted) CMS state */
  cms: T;

  /** Whether the CMS was upcasted */
  wasUpcasted: boolean;

  /** Original state version before upcast */
  originalStateVersion: number;
}
