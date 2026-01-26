/**
 * BDD Test World - Base Interfaces for Scenario State
 *
 * The "World" in BDD testing is the shared context across all steps within
 * a single scenario. It's reset between scenarios.
 *
 * This module provides generic base interfaces that domain-specific test
 * worlds can extend to add their own fields.
 *
 * @module @libar-dev/platform-core/testing
 */

declare const process: { env: Record<string, string | undefined> } | undefined;

import type { ConvexTestingHelper } from "convex-helpers/testing";

/**
 * Base test world interface for any test backend.
 *
 * @template TBackend - The test backend type (ConvexTest or ConvexTestingHelper)
 */
export interface BaseTestWorld<TBackend> {
  /** The test backend instance (mock or real) */
  t: TBackend;
  /** Result from the last operation (for Then assertions) */
  lastResult: unknown;
  /** Error from the last operation (null if succeeded) */
  lastError: Error | null;
  /** Scenario-specific context for passing data between steps */
  scenario: Record<string, unknown>;
}

/**
 * Type alias for convex-test return type.
 *
 * This is a generic interface that matches the convex-test API shape.
 * The actual type is inferred from `convex-test` when used.
 *
 * @example
 * ```typescript
 * import { convexTest } from "convex-test";
 * type MyConvexTest = ReturnType<typeof convexTest>;
 * ```
 */
export interface ConvexTest {
  /** Run a mutation in the test environment */
  mutation: (fn: unknown, args?: unknown) => Promise<unknown>;
  /** Run a query in the test environment */
  query: (fn: unknown, args?: unknown) => Promise<unknown>;
  /** Run an action in the test environment */
  action: (fn: unknown, args?: unknown) => Promise<unknown>;
  /** Schedule a function to run */
  run: (fn: unknown, args?: unknown) => Promise<unknown>;
  /** Clean up test resources */
  finishAllScheduledFunctions: () => Promise<void>;
}

/**
 * Base test world for unit tests (convex-test mock backend).
 *
 * Extend this interface to add domain-specific fields for your test world.
 *
 * @example
 * ```typescript
 * import { BaseUnitTestWorld, createBaseUnitTestWorld } from '@libar-dev/platform-core/testing';
 *
 * interface OrderUnitTestWorld extends BaseUnitTestWorld {
 *   scenario: {
 *     orderId?: string;
 *     customerId?: string;
 *   };
 * }
 * ```
 */
export type BaseUnitTestWorld = BaseTestWorld<ConvexTest>;

/**
 * Base test world for integration tests (real Convex backend).
 *
 * Extend this interface to add domain-specific fields for your test world.
 *
 * @example
 * ```typescript
 * import { BaseIntegrationTestWorld, createBaseIntegrationTestWorld } from '@libar-dev/platform-core/testing';
 *
 * interface OrderIntegrationTestWorld extends BaseIntegrationTestWorld {
 *   createdOrderIds: Set<string>;
 *   scenario: {
 *     orderId?: string;
 *     customerId?: string;
 *   };
 * }
 * ```
 */
export interface BaseIntegrationTestWorld extends BaseTestWorld<ConvexTestingHelper> {
  /** Backend URL for connection info */
  backendUrl: string;
}

/**
 * Create a fresh base unit test world.
 *
 * @param t - The convex-test instance
 * @returns A new BaseUnitTestWorld with empty scenario
 *
 * @example
 * ```typescript
 * import { convexTest } from "convex-test";
 * import { createBaseUnitTestWorld } from "@libar-dev/platform-core/testing";
 *
 * const t = convexTest(schema);
 * const world = createBaseUnitTestWorld(t);
 * ```
 */
export function createBaseUnitTestWorld(t: ConvexTest): BaseUnitTestWorld {
  return {
    t,
    lastResult: null,
    lastError: null,
    scenario: {},
  };
}

/**
 * Create a fresh base integration test world.
 *
 * @param t - The ConvexTestingHelper instance
 * @param backendUrl - Optional backend URL (defaults to CONVEX_URL env or localhost:3210)
 * @returns A new BaseIntegrationTestWorld with empty scenario
 *
 * @example
 * ```typescript
 * import { ConvexTestingHelper } from "convex-helpers/testing";
 * import { createBaseIntegrationTestWorld } from "@libar-dev/platform-core/testing";
 *
 * const t = new ConvexTestingHelper(backendUrl);
 * const world = createBaseIntegrationTestWorld(t);
 * ```
 */
export function createBaseIntegrationTestWorld(
  t: ConvexTestingHelper,
  backendUrl?: string
): BaseIntegrationTestWorld {
  const envUrl = typeof process !== "undefined" ? process?.env?.["CONVEX_URL"] : undefined;
  return {
    t,
    backendUrl: backendUrl ?? envUrl ?? "http://127.0.0.1:3210",
    lastResult: null,
    lastError: null,
    scenario: {},
  };
}

/**
 * Reset the world state between scenarios.
 *
 * Call this in BeforeEachScenario or AfterEachScenario hooks.
 *
 * @param world - The test world to reset
 *
 * @example
 * ```typescript
 * AfterEachScenario(() => {
 *   resetWorldState(world);
 * });
 * ```
 */
export function resetWorldState<T extends BaseTestWorld<unknown>>(world: T): void {
  world.lastResult = null;
  world.lastError = null;
  world.scenario = {};
}
