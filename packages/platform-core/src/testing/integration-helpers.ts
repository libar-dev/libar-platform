/**
 * Type-Safe Integration Test Helpers
 *
 * Centralized wrappers for ConvexTestingHelper to bypass TypeScript depth limits.
 * Use these helpers instead of direct t.mutation()/t.query()/t.action() calls.
 *
 * ## Why Wrappers?
 *
 * ConvexTestingHelper's generic overloads can't deeply resolve component function
 * signatures from the generated API, causing TS2589 "Type instantiation is
 * excessively deep" errors. These wrappers use explicit casting through a minimal
 * interface rather than `any` to maintain type safety at boundaries.
 *
 * @module @libar-dev/platform-core/testing
 */

import type { ConvexTestingHelper } from "convex-helpers/testing";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

/**
 * Minimal interface for ConvexTestingHelper methods.
 * We cast through this to avoid TS2589 while being explicit about our intent.
 * The unknown types force explicit casts at call sites, making type boundaries visible.
 */
interface TestableConvexHelper {
  mutation(fn: unknown, args: unknown): Promise<unknown>;
  query(fn: unknown, args: unknown): Promise<unknown>;
  action(fn: unknown, args: unknown): Promise<unknown>;
}

/**
 * Type-safe wrapper for ConvexTestingHelper.mutation.
 *
 * Use this instead of direct t.mutation() in integration tests to avoid
 * TypeScript depth limit errors with generated API types.
 *
 * @param t - ConvexTestingHelper instance
 * @param mutation - Mutation function reference from generated API
 * @param args - Arguments for the mutation
 * @returns Promise with the mutation result
 *
 * @example
 * ```typescript
 * import { api } from "../convex/_generated/api";
 * import { testMutation } from "@libar-dev/platform-core/testing";
 *
 * const result = await testMutation(t, api.orders.createOrder, {
 *   orderId: "ord_123",
 *   customerId: "cust_456"
 * });
 * ```
 */
export async function testMutation<Mutation extends FunctionReference<"mutation">>(
  t: ConvexTestingHelper,
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.mutation(mutation, args)) as FunctionReturnType<Mutation>;
}

/**
 * Type-safe wrapper for ConvexTestingHelper.query.
 *
 * Use this instead of direct t.query() in integration tests to avoid
 * TypeScript depth limit errors with generated API types.
 *
 * @param t - ConvexTestingHelper instance
 * @param query - Query function reference from generated API
 * @param args - Arguments for the query
 * @returns Promise with the query result
 *
 * @example
 * ```typescript
 * import { api } from "../convex/_generated/api";
 * import { testQuery } from "@libar-dev/platform-core/testing";
 *
 * const order = await testQuery(t, api.orders.getOrderSummary, {
 *   orderId: "ord_123"
 * });
 * ```
 */
export async function testQuery<Query extends FunctionReference<"query">>(
  t: ConvexTestingHelper,
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.query(query, args)) as FunctionReturnType<Query>;
}

/**
 * Type-safe wrapper for ConvexTestingHelper.action.
 *
 * Use this instead of direct t.action() in integration tests to avoid
 * TypeScript depth limit errors with generated API types.
 *
 * @param t - ConvexTestingHelper instance
 * @param action - Action function reference from generated API
 * @param args - Arguments for the action
 * @returns Promise with the action result
 *
 * @example
 * ```typescript
 * import { api } from "../convex/_generated/api";
 * import { testAction } from "@libar-dev/platform-core/testing";
 *
 * const result = await testAction(t, api.actions.sendNotification, {
 *   userId: "user_123",
 *   message: "Hello!"
 * });
 * ```
 */
export async function testAction<Action extends FunctionReference<"action">>(
  t: ConvexTestingHelper,
  action: Action,
  args: FunctionArgs<Action>
): Promise<FunctionReturnType<Action>> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.action(action, args)) as FunctionReturnType<Action>;
}

/**
 * Type-safe wrapper for ConvexTestingHelper.mutation for internal mutations.
 *
 * Use this for testing internal mutations directly in integration tests.
 * Internal mutations are typically used for infrastructure operations
 * that shouldn't be exposed in the public API.
 *
 * @param t - ConvexTestingHelper instance
 * @param mutation - Internal mutation function reference from generated API
 * @param args - Arguments for the mutation
 * @returns Promise with the mutation result
 *
 * @example
 * ```typescript
 * import { internal } from "../convex/_generated/api";
 * import { testInternalMutation } from "@libar-dev/platform-core/testing";
 *
 * const result = await testInternalMutation(
 *   t,
 *   internal.contexts.agent.tools.approval.recordPendingApproval,
 *   { approvalId: "apr_123", ... }
 * );
 * ```
 */
export async function testInternalMutation<Mutation extends FunctionReference<"mutation", "internal">>(
  t: ConvexTestingHelper,
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.mutation(mutation, args)) as FunctionReturnType<Mutation>;
}
