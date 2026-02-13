/**
 * @libar-docs
 * @libar-docs-pattern OrderManagementInfrastructure
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-layer infrastructure
 * @libar-docs-uses Workpool, Workflow, EventStore, CommandBus
 *
 * Infrastructure setup for the order-management application.
 *
 * Initializes Workpool, Workflow, and other infrastructure components.
 */

import { Workpool } from "@convex-dev/workpool";
import { WorkflowManager } from "@convex-dev/workflow";
import { ActionRetrier } from "@convex-dev/action-retrier";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference, FunctionVisibility } from "convex/server";
import { components } from "./_generated/api";
import { EventStore } from "@libar-dev/platform-store";
import { CommandBus } from "@libar-dev/platform-bus";
import {
  CommandOrchestrator,
  IntegrationEventPublisher,
  ConvexEventBus,
  createMiddlewarePipeline,
  createRegistryValidationMiddleware,
  createLoggingMiddleware,
  createRateLimitMiddleware,
  createConvexRateLimitAdapter,
  RateLimitKeys,
  createScopedLogger,
  type WorkpoolClient,
  type IIntegrationEventPublisher,
  type EventBus,
  type MiddlewarePipeline,
  type LogLevel,
} from "@libar-dev/platform-core";
import { integrationRoutes } from "./integration/routes.js";
import { eventSubscriptions } from "./eventSubscriptions.js";
import { commandRegistry } from "./commands/registry.js";
import { rateLimiter } from "./rateLimits.js";

/**
 * Valid log levels for type guard.
 */
const VALID_LOG_LEVELS = ["DEBUG", "TRACE", "INFO", "REPORT", "WARN", "ERROR"] as const;

/**
 * Type guard to validate log level strings.
 */
function isValidLogLevel(level: string): level is LogLevel {
  return VALID_LOG_LEVELS.includes(level as LogLevel);
}

/**
 * Type-safe interface for accessing globalThis properties in Convex runtime.
 *
 * Provides proper typing for environment access patterns that are commonly
 * needed in Convex handlers:
 * - `process.env` for environment variables
 * - `__CONVEX_TEST_MODE__` for detecting unit test context
 */
interface SafeGlobalThis {
  process?: {
    env: Record<string, string | undefined>;
  };
  __CONVEX_TEST_MODE__?: boolean;
}

/**
 * Typed globalThis access - eliminates `as any` casts.
 */
const safeGlobal = globalThis as SafeGlobalThis;

/**
 * Get the platform log level from environment variable.
 *
 * Configuration:
 * - Set via: `npx convex env set PLATFORM_LOG_LEVEL DEBUG`
 * - Override in any environment with explicit PLATFORM_LOG_LEVEL
 *
 * Default behavior:
 * - Production (Convex Cloud): "INFO" - when CONVEX_CLOUD_URL is present
 * - Development/Testing (Self-hosted Docker): "DEBUG" - when CONVEX_CLOUD_URL is absent
 *
 * This ensures verbose logging by default in dev/test environments without
 * any extra configuration, while production stays at INFO level.
 */
function getPlatformLogLevel(): LogLevel {
  // Access process.env safely using typed interface
  const env = safeGlobal.process?.env ?? {};

  // Explicit override from environment variable takes precedence
  const envLogLevel = env["PLATFORM_LOG_LEVEL"];
  if (envLogLevel && isValidLogLevel(envLogLevel)) {
    return envLogLevel;
  }

  // Default based on environment detection:
  // - Convex Cloud deployments have CONVEX_CLOUD_URL set
  // - Self-hosted Docker (dev/test) does not
  const isProduction = !!env["CONVEX_CLOUD_URL"];
  return isProduction ? "INFO" : "DEBUG";
}

/**
 * Platform-wide log level for all infrastructure components.
 *
 * Controls logging verbosity for:
 * - Workpool (projections, PM event processing)
 * - Workflow (sagas)
 * - EventBus (event publishing)
 * - EventStore PM operations
 * - PM executor logging
 * - Command handlers
 *
 * Log levels (most to least verbose):
 * - DEBUG: Internal scheduling, state details
 * - TRACE: Performance timing
 * - INFO: Event processing started/completed (recommended for production)
 * - REPORT: Aggregated metrics, batch summaries
 * - WARN: Fallback behavior, degraded state
 * - ERROR: Failures, dead letters
 *
 * @see getPlatformLogLevel() for configuration details
 */
