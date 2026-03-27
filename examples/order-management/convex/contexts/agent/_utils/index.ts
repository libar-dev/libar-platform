/**
 * @architect
 * @architect-uses AgentAsBoundedContext
 * @architect-arch-role service
 * @architect-arch-context agent
 * @architect-arch-layer domain
 *
 * Agent BC Utility Functions
 *
 * Shared utilities for agent bounded context operations.
 *
 * @module contexts/agent/utils
 */

export { extractCustomerId, groupEventsByCustomer } from "./customer.js";
export { calculateChurnConfidence, countRecentEvents, buildChurnReason } from "./confidence.js";
