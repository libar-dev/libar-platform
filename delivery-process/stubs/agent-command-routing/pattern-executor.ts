/**
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-implements AgentCommandInfrastructure
 * @libar-docs-target platform-core/src/agent/pattern-executor.ts
 *
 * Pattern Executor — DS-4 Stub
 *
 * Iterates an agent's pattern array, calling trigger() then analyze() for
 * each pattern. Short-circuits on the first detected match to avoid
 * unnecessary LLM calls. Returns a simplified execution summary for audit.
 *
 * ## Design Decisions
 *
 * - AD-3: Iterate with short-circuit on first match
 * - Array order equals developer-controlled priority
 * - Trigger-only patterns (no analyze) produce rule-based decisions
 *
 * See: PDR-012 (Agent Command Routing & Pattern Unification)
 * See: PatternDefinition (platform-core/src/agent/patterns.ts)
 * Since: DS-4 (Command Routing & Pattern Unification)
 *
 * ## Type Extensions
 *
 * PatternAnalysisResult gains:
 *   readonly command?: { readonly type: string; readonly payload: unknown };
 *     Explicit command output from analyze(), decoupling the framework from
 *     pattern-specific result.data structures. See buildDecisionFromAnalysis.
 *
 * REMOVED (holistic review, item 3.2):
 * - onAnalyzeFailure: spec only describes a global fallback, not per-pattern control.
 *   Global fallback: if analyze() throws, falls back to rule-based scoring.
 * - defaultCommand: no spec exercises trigger-only command emission.
 */

// ============================================================================
// Execution Result Types
// ============================================================================

/**
 * Summary of pattern execution across all registered patterns.
 *
 * SIMPLIFIED (holistic review, item 3.1): Reduced from 7 fields to 3.
 * Detailed per-pattern evaluation moved to logger output.
 *
 * @example
 * ```typescript
 * const summary = await executePatterns(patterns, events, agent, config);
 *
 * if (summary.decision) {
 *   // Pattern matched — build AgentActionResult
 *   return {
 *     decisionId,
 *     decision: summary.decision,
 *     analysisMethod: summary.analysisMethod,
 *     patternId: summary.matchedPattern,
 *   };
 * }
 *
 * // No pattern matched
 * return { decisionId, decision: null, analysisMethod: "rule-based" };
 * ```
 */
export interface PatternExecutionSummary {
  /** Name of the matched pattern, or null if no match */
  readonly matchedPattern: string | null;
  /** The decision produced, or null if no pattern matched */
  readonly decision: AgentDecision | null;
  /** How the decision was produced */
  readonly analysisMethod: "llm-analysis" | "rule-based" | "rule-based-fallback";
}

// ============================================================================
// Executor Function
// ============================================================================

/**
 * Execute patterns against an event stream.
 *
 * Iterates the patterns array in order (array order = priority).
 * For each pattern:
 * 1. Filter events to the pattern's own window
 * 2. Check minimum events — skip if insufficient
 * 3. Call pattern.trigger(events) — cheap boolean check
 * 4. If triggered AND pattern.analyze exists:
 *    a. Call pattern.analyze(events, agent) — potentially expensive LLM call
 *    b. If analysis.detected — build AgentDecision, SHORT-CIRCUIT
 * 5. If triggered AND NO analyze:
 *    a. Build AgentDecision from trigger alone, SHORT-CIRCUIT
 *
 * @param patterns - Resolved PatternDefinitions (from config.patterns)
 * @param events - Full event history loaded by the action handler
 * @param agent - Agent interface for LLM calls
 * @param config - Agent config for confidence threshold and decision building
 * @returns Execution summary with decision
 *
 * @example
 * ```typescript
 * // In the action handler factory (patterns mode):
 * const summary = await executePatterns(config.patterns, state.eventHistory, agentInterface, config);
 *
 * return {
 *   decisionId: generateDecisionId(config.id, event.globalPosition),
 *   decision: summary.decision,
 *   analysisMethod: summary.analysisMethod ?? "rule-based",
 *   patternId: summary.matchedPattern ?? undefined,
 * };
 * ```
 */
export async function executePatterns(
  patterns: readonly PatternDefinition[],
  events: readonly PublishedEvent[],
  agent: AgentInterface,
  config: AgentBCConfig
): Promise<PatternExecutionSummary> {
  for (const pattern of patterns) {
    // 1. Filter events to pattern's own window
    const windowEvents = filterEventsInWindow(events, pattern.window);

    // 2. Check minimum events
    if (!hasMinimumEvents(windowEvents, pattern.window)) {
      continue;
    }

    // 3. Call trigger (cheap boolean check, no I/O)
    const triggered = pattern.trigger(windowEvents);

    if (!triggered) {
      continue;
    }

    // 4. If pattern has analyze — call it (potentially expensive LLM call)
    if (pattern.analyze) {
      try {
        const analysisResult = await pattern.analyze(windowEvents, agent);

        if (analysisResult.detected) {
          // Build decision from analysis result — SHORT-CIRCUIT
          const decision = buildDecisionFromAnalysis(analysisResult, pattern.name, config);
          return {
            matchedPattern: pattern.name,
            decision,
            analysisMethod: "llm-analysis",
          };
        }

        // Triggered but analysis didn't detect — continue to next pattern
      } catch (analyzeError) {
        // Global fallback: if analyze() throws, falls back to rule-based scoring
        // Log at WARN level so operators can monitor LLM health.
        // logger?.warn("Pattern analyze() failed, falling back to rule-based", {
        //   patternName: pattern.name,
        //   error: String(analyzeError),
        // });

        const decision = buildDecisionFromTrigger(windowEvents, pattern, config);
        return {
          matchedPattern: pattern.name,
          decision,
          analysisMethod: "rule-based-fallback",
        };
      }
    } else {
      // 5. Pattern has trigger but NO analyze — trigger alone is the detection
      const decision = buildDecisionFromTrigger(windowEvents, pattern, config);

      // SHORT-CIRCUIT
      return {
        matchedPattern: pattern.name,
        decision,
        analysisMethod: "rule-based",
      };
    }
  }

  // No pattern matched
  return {
    matchedPattern: null,
    decision: null,
    analysisMethod: "rule-based",
  };
}