export const PLATFORM_LOG_LEVEL: LogLevel = getPlatformLogLevel();

/**
 * No-op workpool client for convex-test unit tests.
 * Projections are verified in integration tests with real Docker backend.
 *
 * Includes enqueueMutation, enqueueMutationBatch, and enqueueAction for
 * interface compatibility, though batch isn't currently used (see
 * CommandOrchestrator notes about per-item context limitations).
 */
const noOpWorkpool: WorkpoolClient = {
  async enqueueMutation() {
    return null;
  },
  async enqueueMutationBatch(_ctx, _handler, argsArray) {
    // Return array of nulls matching input length
    return argsArray.map(() => null);
  },
  async enqueueAction() {
    return null;
  },
};

/**
 * Check if running in convex-test unit test environment.
 * Only __CONVEX_TEST_MODE__ disables projections - NOT IS_TEST env var.
 * IS_TEST is used for Docker integration tests where projections SHOULD run.
 */
const isConvexTestMode = safeGlobal.__CONVEX_TEST_MODE__ === true;

/**
 * Check if running in Docker integration test environment.
 * IS_TEST=true is set when running tests against the Docker backend.
 *
 * We reduce Workpool parallelism during integration tests to minimize
 * OCC (Optimistic Concurrency Control) errors on Workpool's internal
 * runStatus table. The reduced parallelism (3 vs 10) significantly
 * decreases contention when multiple commands enqueue projections rapidly.
 */
const isIntegrationTest = safeGlobal.process?.env?.["IS_TEST"] === "true";

/**
 * Workpool parallelism level.
 * - Integration tests: 3 (reduce OCC contention on Workpool internals)
 * - Production/Development: 10 (higher throughput)
 */
const workpoolParallelism = isIntegrationTest ? 3 : 10;

/**
 * Projection pool - for processing projection updates.
 *
 * Configured with:
 * - maxParallelism: 3-10 (conditional based on environment)
 * - 3 retries with exponential backoff before dead letter
 * - INFO logging for observability
 *
 * In test environment, uses no-op workpool to avoid scheduling errors.
 *
 * Note: The underlying Workpool component supports enqueueMutationBatch,
 * but it's not currently used by the orchestrator because each projection
 * needs different per-item context for dead letter tracking. See
 * CommandOrchestrator for details on this limitation.
 *
 * @see workpoolParallelism for conditional parallelism explanation
 */
export const projectionPool: WorkpoolClient = isConvexTestMode
  ? noOpWorkpool
  : new Workpool(components.projectionPool, {
      maxParallelism: workpoolParallelism,
      defaultRetryBehavior: {
        maxAttempts: 3,
        initialBackoffMs: 250,
        base: 2,
      },
      logLevel: "INFO",
    });

/**
 * DCB Retry Pool - for scheduling DCB conflict retries (Phase 18a).
 *
 * Separate from projectionPool to:
 * - Isolate retry traffic from projection processing
 * - Allow different parallelism/backoff settings
 * - Enable partition key ordering for scope serialization
 *
 * Configured with:
 * - maxParallelism: 3-10 (conditional based on environment)
 * - 1 retry at Workpool level (withDCBRetry handles retries internally)
 * - INFO logging for observability
 *
 * Key feature: Partition key support (`key` option in enqueueMutation)
 * ensures that retries for the same DCB scope execute in FIFO order,
 * preventing concurrent retry collisions.
 *
 * In test environment, uses no-op workpool to avoid scheduling errors.
 *
 * @see workpoolParallelism for conditional parallelism explanation
 */
export const dcbRetryPool: WorkpoolClient = isConvexTestMode
  ? noOpWorkpool
  : new Workpool(components.dcbRetryPool, {
      maxParallelism: workpoolParallelism,
      defaultRetryBehavior: {
        maxAttempts: 1, // withDCBRetry handles retries internally
        initialBackoffMs: 100,
        base: 2,
      },
      logLevel: "INFO",
    });

