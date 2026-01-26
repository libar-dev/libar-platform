/**
 * Idempotent Append Test Mutations
 *
 * Test mutations for validating idempotent event append with real Event Store.
 * These are public mutations/queries used only by integration tests.
 *
 * NOTE: Must be public (not internal) because integration tests call them
 * via the external Convex client, which can only access public functions.
 *
 * @since Phase 18b - EventStoreDurability
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { ensureTestEnvironment, idempotentAppendEvent } from "@libar-dev/platform-core";
import type { SafeQueryRef, SafeMutationRef } from "@libar-dev/platform-core";
import { makeFunctionReference } from "convex/server";

// =============================================================================
// Event Store Component References (TS2589 Prevention)
// =============================================================================

const getByIdempotencyKeyRef = makeFunctionReference<"query">(
  "component:eventStore:lib:getByIdempotencyKey"
) as SafeQueryRef;

const appendToStreamRef = makeFunctionReference<"mutation">(
  "component:eventStore:lib:appendToStream"
) as SafeMutationRef;

// =============================================================================
// Idempotent Append Test Mutations
// =============================================================================

/**
 * Test idempotent append with unique key.
 *
 * Appends an event using idempotentAppendEvent and returns the result.
 */
export const testIdempotentAppend = mutation({
  args: {
    idempotencyKey: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    eventType: v.string(),
    eventData: v.any(),
    boundedContext: v.string(),
    correlationId: v.optional(v.string()),
    expectedVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const {
      idempotencyKey,
      streamType,
      streamId,
      eventType,
      eventData,
      boundedContext,
      correlationId,
      expectedVersion,
    } = args;

    // Use the real Event Store component via idempotentAppendEvent
    const result = await idempotentAppendEvent(
      {
        runQuery: async <T>(_ref: SafeQueryRef, queryArgs: Record<string, unknown>): Promise<T> => {
          return (await ctx.runQuery(
            components.eventStore.lib.getByIdempotencyKey,
            queryArgs as { idempotencyKey: string }
          )) as T;
        },
        runMutation: async <T>(
          _ref: SafeMutationRef,
          mutationArgs: Record<string, unknown>
        ): Promise<T> => {
          // Cast to the expected shape for appendToStream
          const args = mutationArgs as {
            streamType: string;
            streamId: string;
            expectedVersion: number;
            boundedContext: string;
            events: Array<{
              eventId: string;
              eventType: string;
              payload: unknown;
              metadata?: { correlationId: string; causationId?: string };
              idempotencyKey?: string;
            }>;
          };
          return (await ctx.runMutation(components.eventStore.lib.appendToStream, args)) as T;
        },
      },
      {
        event: {
          idempotencyKey,
          streamType,
          streamId,
          eventType,
          eventData,
          boundedContext,
          // Only include optional properties when defined (exactOptionalPropertyTypes)
          ...(correlationId !== undefined && { correlationId }),
          ...(expectedVersion !== undefined && { expectedVersion }),
        },
        dependencies: {
          getByIdempotencyKey: getByIdempotencyKeyRef,
          appendToStream: appendToStreamRef,
        },
      }
    );

    return result;
  },
});

/**
 * Query event by idempotency key.
 *
 * Directly queries the Event Store for an event with the given key.
 */
export const getEventByIdempotencyKey = query({
  args: {
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const event = await ctx.runQuery(components.eventStore.lib.getByIdempotencyKey, {
      idempotencyKey: args.idempotencyKey,
    });

    return event;
  },
});

/**
 * Read events from a stream.
 *
 * Used to verify events were correctly appended.
 */
export const readTestStream = query({
  args: {
    streamType: v.string(),
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const events = await ctx.runQuery(components.eventStore.lib.readStream, {
      streamType: args.streamType,
      streamId: args.streamId,
    });

    return events;
  },
});

/**
 * Get stream version.
 *
 * Used to set up OCC conflict scenarios.
 */
export const getTestStreamVersion = query({
  args: {
    streamType: v.string(),
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const version = await ctx.runQuery(components.eventStore.lib.getStreamVersion, {
      streamType: args.streamType,
      streamId: args.streamId,
    });

    return version;
  },
});

/**
 * Append event directly (without idempotency) to set up test scenarios.
 *
 * Used to create stream state before testing idempotent append.
 */
export const appendTestEvent = mutation({
  args: {
    streamType: v.string(),
    streamId: v.string(),
    eventType: v.string(),
    eventData: v.any(),
    boundedContext: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const {
      streamType,
      streamId,
      eventType,
      eventData,
      boundedContext,
      expectedVersion,
      idempotencyKey,
    } = args;

    const eventId = `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const result = await ctx.runMutation(components.eventStore.lib.appendToStream, {
      streamType,
      streamId,
      expectedVersion,
      boundedContext,
      events: [
        {
          eventId,
          eventType,
          payload: eventData,
          metadata: {
            correlationId: `corr_test_${Date.now()}`,
          },
          ...(idempotencyKey && { idempotencyKey }),
        },
      ],
    });

    return {
      result,
      eventId,
    };
  },
});
