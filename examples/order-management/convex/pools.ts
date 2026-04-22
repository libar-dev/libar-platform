/**
 * Workpool pool definitions — leaf module with no domain imports.
 *
 * Extracted from infrastructure.ts to break the circular dependency:
 *   eventSubscriptions → infrastructure → eventSubscriptions
 *
 * Both infrastructure.ts and eventSubscriptions.ts can safely import
 * from this module without creating cycles.
 *
 * @architect
 * @architect-pattern OrderManagementInfrastructure
 * @architect-status completed
 * @architect-unlock-reason:'Extract-agentPool-break-circular-dep'
 * @architect-infra
 * @architect-arch-role infrastructure
 * @architect-arch-layer infrastructure
 */

import { Workpool, type WorkpoolComponent, type WorkpoolOptions } from "@convex-dev/workpool";
import type { WorkpoolClient } from "@libar-dev/platform-core";
import { components } from "./_generated/api";

// ============================================================================
// Environment detection (duplicated from infrastructure.ts to keep leaf status)
// ============================================================================

interface SafeGlobalThis {
  process?: {
    env: Record<string, string | undefined>;
  };
  __CONVEX_TEST_MODE__?: boolean;
}

const safeGlobal = globalThis as SafeGlobalThis;

/**
 * Check if running in convex-test unit test environment.
 * Only __CONVEX_TEST_MODE__ disables pools — NOT IS_TEST env var.
 */
const isConvexTestMode = safeGlobal.__CONVEX_TEST_MODE__ === true;

/**
 * No-op workpool client for convex-test unit tests.
 */
const noOpWorkpool: WorkpoolClient = {
  async enqueueMutation() {
    return null;
  },
  async enqueueMutationBatch(_ctx, _handler, argsArray) {
    return argsArray.map(() => null);
  },
  async enqueueAction() {
    return null;
  },
};

function createWorkpool(component: unknown, options: WorkpoolOptions): WorkpoolClient {
  return new Workpool(component as WorkpoolComponent, options) as unknown as WorkpoolClient;
}

// ============================================================================
// Pool Definitions
// ============================================================================

/**
 * Agent pool - dedicated for agent LLM action handlers.
 *
 * Configured with:
 * - maxParallelism: 10 (LLM calls are slow ~1-5s, limit concurrency for cost control)
 * - retryActionsByDefault: true (LLM APIs have transient failures)
 * - 3 retries with exponential backoff (1s initial, base 2)
 * - INFO logging for observability
 *
 * Separated from projectionPool to prevent slow LLM actions from
 * blocking time-critical projection updates (head-of-line blocking).
 *
 * In test environment, uses no-op workpool to avoid scheduling errors.
 *
 * @since Phase 22b (AgentLLMIntegration)
 */
export const agentPool: WorkpoolClient = isConvexTestMode
  ? noOpWorkpool
  : createWorkpool(components.agentPool, {
      maxParallelism: 10,
      retryActionsByDefault: true,
      defaultRetryBehavior: {
        maxAttempts: 3,
        initialBackoffMs: 1000,
        base: 2,
      },
      logLevel: "INFO",
    });
