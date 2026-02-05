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
 * Installation:
 * ```typescript
 * import agent from "@libar-dev/platform-core/agent/convex.config";
 * const app = defineApp();
 * app.use(agent);
 * ```
 *
 * @see DESIGN-2026-005 for architecture decisions
 */
import { defineComponent } from "convex/server";

const component = defineComponent("agent");

export default component;
