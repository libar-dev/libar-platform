/**
 * @libar-docs
 * @libar-docs-implements WorkpoolPartitioningStrategy
 * @libar-docs-status completed
 * @libar-docs-projection
 *
 * ## Per-Projection Partition Configuration
 *
 * Defines configuration types and constants for projection partitioning
 * including parallelism recommendations based on partition strategy.
 *
 * ### Parallelism Guidelines
 *
 * | Strategy | Recommended | Rationale |
 * |----------|-------------|-----------|
 * | entity | 10+ | High parallelism, per-entity ordering |
 * | customer | 5 | Medium, per-customer ordering |
 * | saga | 5 | Medium, per-saga causal ordering |
 * | global | 1 | Single worker, no parallelism |
 */

import type { PartitionKey } from "../../eventbus/types.js";
import type { PartitionStrategy } from "./types.js";

/**
 * Projection partition configuration.
 *
 * Defines how a projection should partition its work for Workpool processing.
 */
export interface ProjectionPartitionConfig {
  /** Projection name for identification */
  projectionName: string;

  /** Partition strategy category */
  strategy: PartitionStrategy;

  /**
   * Partition key extractor function.
   * Must be provided - no implicit defaults.
   */
  getPartitionKey: (args: Record<string, unknown>) => PartitionKey;

  /**
   * Recommended max parallelism based on strategy.
   *
   * - entity: 10+ (high parallelism, per-entity ordering)
   * - customer: 5 (medium, per-customer ordering)
   * - saga: 5 (medium, per-saga ordering)
   * - global: 1 (single worker, no parallelism)
   */
  recommendedParallelism?: number;
}

/**
 * Default parallelism recommendations by strategy.
 *
 * These are recommendations based on ADR-018. Actual values should be
 * tuned based on workload characteristics and platform limits.
 *
 * | Strategy | Default | Note |
 * |----------|---------|------|
 * | entity | 10 | Can go higher (20+) for high-throughput entity projections |
 * | customer | 5 | Balance between parallelism and customer ordering |
 * | saga | 5 | Saga events are typically lower volume |
 * | global | 1 | Must be 1 to prevent OCC conflicts |
 */
export const PARALLELISM_BY_STRATEGY: Record<PartitionStrategy, number> = {
  entity: 10,
  customer: 5,
  saga: 5,
  global: 1,
};

/**
 * Get recommended parallelism for a strategy.
 *
 * @param strategy - Partition strategy
 * @returns Recommended parallelism value
 *
 * @example
 * ```typescript
 * const parallelism = getRecommendedParallelism("entity");
 * // Returns: 10
 * ```
 */
export function getRecommendedParallelism(strategy: PartitionStrategy): number {
  return PARALLELISM_BY_STRATEGY[strategy];
}
