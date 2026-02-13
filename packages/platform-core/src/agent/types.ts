/**
 * Agent as Bounded Context - Core Types
 *
 * Type definitions for AI agents as first-class bounded contexts that
 * subscribe to domain events and emit commands based on pattern detection.
 *
 * @module agent/types
 */

import type { PublishedEvent } from "../eventbus/types.js";
import type { PatternDefinition } from "./patterns.js";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for agent configuration validation.
 */
export const AGENT_CONFIG_ERROR_CODES = {
  /** Agent must subscribe to at least one event type */
  NO_SUBSCRIPTIONS: "NO_SUBSCRIPTIONS",
  /** Pattern window duration must be positive */
  INVALID_PATTERN_WINDOW: "INVALID_PATTERN_WINDOW",
  /** Confidence threshold must be between 0 and 1 */
  INVALID_CONFIDENCE_THRESHOLD: "INVALID_CONFIDENCE_THRESHOLD",
  /** Action cannot be in both autoApprove and requiresApproval */
  CONFLICTING_APPROVAL_RULES: "CONFLICTING_APPROVAL_RULES",
  /** Agent must have a unique identifier */
  AGENT_ID_REQUIRED: "AGENT_ID_REQUIRED",
  /** Agent must have a patterns array with at least one pattern */
  NO_PATTERNS: "NO_PATTERNS",
} as const;

export type AgentConfigErrorCode =
  (typeof AGENT_CONFIG_ERROR_CODES)[keyof typeof AGENT_CONFIG_ERROR_CODES];

// ============================================================================
// Pattern Window
// ============================================================================

/**
 * Time/event window constraints for pattern detection.
 *
 * Defines how many events and how far back in time the agent
 * should look when detecting patterns.
 */
export interface PatternWindow {
  /**
   * Time window duration (e.g., "7d", "30d", "24h").
   * Events outside this window are not considered.
   */
  readonly duration: string;

  /**
   * Maximum number of events to load for analysis.
   * Limits memory usage for streams with many events.
   * @default 100
   */
  readonly eventLimit?: number;

  /**
   * Minimum number of events required to trigger pattern detection.
   * Prevents analysis on insufficient data.
   * @default 1
   */
  readonly minEvents?: number;

  /**
   * Batch size for lazy loading events.
   * Events are loaded in batches to control memory.
   * @default 50
   */
  readonly loadBatchSize?: number;
}

// ============================================================================
// Human-in-Loop Configuration
// ============================================================================

/**
 * Configuration for human-in-loop approval workflow.
 *
 * Controls when agent actions require human approval vs. auto-execution.
 */
export interface HumanInLoopConfig {
  /**
   * Confidence threshold below which approval is required.
   * Actions with confidence below this threshold are flagged for review.
   * @default 0.9
   */
  readonly confidenceThreshold?: number;

  /**
   * Action types that always require human approval.
   * These actions are flagged for review regardless of confidence.
   */
  readonly requiresApproval?: readonly string[];

  /**
   * Action types that can auto-execute regardless of confidence.
   * Overrides the confidence threshold for these action types.
   */
  readonly autoApprove?: readonly string[];

  /**
   * Timeout duration for pending approvals (e.g., "24h", "7d").
   * After this duration, the approval request expires.
   * @default "24h"
   */
  readonly approvalTimeout?: string;
}

// ============================================================================
// Rate Limit Configuration
// ============================================================================

/**
 * Configuration for LLM call rate limiting.
 *
 * Controls API call rates to prevent abuse and manage costs.
 */
export interface AgentRateLimitConfig {
  /**
   * Maximum LLM API calls per minute.
   */
  readonly maxRequestsPerMinute: number;

  /**
   * Maximum concurrent LLM calls.
   * @default 5
   */
  readonly maxConcurrent?: number;

  /**
   * Maximum queued events before backpressure.
   * Events exceeding this are sent to dead letter queue.
   * @default 100
   */
  readonly queueDepth?: number;

  /**
   * Cost budget configuration for LLM usage.
   */
  readonly costBudget?: {
    /** Daily budget in USD */
    readonly daily: number;
    /** Alert threshold as percentage of budget (0-1) */
    readonly alertThreshold: number;
  };
}

