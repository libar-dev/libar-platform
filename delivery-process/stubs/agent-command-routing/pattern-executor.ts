/**
 * Pattern Executor — DS-4 Stub
 *
 * Iterates an agent's pattern array, calling trigger() then analyze() for
 * each pattern. Short-circuits on the first detected match to avoid
 * unnecessary LLM calls. Returns a full execution summary for audit.
 *
 * @target platform-core/src/agent/pattern-executor.ts
 *
 * ## Design Decisions
 *
 * - AD-3: Iterate with short-circuit on first match
 * - Array order equals developer-controlled priority
 * - Trigger-only patterns (no analyze) produce rule-based decisions
 *
 * @see PDR-012 (Agent Command Routing & Pattern Unification)
 * @see PatternDefinition (platform-core/src/agent/patterns.ts)
 * @since DS-4 (Command Routing & Pattern Unification)
 *
 * ## Type Extensions (AD-7, AD-8)
 *
 * PatternDefinition gains the following optional fields:
 *
 *   onAnalyzeFailure?: "fallback-to-trigger" | "skip"  // default: "skip" (AD-7)
 *     Controls behavior when analyze() throws. "skip" is fail-closed (safe default).
 *     "fallback-to-trigger" produces a rule-based decision (explicit opt-in only).
 *
 *   defaultCommand?: {                                  // (AD-8)
 *     readonly type: string;
 *     readonly payloadBuilder: (events: readonly PublishedEvent[]) => unknown;
 *   }
 *     For trigger-only patterns that need to emit specific command types
 *     without requiring analyze(). See buildDecisionFromTrigger.
 *
 * PatternAnalysisResult gains:
 *   readonly command?: { readonly type: string; readonly payload: unknown };
 *     Explicit command output from analyze(), decoupling the framework from
 *     pattern-specific result.data structures. See buildDecisionFromAnalysis.
 */

// ============================================================================
// Execution Result Types
// ============================================================================

/**
 * Result of evaluating a single pattern.
 *
 * Captures whether the pattern was triggered, analyzed, and how long
 * it took. Used for audit trail and performance monitoring.
 */
export interface PatternEvaluationResult {
  /** Pattern name */
  readonly patternName: string;

  /** Whether the trigger function returned true */
  readonly triggered: boolean;

  /** Whether analyze() was called (only if triggered and analyze exists) */
  readonly analyzed: boolean;

  /** Whether the analysis detected a match (only if analyzed) */
  readonly detected?: boolean;

  /** Duration of this pattern's evaluation in milliseconds */
  readonly durationMs: number;
}

