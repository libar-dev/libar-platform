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
export type { OrderConfirmedPayload } from "./orderNotification";

// PM executors
export { orderNotificationExecutor } from "./orderNotification";

// Handler mutations are exposed via internal.processManagers.orderNotification
// and registered via EventBus subscriptions
