/**
 * TypeScript contracts for Convex DDD/ES bounded contexts.
 *
 * This package provides type-safe contracts for defining bounded contexts
 * without any Convex runtime dependency. It's purely for TypeScript
 * type definitions and documentation.
 *
 * @example
 * ```typescript
 * import type {
 *   DualWriteContextContract,
 *   BoundedContextIdentity,
 *   CMSTypeDefinition,
 *   CMSFactory,
 *   CommandDefinition,
 *   EventDefinition,
 * } from "@libar-dev/platform-bc";
 * import { defineCommand, defineEvent, defineUpcaster } from "@libar-dev/platform-bc";
 *
 * // Define your bounded context contract
 * export const OrdersContextContract = {
 *   identity: {
 *     name: "orders",
 *     description: "Order management bounded context",
 *     version: 1,
 *     streamTypePrefix: "Order",
 *   },
 *   executionMode: "dual-write",
 *   commandTypes: ["CreateOrder", "SubmitOrder"] as const,
 *   eventTypes: ["OrderCreated", "OrderSubmitted"] as const,
 *   cmsTypes: {
 *     orderCMS: {
 *       tableName: "orderCMS",
 *       currentStateVersion: 1,
 *       description: "Order aggregate state",
 *     },
 *   },
 *   errorCodes: ["ORDER_NOT_FOUND"],
 * } as const satisfies DualWriteContextContract<
 *   readonly ["CreateOrder", "SubmitOrder"],
 *   readonly ["OrderCreated", "OrderSubmitted"],
 *   { orderCMS: CMSTypeDefinition }
 * >;
 *
 * // Define command metadata
 * const CreateOrderDef = defineCommand({
 *   commandType: "CreateOrder",
 *   description: "Creates a new order",
 *   targetAggregate: "Order",
 *   createsAggregate: true,
 *   producesEvents: ["OrderCreated"],
 * });
 * ```
 */

// Re-export all contracts
export type {
  BoundedContextIdentity,
  DualWriteContextContract,
  ExtractCommandTypes,
  ExtractEventTypes,
  ExtractCMSTableNames,
} from "./contracts/index.js";

// Re-export all definitions - types
export type {
  CMSTypeDefinition,
  CMSFactory,
  CMSFactoryDefinition,
  CMSUpcasterFn,
  CMSUpcasterContract,
  CommandDefinition,
  CommandDefinitionRegistry,
  EventCategory,
  EventDefinition,
  EventDefinitionRegistry,
  ProjectionCategory,
  ProjectionType,
  ProjectionDefinition,
  ProjectionDefinitionRegistry,
  QueryResultType,
  QueryDefinition,
  QueryDefinitionRegistry,
  ProcessManagerTriggerType,
  ProcessManagerCronConfig,
  ProcessManagerCorrelationStrategy,
  ProcessManagerDefinition,
  ProcessManagerDefinitionRegistry,
} from "./definitions/index.js";

// Re-export all definitions - helper functions and constants
export {
  defineUpcaster,
  defineCommand,
  defineEvent,
  defineProjection,
  defineQuery,
  defineProcessManager,
  EVENT_CATEGORIES,
  isEventCategory,
  PROJECTION_CATEGORIES,
  ProjectionCategorySchema,
  isProjectionCategory,
  isLogicProjection,
  isViewProjection,
  isReportingProjection,
  isIntegrationProjection,
  isClientExposed,
  PROJECTION_TYPES,
  isProjectionType,
  QUERY_RESULT_TYPES,
  isQueryResultType,
  PROCESS_MANAGER_TRIGGER_TYPES,
  isProcessManagerTriggerType,
} from "./definitions/index.js";
