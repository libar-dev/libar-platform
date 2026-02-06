/**
 * AgentBCConfig Evolution — DS-4 Stub
 *
 * Evolves AgentBCConfig to support pattern-based detection alongside the
 * legacy onEvent handler. Adds XOR validation: exactly one of onEvent or
 * patterns must be set.
 *
 * Also adds patternId to AgentActionResult to flow pattern identity from
 * PatternExecutor through onComplete to commands.record.
 *
 * @target platform-core/src/agent/types.ts (evolution of existing)
 *
 * ## Design Decisions
 *
 * - AD-2: AgentBCConfig uses XOR for onEvent vs patterns
 * - AD-6: AgentActionResult gains patternId field
 *
 * @see PDR-012 (Agent Command Routing & Pattern Unification)
 * @see PDR-011 (Agent Action Handler Architecture) — AD-9 evolves here
 * @since DS-4 (Command Routing & Pattern Unification)
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
  /** Pattern name not found in registry */
  PATTERN_NOT_FOUND: "PATTERN_NOT_FOUND",
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
 * - `patterns` field added (array of pattern names from registry)
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
 * // New mode (patterns) — uses registered PatternDefinitions:
 * const config: AgentBCConfig = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled"],
 *   patternWindow: { duration: "30d" },  // Master loading window
 *   confidenceThreshold: 0.8,
 *   patterns: ["churn-risk", "high-value-churn-risk"],
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
   * Pattern names from PatternRegistry for pattern-based detection.
   *
   * Each name is resolved from globalPatternRegistry at handler creation.
   * Patterns are evaluated in array order (first match wins).
   *
   * NEW in DS-4 — alternative to `onEvent`.
   * XOR constraint: exactly one of `onEvent` or `patterns` must be set.
   *
   * @example
   * ```typescript
   * // Register patterns first:
   * globalPatternRegistry.register(churnRiskPattern, ["churn"]);
   * globalPatternRegistry.register(highValueChurnPattern, ["churn", "high-value"]);
   *
   * // Reference by name in config:
   * const config: AgentBCConfig = {
   *   patterns: ["churn-risk", "high-value-churn-risk"],
   *   // ... other fields
   * };
   * ```
   */
  readonly patterns?: readonly string[];
}

// ============================================================================
// Evolved Validation
// ============================================================================

/**
 * Validate an AgentBCConfig with DS-4 XOR constraint.
 *
 * EVOLUTION from existing validateAgentBCConfig:
 * - Adds XOR check: exactly one of `onEvent` or `patterns` must be set
 * - Validates pattern names against globalPatternRegistry
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

  // DS-4: Validate pattern names exist in registry
  if (hasPatterns && config.patterns) {
    // IMPLEMENTATION NOTE: Import globalPatternRegistry from pattern-registry.ts
    // const { globalPatternRegistry } = await import("./pattern-registry.js");
    for (const name of config.patterns) {
      // if (!globalPatternRegistry.has(name)) {
      //   return {
      //     valid: false,
      //     code: DS4_CONFIG_ERROR_CODES.PATTERN_NOT_FOUND,
      //     message: `Pattern "${name}" not found in registry`,
      //   };
      // }
    }
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
// platform-core/src/agent/action-handler.ts (the @target of the canonical stub).
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
 * AFTER (DS-4 — patterns from registry):
 * ```typescript
 * // Step 1: Register the existing PatternDefinition
 * globalPatternRegistry.register(churnRiskPattern, ["churn"]);
 *
 * // Step 2: Update config to reference patterns by name
 * const config: AgentBCConfig = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled"],
 *   patternWindow: { duration: "30d" },  // Master loading window
 *   confidenceThreshold: 0.8,
 *   patterns: ["churn-risk"],
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

type PatternWindow = import("./types-placeholder.js").PatternWindow;
type HumanInLoopConfig = import("./types-placeholder.js").HumanInLoopConfig;
type AgentRateLimitConfig = import("./types-placeholder.js").AgentRateLimitConfig;
type AgentEventHandler = import("./types-placeholder.js").AgentEventHandler;
type AgentDecision = import("./types-placeholder.js").AgentDecision;
type AgentConfigValidationResult = import("./types-placeholder.js").AgentConfigValidationResult;
