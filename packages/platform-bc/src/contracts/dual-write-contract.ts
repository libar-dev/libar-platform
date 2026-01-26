/**
 * @libar-docs
 * @libar-docs-pattern DualWriteContract
 * @libar-docs-status completed
 * @libar-docs-core
 * @libar-docs-deliverable BoundedContextFoundation:dual-write-contract
 * @libar-docs-uses BoundedContextIdentity
 *
 * ## Dual-Write Contract - BC Type Declaration
 *
 * Type-safe contract for bounded contexts using the dual-write pattern,
 * declaring command types, event types, and CMS table definitions for
 * compile-time verification and documentation generation.
 *
 * ### When to Use
 *
 * - Declaring a bounded context's full type signature (commands, events, CMS)
 * - Enabling compile-time validation of command/event handlers
 * - Documenting BC capabilities for cross-team integration
 */
import type { BoundedContextIdentity } from "./identity.js";
import type { CMSTypeDefinition } from "../definitions/cms-definition.js";

/**
 * Contract for a dual-write bounded context.
 *
 * Dual-write contexts maintain CMS (Command Model State) alongside
 * events in the same transaction. This provides O(1) command execution
 * without event replay.
 *
 * @template TCommandTypes - Tuple of command type strings
 * @template TEventTypes - Tuple of event type strings
 * @template TCMSTypes - Record of CMS type definitions
 *
 * @example
 * ```typescript
 * import type { DualWriteContextContract, CMSTypeDefinition } from "@libar-dev/platform-bc";
 *
 * export const OrdersContextContract = {
 *   identity: {
 *     name: "orders",
 *     description: "Order management bounded context",
 *     version: 1,
 *     streamTypePrefix: "Order",
 *   },
 *   executionMode: "dual-write",
 *   commandTypes: ["CreateOrder", "AddItem", "SubmitOrder", "CancelOrder"] as const,
 *   eventTypes: ["OrderCreated", "ItemAdded", "OrderSubmitted", "OrderCancelled"] as const,
 *   cmsTypes: {
 *     orderCMS: {
 *       tableName: "orderCMS",
 *       currentStateVersion: 1,
 *       description: "Order aggregate state",
 *     },
 *   },
 *   errorCodes: ["ORDER_NOT_FOUND", "ORDER_ALREADY_EXISTS", "ORDER_NOT_IN_DRAFT"],
 * } as const satisfies DualWriteContextContract<
 *   readonly ["CreateOrder", "AddItem", "SubmitOrder", "CancelOrder"],
 *   readonly ["OrderCreated", "ItemAdded", "OrderSubmitted", "OrderCancelled"],
 *   { orderCMS: CMSTypeDefinition }
 * >;
 * ```
 */
export interface DualWriteContextContract<
  TCommandTypes extends readonly string[],
  TEventTypes extends readonly string[],
  TCMSTypes extends Record<string, CMSTypeDefinition>,
> {
  /**
   * Identity of the bounded context.
   */
  readonly identity: BoundedContextIdentity;

  /**
   * Execution mode - always "dual-write" for this contract type.
   * Future: "traditional-es" for rehydration-based contexts.
   */
  readonly executionMode: "dual-write";

  /**
   * List of command types this context handles.
   * Should match the actual command handler implementations.
   */
  readonly commandTypes: TCommandTypes;

  /**
   * List of event types this context produces.
   * Should match the actual event schemas defined.
   */
  readonly eventTypes: TEventTypes;

  /**
   * CMS table definitions for this context.
   * Each entry describes a CMS table and its current schema version.
   */
  readonly cmsTypes: TCMSTypes;

  /**
   * Error codes that this context's invariants can throw.
   * Used for documentation and client error handling.
   */
  readonly errorCodes: readonly string[];
}

/**
 * Type helper to extract command types from a contract.
 */
export type ExtractCommandTypes<
  T extends DualWriteContextContract<
    readonly string[],
    readonly string[],
    Record<string, CMSTypeDefinition>
  >,
> =
  T extends DualWriteContextContract<infer C, readonly string[], Record<string, CMSTypeDefinition>>
    ? C[number]
    : never;

/**
 * Type helper to extract event types from a contract.
 */
export type ExtractEventTypes<
  T extends DualWriteContextContract<
    readonly string[],
    readonly string[],
    Record<string, CMSTypeDefinition>
  >,
> =
  T extends DualWriteContextContract<readonly string[], infer E, Record<string, CMSTypeDefinition>>
    ? E[number]
    : never;

/**
 * Type helper to extract CMS table names from a contract.
 */
export type ExtractCMSTableNames<
  T extends DualWriteContextContract<
    readonly string[],
    readonly string[],
    Record<string, CMSTypeDefinition>
  >,
> =
  T extends DualWriteContextContract<readonly string[], readonly string[], infer C>
    ? keyof C
    : never;
