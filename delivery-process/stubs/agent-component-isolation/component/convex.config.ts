/**
 * @target platform-core/src/agent/component/convex.config.ts
 *
 * Agent Component Definition
 *
 * Defines the agent bounded context as a Convex component with isolated database.
 * All agent-specific state (checkpoints, audit events, dead letters, commands,
 * pending approvals) resides in this component's isolated tables.
 *
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-uses AgentBCConfig
 *
 * ## Agent Component - Isolated BC State
 *
 * Single component instance serves all agents, multi-tenant by agentId.
 * Projections (e.g., customerCancellations) remain at app level per platform architecture.
 *
 * ## AD-6: Peer Mounting Architecture (Finding F-2)
 *
 * `@convex-dev/agent` and `agentBC` are PEER components at the app level,
 * NOT nested (agentBC does NOT `component.use(agent)`).
 *
 * Why peer, not nested:
 * - Convex components cannot access `process.env` for LLM API keys
 * - The app-level action handler coordinates between both components
 * - `@convex-dev/agent` provides LLM threads/messages/embeddings
 * - `agentBC` provides BC state: checkpoints, audit, commands, approvals
 * - App-level action reads from both, onComplete writes to agentBC
 *
 * Installation (all three are app-level peers):
 * ```typescript
 * import agentBC from "@libar-dev/platform-core/agent/convex.config";
 * import { agent } from "@convex-dev/agent/convex.config";
 * import { workpool } from "@convex-dev/workpool/convex.config";
 *
 * const app = defineApp();
 * app.use(agentBC);                         // BC: checkpoints, audit, commands, approvals
 * app.use(agent, { name: "llmAgent" });     // LLM: threads, messages, embeddings
 * app.use(workpool, { name: "agentPool" }); // Dedicated pool for agent actions (F-6)
 * ```
 *
 * Data flow:
 * ```
 * EventBus → agentPool.enqueueAction() → app-level action handler
 *   action: ctx.runQuery(agentBC.checkpoints.*) + ctx.runQuery(llmAgent.*)
 *   onComplete: ctx.runMutation(agentBC.audit.*) + ctx.runMutation(agentBC.checkpoints.*)
 * ```
 *
 * @see DESIGN-2026-005 for detailed architecture rationale (historical)
 * @see PDR-010 (Cross-Component Argument Injection)
 * @see DESIGN-SESSION-GUIDE.md Holistic Review Checklist
 */
import { defineComponent } from "convex/server";

const component = defineComponent("agentBC");

export default component;
