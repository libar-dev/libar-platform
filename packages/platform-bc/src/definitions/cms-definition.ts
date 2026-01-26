/**
 * CMS Type Definition
 *
 * Metadata about CMS (Command Model State) tables in a bounded context.
 */

/**
 * Definition of a CMS table for documentation and introspection.
 *
 * @example
 * ```typescript
 * const orderCMSDefinition: CMSTypeDefinition = {
 *   tableName: "orderCMS",
 *   currentStateVersion: 2,
 *   description: "Order aggregate state with items and status",
 * };
 * ```
 */
export interface CMSTypeDefinition {
  /**
   * The Convex table name where CMS records are stored.
   */
  readonly tableName: string;

  /**
   * Current schema version (stateVersion) for this CMS.
   * Used by upcasters to determine if migration is needed.
   */
  readonly currentStateVersion: number;

  /**
   * Human-readable description of what this CMS represents.
   */
  readonly description: string;
}
