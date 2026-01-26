/**
 * @libar-docs
 * @libar-docs-implements WorkpoolPartitioningStrategy
 * @libar-docs-status completed
 * @libar-docs-projection
 *
 * ## Projection Complexity Classifier
 *
 * Analyzes projection characteristics and recommends appropriate
 * partition strategies using a decision tree approach.
 *
 * ### Decision Tree
 *
 * ```
 * What does this projection aggregate?
 *     │
 *     ├─► Global aggregate → "global" strategy
 *     │
 *     ├─► Cross-context data → "saga" strategy
 *     │
 *     ├─► Customer data → "customer" strategy
 *     │
 *     └─► Single entity → "entity" strategy (default)
 * ```
 */

import type { PartitionStrategy } from "./types.js";

/**
 * Projection complexity level.
 *
 * Used to indicate the architectural complexity of a projection,
 * which affects maintenance burden and failure modes.
 */
export type ProjectionComplexity = "simple" | "moderate" | "complex";

/**
 * Projection characteristics for classification.
 *
 * Answer these questions about a projection to get strategy recommendations.
 */
export interface ProjectionCharacteristics {
  /** Does it aggregate data for a single entity (Order, Product, etc.)? */
  singleEntity: boolean;

  /** Does it aggregate across multiple entities for a customer? */
  customerScoped: boolean;

  /** Does it join data from multiple bounded contexts? */
  crossContext: boolean;

  /** Does it compute global aggregates/rollups (dailySales, totalInventory)? */
  globalRollup: boolean;
}

/**
 * Classification result with recommended strategy.
 */
export interface ClassificationResult {
  /** Recommended partition strategy */
  strategy: PartitionStrategy;

  /** Complexity level of the projection */
  complexity: ProjectionComplexity;

  /** Human-readable rationale for the recommendation */
  rationale: string;
}

/**
 * Classify projection and recommend partition strategy.
 *
 * Uses a decision tree based on projection characteristics to
 * determine the most appropriate partition key strategy.
 *
 * **Decision Priority:**
 * 1. Global rollup → global (prevents OCC, single writer)
 * 2. Cross-context → saga (causal ordering across BCs)
 * 3. Customer-scoped → customer (per-customer ordering)
 * 4. Default → entity (per-entity ordering)
 *
 * @param characteristics - Projection characteristics
 * @returns Classification with strategy recommendation
 *
 * @example
 * ```typescript
 * // Order summary projection
 * const result = classifyProjection({
 *   singleEntity: true,
 *   customerScoped: false,
 *   crossContext: false,
 *   globalRollup: false,
 * });
 * // result.strategy === "entity"
 *
 * // Daily sales rollup
 * const rollup = classifyProjection({
 *   singleEntity: false,
 *   customerScoped: false,
 *   crossContext: false,
 *   globalRollup: true,
 * });
 * // rollup.strategy === "global"
 * ```
 */
export function classifyProjection(
  characteristics: ProjectionCharacteristics
): ClassificationResult {
  // Global rollups need serialization to prevent OCC conflicts
  if (characteristics.globalRollup) {
    return {
      strategy: "global",
      complexity: "complex",
      rationale:
        "Global rollup projections require serialized processing to avoid OCC conflicts. " +
        "Use GLOBAL_PARTITION_KEY or a dedicated Workpool with maxParallelism: 1.",
    };
  }

  // Cross-context projections need saga-scoped ordering
  if (characteristics.crossContext) {
    return {
      strategy: "saga",
      complexity: "complex",
      rationale:
        "Cross-context projections need correlationId partitioning for causal ordering. " +
        "Events from different BCs in the same saga must process in order.",
    };
  }

  // Customer-scoped aggregations
  if (characteristics.customerScoped) {
    return {
      strategy: "customer",
      complexity: "moderate",
      rationale:
        "Customer-scoped projections need customerId partitioning for per-customer ordering. " +
        "All events affecting a customer aggregate in FIFO order.",
    };
  }

  // Single entity projections (most common, default)
  return {
    strategy: "entity",
    complexity: "simple",
    rationale:
      "Entity projections use streamId for per-entity ordering with high parallelism. " +
      "Events for the same entity serialize, different entities parallelize.",
  };
}
