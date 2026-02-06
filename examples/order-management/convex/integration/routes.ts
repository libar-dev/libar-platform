/**
 * @libar-docs
 * @libar-docs-pattern IntegrationRoutes
 * @libar-docs-status completed
 * @libar-docs-infra
 * @libar-docs-arch-role infrastructure
 * @libar-docs-arch-layer infrastructure
 * @libar-docs-uses OrderCommandHandlers
 * @libar-docs-used-by OrderManagementInfrastructure
 *
 * Integration event routes. Translates internal domain events to integration
 * events for external consumers. Currently: OrderSubmitted -> OrderPlacedIntegration.
 */
import type { z } from "zod";
import { makeFunctionReference } from "convex/server";
import type { IntegrationEventRoute, SafeMutationRef } from "@libar-dev/platform-core";
import type { OrderPlacedIntegrationPayload } from "./events";
import type { OrderSubmittedPayloadSchema } from "../contexts/orders/domain/events";

// =============================================================================
// Handler References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 "Type instantiation is excessively
// deep" errors that occur when accessing nested paths like
// `internal.integration.handlers.onOrderPlaced`.
//
// The string path is resolved at runtime by Convex - same behavior as the
// generated api.js which also uses this approach internally.
//
// Type safety is maintained via:
// 1. The translator function's generic constraints at route definition
// 2. Convex's runtime validation layer (throws if path doesn't exist)
// @see docs/external/deep-research/TS2589-compact.md
// =============================================================================

const onOrderPlacedHandler = makeFunctionReference<"mutation">(
  "integration/handlers:onOrderPlaced"
) as SafeMutationRef;

/**
 * OrderSubmitted domain event payload shape.
 * Derived from the actual schema to ensure consistency.
 */
type OrderSubmittedPayload = z.infer<typeof OrderSubmittedPayloadSchema>;

/**
 * Route: OrderSubmitted → OrderPlacedIntegration
 *
 * When an order is submitted in the Orders context, publish a
 * minimal integration event for any interested subscribers.
 *
 * The translator strips out internal details and keeps only
 * the stable, public contract data.
 */
const orderSubmittedRoute: IntegrationEventRoute<
  OrderSubmittedPayload,
  OrderPlacedIntegrationPayload
> = {
  sourceEventType: "OrderSubmitted",
  targetEventType: "OrderPlacedIntegration",
  schemaVersion: 1,
  translator: (source) => ({
    orderId: source.payload.orderId,
    customerId: source.payload.customerId,
    items: source.payload.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    totalAmount: source.payload.totalAmount,
    placedAt: source.timestamp,
  }),
  handlers: [onOrderPlacedHandler],
};

/**
 * All integration routes for the application.
 *
 * Add new routes here as more cross-context integrations are needed.
 */
export { orderSubmittedRoute };
export const integrationRoutes: IntegrationEventRoute<unknown, unknown>[] = [
  orderSubmittedRoute as IntegrationEventRoute<unknown, unknown>,
];
