/**
 * @libar-docs
 * @libar-docs-uses AgentAsBoundedContext
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-context agent
 * @libar-docs-arch-layer infrastructure
 *
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
