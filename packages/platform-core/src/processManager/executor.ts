/**
 * Orchestrates PM event processing with idempotency, lifecycle management,
 * and command emission. This is the runtime component that executes PM handlers.
 *
 * The executor:
 * 1. Receives domain events from EventBus subscriptions
 * 2. Manages PM instance lifecycle (idle → processing → completed/failed)
 * 3. Invokes PM handler to generate commands
 * 4. Emits commands via Workpool for durability
 * 5. Tracks metrics and dead letters
 *
 * @example
 * ```typescript
 * import { createProcessManagerExecutor } from "@libar-dev/platform-core/processManager";
 *
 * // Create an executor for a specific PM
 * const executor = createProcessManagerExecutor({
 *   pmName: "orderNotification",
 *   eventSubscriptions: ["OrderConfirmed", "OrderShipped"],
 *   storage: {
 *     getPMState: async (ctx, pmName, instanceId) => ...,
 *     getOrCreatePMState: async (ctx, pmName, instanceId, initial) => ...,
 *     updatePMState: async (ctx, pmName, instanceId, updates) => ...,
 *     recordDeadLetter: async (ctx, pmName, instanceId, error, context) => ...,
 *   },
 *   commandEmitter: async (ctx, commands) => {
 *     for (const cmd of commands) {
 *       await workpool.enqueue(ctx, { fnArgs: cmd });
 *     }
 *   },
 *   handler: async (ctx, event, customState) => {
 *     // Return commands to emit based on the event
 *     return [{
 *       commandType: "SendNotification",
 *       payload: { orderId: event.streamId },
 *       correlationId: event.correlationId,
 *       causationId: event.eventId,
 *     }];
 *   },
 *   // Optional: customize how instance ID is derived from event
 *   instanceIdResolver: (event) => event.streamId,
 * });
 *
 * // Use in a mutation handler - instanceId is resolved internally
 * export const handleEvent = mutation({
 *   args: { event: v.object({...}) },
 *   handler: async (ctx, { event }) => {
 *     return executor.process(ctx, event);
 *   },
 * });
 * ```
 */

import {
  withPMCheckpoint,
  type PMCheckpointResult,
  type EmittedCommand,
  type WithPMCheckpointConfig,
} from "./withPMCheckpoint.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/**
 * Domain event structure for PM processing.
 */
export interface PMDomainEvent {
  /** Unique event ID */
  eventId: string;

  /** Event type (e.g., "OrderConfirmed") */
  eventType: string;

  /** Global position for ordering/idempotency */
  globalPosition: number;

  /** Correlation ID for tracing */
  correlationId: string;

  /** Stream type (e.g., "order") */
  streamType: string;

  /** Stream ID (e.g., order ID) */
  streamId: string;

  /** Event payload */
  payload: Record<string, unknown>;

  /** Event timestamp */
  timestamp: number;
}

/**
 * Storage callbacks for PM state management.
 * These abstract the underlying storage (Event Store component).
 */
export interface PMStorageCallbacks<TCtx> {
  /** Get existing PM state */
  getPMState: WithPMCheckpointConfig<TCtx>["getPMState"];

  /** Get or create PM state */
  getOrCreatePMState: WithPMCheckpointConfig<TCtx>["getOrCreatePMState"];

  /** Update PM state */
  updatePMState: WithPMCheckpointConfig<TCtx>["updatePMState"];

  /** Record dead letter */
  recordDeadLetter: WithPMCheckpointConfig<TCtx>["recordDeadLetter"];
}

/**
 * PM handler function type.
 *
 * Given an event and optional custom state, returns commands to emit.
 */
export type PMHandler<TCtx, TCustomState = Record<string, unknown>> = (
  ctx: TCtx,
  event: PMDomainEvent,
  customState?: TCustomState
) => Promise<EmittedCommand[]>;

/**
 * Instance ID resolver function.
 *
 * Given an event, returns the PM instance ID.
 * Common strategies:
 * - `event.streamId` - One PM instance per aggregate
 * - `event.correlationId` - One PM instance per correlation chain
 * - `${event.streamType}:${event.streamId}` - Namespaced by stream type
 */
export type InstanceIdResolver = (event: PMDomainEvent) => string;

/**
 * Configuration for creating a Process Manager executor.
 */
export interface ProcessManagerExecutorConfig<TCtx, TCustomState = Record<string, unknown>> {
  /** Process manager name (must match registry) */
  pmName: string;

  /** Event types this PM subscribes to */
  eventSubscriptions: readonly string[];

  /** Storage callbacks for PM state */
  storage: PMStorageCallbacks<TCtx>;

