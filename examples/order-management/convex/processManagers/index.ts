/**
 * Process Manager module exports.
 *
 * Provides infrastructure for event-reactive coordination via process managers.
 * Process Managers react to events and emit commands (fire-and-forget).
 *
 * Distinct from Sagas which handle multi-step orchestration with compensation.
 */

// PM definitions
export { orderNotificationPM } from "./orderNotification";
export { reservationReleasePM } from "./reservationRelease";
export type { OrderConfirmedPayload } from "./orderNotification";
export type { OrderCancelledPayload } from "./reservationRelease";

// PM executors
export { orderNotificationExecutor } from "./orderNotification";
export { reservationReleaseExecutor } from "./reservationRelease";

// PM handler references for EventBus subscriptions
export { handleOrderCancelledRef } from "./reservationRelease";

// Handler mutations are exposed via internal.processManagers.*
// and registered via EventBus subscriptions