// ============================================================================
// Decision Builders
// ============================================================================

/**
 * Build an AgentDecision from a PatternAnalysisResult (LLM analysis).
 *
 * Maps the pattern analysis output to the AgentDecision format expected
 * by the onComplete handler.
 *
 * @param result - Analysis result from pattern.analyze()
 * @param patternName - Name of the pattern that detected
 * @param config - Agent config for confidence threshold
 * @returns AgentDecision ready for onComplete
 */
export function buildDecisionFromAnalysis(
  result: PatternAnalysisResult,
  patternName: string,
  config: AgentBCConfig
): AgentDecision {
  // Determine command type from analysis data.
  //
  // Primary source: result.command (explicit command output from analyze).
  // This is the canonical way for patterns to specify which command to emit.
  //
  // Deprecated fallback: result.data.suggestedAction (churn-risk legacy).
  // Patterns should migrate to using result.command instead.
  const resultCommand = (result as PatternAnalysisResultWithCommand).command;

  // Primary: explicit command field on PatternAnalysisResult
  let command: string | null = resultCommand?.type ?? null;
  let payload: unknown = resultCommand?.payload ?? result.data;

  // Deprecated fallback: extract from result.data.suggestedAction
  // TODO: Remove once all patterns migrate to result.command
  if (!command) {
    const suggestedAction = (result.data as Record<string, unknown> | undefined)
      ?.suggestedAction as { type?: string; payload?: unknown } | undefined;
    command = suggestedAction?.type ?? null;
    payload = suggestedAction?.payload ?? result.data;
  }

  const requiresApproval =
    result.confidence < config.confidenceThreshold ||
    (config.humanInLoop?.requiresApproval?.includes(command ?? "") ?? false);

  return {
    command,
    payload,
    confidence: result.confidence,
    reason: result.reasoning,
    requiresApproval,
    triggeringEvents: [...result.matchingEventIds],
  };
}

/**
 * Build an AgentDecision from a trigger-only pattern (no LLM analysis).
 *
 * When a pattern has trigger() but no analyze(), the trigger firing
 * IS the detection. Confidence is computed from event count heuristics.
 *
 * Without analyze(), the decision has `command: null` and cannot route
 * through CommandOrchestrator. Patterns that need routable commands
 * should implement analyze().
 *
 * @param events - Events that passed the trigger
 * @param pattern - Full pattern definition (for name)
 * @param config - Agent config for confidence threshold
 * @returns AgentDecision with rule-based confidence
 */
export function buildDecisionFromTrigger(
  events: readonly PublishedEvent[],
  pattern: PatternDefinition,
  config: AgentBCConfig
): AgentDecision {
  // Simple heuristic: more events = higher confidence
  // IMPLEMENTATION NOTE: This is a reasonable default. Pattern-specific
  // confidence logic should use analyze() instead of relying on this.
  const eventCount = events.length;
  const confidence = Math.min(0.85, 0.5 + eventCount * 0.1);

  const command = null;
  const payload = {
    patternName: pattern.name,
    eventCount,
    eventIds: events.map((e) => e.eventId),
  };

  const requiresApproval =
    confidence < config.confidenceThreshold ||
    (config.humanInLoop !== undefined &&
      confidence < (config.humanInLoop.confidenceThreshold ?? 0.9));

  return {
    command,
    payload,
    confidence,
    reason: `Pattern "${pattern.name}" triggered: ${eventCount} matching events detected (rule-based)`,
    requiresApproval,
    triggeringEvents: events.map((e) => e.eventId),
  };
}

// ============================================================================
// Type Aliases (referenced but defined elsewhere)
// ============================================================================

// From platform-core/src/agent/patterns.ts:
type PatternDefinition = import("./types-placeholder.js").PatternDefinition;
type PatternAnalysisResult = import("./types-placeholder.js").PatternAnalysisResult;
type PatternWindow = import("./types-placeholder.js").PatternWindow;

// DS-4 extension to PatternAnalysisResult:
// Adds explicit command output field, decoupling the framework from
// pattern-specific result.data structures (e.g., suggestedAction).
type PatternAnalysisResultWithCommand = PatternAnalysisResult & {
  readonly command?: { readonly type: string; readonly payload: unknown };
};

// @evolution: PatternAnalysisResult at platform-core/src/agent/patterns.ts:54 gains:
//   readonly command?: { readonly type: string; readonly payload: unknown };
//
// REMOVED (holistic review, item 3.2):
// - onAnalyzeFailure on PatternDefinition: spec only describes global fallback
// - defaultCommand on PatternDefinition: no spec exercises trigger-only command emission

// From platform-core/src/agent/types.ts:
type AgentBCConfig = import("./types-placeholder.js").AgentBCConfig;
type AgentDecision = import("./types-placeholder.js").AgentDecision;
type AgentInterface = import("./types-placeholder.js").AgentInterface;

// From platform-core/src/eventbus/types.ts:
type PublishedEvent = import("./types-placeholder.js").PublishedEvent;

// From platform-core/src/agent/patterns.ts (helper functions):
declare function filterEventsInWindow(
  events: readonly PublishedEvent[],
  window: PatternWindow
): PublishedEvent[];
declare function hasMinimumEvents(
  events: readonly PublishedEvent[],
  window: PatternWindow
): boolean;