  /**
   * Command emission callback.
   * Typically enqueues commands to Workpool.
   */
  commandEmitter: (ctx: TCtx, commands: EmittedCommand[]) => Promise<void>;

  /**
   * PM handler function.
   * Given an event, returns commands to emit.
   */
  handler: PMHandler<TCtx, TCustomState>;

  /**
   * Instance ID resolver.
   * Determines which PM instance handles an event.
   * @default (event) => event.streamId
   */
  instanceIdResolver?: InstanceIdResolver;

  /**
   * Optional logger for executor-level logging.
   * Passed to withPMCheckpoint for PM execution tracing.
   *
   * Logging points:
   * - DEBUG: Event routing, not_subscribed skip
   * - INFO: Delegated to withPMCheckpoint
   * - WARN/ERROR: Delegated to withPMCheckpoint
   */
  logger?: Logger;
}

/**
 * Process Manager Executor instance.
 *
 * Provides methods to process events and query PM state.
 */
export interface ProcessManagerExecutor<TCtx> {
  /** Process manager name */
  readonly pmName: string;

  /** Event types this PM subscribes to */
  readonly eventSubscriptions: readonly string[];

  /**
   * Process an event.
   *
   * @param ctx - Mutation context
   * @param event - Domain event to process
   * @returns Processing result
   */
  process: (ctx: TCtx, event: PMDomainEvent) => Promise<PMCheckpointResult>;

  /**
   * Check if PM handles this event type.
   *
   * @param eventType - Event type to check
   * @returns true if PM subscribes to this event type
   */
  handles: (eventType: string) => boolean;
}

/**
 * Creates a Process Manager executor.
 *
 * The executor wraps your PM handler with:
 * - Idempotency via globalPosition checkpoint
 * - Lifecycle state management
 * - Command emission via callback
 * - Dead letter recording on failures
 *
 * @param config - Executor configuration
 * @returns Process Manager executor instance
 *
 * @example
 * ```typescript
 * const notificationExecutor = createProcessManagerExecutor({
 *   pmName: "orderNotification",
 *   eventSubscriptions: ["OrderConfirmed"],
 *   storage: {
 *     getPMState: async (ctx, pmName, instanceId) =>
 *       ctx.runQuery(components.eventStore.lib.getPMState, { pmName, instanceId }),
 *     getOrCreatePMState: async (ctx, pmName, instanceId, initial) =>
 *       ctx.runMutation(components.eventStore.lib.getOrCreatePMState, {
 *         pmName, instanceId, ...initial
 *       }),
 *     updatePMState: async (ctx, pmName, instanceId, updates) =>
 *       ctx.runMutation(components.eventStore.lib.updatePMState, {
 *         pmName, instanceId, ...updates
 *       }),
 *     recordDeadLetter: async (ctx, pmName, instanceId, error, context) =>
 *       ctx.runMutation(components.eventStore.lib.recordPMDeadLetter, {
 *         pmName, instanceId, error, ...context
 *       }),
 *   },
 *   commandEmitter: async (ctx, commands) => {
 *     for (const cmd of commands) {
 *       await workpool.enqueue(ctx, {
 *         fnArgs: {
 *           commandType: cmd.commandType,
 *           payload: cmd.payload,
 *           correlationId: cmd.correlationId,
 *           causationId: cmd.causationId,
 *         },
 *         options: {
 *           partitionKey: cmd.partitionKey,
 *           context: { source: `pm:orderNotification` },
 *         },
 *       });
 *     }
 *   },
 *   handler: async (ctx, event) => {
 *     const { orderId, customerEmail } = event.payload as {
 *       orderId: string;
 *       customerEmail: string;
 *     };
 *     return [{
 *       commandType: "SendOrderConfirmationEmail",
 *       payload: { orderId, email: customerEmail },
 *       causationId: event.eventId,
 *       correlationId: event.correlationId,
 *     }];
 *   },
 * });
 * ```
 */
