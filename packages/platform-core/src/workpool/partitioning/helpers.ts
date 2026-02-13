/**
 * @libar-docs
 * @libar-docs-implements WorkpoolPartitioningStrategy
 * @libar-docs-status completed
 * @libar-docs-projection
 *
 * @libar-docs-uses EventBusAbstraction
 * @libar-docs-used-by CommandOrchestrator, Projections, DCBRetry
 * @libar-docs-usecase "When creating partition keys for Workpool-based event processing"
 *
 * ## Partition Key Helper Functions
 *
 * Standardized partition key generation for per-entity event ordering
 * and OCC prevention in Workpool-based processing.
 *
 * ### Quick Reference
 *
 * | Helper | Key Format | Use Case |
 * |--------|------------|----------|
 * | createEntityPartitionKey | `{streamType}:{entityId}` | Per-entity projections |
 * | createCustomerPartitionKey | `{customerId}` | Customer-scoped aggregations |
 * | createSagaPartitionKey | `{correlationId}` | Cross-context projections |
 * | GLOBAL_PARTITION_KEY | `global` | Global rollups |
 * | createDCBPartitionKey | `{scopeKey}` | DCB retry serialization |
 *
 * @example
 * ```typescript
 * import {
 *   createEntityPartitionKey,
 *   GLOBAL_PARTITION_KEY,
 * } from "@libar-dev/platform-core/workpool/partitioning";
 *
 * // Entity projection
 * getPartitionKey: createEntityPartitionKey("Order"),
 *
 * // Global rollup
 * getPartitionKey: () => GLOBAL_PARTITION_KEY,
 * ```
 */

import type { PartitionKey } from "../../eventbus/types.js";
import type {
  PartitionKeyExtractor,
  EntityPartitionArgs,
  CustomerPartitionArgs,
  SagaPartitionArgs,
} from "./types.js";

/**
 * Global partition key constant for rollup projections.
 *
 * All events with this key serialize to a single worker.
 * Use for projections that aggregate across all entities (dailySales, globalMetrics).
 *
 * **Alternative:** Use a dedicated Workpool with `maxParallelism: 1` for
 * dedicated low-throughput global processing.
 *
 * @example
 * ```typescript
 * projection: {
 *   projectionName: "dailySalesSummary",
 *   getPartitionKey: () => GLOBAL_PARTITION_KEY,
 * }
 * ```
 */
export const GLOBAL_PARTITION_KEY: PartitionKey = {
  name: "global",
  value: "global",
};

/**
 * Create a partition key extractor for entity-scoped projections.
 *
 * Uses streamId format: `${streamType}:${entityId}` for consistent
 * partition keys across all entity projections.
 *
 * **Behavior:**
 * - Tries entity ID fields in order: streamId, orderId, productId, reservationId
 * - Throws if no entity ID field is found
 *
 * @param streamType - The stream type (e.g., "Order", "Product", "Reservation")
 * @returns Partition key extractor function
 *
 * @example
 * ```typescript
 * // Order projection
 * getPartitionKey: createEntityPartitionKey("Order")
 * // Returns: { name: "streamId", value: "Order:ord-123" }
 *
 * // Product projection
 * getPartitionKey: createEntityPartitionKey("Product")
 * // Returns: { name: "streamId", value: "Product:prod-456" }
 * ```
 */
export function createEntityPartitionKey(
  streamType: string
): PartitionKeyExtractor<EntityPartitionArgs> {
  return (args: EntityPartitionArgs): PartitionKey => {
    // Try common entity ID field names in priority order
    const entityId = args.streamId ?? args.orderId ?? args.productId ?? args.reservationId;

    if (!entityId) {
      throw new Error(
        `Entity partition key requires streamId, orderId, productId, or reservationId. ` +
          `Received args with keys: ${JSON.stringify(Object.keys(args))}`
      );
    }

    return {
      name: "streamId",
      value: `${streamType}:${entityId}`,
    };
  };
}

/**
 * Create a partition key extractor for customer-scoped projections.
 *
 * Ensures all events affecting a customer's aggregate view process in FIFO
 * order for that customer, regardless of which entity generated the event.
 *
 * @returns Partition key extractor function
 *
 * @example
 * ```typescript
 * // Customer order history projection
 * getPartitionKey: createCustomerPartitionKey()
 * // Returns: { name: "customerId", value: "cust-123" }
 * ```
 *
 * @throws Error if customerId is missing from args
 */
export function createCustomerPartitionKey(): PartitionKeyExtractor<CustomerPartitionArgs> {
  return (args: CustomerPartitionArgs): PartitionKey => {
    if (!args.customerId) {
      throw new Error("Customer partition key requires customerId field in args");
    }

    return {
      name: "customerId",
      value: args.customerId,
    };
  };
}

/**
 * Create a partition key extractor for saga-scoped projections.
 *
 * Ensures events within a saga/workflow process in causal order across
 * all bounded contexts. Use for cross-context projections that join data
 * from multiple BCs coordinated by a saga.
 *
 * @returns Partition key extractor function
 *
 * @example
 * ```typescript
 * // Cross-context order with inventory projection
 * getPartitionKey: createSagaPartitionKey()
 * // Returns: { name: "correlationId", value: "corr-123" }
 * ```
 *
 * @throws Error if correlationId is missing from args
 */
export function createSagaPartitionKey(): PartitionKeyExtractor<SagaPartitionArgs> {
  return (args: SagaPartitionArgs): PartitionKey => {
    if (!args.correlationId) {
      throw new Error("Saga partition key requires correlationId field in args");
    }

    return {
      name: "correlationId",
      value: args.correlationId,
    };
  };
}

/**
 * Create a global partition key extractor.
 *
 * Returns the constant GLOBAL_PARTITION_KEY for all args.
 * Useful when you need a function that conforms to PartitionKeyExtractor
 * but always returns the global key.
 *
 * @returns Partition key extractor that always returns global key
 *
 * @example
 * ```typescript
 * getPartitionKey: createGlobalPartitionKey()
 * // Always returns: { name: "global", value: "global" }
 * ```
 */
export function createGlobalPartitionKey<TArgs = unknown>(): PartitionKeyExtractor<TArgs> {
  return (): PartitionKey => GLOBAL_PARTITION_KEY;
}

/**
 * Create a DCB-aligned partition key for retry operations.
 *
 * Derives partition key from DCB scope key for coherent retry serialization.
 * Ensures DCB retries serialize with new operations on the same scope,
 * preventing interleaving that could cause stale reads.
 *
 * @param scopeKey - The DCB scope key (e.g., "tenant:T:reservation:res-456")
 * @returns Partition key aligned with scope
 *
 * @example
 * ```typescript
 * const partitionKey = createDCBPartitionKey(scopeKey);
 * // Returns: { name: "dcb", value: "tenant:T:reservation:res-456" }
 *
 * // Use with withDCBRetry
 * const handler = withDCBRetry(ctx, {
 *   scopeKey,
 *   getRetryPartitionKey: () => createDCBPartitionKey(scopeKey),
 * });
 * ```
 */
export function createDCBPartitionKey(scopeKey: string): PartitionKey {
  return {
    name: "dcb",
    value: scopeKey,
  };
}
