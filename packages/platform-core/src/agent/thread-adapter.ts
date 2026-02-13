/**
 * Thread Adapter — Bridges Platform AgentInterface to LLM generateText
 *
 * Creates an AgentInterface implementation backed by a generateText callback.
 * The adapter:
 * - Accepts a generateText callback (provided at the app level)
 * - Formats events into analysis prompts
 * - Parses LLM responses into LLMAnalysisResult
 * - Tracks timing and token usage for audit context
 *
 * This keeps platform-core free of @convex-dev/agent dependency.
 * The actual LLM call is injected via the config callback.
 *
 * NOTE: This is currently a "thin shim" that wraps any generateText-like
 * function. It does NOT use @convex-dev/agent's persistent thread model
 * (Agent.generateText with threadId for conversation context). Thread-per-
 * customer conversation history is a future enhancement.
 *
 * @see Feature spec: agent-llm-integration.feature, Thread Adapter Design
 * @todo Wire to @convex-dev/agent's Agent.generateText() with persistent
 *   threads, conversation context, and tool calling.
 *
 * @module agent/thread-adapter
 */

import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";
import type { PublishedEvent } from "../eventbus/types.js";
import type { AgentInterface, LLMAnalysisResult, DetectedPattern } from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Result shape from the generateText callback.
 *
 * Maps to the subset of @convex-dev/agent's generateText response
 * that the adapter needs.
 */
export interface GenerateTextResult {
  /** Raw text response from the LLM */
  readonly text: string;
  /** Token usage statistics (optional) */
  readonly usage?: { readonly totalTokens?: number };
  /** Thread ID if using persistent threads (optional) */
  readonly threadId?: string;
}

/**
 * Thread adapter configuration.
 *
 * Bridges platform AgentInterface to @convex-dev/agent.
 * All LLM interaction is delegated to the generateText callback,
 * keeping platform-core decoupled from the agent SDK.
 */
export interface ThreadAdapterConfig {
  /** Agent ID for logging and thread keying */
  readonly agentId: string;

  /** Model identifier (e.g., "anthropic/claude-sonnet-4-5-20250929") */
  readonly model: string;

  /**
   * Callback to generate text via @convex-dev/agent.
   *
   * The app level provides the actual agent.generateText() call.
   * This abstraction keeps platform-core free of @convex-dev/agent dependency.
   */
  readonly generateText: (prompt: string) => Promise<GenerateTextResult>;