/**
 * Event Replay Pool - for background projection rebuilding (Phase 18b-1).
 *
 * Separate from projectionPool to:
 * - Lower priority (5 vs 10 parallelism) - preserves live operation budget
 * - Partition key support for one-active-replay-per-projection
 * - Longer backoff suitable for batch work
 *
 * Configured with:
 * - maxParallelism: 5 (low priority, preserves 50%+ budget for live ops)
 * - 5 retries with exponential backoff (more retries for background work)
 * - INFO logging for observability
 *
 * Partition key strategy: `replay:{projectionName}` ensures:
 * - Only one active replay per projection (no concurrent rebuilds)
 * - Chunks for same projection execute in FIFO order
 * - Different projections can rebuild in parallel
 *
 * In test environment, uses no-op workpool to avoid scheduling errors.
 */
export const eventReplayPool: WorkpoolClient = isConvexTestMode
  ? noOpWorkpool
  : new Workpool(components.eventReplayPool, {
      maxParallelism: 5, // Low priority, preserves 50%+ budget for live ops
      defaultRetryBehavior: {
        maxAttempts: 5,
        initialBackoffMs: 1000,
        base: 2,
      },
      logLevel: "INFO",
    });

/**
 * Durable Append Pool - for Workpool-backed event append retry (Phase 18.5).
 *
 * Separate from projectionPool to:
 * - Isolate critical event append retries from projection processing
 * - Allow different retry settings (more aggressive for event append)
 * - Enable partition key ordering for per-entity event append serialization
 *
 * Configured with:
 * - maxParallelism: 3-10 (conditional based on environment)
 * - 5 retry attempts with exponential backoff
 * - INFO logging for observability
 *
 * Partition key strategy: `append:{streamType}:{streamId}` ensures:
 * - Only one active append per entity (no concurrent appends)
 * - Events for same entity are appended in FIFO order
 * - Different entities can append in parallel
 *
 * In test environment, uses no-op workpool to avoid scheduling errors.
 *
 * @since Phase 18.5 (DurableEventsIntegration)
 */
export const durableAppendPool: WorkpoolClient = isConvexTestMode
  ? noOpWorkpool
  : new Workpool(components.durableAppendPool, {
      maxParallelism: workpoolParallelism,
      defaultRetryBehavior: {
        maxAttempts: 5,
        initialBackoffMs: 100,
        base: 2,
      },
      logLevel: "INFO",
    });

/**
 * Workflow manager for durable sagas.
 *
 * Uses internal workpool for step execution with:
 * - maxParallelism: 3-10 (conditional based on environment)
 * - Explicit retry control per-step (not by default)
 * - 3 retry attempts with exponential backoff when enabled
 * - INFO logging for observability
 *
 * Note: Type assertion needed because apps/frontend generated types are
 * out of sync with installed @convex-dev/workflow v0.3.4. The generated
 * api.d.ts is missing `list` and `listByName` methods that were added
 * in newer versions. Run `npx convex dev` when deployment is available
 * to regenerate types and remove this workaround.
 *
 * @see workpoolParallelism for conditional parallelism explanation
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const workflowManager = new WorkflowManager(components.workflow as any, {
  workpoolOptions: {
    maxParallelism: workpoolParallelism,
    retryActionsByDefault: false,
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 500,
      base: 2,
    },
    logLevel: "INFO",
  },
});

/**
 * Action retrier for external API calls.
 */
export const actionRetrier = new ActionRetrier(components.actionRetrier);

/**
 * Event Store client.
 */
export const eventStore = new EventStore(components.eventStore);

/**
 * Command Bus client.
 */
export const commandBus = new CommandBus(components.commandBus);

/**
 * EventBus logger for pub/sub event delivery tracing.
 */
const eventBusLogger = createScopedLogger("EventBus", PLATFORM_LOG_LEVEL);

/**
 * CommandOrchestrator logger for command execution tracing.
 */
const orchestratorLogger = createScopedLogger("Orchestrator", PLATFORM_LOG_LEVEL);

/**
 * IntegrationPublisher logger for cross-context event publishing tracing.
 */
const integrationLogger = createScopedLogger("Integration", PLATFORM_LOG_LEVEL);

// =============================================================================
// Projection Handler Reference (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 errors when accessing internal paths.
// =============================================================================
const deadLetterOnComplete = makeFunctionReference<"mutation">(
  "projections/deadLetters:onProjectionComplete"
) as FunctionReference<"mutation", FunctionVisibility>;

