/**
 * Step Definitions Barrel File
 *
 * This file registers all step definitions with playwright-bdd.
 * Import this file in the test configuration to make all steps available.
 *
 * The steps are organized by domain:
 * - common.steps.ts: Navigation, waiting, and shared utilities
 * - dashboard.steps.ts: Dashboard-specific steps
 * - product.steps.ts: Product catalog and viewing steps
 * - order.steps.ts: Order creation, submission, and status steps
 * - admin.steps.ts: Admin-specific steps (create product, add stock)
 */

// Re-export all step definitions to ensure they are registered
export * from "./common.steps";
export * from "./dashboard.steps";
export * from "./product.steps";
export * from "./order.steps";
export * from "./admin.steps";
