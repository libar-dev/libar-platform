/**
 * Integration event module for cross-context communication.
 *
 * Implements the Published Language pattern from DDD:
 * - Translators convert domain events to minimal integration events
 * - IntegrationEventPublisher routes integration events to handlers
 */

// Types
export type {
  IntegrationEventMetadata,
  IntegrationEvent,
  SourceEventInfo,
  IntegrationEventTranslator,
  IntegrationEventRoute,
  IntegrationPublishResult,
  IIntegrationEventPublisher,
  IntegrationPublisherConfig,
} from "./types.js";

// Publisher
export {
  IntegrationEventPublisher,
  createIntegrationPublisher,
  IntegrationRouteBuilder,
  defineIntegrationRoute,
} from "./IntegrationEventPublisher.js";

// Errors
export {
  IntegrationRouteError,
  type IntegrationRouteErrorCode,
} from "./IntegrationEventPublisher.js";

// Roadmap Patterns (Phase 21)
export type {
  ContextRelationship,
  BoundedContextMetadata,
  IntegrationEventSchema,
  ACLTranslator,
} from "./patterns.js";
export {
  registerIntegrationEventSchema,
  validateIntegrationEvent,
  createACLTranslator,
} from "./patterns.js";
