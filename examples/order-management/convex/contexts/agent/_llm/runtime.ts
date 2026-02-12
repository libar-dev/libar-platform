/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer infrastructure
 *
 * OpenRouter Agent Runtime
 *
 * Implements AgentRuntimeConfig using the Vercel AI SDK with OpenRouter.
 * Falls back to mock runtime when API key is not configured.
 *
 * ## Usage
 *
 * ```typescript
 * import { createOpenRouterAgentRuntime } from "./_llm/runtime.js";
 *
 * // Pass the API key from Convex environment
 * const apiKey = process.env.OPENROUTER_API_KEY;
 * const handler = createAgentEventHandler({
 *   config: myAgentConfig,
 *   runtime: createOpenRouterAgentRuntime(apiKey),
 *   // ...
 * });
 * ```
 *
 * @module contexts/agent/_llm/runtime
 * @since Phase 22 (AgentAsBoundedContext)
 */

import { generateObject } from "ai";
import { z } from "zod";
import {
  createMockAgentRuntime,
  type AgentRuntimeConfig,
  type LLMAnalysisResult,
} from "@libar-dev/platform-core/agent";
import type { PublishedEvent } from "@libar-dev/platform-core";
import { createLanguageModel, OPENROUTER_MODEL } from "./config.js";

/** Type for pattern analysis response */
type PatternAnalysisResponse = z.infer<typeof PatternAnalysisSchema>;

/** Type for event reasoning response */
type EventReasoningResponse = z.infer<typeof EventReasoningSchema>;

/**
 * Schema for pattern analysis response from the LLM.
 *
 * This defines the structured output format that the LLM must follow.
 */
const PatternAnalysisSchema = z.object({
  patterns: z.array(
    z.object({
      name: z.string().describe("Pattern identifier (e.g., 'churn-risk', 'high-value-customer')"),
      confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
      matchingEventIds: z.array(z.string()).describe("IDs of events that match this pattern"),
      data: z.any().optional().describe("Additional pattern-specific data"),
    })
  ),
  confidence: z.number().min(0).max(1).describe("Overall confidence in the analysis"),
  reasoning: z.string().describe("Explanation of the analysis and findings"),
  suggestedAction: z
    .object({
      type: z.string().describe("Command type to emit (e.g., 'SuggestCustomerOutreach')"),
      payload: z.any().describe("Command payload data"),
    })
    .optional()
    .describe("Recommended action based on the analysis"),
});

/**
 * Schema for single-event reasoning.
 */
const EventReasoningSchema = z.object({
  assessment: z.string().describe("Brief assessment of the event"),
  riskLevel: z.enum(["low", "medium", "high"]).describe("Risk level assessment"),
  confidence: z.number().min(0).max(1).describe("Confidence in the assessment"),
  relevantFactors: z.array(z.string()).optional().describe("Key factors in the assessment"),
});

/**
 * Create an agent runtime that uses OpenRouter for LLM calls.
 *
 * If apiKey is not provided, returns a mock runtime instead.
 * This allows the agent to run without LLM integration for testing.
 *
 * @param apiKey - OpenRouter API key from Convex environment (process.env.OPENROUTER_API_KEY)
 * @returns AgentRuntimeConfig for use with createAgentEventHandler
 *
 * @example
 * ```typescript
 * // In Convex handler:
 * const apiKey = process.env.OPENROUTER_API_KEY;
 * const runtime = createOpenRouterAgentRuntime(apiKey);
 * const handler = createAgentEventHandler({
 *   config: churnRiskAgentConfig,
 *   runtime,
 *   // ...
 * });
 * ```
 */
export function createOpenRouterAgentRuntime(apiKey?: string): AgentRuntimeConfig {
  const model = createLanguageModel(apiKey);

  if (!model) {
    return createMockAgentRuntime();
  }

  return {
    analyze: async (
      prompt: string,
      events: readonly PublishedEvent[]
    ): Promise<LLMAnalysisResult> => {
      const startTime = Date.now();

      // Format events for LLM consumption
      const eventsContext = events.map((e) => ({
        id: e.eventId,
        type: e.eventType,
        timestamp: new Date(e.timestamp).toISOString(),
        streamId: e.streamId,
        payload: e.payload,
      }));

      const fullPrompt = `${prompt}

## Events to Analyze

${JSON.stringify(eventsContext, null, 2)}

Analyze these events for patterns and provide your assessment.`;

      try {
        const result = await generateObject({
          model,
          schema: PatternAnalysisSchema,
          prompt: fullPrompt,
        });

        const durationMs = Date.now() - startTime;

        // Type assertion: generateObject with schema returns typed object
        const analysisResult = result.object as PatternAnalysisResponse;

        // Build result, only including suggestedAction if it exists
        const llmResult: LLMAnalysisResult = {
          patterns: analysisResult.patterns.map((p) => ({
            name: p.name,
            confidence: p.confidence,
            matchingEventIds: p.matchingEventIds,
            data: p.data,
          })),
          confidence: analysisResult.confidence,
          reasoning: analysisResult.reasoning,
          llmContext: {
            model: OPENROUTER_MODEL,
            tokens: result.usage?.totalTokens ?? 0,
            durationMs,
          },
        };

        // Only add suggestedAction if present (exactOptionalPropertyTypes compatibility)
        if (analysisResult.suggestedAction) {
          (llmResult as { suggestedAction?: { type: string; payload: unknown } }).suggestedAction =
            analysisResult.suggestedAction;
        }

        return llmResult;
      } catch (error) {
        // Return a failed analysis result with zero confidence
        // Note: Convex doesn't have console in mutations, so we don't log here
        return {
          patterns: [],
          confidence: 0,
          reasoning: `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          llmContext: {
            model: OPENROUTER_MODEL,
            tokens: 0,
            durationMs: Date.now() - startTime,
          },
        };
      }
    },

    reason: async (event: PublishedEvent): Promise<unknown> => {
      const startTime = Date.now();

      const prompt = `Assess the following event and provide your analysis:

## Event Details

- ID: ${event.eventId}
- Type: ${event.eventType}
- Stream: ${event.streamType}/${event.streamId}
- Timestamp: ${new Date(event.timestamp).toISOString()}
- Payload: ${JSON.stringify(event.payload, null, 2)}

Provide a brief risk assessment of this event.`;

      try {
        const result = await generateObject({
          model,
          schema: EventReasoningSchema,
          prompt,
        });

        // Type assertion: generateObject with schema returns typed object
        const reasoningResult = result.object as EventReasoningResponse;

        return {
          assessment: reasoningResult.assessment,
          riskLevel: reasoningResult.riskLevel,
          confidence: reasoningResult.confidence,
          relevantFactors: reasoningResult.relevantFactors,
          llmContext: {
            model: OPENROUTER_MODEL,
            tokens: result.usage?.totalTokens ?? 0,
            durationMs: Date.now() - startTime,
          },
        };
      } catch (error) {
        // Note: Convex doesn't have console in mutations, so we don't log here
        return {
          assessment: `Reasoning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          riskLevel: "low",
          confidence: 0,
        };
      }
    },
  };
}
