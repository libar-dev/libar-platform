/**
 * Pattern Detection Framework for Agent BC
 *
 * Defines patterns that trigger agent analysis based on event streams.
 * Patterns specify time/event windows, trigger conditions, and optional
 * analysis functions for LLM-powered pattern detection.
 *
 * @module agent/patterns
 */

import { z } from "zod";
import type { PublishedEvent } from "../eventbus/types.js";
import type { AgentInterface, PatternWindow } from "./types.js";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for pattern validation and processing.
 */
export const PATTERN_ERROR_CODES = {
  /** Pattern trigger function is required */
  TRIGGER_REQUIRED: "TRIGGER_REQUIRED",
  /** Pattern name is required */
  PATTERN_NAME_REQUIRED: "PATTERN_NAME_REQUIRED",
  /** Minimum events must be positive */
  INVALID_MIN_EVENTS: "INVALID_MIN_EVENTS",
  /** Duration format is invalid (must be Nd, Nh, or Nm) */
  INVALID_DURATION_FORMAT: "INVALID_DURATION_FORMAT",
  /** Event limit must be positive */
  INVALID_EVENT_LIMIT: "INVALID_EVENT_LIMIT",
  /** Load batch size must be positive */
  INVALID_LOAD_BATCH_SIZE: "INVALID_LOAD_BATCH_SIZE",
} as const;

export type PatternErrorCode =
  (typeof PATTERN_ERROR_CODES)[keyof typeof PATTERN_ERROR_CODES];

// ============================================================================
// Pattern Types
// ============================================================================

/**
 * Function that determines if a pattern should trigger analysis.
 *
 * @param events - Events within the pattern window
 * @returns true if the pattern is detected and analysis should proceed
 */
export type PatternTrigger = (events: readonly PublishedEvent[]) => boolean;

/**
 * Result from pattern analysis by the agent.
 */
export interface PatternAnalysisResult {
  /** Whether a pattern was detected */
  readonly detected: boolean;

  /** Confidence score for the detected pattern (0-1) */
  readonly confidence: number;

  /** Human-readable explanation of the analysis */
  readonly reasoning: string;

  /** Event IDs that matched the pattern */
  readonly matchingEventIds: readonly string[];

  /** Additional pattern-specific data */
  readonly data?: unknown;
}

/**
 * Function that performs LLM-powered analysis on events.
 *
 * @param events - Events within the pattern window
 * @param agent - Agent interface for LLM reasoning
 * @returns Analysis result with pattern detection details
 */
export type PatternAnalyzer = (
  events: readonly PublishedEvent[],
  agent: AgentInterface
) => Promise<PatternAnalysisResult>;

/**
 * Definition of a pattern for agent detection.
 *
 * Patterns combine:
 * - A time/event window for event collection
 * - A trigger function for quick pattern matching
 * - An optional analyzer for LLM-powered deep analysis
 */
export interface PatternDefinition {
  /** Unique identifier for this pattern */
  readonly name: string;

  /** Human-readable description of the pattern */
  readonly description?: string;

  /** Time/event window configuration */
  readonly window: PatternWindow;

  /**
   * Fast trigger function to determine if analysis should run.
   * Returns true if the pattern is potentially present.
   */
  readonly trigger: PatternTrigger;