// ============================================================================
// Agent Decision
// ============================================================================

/**
 * Output from agent analysis/reasoning.
 *
 * Represents a decision about what action to take (if any) based on
 * pattern detection and LLM reasoning.
 */
export interface AgentDecision {
  /**
   * Command type to emit, or null if no action needed.
   */
  readonly command: string | null;

  /**
   * Command payload data.
   */
  readonly payload: unknown;

  /**
   * Confidence score for this decision (0-1).
   * Used to determine if human approval is required.
   */
  readonly confidence: number;

  /**
   * Human-readable explanation of the decision.
   * Required for audit trail and explainability.
   */
  readonly reason: string;

  /**
   * Whether this action requires human approval.
   * Computed from confidence and HumanInLoopConfig.
   */
  readonly requiresApproval: boolean;

  /**
   * Event IDs that triggered this decision.
   * Used for audit trail and debugging.
   */
  readonly triggeringEvents: readonly string[];
}

// ============================================================================
// LLM Analysis Result
// ============================================================================

/**
 * Result from LLM analysis including patterns and reasoning.
 */
export interface LLMAnalysisResult {
  /**
   * Detected patterns from the event stream.
   */
  readonly patterns: readonly DetectedPattern[];

  /**
   * Overall confidence in the analysis (0-1).
   */
  readonly confidence: number;

  /**
   * Raw reasoning/explanation from the LLM.
   */
  readonly reasoning: string;

  /**
   * LLM context metadata for audit.
   */
  readonly llmContext?: LLMContext;
}

/**
 * A pattern detected by the agent during analysis.
 */
export interface DetectedPattern {
  /** Pattern name/identifier */
  readonly name: string;
  /** Confidence in this specific pattern (0-1) */
  readonly confidence: number;
  /** Event IDs that match this pattern */
  readonly matchingEventIds: readonly string[];
  /** Additional pattern-specific data */
  readonly data?: unknown;
}

/**
 * LLM call context for auditing and debugging.
 */
export interface LLMContext {
  /** Model used for analysis */
  readonly model: string;
  /** Total tokens used */
  readonly tokens: number;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Thread ID if using @convex-dev/agent threads */
  readonly threadId?: string;
}

// ============================================================================
// Agent Execution Context
// ============================================================================

/**
 * Context provided to the agent's pattern trigger/analyze functions.
 *
 * Provides access to LLM reasoning capabilities, event history,
 * and agent configuration.
 */
export interface AgentExecutionContext {
  /**
   * Agent reasoning interface (integrates with @convex-dev/agent).
   */
  readonly agent: AgentInterface;

  /**
   * Recent events within the pattern window.
   * Loaded lazily based on PatternWindow configuration.
   */
  readonly history: readonly PublishedEvent[];

  /**
   * Current agent checkpoint state.
   */
  readonly checkpoint: AgentCheckpointState;

  /**
   * Agent configuration (read-only).
   */
  readonly config: Readonly<AgentBCConfig>;
}

/**
 * Interface for agent reasoning capabilities.
 *
 * Wraps @convex-dev/agent for LLM interaction.
 */
export interface AgentInterface {
  /**
   * Analyze events using LLM for pattern detection.
   *
   * @param prompt - Analysis prompt for the LLM
   * @param events - Events to analyze
   * @returns Analysis result with patterns and confidence
   */
  readonly analyze: (
    prompt: string,
    events: readonly PublishedEvent[]
  ) => Promise<LLMAnalysisResult>;

  /**
   * Simple reasoning about a single event.
   *
   * @param event - Event to reason about
   * @returns Reasoning result (implementation-specific)
   */
  readonly reason: (event: PublishedEvent) => Promise<unknown>;
}

/**
 * Checkpoint state accessible during event handling.
 * Read-only view of the agent's position in the event stream.
 */
export interface AgentCheckpointState {
  /** Last processed global position */
  readonly lastProcessedPosition: number;
  /** Last processed event ID */
  readonly lastEventId: string;
  /** Total events processed by this agent */
  readonly eventsProcessed: number;
}

// ============================================================================
// Agent BC Configuration
// ============================================================================

