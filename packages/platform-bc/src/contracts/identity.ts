/**
 * @libar-docs
 * @libar-docs-pattern BoundedContextIdentity
 * @libar-docs-status completed
 * @libar-docs-ddd
 * @libar-docs-deliverable BoundedContextFoundation:bounded-context-identity
 *
 * ## Bounded Context Identity - Domain Metadata
 *
 * Core identification contract for bounded contexts, providing metadata
 * for documentation, debugging, event routing, and cross-BC integration.
 *
 * ### When to Use
 *
 * - Defining a new bounded context's core metadata (name, description, version)
 * - Configuring event stream type prefixes for Event Store routing
 * - Providing context identity for logging and debugging across BC boundaries
 */

/**
 * Identity of a bounded context within the domain.
 *
 * Every bounded context should have a unique identity that
 * identifies it in logs, events, and integrations.
 *
 * @example
 * ```typescript
 * const ordersIdentity: BoundedContextIdentity = {
 *   name: "orders",
 *   description: "Order management bounded context",
 *   version: 1,
 *   streamTypePrefix: "Order",
 * };
 * ```
 */
export interface BoundedContextIdentity {
  /**
   * Unique context name (lowercase, no spaces).
   * Used as identifier in logs, event routing, and integrations.
   *
   * @example "orders", "inventory", "shipping"
   */
  readonly name: string;

  /**
   * Human-readable description of the context's purpose.
   */
  readonly description: string;

  /**
   * Contract version for evolution tracking.
   * Increment when breaking changes are made to the public API.
   */
  readonly version: number;

  /**
   * Prefix used for event stream types in the Event Store.
   * All events from this context will have streams like `{prefix}:{entityId}`.
   *
   * @example "Order" produces streams like "Order:order_123"
   */
  readonly streamTypePrefix: string;
}