  /** Optional logger (defaults to no-op) */
  readonly logger?: Logger;
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build an analysis prompt from events.
 *
 * Formats the event stream into a structured prompt that includes:
 * - The user's analysis instruction
 * - A JSON representation of each event (type, stream, timestamp, payload)
 * - Instructions for the expected response format
 *
 * @param prompt - User-provided analysis instruction
 * @param events - Events to include in the prompt
 * @returns Formatted analysis prompt string
 */
function buildAnalysisPrompt(prompt: string, events: readonly PublishedEvent[]): string {
  const eventSummaries = events.map((e) => ({
    eventId: e.eventId,
    eventType: e.eventType,
    streamType: e.streamType,
    streamId: e.streamId,
    globalPosition: e.globalPosition,
    payload: e.payload,
  }));

  return [
    "You are an event stream analyst. Analyze the following domain events and respond with a JSON object.",
    "",
    `## Task`,
    prompt,
    "",
    `## Events (${events.length} total)`,
    "```json",
    JSON.stringify(eventSummaries, null, 2),
    "```",
    "",
    "## Response Format",
    "Respond with a JSON object containing:",
    '- "patterns": array of { "name": string, "confidence": number (0-1), "matchingEventIds": string[], "data": any }',
    '- "confidence": number (0-1) — overall confidence in the analysis',
    '- "reasoning": string — explanation of what you found',
    "",
    "Respond ONLY with the JSON object, no markdown fences or extra text.",
  ].join("\n");
}

/**
 * Build a reasoning prompt for a single event.
 *
 * @param event - The event to reason about
 * @returns Formatted reasoning prompt string
 */
function buildReasoningPrompt(event: PublishedEvent): string {
  const eventSummary = {
    eventId: event.eventId,
    eventType: event.eventType,
    streamType: event.streamType,
    streamId: event.streamId,
    globalPosition: event.globalPosition,
    payload: event.payload,
  };

  return [
    "You are a domain event reasoner. Analyze the following event and provide your reasoning.",
    "",
    "## Event",
    "```json",
    JSON.stringify(eventSummary, null, 2),
    "```",
    "",
    "## Response Format",
    "Respond with a JSON object containing your reasoning about this event.",
    "Include any relevant observations, implications, or suggested actions.",
    "",
    "Respond ONLY with the JSON object, no markdown fences or extra text.",
  ].join("\n");
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse an LLM response into an LLMAnalysisResult.
 *
 * Strategy:
 * 1. Attempt JSON parsing of the raw response
 * 2. Extract known fields (patterns, confidence, reasoning)
 * 3. If JSON parsing fails, return defaults with the raw text as reasoning
 *
 * @param text - Raw LLM response text
 * @param model - Model identifier for context
 * @param tokens - Token count for context
 * @param durationMs - Call duration for context
 * @param threadId - Optional thread ID for context
 * @returns Parsed LLMAnalysisResult
 */
function parseAnalysisResponse(
  text: string,
  model: string,
  tokens: number,
  durationMs: number,
  threadId?: string
): LLMAnalysisResult {
  const llmContext = {
    model,
    tokens,
    durationMs,
    ...(threadId !== undefined ? { threadId } : {}),
  };

  try {
    const parsed: unknown = JSON.parse(text);

    if (typeof parsed !== "object" || parsed === null) {
      return {
        patterns: [],
        confidence: 0,
        reasoning: text,
        llmContext,
      };
    }

    const obj = parsed as Record<string, unknown>;

    // Extract patterns array
    const patterns: DetectedPattern[] = Array.isArray(obj["patterns"])
      ? (obj["patterns"] as unknown[])
          .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
          .map((p) => ({
            name: typeof p["name"] === "string" ? p["name"] : "unknown",
            confidence: typeof p["confidence"] === "number" ? p["confidence"] : 0,
            matchingEventIds: Array.isArray(p["matchingEventIds"])
              ? (p["matchingEventIds"] as unknown[]).filter(
                  (id): id is string => typeof id === "string"
                )
              : [],
            ...(p["data"] !== undefined ? { data: p["data"] } : {}),
          }))
      : [];

    // Extract confidence
    const confidence = typeof obj["confidence"] === "number" ? obj["confidence"] : 0;

    // Extract reasoning
    const reasoning = typeof obj["reasoning"] === "string" ? obj["reasoning"] : text;

    return {
      patterns,
      confidence,
      reasoning,
      llmContext,
    };
  } catch {
    // JSON parse failed — return defaults with raw text as reasoning
    return {
      patterns: [],
      confidence: 0,
      reasoning: text,
      llmContext,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an AgentInterface backed by @convex-dev/agent.
 *
 * The adapter:
 * 1. Takes a prompt and events
 * 2. Formats them into a structured analysis prompt
 * 3. Calls generateText (which wraps agent.generateText at app level)
 * 4. Parses the response into LLMAnalysisResult
 *
 * If the LLM call fails, errors are logged and re-thrown to allow
 * upstream error handling (circuit breaker, dead letter, etc.).
 *
 * @param config - Thread adapter configuration
 * @returns AgentInterface implementation
 *
 * @example
 * ```typescript
 * const agent = createThreadAdapter({
 *   agentId: "churn-risk-agent",
 *   model: "anthropic/claude-sonnet-4-5-20250929",
 *   generateText: async (prompt) => {
 *     const result = await convexAgent.generateText({ prompt });
 *     return { text: result.text, usage: result.usage, threadId: result.threadId };
 *   },
 * });
 *
 * const analysis = await agent.analyze("Detect churn risk", events);
 * ```
 */
export function createThreadAdapter(config: ThreadAdapterConfig): AgentInterface {
  const logger = config.logger ?? createPlatformNoOpLogger();

  return {
    async analyze(prompt: string, events: readonly PublishedEvent[]): Promise<LLMAnalysisResult> {
      logger.debug("Starting analysis", {
        agentId: config.agentId,
        eventCount: events.length,
      });

      const fullPrompt = buildAnalysisPrompt(prompt, events);
      const startTime = Date.now();

      try {
        const response = await config.generateText(fullPrompt);
        const durationMs = Date.now() - startTime;
        const tokens = response.usage?.totalTokens ?? 0;

        logger.info("Analysis completed", {
          agentId: config.agentId,
          model: config.model,
          tokens,
          durationMs,
        });

        return parseAnalysisResponse(
          response.text,
          config.model,
          tokens,
          durationMs,
          response.threadId
        );
      } catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error("Analysis failed", {
          agentId: config.agentId,
          model: config.model,
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    async reason(event: PublishedEvent): Promise<unknown> {
      logger.debug("Starting reasoning", {
        agentId: config.agentId,
        eventType: event.eventType,
        eventId: event.eventId,
      });

      const fullPrompt = buildReasoningPrompt(event);
      const startTime = Date.now();

      try {
        const response = await config.generateText(fullPrompt);
        const durationMs = Date.now() - startTime;

        logger.info("Reasoning completed", {
          agentId: config.agentId,
          model: config.model,
          durationMs,
        });

        // Attempt to parse JSON response, fall back to raw text
        try {
          return JSON.parse(response.text);
        } catch {
          return response.text;
        }
      } catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error("Reasoning failed", {
          agentId: config.agentId,
          model: config.model,
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}
