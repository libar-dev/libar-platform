/**
 * @libar-docs
 * @libar-docs-pattern AppCompositionRoot
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-layer infrastructure
 *
 * Application composition root. Mounts all Convex components (workpool, workflow,
 * event store, command bus, rate limiter, agent BC) and bounded contexts (orders, inventory).
 */
import { defineApp } from "convex/server";

// NPM components
import workpool from "@convex-dev/workpool/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

// Infrastructure components from our packages
import eventStore from "@libar-dev/platform-store/convex.config";
import commandBus from "@libar-dev/platform-bus/convex.config";
import agentBC from "@libar-dev/platform-core/agent/convex.config";

// LLM agent component (peer to agentBC per AD-6)
import agent from "@convex-dev/agent/convex.config";

// Local components (bounded contexts)
import orders from "./contexts/orders/convex.config";
import inventory from "./contexts/inventory/convex.config";

const app: ReturnType<typeof defineApp> = defineApp();

// Mount infrastructure components
app.use(eventStore);
app.use(commandBus);

// Mount workpool for projection processing
// Note: Sagas use workflow's internal workpool for step execution
app.use(workpool, { name: "projectionPool" });

// Mount workpool for DCB retry scheduling (Phase 18a)
// Separate from projectionPool to:
// - Isolate retry traffic from projection processing
// - Allow different parallelism/backoff settings
// - Enable partition key ordering for scope serialization
app.use(workpool, { name: "dcbRetryPool" });

// Mount workpool for projection replay/rebuild (Phase 18b-1)
// Used by EventReplayInfrastructure for background projection rebuilding
// Partition key = replay:{projectionName} for per-projection ordering
// Low priority (maxParallelism: 5) to preserve live operation budget
app.use(workpool, { name: "eventReplayPool" });

// Mount workpool for durable event append retry (Phase 18.5)
// Used by DurableEventsIntegration for Workpool-backed append retries
// Partition key = append:{streamType}:{streamId} for per-entity ordering
app.use(workpool, { name: "durableAppendPool" });

// Mount workflow and retrier
app.use(workflow);
app.use(actionRetrier);

// Mount rate limiter for production-grade rate limiting
app.use(rateLimiter);

// Mount agent BC component (Phase 22a — physical BC isolation)
// AD-6: agentBC, llmAgent, agentPool are all app-level peers (not nested)
app.use(agentBC);
app.use(agent, { name: "llmAgent" });
app.use(workpool, { name: "agentPool" });

// Mount bounded context components
app.use(orders);
app.use(inventory);

export default app;
