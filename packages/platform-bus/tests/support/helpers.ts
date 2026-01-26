/**
 * Test Support Helpers for Command Bus Integration Tests
 *
 * Provides test isolation through unique command ID prefixes per test run.
 * This eliminates the need for database cleanup between tests.
 *
 * @libar-docs-pattern CommandBusIdempotency
 */

import { ConvexTestingHelper } from "convex-helpers/testing";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

/**
 * Minimal interface for ConvexTestingHelper methods.
 * We cast through this to avoid TS2589 while being explicit about our intent.
 */
interface TestableConvexHelper {
  mutation(fn: unknown, args: unknown): Promise<unknown>;
  query(fn: unknown, args: unknown): Promise<unknown>;
}

/**
 * Unique identifier for this test run.
 * Used as prefix for all command IDs to ensure test isolation.
 */
export const testRunId = `r${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(-2)}`;

/**
 * Add the test run prefix to an ID for isolation.
 */
export function withPrefix(id: string): string {
  return `${testRunId}_${id}`;
}

/**
 * Generate a unique command ID with test run prefix.
 */
export function generateCommandId(suffix: string = ""): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return withPrefix(`cmd_${suffix ? suffix + "_" : ""}${timestamp}_${random}`);
}

/**
 * Generate a unique correlation ID with test run prefix.
 */
export function generateCorrelationId(): string {
  return withPrefix(`corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
}

/**
 * Type-safe wrapper for ConvexTestingHelper.mutation.
 * Works around TypeScript depth limits with generated API types.
 * Accepts any visibility (public, internal, etc.) for component APIs.
 */
export async function testMutation<
  Mutation extends FunctionReference<"mutation", "public" | "internal">,
>(
  t: ConvexTestingHelper,
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.mutation(mutation, args)) as FunctionReturnType<Mutation>;
}

/**
 * Type-safe wrapper for ConvexTestingHelper.query.
 * Works around TypeScript depth limits with generated API types.
 * Accepts any visibility (public, internal, etc.) for component APIs.
 */
export async function testQuery<Query extends FunctionReference<"query", "public" | "internal">>(
  t: ConvexTestingHelper,
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  const helper = t as unknown as TestableConvexHelper;
  return (await helper.query(query, args)) as FunctionReturnType<Query>;
}

/**
 * Wait for a condition with timeout.
 */
export async function waitUntil<T>(
  check: () => Promise<T>,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    message?: string;
  } = {}
): Promise<T> {
  const { timeoutMs = 30000, pollIntervalMs = 100, message = "condition" } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await check();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timeout waiting for ${message} after ${timeoutMs}ms`);
}
