/**
 * LLM Configuration and Runtime Exports
 *
 * @module contexts/agent/_llm
 * @since Phase 22 (AgentAsBoundedContext)
 */

export {
  createLanguageModel,
  OPENROUTER_MODEL,
  OPENROUTER_SITE_URL,
  OPENROUTER_SITE_NAME,
} from "./config.js";
export { createOpenRouterAgentRuntime } from "./runtime.js";
