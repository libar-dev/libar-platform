/**
 * @libar-docs
 * @libar-docs-implements WorkpoolPartitioningStrategy
 * @libar-docs-status completed
 * @libar-docs-projection
 *
 * ## Workpool Partitioning Strategy
 *
 * Standardized partition key patterns for event ordering and OCC prevention
 * in Workpool-based projection processing.
 *
 * ### Quick Reference
 *
 * | Projection Type | Helper | Key Format |
 * |-----------------|--------|------------|
 * | Per-entity | `createEntityPartitionKey("Order")` | `Order:ord-123` |
 * | Per-customer | `createCustomerPartitionKey()` | `cust-123` |
 * | Cross-context | `createSagaPartitionKey()` | `corr-123` |
 * | Global rollup | `GLOBAL_PARTITION_KEY` | `global` |
 * | DCB retry | `createDCBPartitionKey(scopeKey)` | `dcb:scope-key` |
 *
 * ### Decision Tree
 *
 * ```
 * What does this projection aggregate?
 *     │
 *     ├─► Single entity (Order, Product)
 *     │       └─► Use createEntityPartitionKey("EntityType")
 *     │
 *     ├─► Multiple entities for same customer
 *     │       └─► Use createCustomerPartitionKey()
 *     │
 *     ├─► Multiple entities across a saga/workflow
 *     │       └─► Use createSagaPartitionKey()
 *     │
 *     └─► Global aggregate (daily totals, metrics)
 *             └─► Use GLOBAL_PARTITION_KEY or maxParallelism: 1
 * ```
 *
 * @example
 * ```typescript
 * import {
 *   createEntityPartitionKey,
 *   createCustomerPartitionKey,
 *   createSagaPartitionKey,
 *   GLOBAL_PARTITION_KEY,
 * } from "@libar-dev/platform-core/workpool/partitioning";
 *
 * const orderConfig: CommandConfig = {
 *   projection: {
 *     projectionName: "orderSummary",
 *     getPartitionKey: createEntityPartitionKey("Order"),
 *   },
 *   secondaryProjections: [{
 *     projectionName: "customerOrderHistory",
 *     getPartitionKey: createCustomerPartitionKey(),
 *   }],
 * };
 * ```
 *
 * @see ADR-018 Workpool Partitioning Strategy
 * @see docs/architecture/WORKPOOL-PARTITIONING.md
 */

// Types
export type {
  PartitionKey,
  PartitionStrategy,
  PartitionKeyExtractor,
  EntityPartitionArgs,
  CustomerPartitionArgs,
  SagaPartitionArgs,
} from "./types.js";

// Helpers
export {
  GLOBAL_PARTITION_KEY,
  createEntityPartitionKey,
  createCustomerPartitionKey,
  createSagaPartitionKey,
  createGlobalPartitionKey,
  createDCBPartitionKey,
} from "./helpers.js";

// Config
export type { ProjectionPartitionConfig } from "./config.js";
export { PARALLELISM_BY_STRATEGY, getRecommendedParallelism } from "./config.js";

// Complexity
export type {
  ProjectionComplexity,
  ProjectionCharacteristics,
  ClassificationResult,
} from "./complexity.js";
export { classifyProjection } from "./complexity.js";