  /**
   * Optional LLM-powered analyzer for deeper pattern analysis.
   * Only called if trigger returns true.
   */
  readonly analyze?: PatternAnalyzer;
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for pattern window validation.
 */
export const PatternWindowSchema = z.object({
  duration: z.string().min(1),
  eventLimit: z.number().int().positive().optional(),
  minEvents: z.number().int().positive().optional(),
  loadBatchSize: z.number().int().positive().optional(),
});

/**
 * Type inferred from PatternWindowSchema.
 */
export type PatternWindowSchemaType = z.infer<typeof PatternWindowSchema>;

// ============================================================================
// Duration Parsing
// ============================================================================

/**
 * Duration unit multipliers in milliseconds.
 */
const DURATION_UNITS: Record<string, number> = {
  m: 60 * 1000, // minutes
  h: 60 * 60 * 1000, // hours
  d: 24 * 60 * 60 * 1000, // days
};

/**
 * Parse a duration string to milliseconds.
 *
 * Supports formats:
 * - `Nd` - N days (e.g., "7d", "30d")
 * - `Nh` - N hours (e.g., "24h", "12h")
 * - `Nm` - N minutes (e.g., "30m", "60m")
 *
 * @param duration - Duration string to parse
 * @returns Milliseconds, or null if format is invalid
 *
 * @example
 * ```typescript
 * parseDuration("7d");  // 604800000 (7 days in ms)
 * parseDuration("24h"); // 86400000 (24 hours in ms)
 * parseDuration("30m"); // 1800000 (30 minutes in ms)
 * parseDuration("invalid"); // null
 * ```
 */
export function parseDuration(duration: string): number | null {
  const match = duration.trim().match(/^(\d+)([dhm])$/i);
  if (!match) {
    return null;
  }

  const valueStr = match[1];
  const unitStr = match[2];
  if (valueStr === undefined || unitStr === undefined) {
    return null;
  }

  const value = parseInt(valueStr, 10);
  const unit = unitStr.toLowerCase();
  const multiplier = DURATION_UNITS[unit];

  if (value <= 0 || !multiplier) {
    return null;
  }

  return value * multiplier;
}

/**
 * Check if a duration string is valid.
 *
 * @param duration - Duration string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDuration(duration: string): boolean {
  return parseDuration(duration) !== null;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Result of validating a pattern definition.
 */
export type PatternValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: PatternErrorCode;
      readonly message: string;
    };

/**
 * Validate a pattern definition.
 *
 * Checks:
 * - Pattern name is required and non-empty
 * - Trigger function is required
 * - Window duration is valid
 * - Event limit is positive (if specified)
 * - Min events is positive (if specified)
 * - Load batch size is positive (if specified)
 *
 * @param definition - Pattern definition to validate
 * @returns Validation result with error details if invalid
 */