/**
 * EventBus for pub/sub event delivery.
 *
 * Provides an alternative to direct projection triggering via CommandConfig.
 * Currently configured with minimal subscriptions - projections are triggered
 * directly via CommandConfig for explicit wiring.
 *
 * In test environment, uses no-op workpool which effectively disables EventBus.
 *
 * @see eventSubscriptions.ts for subscription definitions
 */
export const eventBus: EventBus = new ConvexEventBus(projectionPool, eventSubscriptions, {
  defaultOnComplete: deadLetterOnComplete,
  logger: eventBusLogger,
});

/**
 * Middleware Pipeline for command validation, logging, and rate limiting.
 *
 * Configures command execution with cross-cutting concerns:
 * - Structure validation (order: 10) - validates args against Zod schemas from registry
 * - Logging (order: 40) - logs command execution with timing metrics
 * - Rate limiting (order: 50) - API protection via @convex-dev/rate-limiter
 *
 * Additional middlewares can be added:
 * - Domain validation (order: 20) - business rule pre-checks
 * - Authorization (order: 30) - RBAC checks
 *
 * In convex-test mode, rate limiting is disabled because @convex-dev/rate-limiter
 * cannot be simulated in convex-test (see TESTING.md Section 2.1).
 * Rate limiting is tested:
 * - Unit tests: platform-core/tests/unit/middleware/middlewares.test.ts (mocked)
 * - Integration tests: Against real Docker backend (port 3210/3215)
 *
 * @see rateLimits.ts for rate limit definitions
 */
const basePipeline = createMiddlewarePipeline()
  .use(
    createRegistryValidationMiddleware(commandRegistry, {
      stripUnknown: false,
    })
  )
  .use(
    createLoggingMiddleware({
      logger: createScopedLogger("Middleware", PLATFORM_LOG_LEVEL),
      includeTiming: true,
      includePayload: false, // Security: don't log sensitive data
    })
  );

// Rate limiting is only active in non-test mode.
// In convex-test, the rateLimiter component cannot be registered
// (similar to Workpool → noOpWorkpool pattern).
export const middlewarePipeline: MiddlewarePipeline = isConvexTestMode
  ? basePipeline
  : basePipeline.use(
      createRateLimitMiddleware({
        checkerFactory: (ctx) =>
          createConvexRateLimitAdapter(rateLimiter, "commandDispatch")(ctx.raw),
        getKey: RateLimitKeys.byUserAndCommand(
          (ctx) => (ctx.custom["userId"] as string | undefined) ?? "anonymous"
        ),
        skipFor: ["GetSystemHealth", "CleanupExpiredReservations"],
      })
    );

/**
 * Command Orchestrator - handles dual-write + projection pattern.
 *
 * Reduces boilerplate in command mutations by encapsulating
 * the 7-step orchestration logic.
 *
 * Features:
 * - middlewarePipeline: Applies validation and logging before/after execution
 * - commandBusComponent: Records command-event correlations for audit trail
 *
 * Wired with EventBus for pub/sub event publishing (step 6a).
 * Note: Projections are triggered both directly (via CommandConfig)
 * and potentially via EventBus subscriptions. To avoid duplication,
 * eventSubscriptions.ts should NOT duplicate CommandConfig projections.
 */
export const commandOrchestrator: CommandOrchestrator = new CommandOrchestrator({
  eventStore,
  commandBus,
  projectionPool,
  eventBus,
  defaultOnComplete: deadLetterOnComplete,
  middlewarePipeline,
  commandBusComponent: {
    recordCommandEventCorrelation: components.commandBus.lib.recordCommandEventCorrelation,
  },
  logger: orchestratorLogger,
});

/**
 * Integration Event Publisher - handles cross-context event publishing.
 *
 * Translates domain events to integration events (Published Language pattern)
 * and dispatches to registered handlers via Workpool.
 *
 * Currently configured routes:
 * - OrderSubmitted → OrderPlacedIntegration → inventory pre-check handlers
 *
 * TODO: Wire to CommandOrchestrator or EventBus for automatic domain→integration
 * event translation (currently requires manual invocation).
 *
 * In test environment, uses no-op workpool to avoid scheduling errors.
 */
export const integrationPublisher: IIntegrationEventPublisher = new IntegrationEventPublisher(
  projectionPool,
  integrationRoutes,
  {
    onComplete: deadLetterOnComplete,
    logger: integrationLogger,
  }
);
