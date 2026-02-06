/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentCommandInfrastructure
 *
 * AgentBCConfig Evolution — DS-4 Stub
 *
 * Evolves AgentBCConfig to support pattern-based detection alongside the
 * legacy onEvent handler. Adds XOR validation: exactly one of onEvent or
 * patterns must be set.
 *
 * Also adds patternId to AgentActionResult to flow pattern identity from
 * PatternExecutor through onComplete to commands.record.
 *
 * Target: platform-core/src/agent/types.ts (evolution of existing)
 *
 * ## Design Decisions
 *
 * - AD-2: AgentBCConfig uses XOR for onEvent vs patterns
 * - AD-6: AgentActionResult gains patternId field
 *
 * See: PDR-012 (Agent Command Routing & Pattern Unification)
 * See: PDR-011 (Agent Action Handler Architecture) — AD-9 evolves here
 * Since: DS-4 (Command Routing & Pattern Unification)
 */

// ============================================================================
// New Error Codes (extend AGENT_CONFIG_ERROR_CODES)
// ============================================================================

/**
 * Additional error codes for DS-4 config validation.
 *
 * IMPLEMENTATION NOTE: Merge these into the existing AGENT_CONFIG_ERROR_CODES
 * in platform-core/src/agent/types.ts.
 */
export const DS4_CONFIG_ERROR_CODES = {
  /** Agent must have either onEvent handler or patterns array */
  NO_EVENT_HANDLER: "NO_EVENT_HANDLER",
  /** Agent cannot have both onEvent and patterns */
  CONFLICTING_HANDLERS: "CONFLICTING_HANDLERS",
} as const;

/**
 * MIGRATION NOTE: Production types.ts has onEvent as REQUIRED.
 * At DS-4 implementation time, change production AgentBCConfig.onEvent to optional.
 * The XOR constraint (onEvent XOR patterns) is enforced by validateAgentBCConfig().
 */

// ============================================================================
// Evolved AgentBCConfig
// ============================================================================

/**
 * Full configuration for an Agent Bounded Context.
 *
 * EVOLUTION from DS-2:
 * - `onEvent` is now OPTIONAL (was required)
 * - `patterns` field added (array of PatternDefinition objects)
 * - XOR constraint: exactly one of `onEvent` or `patterns` must be set
 *
 * In `onEvent` mode (legacy):
 * - `patternWindow` controls event loading for the manual handler
 * - Handler receives events and returns AgentDecision directly
 *
 * In `patterns` mode (new):
 * - `patternWindow` is the master event-loading window
 * - Each pattern's own `window` is used for its trigger/analyze
 * - PatternExecutor iterates patterns and returns first match
 *
 * @example
 * ```typescript
 * // Legacy mode (onEvent) — existing agents unchanged:
 * const config: AgentBCConfig = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled"],
 *   patternWindow: { duration: "30d", minEvents: 3 },
 *   confidenceThreshold: 0.8,
 *   onEvent: async (event, ctx) => { ... },
 * };
 *
 * // New mode (patterns) — PatternDefinition objects passed directly:
 * const config: AgentBCConfig = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled"],
 *   patternWindow: { duration: "30d" },  // Master loading window
 *   confidenceThreshold: 0.8,
 *   patterns: [churnRiskPattern, highValueChurnPattern],
 * };
 * ```
 */
export interface AgentBCConfig {
  /**
   * Unique identifier for this agent.
   * Used for checkpoint tracking, audit, and logging.
   */
  readonly id: string;

  /**
   * Event types this agent subscribes to.
   */
  readonly subscriptions: readonly string[];

  /**
   * Pattern window configuration.
   *
   * In `onEvent` mode: controls event loading for the handler.
   * In `patterns` mode: master event-loading window. Individual pattern
   * windows must be subsets of this (shorter duration, fewer events).
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
   */
  readonly humanInLoop?: HumanInLoopConfig;

  /**
   * LLM rate limiting configuration (optional).
   */
  readonly rateLimits?: AgentRateLimitConfig;

  /**
   * Event handler invoked for each subscribed event.
   * Returns a decision about what action to take.
   *
   * OPTIONAL as of DS-4 — use `patterns` for pattern-based detection.
   * XOR constraint: exactly one of `onEvent` or `patterns` must be set.
   */
  readonly onEvent?: AgentEventHandler;

  /**
   * Pattern definitions for pattern-based detection.
   *
   * Patterns are evaluated in array order by PatternExecutor (first match wins).
   * Validated via `validatePatternDefinitions()` from pattern-registry.ts.
   *
   * NEW in DS-4 — alternative to `onEvent`.
   * XOR constraint: exactly one of `onEvent` or `patterns` must be set.
   *
   * @example
   * ```typescript
   * import { churnRiskPattern } from "./_patterns/churnRisk.js";
   * import { highValueChurnPattern } from "./_patterns/highValueChurn.js";
   *
   * const config: AgentBCConfig = {
   *   patterns: [churnRiskPattern, highValueChurnPattern],
   *   // ... other fields
   * };
   * ```
   */
  readonly patterns?: readonly PatternDefinition[];
}

// ============================================================================
// Evolved Validation
// ============================================================================

