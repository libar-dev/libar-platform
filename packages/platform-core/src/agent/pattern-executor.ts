/**
 * Pattern Executor — Runs patterns against event streams
 *
 * Iterates pattern definitions in array order (developer-controlled priority),
 * short-circuiting on the first match. Handles both LLM-analyzed and
 * rule-based-only patterns.
 *
 * @module agent/pattern-executor
 */

import type { PublishedEvent } from "../eventbus/types.js";
import type { AgentBCConfig, AgentDecision, AgentInterface } from "./types.js";
import type { PatternDefinition, PatternAnalysisResult } from "./patterns.js";
import { filterEventsInWindow, hasMinimumEvents } from "./patterns.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Summary of pattern execution against an event stream.
 */
export interface PatternExecutionSummary {
  /** Name of the matched pattern, or null if no pattern triggered */
  readonly matchedPattern: string | null;

  /** Decision produced by the matched pattern, or null if none */
  readonly decision: AgentDecision | null;

  /**
   * How the decision was reached.
   *
   * - "llm": Pattern's analyze() function produced the result
   * - "rule-based": Pattern triggered without an analyze function
   * - "rule-based-fallback": Pattern's analyze() threw, fell back to trigger-only
   */
  readonly analysisMethod: "llm" | "rule-based" | "rule-based-fallback";
}

// ============================================================================
// Core Executor
// ============================================================================

/**
 * Execute patterns against events, short-circuiting on first match.
 *
 * Iterates patterns in array order (developer-controlled priority).
 * For each pattern:
 * 1. Filters events to the pattern's window
 * 2. Checks minimum event count
 * 3. Calls the trigger function (cheap boolean, no I/O)
 * 4. If triggered with analyze: runs LLM analysis
 * 5. If triggered without analyze: builds rule-based decision
 *
 * @param patterns - Pattern definitions in priority order
 * @param events - All available events (will be filtered per-pattern)
 * @param agent - Agent interface for LLM reasoning
 * @param config - Agent BC configuration for approval thresholds
 * @returns Execution summary with matched pattern and decision
 */
export async function executePatterns(
  patterns: readonly PatternDefinition[],
  events: readonly PublishedEvent[],
  agent: AgentInterface,
  config: AgentBCConfig
): Promise<PatternExecutionSummary> {
  for (const pattern of patterns) {
    // 1. Filter events to this pattern's window
    const filteredEvents = filterEventsInWindow(events, pattern.window);

    // 2. Check minimum event count
    if (!hasMinimumEvents(filteredEvents, pattern.window)) {
      continue;
    }

    // 3. Call trigger (cheap boolean, no I/O)
    const triggered = pattern.trigger(filteredEvents);
    if (!triggered) {
      continue;
    }

    // 4. If triggered AND analyze exists: run LLM analysis
    if (pattern.analyze) {
      try {
        const result = await pattern.analyze(filteredEvents, agent);

        if (result.detected) {
          // LLM confirmed the pattern
          return {
            matchedPattern: pattern.name,
            decision: buildDecisionFromAnalysis(result, pattern.name, config),
            analysisMethod: "llm",
          };
        }
        // LLM said not detected -- continue to next pattern
        continue;
      } catch {
        // Analyze threw -- fall back to trigger-only decision
        return {
          matchedPattern: pattern.name,
          decision: buildDecisionFromTrigger(filteredEvents, pattern, config),
          analysisMethod: "rule-based-fallback",
        };
      }
    }

    // 5. Triggered with NO analyze: rule-based decision
    return {
      matchedPattern: pattern.name,
      decision: buildDecisionFromTrigger(filteredEvents, pattern, config),
      analysisMethod: "rule-based",
    };
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
 * Build an AgentDecision from an LLM analysis result.
 *
 * Uses the structured `result.command` field to extract the command type and payload.
 *
 * @param result - Pattern analysis result from the LLM
 * @param patternName - Name of the pattern that produced this result
 * @param config - Agent BC configuration for approval thresholds
 * @returns AgentDecision ready for persistence
 */
export function buildDecisionFromAnalysis(
  result: PatternAnalysisResult,
  patternName: string,
  config: AgentBCConfig
): AgentDecision {
  const command: string | null = result.command?.type ?? null;

  const payload: unknown = result.command?.payload ?? result.data ?? {};

  const confidence = result.confidence;

  const requiresApproval = determineRequiresApproval(command, confidence, config);

  return {
    command,
    payload,
    confidence,
    reason: result.reasoning,
    requiresApproval,
    triggeringEvents: result.matchingEventIds,
  };
}

/**
 * Build an AgentDecision from a trigger match alone (no LLM analysis).
 *
 * Since no analysis was performed, the command is null (cannot route
 * without analysis). Confidence is a heuristic based on event count.
 * Always requires approval because there is no command to auto-execute.
 *
 * @param events - Events that triggered the pattern
 * @param pattern - Pattern definition that matched
 * @param _config - Agent BC configuration (unused, reserved for future use)
 * @returns AgentDecision with heuristic confidence
 */
export function buildDecisionFromTrigger(
  events: readonly PublishedEvent[],
  pattern: PatternDefinition,
  _config: AgentBCConfig
): AgentDecision {
  return {
    command: null,
    payload: {},
    confidence: Math.min(0.85, 0.5 + events.length * 0.1),
    reason: `Pattern '${pattern.name}' triggered with ${events.length} events`,
    requiresApproval: true,
    triggeringEvents: events.map((e) => e.eventId),
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Determine whether a decision requires human approval.
 *
 * Checks:
 * 1. If command is in humanInLoop.requiresApproval list -> always approve
 * 2. If command is in humanInLoop.autoApprove list -> never approve
 * 3. If confidence < confidenceThreshold -> requires approval
 * 4. If no command -> always requires approval
 */
function determineRequiresApproval(
  command: string | null,
  confidence: number,
  config: AgentBCConfig
): boolean {
  // No command means we cannot auto-execute
  if (!command) {
    return true;
  }

  // Check humanInLoop overrides
  if (config.humanInLoop) {
    if (config.humanInLoop.requiresApproval?.includes(command)) {
      return true;
    }
    if (config.humanInLoop.autoApprove?.includes(command)) {
      return false;
    }
  }

  // Confidence threshold check
  return confidence < config.confidenceThreshold;
}
