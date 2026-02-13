/**
 * @libar-docs
 * @libar-docs-implements WorkpoolPartitioningStrategy
 * @libar-docs-status completed
 * @libar-docs-projection
 *
 * @libar-docs-uses EventBusAbstraction
 * @libar-docs-used-by CommandOrchestrator, Projections, DCBRetry
 * @libar-docs-usecase "When configuring partition keys for Workpool-based event processing"
 *
 * ## Workpool Partition Key Types
 *
 * Provides type definitions for partition key strategies that ensure
 * per-entity event ordering and prevent OCC conflicts.
 *
 * ### Key Concepts
 *
 * | Type | Purpose |
 * |------|---------|
 * | PartitionKey | Base type for partition key structure |
 * | PartitionStrategy | Category of partition approach |
 * | PartitionKeyExtractor | Function that generates partition keys from args |
 *
 * @see ADR-018 Workpool Partitioning Strategy
 */

// Re-export PartitionKey from eventbus for consistency
export type { PartitionKey } from "../../eventbus/types.js";

/**
 * Partition strategy categories for projections.
 *
 * | Strategy | Use Case | Partition Scope |
 * |----------|----------|-----------------|
 * | entity | Per-entity projections (orderSummary) | streamId |
 * | customer | Customer-scoped aggregations | customerId |
 * | saga | Cross-context projections | correlationId |
 * | global | Global rollups (dailySales) | Single key |
 */
export type PartitionStrategy = "entity" | "customer" | "saga" | "global";

/**
 * Partition key extractor function signature.
 *
 * Generic over the args type to support different command arg shapes.
 * Returns a PartitionKey with name and value for Workpool routing.
 *
 * @template TArgs - The argument type passed to the extractor
 *
 * @example
 * ```typescript
 * const extractor: PartitionKeyExtractor<{ orderId: string }> =
 *   (args) => ({ name: "streamId", value: `Order:${args.orderId}` });
 * ```
 */
export type PartitionKeyExtractor<TArgs = Record<string, unknown>> = (args: TArgs) => {
  name: string;
  value: string;
};

/**
 * Entity partition key args - must have at least one entity identifier.
 *
 * The extractor tries fields in order: streamId, orderId, productId, reservationId.
 */
export interface EntityPartitionArgs {
  /** Explicit stream ID (highest priority) */
  streamId?: string;
  /** Order entity ID */
  orderId?: string;
  /** Product entity ID */
  productId?: string;
  /** Reservation entity ID */
  reservationId?: string;
  /** Allow additional fields */
  [key: string]: unknown;
}

/**
 * Customer partition key args - requires customerId.
 */
export interface CustomerPartitionArgs {
  /** Customer identifier (required) */
  customerId: string;
  /** Allow additional fields */
  [key: string]: unknown;
}

/**
 * Saga partition key args - requires correlationId.
 */
export interface SagaPartitionArgs {
  /** Correlation ID for saga/workflow tracking (required) */
  correlationId: string;
  /** Allow additional fields */
  [key: string]: unknown;
}
