/**
 * Event data builder utilities.
 */
import { generateEventId } from "../ids/index.js";
import type { EventId, StreamId, CorrelationId, CausationId } from "../ids/branded.js";
import { toStreamId, toCorrelationId, toCausationId } from "../ids/branded.js";
import type { UnknownRecord } from "../types.js";

/**
 * Event data structure for creating new events to append to Event Store.
 *
 * This is the complete format needed for Event Store persistence.
 *
 * ## Related Types
 *
 * | Type          | Location               | Purpose                           |
 * |---------------|------------------------|-----------------------------------|
 * | `NewEventData`| events/builder.ts      | Event Store append (has boundedContext) |
 * | `EventData`   | orchestration/types.ts | Handler return type (minimal)     |
 *
 * ## Usage
 *
 * - Use `NewEventData` when building events for Event Store via `createEventData()`
 * - Use `EventData` in handler result types (`CommandHandlerSuccess`, `CommandHandlerFailed`)
 * - The orchestrator converts `EventData` to full Event Store format internally
 */
export interface NewEventData {
  /** Unique event identifier (branded type) */
  eventId: EventId;

  /** Type of the event (e.g., "OrderCreated") */
  eventType: string;

  /** Type of the aggregate/stream (e.g., "order") */
  streamType: string;

  /** Unique identifier of the aggregate/stream instance (branded type) */
  streamId: StreamId;

  /** The bounded context this event belongs to */
  boundedContext: string;

  /** The event payload data */
  payload: UnknownRecord;

  /** Event metadata for correlation and causation tracking */
  metadata: {
    /** ID to correlate related commands and events (branded type) */
    correlationId: CorrelationId;

    /** ID of the command that caused this event (branded type) */
    causationId: CausationId;
  };
}

/**
 * Input for creating event data.
 */
export interface CreateEventDataInput {
  /** Type of the event (e.g., "OrderCreated") */
  eventType: string;

  /** Type of the aggregate/stream (e.g., "order") */
  streamType: string;

  /** Unique identifier of the aggregate/stream instance */
  streamId: string;

  /** The bounded context this event belongs to */
  boundedContext: string;

  /** The event payload data */
  payload: UnknownRecord;

  /** ID to correlate related commands and events */
  correlationId: string;

  /** ID of the command that caused this event */
  causationId: string;
}

/**
 * Event factory function that creates properly formatted event data for the Event Store. Automatically
 * generates a unique eventId using UUID v7 format with the bounded context prefix.
 *
 * ### Event Structure
 *
 * | Field | Description |
 * |-------|-------------|
 * | `eventId` | Auto-generated: `{context}_event_{uuidv7}` |
 * | `eventType` | Event name (e.g., "OrderCreated") |
 * | `streamType` | Aggregate type (e.g., "order") |
 * | `streamId` | Aggregate instance ID |
 * | `metadata` | Correlation and causation tracking |
 *
 * ### Correlation Chain
 *
 * Events link to their causing command via `causationId`, enabling full
 * traceability from command → event → child events.
 *
 * @param input - The event data input
 * @returns Formatted event data ready for Event Store
 *
 * @example
 * ```typescript
 * const event = createEventData({
 *   eventType: "OrderCreated",
 *   streamType: "order",
 *   streamId: orderId,
 *   boundedContext: "orders",
 *   payload: { orderId, customerId },
 *   correlationId: args.correlationId,
 *   causationId: args.commandId,
 * });
 *
 * // Returns:
 * // {
 * //   eventId: "orders_event_0190a7c4-1234-...",
 * //   eventType: "OrderCreated",
 * //   streamType: "order",
 * //   streamId: "orders_order_...",
 * //   payload: { orderId, customerId },
 * //   metadata: { correlationId: "...", causationId: "..." }
 * // }
 * ```
 */
export function createEventData(input: CreateEventDataInput): NewEventData {
  return {
    eventId: generateEventId(input.boundedContext),
    eventType: input.eventType,
    streamType: input.streamType,
    streamId: toStreamId(input.streamId),
    boundedContext: input.boundedContext,
    payload: input.payload,
    metadata: {
      correlationId: toCorrelationId(input.correlationId),
      causationId: toCausationId(input.causationId),
    },
  };
}

/**
 * Creates event data with a pre-generated eventId.
 *
 * Use this when you need to generate the eventId before calling
 * this function (e.g., for logging or pre-allocation).
 *
 * @param eventId - Pre-generated event ID
 * @param input - The event data input (without eventId generation fields)
 * @returns Formatted event data ready for Event Store
 */
export function createEventDataWithId(
  eventId: EventId,
  input: Omit<CreateEventDataInput, "boundedContext"> & { boundedContext?: string }
): NewEventData {
  // Extract boundedContext from eventId if not provided
  const parts = eventId.split("_");
  const boundedContext = input.boundedContext ?? parts[0] ?? "unknown";

  return {
    eventId,
    eventType: input.eventType,
    streamType: input.streamType,
    streamId: toStreamId(input.streamId),
    boundedContext,
    payload: input.payload,
    metadata: {
      correlationId: toCorrelationId(input.correlationId),
      causationId: toCausationId(input.causationId),
    },
  };
}