/**
 * Validate an AgentBCConfig with DS-4 XOR constraint.
 *
 * EVOLUTION from existing validateAgentBCConfig:
 * - Adds XOR check: exactly one of `onEvent` or `patterns` must be set
 * - Validates patterns via validatePatternDefinitions() from pattern-registry.ts
 *
 * IMPLEMENTATION NOTE: Extend the existing validateAgentBCConfig function
 * in platform-core/src/agent/types.ts. Add the new checks after the
 * existing validation (ID, subscriptions, threshold, window, approvals).
 *
 * @param config - Configuration to validate
 * @returns Validation result with error details if invalid
 */
export function validateAgentBCConfig(config: Partial<AgentBCConfig>): AgentConfigValidationResult {
  // ... existing validation checks unchanged (ID, subscriptions, threshold, etc.) ...

  // DS-4: XOR constraint on onEvent vs patterns
  const hasOnEvent = config.onEvent !== undefined;
  const hasPatterns = config.patterns !== undefined && config.patterns.length > 0;

  if (!hasOnEvent && !hasPatterns) {
    return {
      valid: false,
      code: DS4_CONFIG_ERROR_CODES.NO_EVENT_HANDLER,
      message: "Agent must have either onEvent handler or patterns array",
    };
  }

  if (hasOnEvent && hasPatterns) {
    return {
      valid: false,
      code: DS4_CONFIG_ERROR_CODES.CONFLICTING_HANDLERS,
      message: "Agent cannot have both onEvent and patterns — use one or the other",
    };
  }

  // DS-4: Validate pattern definitions
  if (hasPatterns && config.patterns) {
    // Delegate to validatePatternDefinitions() from pattern-registry.ts
    // const result = validatePatternDefinitions(config.patterns);
    // if (!result.valid) return result;
  }

  return { valid: true };
}

// ============================================================================
// AgentActionResult — Cross-Reference (AD-6)
// ============================================================================
//
// AgentActionResult is CANONICALLY defined in:
//   @see stubs/agent-action-handler/action-handler.ts
//
// DS-4 (PDR-012 AD-6) adds `patternId?: string` to that canonical definition.
// The field is already included there with comment: "Added by DS-4 (PDR-012 AD-6)"
//
// DO NOT redefine AgentActionResult here. At implementation time, import from
// platform-core/src/agent/action-handler.ts (the target of the canonical stub).
//
// patternId flow: PatternExecutor → AgentActionResult → onComplete → commands.record
type AgentActionResult = import("./types-placeholder.js").AgentActionResult;

// ============================================================================
// Migration Example: onEvent → patterns
// ============================================================================

/**
 * Migration guide for converting onEvent to patterns.
 *
 * BEFORE (DS-2 era — onEvent with inline logic):
 * ```typescript
 * const config: AgentBCConfig = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled"],
 *   patternWindow: { duration: "30d", minEvents: 3 },
 *   confidenceThreshold: 0.8,
 *   onEvent: async (event, ctx) => {
 *     const customerId = extractCustomerId(event);
 *     const trigger = PatternTriggers.eventTypePresent(["OrderCancelled"], 3);
 *     if (!trigger(ctx.history.filter(e => extractCustomerId(e) === customerId))) {
 *       return null;
 *     }
 *     const confidence = calculateChurnConfidence(customerEvents);
 *     return {
 *       command: "SuggestCustomerOutreach",
 *       payload: { customerId, riskLevel: "high" },
 *       confidence,
 *       reason: buildChurnReason(customerEvents, confidence),
 *       requiresApproval: confidence < 0.9,
 *       triggeringEvents: customerEvents.map(e => e.eventId),
 *     };
 *   },
 * };
 * ```
 *
 * AFTER (DS-4 — PatternDefinition objects on config):
 * ```typescript
 * // Step 1: PatternDefinition already exists in _patterns/churnRisk.ts
 * import { churnRiskPattern } from "./_patterns/churnRisk.js";
 *
 * // Step 2: Pass PatternDefinition objects directly on config
 * const config: AgentBCConfig = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled"],
 *   patternWindow: { duration: "30d" },  // Master loading window
 *   confidenceThreshold: 0.8,
 *   patterns: [churnRiskPattern],
 *   // onEvent removed — patterns handle detection + analysis
 * };
 *
 * // Step 3: PatternExecutor now calls churnRiskPattern.trigger()
 * //         and churnRiskPattern.analyze() automatically
 * ```
 */

// ============================================================================
// PatternDefinition Evolution — @see pattern-executor.ts
// ============================================================================
//
// REMOVED (holistic review): onAnalyzeFailure and defaultCommand fields.
// - onAnalyzeFailure: spec only describes a global fallback, not per-pattern control.
//   Global fallback: if analyze() throws, falls back to rule-based scoring.
// - defaultCommand: no spec exercises trigger-only command emission.
//
// Full evolution documented in stubs/agent-command-routing/pattern-executor.ts.

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

type PatternDefinition = import("./types-placeholder.js").PatternDefinition;
type PatternWindow = import("./types-placeholder.js").PatternWindow;
type HumanInLoopConfig = import("./types-placeholder.js").HumanInLoopConfig;
type AgentRateLimitConfig = import("./types-placeholder.js").AgentRateLimitConfig;
type AgentEventHandler = import("./types-placeholder.js").AgentEventHandler;
type AgentDecision = import("./types-placeholder.js").AgentDecision;
type AgentConfigValidationResult = import("./types-placeholder.js").AgentConfigValidationResult;
