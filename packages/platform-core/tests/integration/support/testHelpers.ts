/**
 * Type-Safe Integration Test Helpers
 *
 * Centralized wrappers for ConvexTestingHelper to bypass TypeScript depth limits.
 * Use these helpers instead of direct t.mutation()/t.query()/t.action() calls.
 *
 * Background: ConvexTestingHelper's generic overloads can't deeply resolve
 * component function signatures from the generated API, causing TS2589 errors.
 * These wrappers centralize the type suppression to a single location.
 */

import type { ConvexTestingHelper } from "convex-helpers/testing";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

/**
 * Type-safe wrapper for ConvexTestingHelper.mutation to bypass TS depth limits.
 * Use this instead of direct t.mutation() in integration tests.
 *
 * @example
 * const result = await testMutation(t, api.orders.createOrder, { orderId, customerId });
 */
export async function testMutation<Mutation extends FunctionReference<"mutation">>(
  t: ConvexTestingHelper,
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  // @ts-expect-error - ConvexTestingHelper type depth issues with generated API
  return await t.mutation(mutation, args);
}

/**
 * Type-safe wrapper for ConvexTestingHelper.query to bypass TS depth limits.
 * Use this instead of direct t.query() in integration tests.
 *
 * @example
 * const order = await testQuery(t, api.orders.getOrderSummary, { orderId });
 */
export async function testQuery<Query extends FunctionReference<"query">>(
  t: ConvexTestingHelper,
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  // @ts-expect-error - ConvexTestingHelper type depth issues with generated API
  return await t.query(query, args);
}

/**
 * Type-safe wrapper for ConvexTestingHelper.action to bypass TS depth limits.
 * Use this instead of direct t.action() in integration tests.
 *
 * @example
 * const result = await testAction(t, api.actions.sendNotification, { userId, message });
 */
export async function testAction<Action extends FunctionReference<"action">>(
  t: ConvexTestingHelper,
  action: Action,
  args: FunctionArgs<Action>
): Promise<FunctionReturnType<Action>> {
  // @ts-expect-error - ConvexTestingHelper type depth issues with generated API
  return await t.action(action, args);
}
