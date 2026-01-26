/**
 * Saga module exports.
 *
 * Provides infrastructure for cross-context coordination via sagas.
 */

// Event definitions
export { inventoryReservedPayload, INVENTORY_RESERVED_EVENT } from "./events";

// Saga types
export type { OrderFulfillmentArgs, OrderFulfillmentResult } from "./orderFulfillment";
export { SAGA_TYPE as ORDER_FULFILLMENT_SAGA } from "./orderFulfillment";

// Router is exposed via internal.sagas.router
// Registry is exposed via internal.sagas.registry
