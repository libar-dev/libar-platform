import { defineApp } from "convex/server";

// NPM components
import workpool from "@convex-dev/workpool/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

// Infrastructure components from our packages
import eventStore from "@libar-dev/platform-store/convex.config";
import commandBus from "@libar-dev/platform-bus/convex.config";

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

// Mount bounded context components
app.use(orders);
app.use(inventory);

export default app;
