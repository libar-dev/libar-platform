/**
 * CMS Upcaster Contract
 *
 * Contract interface for CMS lazy migration (upcasting).
 * Upcasters transform CMS from older schema versions to current version.
 *
 * This formalizes the `upcastXxxCMS()` pattern used in bounded contexts.
 *
 * @example
 * ```typescript
 * // Define the upcaster contract
 * export const orderCMSUpcaster = defineUpcaster<OrderCMS>({
 *   cmsType: "OrderCMS",
 *   currentVersion: CURRENT_ORDER_CMS_VERSION,
 *   minSupportedVersion: 1,
 *   upcast: upcastOrderCMS,
 *   description: "Migrates OrderCMS from v1+ to current",
 * });
 * ```
 */

/**
 * Upcaster function that transforms raw CMS data to current version.
 *
 * @template TCMS - The target CMS type (current version)
 *
 * @example
 * ```typescript
 * const upcastOrderCMS: CMSUpcasterFn<OrderCMS> = (raw) => {
 *   const state = raw as Record<string, unknown>;
 *   const version = state["stateVersion"] as number ?? 0;
 *
 *   if (version === CURRENT_ORDER_CMS_VERSION) {
 *     return raw as OrderCMS;
 *   }
 *
 *   // Migration logic here
 *   return { ...(raw as OrderCMS), stateVersion: CURRENT_ORDER_CMS_VERSION };
 * };
 * ```
 */
export type CMSUpcasterFn<TCMS> = (raw: unknown) => TCMS;

/**
 * Full upcaster contract with metadata and validation info.
 *
 * @template TCMS - The CMS type being upcasted
 */
export interface CMSUpcasterContract<TCMS> {
  /**
   * CMS type name for identification (e.g., "OrderCMS").
   */
  readonly cmsType: string;

  /**
   * Current target version (stateVersion in CMS).
   */
  readonly currentVersion: number;

  /**
   * Minimum supported version.
   * Versions older than this should throw an error.
   */
  readonly minSupportedVersion: number;

  /**
   * The upcast function that transforms raw data to current version.
   */
  readonly upcast: CMSUpcasterFn<TCMS>;

  /**
   * Optional description of the migration path.
   */
  readonly description?: string;
}

/**
 * Helper to create a type-safe upcaster contract.
 *
 * This is a simple identity function that provides better TypeScript inference,
 * preserving literal types for cmsType and description.
 *
 * @param config - Upcaster configuration
 * @returns The same configuration with all literal types preserved
 *
 * @example
 * ```typescript
 * const orderCMSUpcaster = defineUpcaster<OrderCMS>({
 *   cmsType: "OrderCMS",
 *   currentVersion: CURRENT_ORDER_CMS_VERSION,
 *   minSupportedVersion: 1,
 *   upcast: upcastOrderCMS,
 *   description: "Migrates OrderCMS from v1+ to current version",
 * });
 *
 * // orderCMSUpcaster.cmsType is "OrderCMS" (literal), not string
 * ```
 */
export function defineUpcaster<TCMS, const T extends CMSUpcasterContract<TCMS>>(config: T): T {
  return config;
}
