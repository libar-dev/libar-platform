/**
 * Bounded Context Definitions
 *
 * Type definitions and helpers for bounded context components.
 */

export type { CMSTypeDefinition } from "./cms-definition.js";

// CMS Factory Pattern
export type { CMSFactory, CMSFactoryDefinition } from "./cms-factory.js";

// CMS Upcaster Contract
export type { CMSUpcasterFn, CMSUpcasterContract } from "./cms-upcaster.js";
export { defineUpcaster } from "./cms-upcaster.js";

// Command Definition
export type { CommandDefinition, CommandDefinitionRegistry } from "./command-definition.js";
export { defineCommand } from "./command-definition.js";

// Event Definition
export type {
  EventCategory,
  EventDefinition,
  EventDefinitionRegistry,
} from "./event-definition.js";
export { EVENT_CATEGORIES, isEventCategory, defineEvent } from "./event-definition.js";

// Projection Categories (Phase 15)
export type { ProjectionCategory } from "./categories.js";
export {
  PROJECTION_CATEGORIES,
  ProjectionCategorySchema,
  isProjectionCategory,
  isLogicProjection,
  isViewProjection,
  isReportingProjection,
  isIntegrationProjection,
  isClientExposed,
} from "./categories.js";

// Projection Definition
export type {
  ProjectionType,
  ProjectionDefinition,
  ProjectionDefinitionRegistry,
} from "./projection-definition.js";
export { PROJECTION_TYPES, isProjectionType, defineProjection } from "./projection-definition.js";

// Query Definition
export type {
  QueryResultType,
  QueryDefinition,
  QueryDefinitionRegistry,
} from "./query-definition.js";
export { QUERY_RESULT_TYPES, isQueryResultType, defineQuery } from "./query-definition.js";

// Process Manager Definition
export type {
  ProcessManagerTriggerType,
  ProcessManagerCronConfig,
  ProcessManagerCorrelationStrategy,
  ProcessManagerDefinition,
  ProcessManagerDefinitionRegistry,
} from "./process-manager-definition.js";
export {
  PROCESS_MANAGER_TRIGGER_TYPES,
  isProcessManagerTriggerType,
  defineProcessManager,
} from "./process-manager-definition.js";
