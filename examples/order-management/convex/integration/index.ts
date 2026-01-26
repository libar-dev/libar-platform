/**
 * Integration module barrel exports.
 *
 * This module provides:
 * - Integration event schemas (Published Language contracts)
 * - Integration event routes (domain → integration translation)
 * - Integration event handlers (subscriber implementations)
 */

// Event schemas
export {
  OrderPlacedIntegrationPayloadSchema,
  OrderPlacedIntegrationSchema,
  INTEGRATION_EVENT_TYPES,
  type OrderPlacedIntegrationPayload,
  type OrderPlacedIntegrationEvent,
  type IntegrationEventType,
} from "./events.js";

// Routes
export { orderSubmittedRoute, integrationRoutes } from "./routes.js";

// Handlers are internal mutations, not exported here
// Access via internal.integration.handlers.*