export function createProcessManagerExecutor<TCtx, TCustomState = Record<string, unknown>>(
  config: ProcessManagerExecutorConfig<TCtx, TCustomState>
): ProcessManagerExecutor<TCtx> {
  const {
    pmName,
    eventSubscriptions,
    storage,
    commandEmitter,
    handler,
    instanceIdResolver = (event) => event.streamId,
    logger: configLogger,
  } = config;

  // Use provided logger or fall back to no-op
  const logger = configLogger ?? createPlatformNoOpLogger();

  // Pre-compute event subscription set for O(1) lookup
  const eventTypeSet = new Set(eventSubscriptions);

  return {
    pmName,
    eventSubscriptions,

    handles(eventType: string): boolean {
      return eventTypeSet.has(eventType);
    },

    async process(ctx: TCtx, event: PMDomainEvent): Promise<PMCheckpointResult> {
      // Validate event type - skip if PM doesn't subscribe to this event
      if (!eventTypeSet.has(event.eventType)) {
        logger.debug("Skipped: not subscribed", {
          pmName,
          eventType: event.eventType,
          eventId: event.eventId,
          subscribedTo: [...eventSubscriptions],
        });
        return {
          status: "skipped",
          reason: "not_subscribed",
        };
      }

      const instanceId = instanceIdResolver(event);

      logger.debug("Routing event to PM", {
        pmName,
        instanceId,
        eventType: event.eventType,
        eventId: event.eventId,
        globalPosition: event.globalPosition,
      });

      return withPMCheckpoint(ctx, {
        pmName,
        instanceId,
        globalPosition: event.globalPosition,
        eventId: event.eventId,
        correlationId: event.correlationId,
        ...storage,
        // pmState is passed from withPMCheckpoint to avoid redundant DB read
        process: async (pmState) => {
          const customState = pmState.customState as TCustomState | undefined;
          return handler(ctx, event, customState);
        },
        emitCommands: commandEmitter,
        logger, // Pass logger to checkpoint
      });
    },
  };
}

/**
 * Result from processing an event through an executor.
 */
export interface MultiPMProcessResult {
  /** Process manager name */
  pmName: string;
  /** Processing result */
  result: PMCheckpointResult;
}

/**
 * Multi-PM executor instance.
 *
 * Routes events to the appropriate PM executors based on event type subscriptions.
 * Use when you have multiple PMs and want a single entry point for event processing.
 */
export interface MultiPMExecutor<TCtx> {
  /** All PM names */
  readonly pmNames: string[];

  /** Find executors that handle an event type */
  findExecutors: (eventType: string) => ProcessManagerExecutor<TCtx>[];

  /**
   * Process event through all matching executors.
   *
   * Executors are processed sequentially (not in parallel) because Convex
   * mutation context cannot be shared across concurrent operations.
   * Each executor is wrapped in try-catch to ensure all PMs get a chance
   * to process the event, even if one fails.
   */
  processAll: (ctx: TCtx, event: PMDomainEvent) => Promise<MultiPMProcessResult[]>;
}

/**
 * Creates a multi-PM executor that routes events to appropriate executors.
 *
 * Use this when you have multiple PMs and want a single entry point
 * for event processing.
 *
 * @param executors - Array of PM executors
 * @returns Multi-PM executor
 *
 * @example
 * ```typescript
 * const multiExecutor = createMultiPMExecutor([
 *   orderNotificationExecutor,
 *   inventoryReservationExecutor,
 *   paymentProcessorExecutor,
 * ]);
 *
 * // Process event - routes to appropriate PM(s)
 * const results = await multiExecutor.processAll(ctx, event);
 * ```
 */
export function createMultiPMExecutor<TCtx>(
  executors: ProcessManagerExecutor<TCtx>[]
): MultiPMExecutor<TCtx> {
  // Build index: eventType → executors
  const eventTypeIndex = new Map<string, ProcessManagerExecutor<TCtx>[]>();

  for (const executor of executors) {
    for (const eventType of executor.eventSubscriptions) {
      const existing = eventTypeIndex.get(eventType) ?? [];
      existing.push(executor);
      eventTypeIndex.set(eventType, existing);
    }
  }

  return {
    pmNames: executors.map((e) => e.pmName),

    findExecutors(eventType: string): ProcessManagerExecutor<TCtx>[] {
      return eventTypeIndex.get(eventType) ?? [];
    },

    async processAll(ctx: TCtx, event: PMDomainEvent): Promise<MultiPMProcessResult[]> {
      const matchingExecutors = eventTypeIndex.get(event.eventType) ?? [];

      const results: MultiPMProcessResult[] = [];

      // Process sequentially to maintain order guarantees
      // Each executor is wrapped in try-catch to ensure all PMs get a chance
      // to process the event, even if one fails
      for (const executor of matchingExecutors) {
        try {
          const result = await executor.process(ctx, event);
          results.push({ pmName: executor.pmName, result });
        } catch (error) {
          // Capture unexpected errors (executor.process should not throw,
          // but this protects against edge cases like OOM, network issues, etc.)
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            pmName: executor.pmName,
            result: { status: "failed", error: `Executor threw: ${errorMessage}` },
          });
        }
      }

      return results;
    },
  };
}

// Re-export checkpoint types for convenience
export type { PMCheckpointResult, EmittedCommand } from "./withPMCheckpoint.js";
