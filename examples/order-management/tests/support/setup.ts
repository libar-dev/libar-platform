/**
 * Test Setup and Lifecycle Utilities
 *
 * Common setup/teardown patterns for both unit and integration tests.
 *
 * This file handles registration of all Convex components required for testing.
 */

/// <reference types="vite/client" />

// Import global type augmentation for __CONVEX_TEST_MODE__
import type {} from "../../convex/types/globals";

// Set global test mode flag for CommandOrchestrator to detect test environment.
// This is needed because process.env doesn't work in edge-runtime.
// Type safety provided by globals.d.ts in convex/types/
globalThis.__CONVEX_TEST_MODE__ = true;

import { convexTest } from "convex-test";
import schema from "../../convex/schema";

// Import component schemas using relative paths (workspace packages)
import ordersSchema from "../../convex/contexts/orders/schema";
import inventorySchema from "../../convex/contexts/inventory/schema";
// Use relative paths for workspace packages since they don't export schema
import commandBusSchema from "../../../../packages/platform-bus/src/component/schema";
import eventStoreSchema from "../../../../packages/platform-store/src/component/schema";
import agentBCSchema from "../../../../packages/platform-core/src/agent/component/schema";

// Import test helpers from @convex-dev packages
// Note: We use workpoolTest.schema but NOT workpoolTest.register() to avoid
// crons/main loop that cause "Write outside of transaction" errors in tests.
import workpoolTest from "@convex-dev/workpool/test";
import workflowTest from "@convex-dev/workflow/test";

// Import convex modules for the app
const appModules = import.meta.glob("../../convex/**/*.ts");

// Import component modules using relative paths
const ordersModules = import.meta.glob("../../convex/contexts/orders/**/*.ts");
const inventoryModules = import.meta.glob("../../convex/contexts/inventory/**/*.ts");
const commandBusModules = import.meta.glob(
  "../../../../packages/platform-bus/src/component/**/*.ts"
);
const eventStoreModules = import.meta.glob(
  "../../../../packages/platform-store/src/component/**/*.ts"
);
const agentBCModules = import.meta.glob(
  "../../../../packages/platform-core/src/agent/component/**/*.ts"
);

/**
 * Creates a fresh convex-test instance for unit tests with all components registered.
 * Uses mock backend for fast, isolated testing.
 */
export function createUnitTestContext() {
  const t = convexTest(schema, appModules);

  // Register local bounded context components
  t.registerComponent("orders", ordersSchema, ordersModules);
  t.registerComponent("inventory", inventorySchema, inventoryModules);

  // Register infrastructure components from @convex-es packages
  t.registerComponent("commandBus", commandBusSchema, commandBusModules);
  t.registerComponent("eventStore", eventStoreSchema, eventStoreModules);
  t.registerComponent("agentBC", agentBCSchema, agentBCModules);

  // Register @convex-dev components.
  // Note: infrastructure.ts uses no-op workpool when __CONVEX_TEST_MODE__ is set,
  // so projections won't trigger actual scheduling in tests.
  // We still register the components with filtered modules to avoid
  // crons/loop initialization that could cause unhandled errors.
  const workpoolModulesFiltered = Object.fromEntries(
    Object.entries(workpoolTest.modules).filter(
      ([path]) => !path.includes("crons") && !path.includes("loop")
    )
  );
  t.registerComponent("projectionPool", workpoolTest.schema, workpoolModulesFiltered);
  t.registerComponent("workpool", workpoolTest.schema, workpoolModulesFiltered);
  // Note: sagaPool removed - workflow uses its internal workpool for step execution
  workflowTest.register(t, "workflow");

  // Note: action-retrier doesn't have a test helper export,
  // so we skip registering it. Tests that need it should use integration tests.

  return t;
}

/**
 * Test context interface for step definitions.
 * Stores state between Given-When-Then steps.
 */
export interface TestContext {
  // Test instance (convex-test for unit, ConvexTestingHelper for integration)
  t: ReturnType<typeof convexTest> | unknown;

  // Last command/mutation result
  lastResult: unknown;

  // Last error caught (null if no error)
  lastError: Error | null;

  // Test data storage
  data: {
    orders: Map<string, { orderId: string; customerId: string }>;
    events: unknown[];
  };
}

/**
 * Creates a fresh test context for each scenario.
 */
export function createTestContext(): TestContext {
  return {
    t: null as unknown,
    lastResult: null,
    lastError: null,
    data: {
      orders: new Map(),
      events: [],
    },
  };
}

/**
 * Resets test context between scenarios.
 */
export function resetTestContext(ctx: TestContext): void {
  ctx.lastResult = null;
  ctx.lastError = null;
  ctx.data.orders.clear();
  ctx.data.events = [];
}
