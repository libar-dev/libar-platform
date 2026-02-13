/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer infrastructure
 *
 * LLM Provider Configuration
 *
 * Configures the language model for agent pattern analysis.
 * Uses OpenRouter as the provider with Google Gemini as the model.
 *
 * ## Environment Variables
 *
 * Set the OpenRouter API key in your Convex deployment:
 * ```bash
 * npx convex env set OPENROUTER_API_KEY "sk-or-v1-xxx..."
 * ```
 *
 * @module contexts/agent/_llm/config
 * @since Phase 22 (AgentAsBoundedContext)
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";

/**
 * Default model for agent pattern analysis.
 * Google Gemini 3.0 Flash is optimized for fast, cost-effective inference.
 */
export const OPENROUTER_MODEL = "google/gemini-3-flash-preview" as const;

/**
 * Site URL and name for OpenRouter tracking.
 * These are included in request headers for usage tracking.
 */
export const OPENROUTER_SITE_URL = "https://libar.dev";
export const OPENROUTER_SITE_NAME = "libar-platform";

/**
 * Create a configured language model with the provided API key.
 *
 * Returns null if apiKey is not provided, allowing
 * the caller to fall back to mock runtime for testing.
 *
 * @param apiKey - OpenRouter API key (from Convex environment)
 * @returns Language model instance or null if API key not provided
 *
 * @example
 * ```typescript
 * // In a Convex action:
 * const apiKey = process.env.OPENROUTER_API_KEY;
 * const model = createLanguageModel(apiKey);
 * if (!model) {
 *   return createMockAgentRuntime();
 * }
 * // Use model for LLM calls
 * ```
 */
export async function createLanguageModel(
  apiKey: string | undefined
): Promise<LanguageModelV2 | null> {
  if (!apiKey) {
    // Note: Caller should log the warning as Convex doesn't have console in mutations
    return null;
  }

  // Dynamic import: only loads @openrouter/ai-sdk-provider when an API key is present.
  // This prevents module-level resolution failures when the package can't be bundled
  // or loaded in the Convex self-hosted Docker backend's Node.js runtime.
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  const openrouter = createOpenRouter({
    apiKey,
  });

  return openrouter(OPENROUTER_MODEL);
}