export function validatePatternDefinition(
  definition: Partial<PatternDefinition>
): PatternValidationResult {
  // Check pattern name
  if (!definition.name || definition.name.trim() === "") {
    return {
      valid: false,
      code: PATTERN_ERROR_CODES.PATTERN_NAME_REQUIRED,
      message: "Pattern name is required",
    };
  }

  // Check trigger function
  if (!definition.trigger || typeof definition.trigger !== "function") {
    return {
      valid: false,
      code: PATTERN_ERROR_CODES.TRIGGER_REQUIRED,
      message: "Pattern trigger function is required",
    };
  }

  // Validate window configuration
  if (definition.window) {
    const { duration } = definition.window;
    // Check duration format
    if (!duration || !isValidDuration(duration)) {
      return {
        valid: false,
        code: PATTERN_ERROR_CODES.INVALID_DURATION_FORMAT,
        message: "Duration must be in format Nd (days), Nh (hours), or Nm (minutes)",
      };
    }

    // Check event limit
    if (
      definition.window.eventLimit !== undefined &&
      (definition.window.eventLimit <= 0 || !Number.isInteger(definition.window.eventLimit))
    ) {
      return {
        valid: false,
        code: PATTERN_ERROR_CODES.INVALID_EVENT_LIMIT,
        message: "Event limit must be a positive integer",
      };
    }

    // Check min events
    if (
      definition.window.minEvents !== undefined &&
      (definition.window.minEvents <= 0 || !Number.isInteger(definition.window.minEvents))
    ) {
      return {
        valid: false,
        code: PATTERN_ERROR_CODES.INVALID_MIN_EVENTS,
        message: "Minimum events must be a positive integer",
      };
    }

    // Check load batch size
    if (
      definition.window.loadBatchSize !== undefined &&
      (definition.window.loadBatchSize <= 0 || !Number.isInteger(definition.window.loadBatchSize))
    ) {
      return {
        valid: false,
        code: PATTERN_ERROR_CODES.INVALID_LOAD_BATCH_SIZE,
        message: "Load batch size must be a positive integer",
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Define a pattern for agent detection.
 *
 * Factory function that validates and returns a pattern definition.
 * Throws if the definition is invalid.
 *
 * @param definition - Pattern definition configuration
 * @returns Validated pattern definition
 * @throws Error if definition is invalid
 *
 * @example
 * ```typescript
 * const churnRiskPattern = definePattern({
 *   name: "churn-risk",
 *   description: "Detect customers at risk of churning",
 *   window: { duration: "30d", minEvents: 3 },
 *   trigger: (events) => {
 *     const cancellations = events.filter(e => e.eventType === "OrderCancelled");
 *     return cancellations.length >= 3;
 *   },
 *   analyze: async (events, agent) => {
 *     const result = await agent.analyze(
 *       "Analyze cancellation patterns for churn risk",
 *       events
 *     );
 *     return {
 *       detected: result.confidence > 0.7,
 *       confidence: result.confidence,
 *       reasoning: result.reasoning,
 *       matchingEventIds: events.map(e => e.eventId),
 *     };
 *   },
 * });
 * ```
 */
export function definePattern(definition: PatternDefinition): PatternDefinition {
  const validation = validatePatternDefinition(definition);
  if (!validation.valid) {
    throw new Error(`Invalid pattern definition: ${validation.message} (${validation.code})`);
  }
  return definition;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate the timestamp boundary for a pattern window.
 *
 * @param window - Pattern window configuration
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Earliest timestamp to include in the window
 */
export function calculateWindowBoundary(
  window: PatternWindow,
  now: number = Date.now()
): number {
  const durationMs = parseDuration(window.duration);
  if (durationMs === null) {
    throw new Error(`Invalid duration format: ${window.duration}`);
  }
  return now - durationMs;
}

/**
 * Filter events to those within a pattern window.
 *
 * Applies time and count constraints from the window configuration.
 *
 * @param events - Events to filter
 * @param window - Pattern window configuration
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Filtered events within the window
 */
export function filterEventsInWindow(
  events: readonly PublishedEvent[],
  window: PatternWindow,
  now: number = Date.now()
): PublishedEvent[] {
  const boundary = calculateWindowBoundary(window, now);

  // Filter by time
  let filtered = events.filter((e) => e.timestamp >= boundary);

  // Apply event limit if specified
  if (window.eventLimit !== undefined && filtered.length > window.eventLimit) {
    // Take the most recent events up to the limit
    filtered = filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, window.eventLimit);
  }

  return filtered;
}

/**
 * Check if there are enough events to trigger pattern analysis.
 *
 * @param events - Events to check
 * @param window - Pattern window configuration
 * @returns true if minimum event count is met
 */
export function hasMinimumEvents(
  events: readonly PublishedEvent[],
  window: PatternWindow
): boolean {
  const minEvents = window.minEvents ?? 1;
  return events.length >= minEvents;
}

// ============================================================================
// Common Pattern Triggers
// ============================================================================

/**
 * Common pattern trigger factories.
 *
 * Pre-built triggers for common pattern detection scenarios.
 */
export const PatternTriggers = {
  /**
   * Trigger when event count meets threshold.
   *
   * @param minCount - Minimum number of events to trigger
   * @returns Trigger function
   */
  countThreshold(minCount: number): PatternTrigger {
    return (events) => events.length >= minCount;
  },

  /**
   * Trigger when specific event types appear.
   *
   * @param eventTypes - Event types to look for
   * @param minCount - Minimum count of matching events (default: 1)
   * @returns Trigger function
   */
  eventTypePresent(eventTypes: readonly string[], minCount: number = 1): PatternTrigger {
    const typeSet = new Set(eventTypes);
    return (events) => {
      const matching = events.filter((e) => typeSet.has(e.eventType));
      return matching.length >= minCount;
    };
  },

  /**
   * Trigger when events from multiple streams are present.
   *
   * @param minStreams - Minimum number of unique streams
   * @returns Trigger function
   */
  multiStreamPresent(minStreams: number): PatternTrigger {
    return (events) => {
      const streams = new Set(events.map((e) => e.streamId));
      return streams.size >= minStreams;
    };
  },

  /**
   * Combine multiple triggers with AND logic.
   *
   * @param triggers - Triggers to combine
   * @returns Trigger that requires all conditions
   */
  all(...triggers: PatternTrigger[]): PatternTrigger {
    return (events) => triggers.every((t) => t(events));
  },

  /**
   * Combine multiple triggers with OR logic.
   *
   * @param triggers - Triggers to combine
   * @returns Trigger that requires any condition
   */
  any(...triggers: PatternTrigger[]): PatternTrigger {
    return (events) => triggers.some((t) => t(events));
  },
} as const;
