/**
 * @libar-dev/platform-core
 *
 * Core types, schemas, and utilities for Convex Event Sourcing.
 */

// Core type aliases
export * from "./types.js";

// Re-export all modules
export * from "./events/index.js";
export * from "./commands/index.js";
export * from "./ids/index.js";
export * from "./cms/index.js";
export * from "./projections/index.js";
export * from "./orchestration/index.js";
export * from "./correlation/index.js";
export * from "./eventbus/index.js";
export * from "./integration/index.js";
export * from "./registry/index.js";
export * from "./middleware/index.js";
export * from "./batch/index.js";
export * from "./handlers/index.js";
export * from "./invariants/index.js";
export * from "./testing/index.js";
export * from "./repository/index.js";
export * from "./queries/index.js";
export * from "./processManager/index.js";
export * from "./logging/index.js";
export * from "./fsm/index.js";
export * from "./decider/index.js";
export * from "./function-refs/index.js";

// Roadmap Patterns (Phases 16, 18, 20, 22)
export * from "./dcb/index.js";
export * from "./monitoring/index.js";
export * from "./ecst/index.js";
export * from "./reservations/index.js";
export * from "./agent/index.js";
export * from "./workpool/index.js";
export * from "./durability/index.js";
