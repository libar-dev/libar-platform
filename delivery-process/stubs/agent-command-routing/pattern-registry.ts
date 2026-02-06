/**
 * Pattern Registry — DS-4 Stub
 *
 * Singleton registry for named pattern definitions. Mirrors the CommandRegistry
 * pattern for consistency. Agents reference patterns by name in their config;
 * the registry resolves names to PatternDefinition instances.
 *
 * @target platform-core/src/agent/pattern-registry.ts
 *
 * ## Design Decisions
 *
 * - AD-1: Follows CommandRegistry singleton pattern for consistency
 * - AD-2: AgentBCConfig references patterns by name (not inline objects)
 *
 * @see PDR-012 (Agent Command Routing & Pattern Unification)
 * @see CommandRegistry (platform-core/src/registry/CommandRegistry.ts)
 * @since DS-4 (Command Routing & Pattern Unification)
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for pattern registry operations.
 */
export const PATTERN_REGISTRY_ERROR_CODES = {
  /** Pattern with this name already registered */
  DUPLICATE_PATTERN: "DUPLICATE_PATTERN",
  /** Pattern name not found in registry */
  PATTERN_NOT_FOUND: "PATTERN_NOT_FOUND",
  /** Pattern definition is invalid */
  INVALID_PATTERN: "INVALID_PATTERN",
} as const;

export type PatternRegistryErrorCode =
  (typeof PATTERN_REGISTRY_ERROR_CODES)[keyof typeof PATTERN_REGISTRY_ERROR_CODES];

// ============================================================================
// Introspection Types
// ============================================================================

/**
 * Metadata returned by registry list/introspection APIs.
 *
 * Provides pattern information without exposing the trigger/analyze functions.
 * Used by admin UI and monitoring tools.
 */
export interface PatternInfo {
  /** Pattern name (unique identifier) */
  readonly name: string;

  /** Human-readable description */
  readonly description?: string;

  /** Pattern window configuration */
  readonly window: PatternWindow;

  /** Whether pattern has a trigger function (always true) */
  readonly hasTrigger: true;

  /** Whether pattern has an LLM-powered analyze function */
  readonly hasAnalyze: boolean;

  /** Optional tags for filtering */
  readonly tags: readonly string[];

  /** Registration timestamp */
  readonly registeredAt: number;
}

/**
 * Internal storage for registered patterns with metadata.
 */
interface PatternRegistration {
  /** The pattern definition */
  readonly pattern: PatternDefinition;

  /** Tags for filtering/grouping */
  readonly tags: readonly string[];

  /** Registration timestamp */
  readonly registeredAt: number;
}

// ============================================================================
// Pattern Registry
// ============================================================================

/**
 * Central registry for pattern definitions.
 *
 * Uses singleton pattern for app-wide registration at module load time,
 * mirroring CommandRegistry's established pattern.
 *
 * Patterns are registered globally and referenced by name in AgentBCConfig.
 * This enables:
 * - Named lookup: `registry.get("churn-risk")` → PatternDefinition
 * - Discoverability: `registry.list()` for admin UI
 * - Validation: config validation checks pattern names against registry
 * - Testing: `resetForTesting()` clears state between tests
 *
 * @example
 * ```typescript
 * // Registration (at module load time)
 * import { churnRiskPattern } from "./patterns/churnRisk";
 * globalPatternRegistry.register(churnRiskPattern, ["churn", "customer"]);
 *
 * // Lookup (in handler factory)
 * const pattern = globalPatternRegistry.get("churn-risk");
 * if (!pattern) throw new Error("Pattern not found");
 *
 * // Introspection (admin UI)
 * const allPatterns = globalPatternRegistry.list();
 * const churnPatterns = globalPatternRegistry.listByTag("churn");
 * ```
 */
export class PatternRegistry {
  private static instance: PatternRegistry | null = null;
  private patterns: Map<string, PatternRegistration> = new Map();

  private constructor() {}

  /**
   * Get singleton instance.
   * Registry uses singleton pattern for module-load-time registration.
   */
  static getInstance(): PatternRegistry {
    if (!PatternRegistry.instance) {
      PatternRegistry.instance = new PatternRegistry();
    }
    return PatternRegistry.instance;
  }

  /**
   * Reset registry (for testing only).
   * Creates a fresh instance, discarding all registrations.
   */
  static resetForTesting(): void {
    PatternRegistry.instance = null;
  }

