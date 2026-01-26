/**
 * Test World - Shared Context for BDD Tests
 *
 * The World is shared across all steps within a single scenario.
 * It's reset between scenarios.
 *
 * Extends base interfaces from @libar-dev/platform-core/testing with
 * domain-specific fields for order management.
 */

import type { convexTest } from "convex-test";
import type { ConvexTestingHelper } from "convex-helpers/testing";
import {
  type BaseUnitTestWorld,
  type BaseIntegrationTestWorld,
  createBaseUnitTestWorld as platformCreateBaseUnitTestWorld,
  createBaseIntegrationTestWorld as platformCreateBaseIntegrationTestWorld,
} from "@libar-dev/platform-core/testing";

/**
 * Order item structure matching the schema.
 */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Order status union type.
 */
export type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";

/**
 * Domain-specific scenario context for order management tests.
 */
export interface OrderManagementScenario {
  orderId?: string;
  customerId?: string;
  items?: OrderItem[];
  commandId?: string;
}

/**
 * Test World for unit tests (convex-test mock backend).
 *
 * Extends the platform BaseUnitTestWorld with order management specific fields.
 */
export interface UnitTestWorld extends BaseUnitTestWorld {
  // Created order IDs for reference
  createdOrderIds: Set<string>;

  // Current scenario context with domain-specific fields
  scenario: OrderManagementScenario;
}

/**
 * Test World for integration tests (real backend).
 *
 * Extends the platform BaseIntegrationTestWorld with order management specific fields.
 */
export interface IntegrationTestWorld extends BaseIntegrationTestWorld {
  // Created order IDs for cleanup
  createdOrderIds: Set<string>;

  // Current scenario context with domain-specific fields
  scenario: OrderManagementScenario;
}

/**
 * Creates a fresh UnitTestWorld.
 */
export function createUnitTestWorld(t: ReturnType<typeof convexTest>): UnitTestWorld {
  const base = platformCreateBaseUnitTestWorld(t);
  return {
    ...base,
    createdOrderIds: new Set(),
    scenario: {},
  };
}

/**
 * Creates a fresh IntegrationTestWorld.
 */
export function createIntegrationTestWorld(t: ConvexTestingHelper): IntegrationTestWorld {
  const base = platformCreateBaseIntegrationTestWorld(t);
  return {
    ...base,
    createdOrderIds: new Set(),
    scenario: {},
  };
}
