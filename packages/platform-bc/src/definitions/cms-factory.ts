/**
 * CMS Factory Pattern
 *
 * Types for factories that create initial CMS (Command Model State).
 * Formalizes the `createInitialXxxCMS()` pattern used in bounded contexts.
 *
 * @example
 * ```typescript
 * // Type the factory function
 * type OrderCMSFactory = CMSFactory<
 *   { orderId: string; customerId: string },
 *   OrderCMS
 * >;
 *
 * // Implement the factory
 * export const createInitialOrderCMS: OrderCMSFactory = (args) => ({
 *   orderId: args.orderId,
 *   customerId: args.customerId,
 *   status: "draft",
 *   items: [],
 *   totalAmount: 0,
 *   version: 0,
 *   stateVersion: CURRENT_ORDER_CMS_VERSION,
 *   createdAt: Date.now(),
 *   updatedAt: Date.now(),
 * });
 * ```
 */

/**
 * Factory function type for creating initial CMS state.
 *
 * @template TArgs - The arguments required to create initial state (must be an object)
 * @template TCMS - The CMS type being created (must be an object)
 */
export type CMSFactory<TArgs extends object, TCMS extends object> = (args: TArgs) => TCMS;

/**
 * Configuration for defining a CMS factory with metadata.
 *
 * Use this when you want to document the factory alongside its implementation.
 *
 * @template TArgs - Factory argument type (must be an object)
 * @template TCMS - CMS type produced (must be an object)
 *
 * @example
 * ```typescript
 * const orderCMSFactoryDef: CMSFactoryDefinition<
 *   { orderId: string; customerId: string },
 *   OrderCMS
 * > = {
 *   name: "createInitialOrderCMS",
 *   description: "Creates initial order in draft status",
 *   create: createInitialOrderCMS,
 *   producesVersion: CURRENT_ORDER_CMS_VERSION,
 * };
 * ```
 */
export interface CMSFactoryDefinition<TArgs extends object, TCMS extends object> {
  /**
   * Human-readable name for the factory (e.g., "createInitialOrderCMS").
   */
  readonly name: string;

  /**
   * Description of what CMS state this factory creates.
   */
  readonly description: string;

  /**
   * The factory function that creates initial CMS state.
   */
  readonly create: CMSFactory<TArgs, TCMS>;

  /**
   * Current CMS stateVersion this factory produces.
   * Should match CURRENT_XXX_CMS_VERSION constant.
   */
  readonly producesVersion: number;
}