/**
 * Summary of executing all patterns for a single event.
 *
 * Provides full audit trail of which patterns were evaluated,
 * which triggered, and which (if any) produced a decision.
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
  /**
   * Name of the pattern that matched, or null if none matched.
   * This becomes the `patternId` on AgentActionResult.
   */
  readonly matchedPattern: string | null;

  /**
   * All patterns evaluated before match/completion.
   * Includes patterns that were skipped (insufficient events),
   * not triggered, or triggered but not detected.
   */
  readonly evaluated: readonly PatternEvaluationResult[];

  /**
   * Decision from the matched pattern's analysis, or null if none matched.
   * Ready to be used as AgentActionResult.decision.
   */
  readonly decision: AgentDecision | null;

  /**
   * How the decision was reached.
   * - "llm": Pattern's analyze() used LLM
   * - "rule-based": Trigger-only pattern (no analyze function)
   * - "rule-based-fallback": analyze() failed, fell back to trigger-based
   * - null: No pattern matched
   */
  readonly analysisMethod: "llm" | "rule-based" | "rule-based-fallback" | null;

  /** Total execution duration in milliseconds */
  readonly durationMs: number;

  /** Number of patterns evaluated */
  readonly evaluatedCount: number;

  /** Number of patterns whose trigger fired */
  readonly triggeredCount: number;
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
 * @param patterns - Resolved PatternDefinitions (from registry.resolveAll)
 * @param events - Full event history loaded by the action handler
 * @param agent - Agent interface for LLM calls
 * @param config - Agent config for confidence threshold and decision building
 * @returns Execution summary with decision and audit trail
 *
 * @example
 * ```typescript
 * // In the action handler factory (patterns mode):
 * const patterns = globalPatternRegistry.resolveAll(config.patterns!);
 * const summary = await executePatterns(patterns, state.eventHistory, agentInterface, config);
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
  const startTime = Date.now();
  const evaluated: PatternEvaluationResult[] = [];
  let triggeredCount = 0;

  for (const pattern of patterns) {
    const patternStart = Date.now();

    // 1. Filter events to pattern's own window
    const windowEvents = filterEventsInWindow(events, pattern.window);

    // 2. Check minimum events
    if (!hasMinimumEvents(windowEvents, pattern.window)) {
      evaluated.push({
        patternName: pattern.name,
        triggered: false,
        analyzed: false,
        durationMs: Date.now() - patternStart,
      });
      continue;
    }

    // 3. Call trigger (cheap boolean check, no I/O)
    const triggered = pattern.trigger(windowEvents);

    if (!triggered) {
      evaluated.push({
        patternName: pattern.name,
        triggered: false,
        analyzed: false,
        durationMs: Date.now() - patternStart,
      });
      continue;
    }

    triggeredCount++;

    // 4. If pattern has analyze — call it (potentially expensive LLM call)
    if (pattern.analyze) {
      try {
        const analysisResult = await pattern.analyze(windowEvents, agent);

        if (analysisResult.detected) {
          // Build decision from analysis result
          const decision = buildDecisionFromAnalysis(analysisResult, pattern.name, config);

          evaluated.push({
            patternName: pattern.name,
            triggered: true,
            analyzed: true,
            detected: true,
            durationMs: Date.now() - patternStart,
          });

          // SHORT-CIRCUIT: first detected match wins
          return {
            matchedPattern: pattern.name,
            evaluated,
            decision,
            analysisMethod: "llm",
            durationMs: Date.now() - startTime,
            evaluatedCount: evaluated.length,
            triggeredCount,
          };
        }

        // Triggered but analysis didn't detect — continue to next pattern
        evaluated.push({
          patternName: pattern.name,
          triggered: true,
          analyzed: true,
          detected: false,
          durationMs: Date.now() - patternStart,
        });
      } catch (analyzeError) {
        // AD-7: Fail-closed default for analyze() failures.
        // LLM outage must not cause mass command emission.
        const failureMode = (pattern as PatternDefinitionWithExtensions).onAnalyzeFailure ?? "skip";

        if (failureMode === "fallback-to-trigger") {
          // Explicit opt-in: fall back to trigger-based decision
          const decision = buildDecisionFromTrigger(windowEvents, pattern, config);

          evaluated.push({
            patternName: pattern.name,
            triggered: true,
            analyzed: true,
            detected: true,
            durationMs: Date.now() - patternStart,
          });

          return {
            matchedPattern: pattern.name,
            evaluated,
            decision,
            analysisMethod: "rule-based-fallback",
            durationMs: Date.now() - startTime,
            evaluatedCount: evaluated.length,
            triggeredCount,
          };
        }

        // Default "skip": analyze() failed, skip this pattern entirely.
        // analyzed: true because analyze() WAS attempted (it threw).
        // detected: false because we chose not to produce a decision.
        // Log at WARN level so operators can monitor LLM health.
        // logger?.warn("Pattern analyze() failed, skipping (fail-closed)", {
        //   patternName: pattern.name,
        //   error: String(analyzeError),
        // });

        evaluated.push({
          patternName: pattern.name,
          triggered: true,
          analyzed: true,
          detected: false,
          durationMs: Date.now() - patternStart,
        });
        // Continue to next pattern (do NOT short-circuit)
      }
    } else {
      // 5. Pattern has trigger but NO analyze — trigger alone is the detection
      const decision = buildDecisionFromTrigger(windowEvents, pattern, config);

      evaluated.push({
        patternName: pattern.name,
        triggered: true,
        analyzed: false,
        durationMs: Date.now() - patternStart,
      });

      // SHORT-CIRCUIT
      return {
        matchedPattern: pattern.name,
        evaluated,
        decision,
        analysisMethod: "rule-based",
        durationMs: Date.now() - startTime,
        evaluatedCount: evaluated.length,
        triggeredCount,
      };
    }
  }

  // No pattern matched
  return {
    matchedPattern: null,
    evaluated,
    decision: null,
    analysisMethod: null,
    durationMs: Date.now() - startTime,
    evaluatedCount: evaluated.length,
    triggeredCount,
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
 * AD-8: If the pattern defines a `defaultCommand`, that command type and
 * payload are used. This enables trigger-only patterns to emit routable
 * commands without requiring analyze(). Without defaultCommand, the
 * decision has `command: null` and cannot route through CommandOrchestrator.
 *
 * @param events - Events that passed the trigger
 * @param pattern - Full pattern definition (for name and defaultCommand)
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

  // AD-8: Use defaultCommand if defined on the pattern.
  // This allows trigger-only patterns to emit routable commands.
  const extended = pattern as PatternDefinitionWithExtensions;
  const defaultCmd = extended.defaultCommand;

  const command = defaultCmd?.type ?? null;
  const payload = defaultCmd
    ? defaultCmd.payloadBuilder(events)
    : {
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

// DS-4 extensions to PatternDefinition (AD-7, AD-8):
// These fields will be added to the base PatternDefinition type at implementation time.
// Using a local extension type for the stub to avoid modifying the placeholder import.
type PatternDefinitionWithExtensions = PatternDefinition & {
  /** AD-7: Behavior when analyze() throws. Default: "skip" (fail-closed). */
  readonly onAnalyzeFailure?: "fallback-to-trigger" | "skip";
  /** AD-8: Default command for trigger-only patterns. */
  readonly defaultCommand?: {
    readonly type: string;
    readonly payloadBuilder: (events: readonly PublishedEvent[]) => unknown;
  };
};

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