/**
 * Full configuration for an Agent Bounded Context.
 *
 * Defines the agent's identity, subscriptions, pattern detection
 * parameters, and execution configuration.
 */
export interface AgentBCConfig {
  /**
   * Unique identifier for this agent.
   * Used for checkpoint tracking, audit, and logging.
   */
  readonly id: string;

  /**
   * Event types this agent subscribes to.
   * The agent receives all events matching these types.
   */
  readonly subscriptions: readonly string[];

  /**
   * Pattern window configuration.
   * Defines the time/event window for pattern detection.
   */
  readonly patternWindow: PatternWindow;

  /**
   * Confidence threshold for auto-execution.
   * Actions with confidence >= threshold auto-execute.
   * Actions below threshold are flagged for review.
   */
  readonly confidenceThreshold: number;

  /**
   * Human-in-loop configuration (optional).
   * Overrides default approval behavior for specific actions.
   */
  readonly humanInLoop?: HumanInLoopConfig;

  /**
   * LLM rate limiting configuration (optional).
   * Controls API call rates and cost budgets.
   */
  readonly rateLimits?: AgentRateLimitConfig;

  /**
   * Pattern definitions for event analysis.
   * The handler uses the pattern executor to analyze events.
   */
  readonly patterns: readonly PatternDefinition[];
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of validating an AgentBCConfig.
 */
export type AgentConfigValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: AgentConfigErrorCode;
      readonly message: string;
    };

/**
 * Validate an AgentBCConfig.
 *
 * Checks all required fields and validates constraints:
 * - Agent ID is required
 * - At least one subscription is required
 * - Confidence threshold must be 0-1
 * - Pattern window duration must be positive
 * - No conflicting approval rules
 *
 * @param config - Configuration to validate
 * @returns Validation result with error details if invalid
 */
export function validateAgentBCConfig(config: Partial<AgentBCConfig>): AgentConfigValidationResult {
  // Check required ID
  if (!config.id || config.id.trim() === "") {
    return {
      valid: false,
      code: AGENT_CONFIG_ERROR_CODES.AGENT_ID_REQUIRED,
      message: "Agent must have a unique identifier",
    };
  }

  // Check subscriptions
  if (!config.subscriptions || config.subscriptions.length === 0) {
    return {
      valid: false,
      code: AGENT_CONFIG_ERROR_CODES.NO_SUBSCRIPTIONS,
      message: "Agent must subscribe to at least one event type",
    };
  }

  // Check confidence threshold
  if (
    config.confidenceThreshold !== undefined &&
    (config.confidenceThreshold < 0 || config.confidenceThreshold > 1)
  ) {
    return {
      valid: false,
      code: AGENT_CONFIG_ERROR_CODES.INVALID_CONFIDENCE_THRESHOLD,
      message: "Confidence threshold must be between 0 and 1",
    };
  }

  // Check pattern window (basic validation - detailed parsing in patterns.ts)
  if (config.patternWindow) {
    if (!config.patternWindow.duration || config.patternWindow.duration.trim() === "") {
      return {
        valid: false,
        code: AGENT_CONFIG_ERROR_CODES.INVALID_PATTERN_WINDOW,
        message: "Pattern window duration must be specified",
      };
    }
  }

  // Check for conflicting approval rules
  if (config.humanInLoop) {
    const { requiresApproval, autoApprove } = config.humanInLoop;
    if (requiresApproval && autoApprove) {
      const conflicts = requiresApproval.filter((action) => autoApprove.includes(action));
      if (conflicts.length > 0) {
        return {
          valid: false,
          code: AGENT_CONFIG_ERROR_CODES.CONFLICTING_APPROVAL_RULES,
          message: `Action cannot be in both autoApprove and requiresApproval: ${conflicts.join(", ")}`,
        };
      }
    }
  }

  // Patterns array must be present and non-empty
  if (!Array.isArray(config.patterns) || config.patterns.length === 0) {
    return {
      valid: false,
      code: AGENT_CONFIG_ERROR_CODES.NO_PATTERNS,
      message: "Agent must have a patterns array with at least one pattern",
    };
  }

  return { valid: true };
}