  /**
   * Register a pattern definition.
   *
   * Validates the pattern via `validatePatternDefinition()` before registration.
   * Throws if a pattern with the same name is already registered.
   *
   * @param pattern - Pattern definition (created via `definePattern()`)
   * @param tags - Optional tags for filtering/grouping
   * @throws Error if pattern name is already registered
   * @throws Error if pattern definition is invalid
   *
   * @example
   * ```typescript
   * globalPatternRegistry.register(churnRiskPattern, ["churn", "customer"]);
   * globalPatternRegistry.register(highValueChurnPattern, ["churn", "high-value"]);
   * ```
   */
  register(pattern: PatternDefinition, tags?: readonly string[]): void {
    // Validate pattern
    // IMPLEMENTATION NOTE: Call validatePatternDefinition(pattern) here.
    // The definePattern() factory already validates, but we check again
    // in case someone bypasses the factory.

    if (this.patterns.has(pattern.name)) {
      const existing = this.patterns.get(pattern.name)!;
      throw new Error(
        `Duplicate pattern registration: "${pattern.name}" is already registered ` +
          `(registered at ${new Date(existing.registeredAt).toISOString()})`
      );
    }

    this.patterns.set(pattern.name, {
      pattern,
      tags: tags ?? [],
      registeredAt: Date.now(),
    });
  }

  /**
   * Get a pattern definition by name.
   *
   * @returns PatternDefinition or undefined if not found
   */
  get(name: string): PatternDefinition | undefined {
    return this.patterns.get(name)?.pattern;
  }

  /**
   * Check if a pattern is registered.
   */
  has(name: string): boolean {
    return this.patterns.has(name);
  }

  /**
   * List all registered patterns (for introspection).
   * Returns PatternInfo without exposing trigger/analyze functions.
   */
  list(): PatternInfo[] {
    return Array.from(this.patterns.values()).map((reg) => ({
      name: reg.pattern.name,
      description: reg.pattern.description,
      window: reg.pattern.window,
      hasTrigger: true as const,
      hasAnalyze: reg.pattern.analyze !== undefined,
      tags: reg.tags,
      registeredAt: reg.registeredAt,
    }));
  }

  /**
   * List patterns by tag.
   */
  listByTag(tag: string): PatternInfo[] {
    return this.list().filter((info) => info.tags.includes(tag));
  }

  /**
   * Get count of registered patterns.
   */
  size(): number {
    return this.patterns.size;
  }

  /**
   * Clear all registrations (for testing only).
   */
  clear(): void {
    this.patterns.clear();
  }

  /**
   * Resolve an array of pattern names to PatternDefinition instances.
   *
   * Used by the action handler factory to resolve config.patterns names
   * into executable PatternDefinition objects.
   *
   * @param names - Pattern names to resolve
   * @returns Array of resolved PatternDefinitions
   * @throws Error if any pattern name is not found
   *
   * @example
   * ```typescript
   * const patterns = globalPatternRegistry.resolveAll(["churn-risk", "high-value-churn"]);
   * const summary = await executePatterns(patterns, events, agent, config);
   * ```
   */
  resolveAll(names: readonly string[]): PatternDefinition[] {
    return names.map((name) => {
      const pattern = this.get(name);
      if (!pattern) {
        throw new Error(
          `Pattern "${name}" not found in registry. ` +
            `Registered patterns: [${Array.from(this.patterns.keys()).join(", ")}]`
        );
      }
      return pattern;
    });
  }
}

/**
 * Global registry instance for app-wide pattern registration.
 *
 * @example
 * ```typescript
 * import { globalPatternRegistry } from "@libar-dev/platform-core/agent";
 *
 * // Register at module load
 * globalPatternRegistry.register(churnRiskPattern);
 *
 * // Use in AgentBCConfig validation
 * if (!globalPatternRegistry.has("churn-risk")) {
 *   throw new Error("Pattern not found");
 * }
 * ```
 */
export const globalPatternRegistry = PatternRegistry.getInstance();

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

// From platform-core/src/agent/patterns.ts:
//   - PatternDefinition
//   - PatternWindow
//   - validatePatternDefinition
type PatternDefinition = import("./types-placeholder.js").PatternDefinition;
type PatternWindow = import("./types-placeholder.js").PatternWindow;
