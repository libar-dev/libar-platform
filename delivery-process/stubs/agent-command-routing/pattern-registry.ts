/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentCommandInfrastructure
 *
 * Pattern Registry — DS-4 Stub
 *
 * Validates pattern definitions passed directly on AgentBCConfig.patterns.
 * Patterns are PatternDefinition[] on the config object, not looked up by
 * name from a global singleton.
 *
 * Target: platform-core/src/agent/pattern-registry.ts
 *
 * ## Design Decisions
 *
 * - AD-1: Originally followed CommandRegistry singleton pattern
 * - AD-2: AgentBCConfig receives PatternDefinition[] directly (simplified from name-based lookup)
 *
 * SIMPLIFICATION (holistic review, item 2.1): Replaced singleton class with
 * plain validation function. Single agent passes PatternDefinition[] directly
 * on AgentBCConfig. Add registry back when multi-agent support requires
 * shared pattern discovery.
 *
 * See: PDR-012 (Agent Command Routing & Pattern Unification)
 * See: CommandRegistry (platform-core/src/registry/CommandRegistry.ts)
 * Since: DS-4 (Command Routing & Pattern Unification)
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for pattern validation operations.
 */
export const PATTERN_REGISTRY_ERROR_CODES = {
  /** Pattern with this name already registered */
  DUPLICATE_PATTERN: "DUPLICATE_PATTERN",
  /** Pattern definition is invalid */
  INVALID_PATTERN: "INVALID_PATTERN",
  /** Pattern name is required */
  PATTERN_NAME_REQUIRED: "PATTERN_NAME_REQUIRED",
  /** Pattern must define a trigger function */
  TRIGGER_REQUIRED: "TRIGGER_REQUIRED",
} as const;

export type PatternRegistryErrorCode =
  (typeof PATTERN_REGISTRY_ERROR_CODES)[keyof typeof PATTERN_REGISTRY_ERROR_CODES];

// ============================================================================
// Pattern Validation
// ============================================================================

// SIMPLIFICATION NOTE: Full PatternRegistry singleton deferred until multi-agent support.
// Single agent passes PatternDefinition[] directly on AgentBCConfig.
// See plan item 2.1 for rationale.

/**
 * Resolve pattern definitions from names.
 *
 * Patterns are passed directly on AgentBCConfig.patterns (as PatternDefinition[]),
 * NOT looked up by name from a global singleton. This eliminates the need for a
 * registry when there is a single agent.
 *
 * SIMPLIFICATION (holistic review): Replaced singleton class with plain function.
 * Add registry back when multi-agent support requires shared pattern discovery.
 *
 * @see AgentBCConfig.patterns — array of PatternDefinition objects
 */
export function validatePatternDefinitions(
  patterns: readonly PatternDefinition[]
): { valid: true } | { valid: false; code: string; message: string } {
  for (const pattern of patterns) {
    if (!pattern.name || pattern.name.trim() === "") {
      return {
        valid: false,
        code: PATTERN_REGISTRY_ERROR_CODES.PATTERN_NAME_REQUIRED,
        message: "Pattern name is required",
      };
    }
    if (!pattern.trigger) {
      return {
        valid: false,
        code: PATTERN_REGISTRY_ERROR_CODES.TRIGGER_REQUIRED,
        message: `Pattern "${pattern.name}" must define a trigger function`,
      };
    }
  }
  const names = new Set<string>();
  for (const pattern of patterns) {
    if (names.has(pattern.name)) {
      return {
        valid: false,
        code: PATTERN_REGISTRY_ERROR_CODES.DUPLICATE_PATTERN,
        message: `Duplicate pattern: "${pattern.name}"`,
      };
    }
    names.add(pattern.name);
  }
  return { valid: true };
}

// ============================================================================
// NAMING CONVENTION — Agent-Scoped Pattern Names
// ============================================================================
//
// Pattern names SHOULD be agent-scoped to prevent collisions when multiple
// agents register patterns:
//
//   Format: `{agentId}/{patternName}`
//   Example: `churn-risk/cancellation-pattern`
//   Example: `churn-risk/refund-surge`
//   Example: `fraud-detection/velocity-check`
//
// validatePatternDefinitions() checks uniqueness within a single config.
// Agent-scoping prevents collisions if patterns are shared across configs.

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

// From platform-core/src/agent/patterns.ts:
//   - PatternDefinition
//   - PatternWindow
//   - validatePatternDefinition
type PatternDefinition = import("./types-placeholder.js").PatternDefinition;
type PatternWindow = import("./types-placeholder.js").PatternWindow;
