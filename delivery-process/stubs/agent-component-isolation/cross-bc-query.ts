/**
 * @target platform-core/src/agent/cross-bc-query.ts
 *
 * Cross-Component Query Types for Agent BC
 *
 * Defines the data shapes for argument injection pattern. The app-level
 * caller pre-loads projection data and passes it as handler arguments,
 * keeping the agent component truly isolated.
 *
 * @libar-docs
 * @libar-docs-status roadmap
 * @libar-docs-infra
 * @libar-docs-uses AgentBCConfig
 *
 * ## Cross-BC Query Pattern - Argument Injection
 *
 * Instead of the agent component reaching out to query app-level projections,
 * the app-level caller loads projection data and passes it in.
 *
 * @see PDR-010 (Cross-Component Argument Injection)
 * @see DESIGN-2026-005 AD-3 (historical)
 */

// ============================================================================
// Customer Cancellation History (from customerCancellations projection)
// ============================================================================

/**
 * A single cancellation record from the customerCancellations projection.
 */
export interface CancellationRecord {
  /** Order ID that was cancelled */
  readonly orderId: string;

  /** Event ID of the OrderCancelled event */
  readonly eventId: string;

  /** Global position for ordering */
  readonly globalPosition: number;

  /** Cancellation reason */
  readonly reason: string;

  /** When the cancellation occurred */
  readonly timestamp: number;
}

/**
 * Pre-loaded customer cancellation history from the app-level
 * `customerCancellations` projection.
 *
 * This data is loaded by the app-level subscription handler and
 * passed as an argument to the agent event handler, following
 * the argument injection pattern for cross-component data access.
 *
 * @example
 * ```typescript
 * // App-level code loads from projection:
 * const customerData = await ctx.db
 *   .query("customerCancellations")
 *   .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
 *   .first();
 *
 * // Then passes to agent handler:
 * const history: CustomerCancellationHistory = {
 *   customerId: customerData.customerId,
 *   cancellations: customerData.cancellations,
 *   cancellationCount: customerData.cancellationCount,
 * };
 * ```
 */
export interface CustomerCancellationHistory {
  /** Customer whose cancellation history this represents */
  readonly customerId: string;

  /** Cancellation records within the observation window */
  readonly cancellations: readonly CancellationRecord[];

  /** Total cancellation count (may exceed cancellations array length) */
  readonly cancellationCount: number;
}

// ============================================================================
// Injected Data Container
// ============================================================================

/**
 * Container for all external data injected into agent event handlers.
 *
 * As new cross-component data sources are needed, add optional fields here.
 * Each field represents data from an app-level projection that the agent
 * needs for pattern detection.
 *
 * @example
 * ```typescript
 * const injectedData: AgentEventHandlerInjectedData = {
 *   customerHistory: loadedFromProjection,
 * };
 * ```
 */
export interface AgentEventHandlerInjectedData {
  /**
   * Customer cancellation history from the `customerCancellations` projection.
   * Used by churn risk pattern detection.
   *
   * Undefined when:
   * - Customer has no cancellation history
   * - Projection data is not available (new customer)
   * - Pattern doesn't require cancellation history
   */
  readonly customerHistory?: CustomerCancellationHistory;
}
