/**
 * IntegrationEventPublisher implementation.
 *
 * Translates domain events to integration events and publishes them
 * to registered handlers via Workpool.
 */

import { generateIntegrationEventId } from "../ids/index.js";
import type { WorkpoolClient, MutationCtx } from "../orchestration/types.js";
import type { CorrelationChain } from "../correlation/types.js";
import type {
  IIntegrationEventPublisher,
  IntegrationEventRoute,
  IntegrationPublishResult,
  IntegrationPublisherConfig,
  SourceEventInfo,
  IntegrationEvent,
} from "./types.js";
import type { SafeMutationRef } from "../function-refs/types.js";
import type { UnknownRecord } from "../types.js";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

/**
 * Error codes for integration route validation failures.
 */
export type IntegrationRouteErrorCode =
  | "MISSING_SOURCE_EVENT_TYPE"
  | "MISSING_TARGET_EVENT_TYPE"
  | "MISSING_TRANSLATOR"
  | "MISSING_HANDLERS"
  | "DUPLICATE_SOURCE_EVENT_TYPE";

/**
 * Error thrown when integration route validation fails.
 */
export class IntegrationRouteError extends Error {
  readonly code: IntegrationRouteErrorCode;
  readonly context: UnknownRecord | undefined;

  constructor(code: IntegrationRouteErrorCode, message: string, context?: UnknownRecord) {
    super(message);
    this.name = "IntegrationRouteError";
    this.code = code;
    this.context = context;
  }
}

/**
 * IntegrationEventPublisher - Translates and publishes integration events.
 *
 * @example
 * ```typescript
 * const publisher = new IntegrationEventPublisher(
 *   workpool,
 *   [
 *     {
 *       sourceEventType: "OrderSubmitted",
 *       targetEventType: "OrderPlacedIntegration",
 *       schemaVersion: 1,
 *       translator: (source) => ({
 *         orderId: source.payload.orderId,
 *         customerId: source.payload.customerId,
 *         totalAmount: source.payload.totalAmount,
 *         placedAt: source.timestamp,
 *       }),
 *       handlers: [
 *         internal.inventory.handlers.onOrderPlaced,
 *         internal.notifications.handlers.onOrderPlaced,
 *       ],
 *     },
 *   ],
 *   { onComplete: internal.deadLetters.onIntegrationEvent }
 * );
 *
 * // In CommandOrchestrator or EventBus subscription:
 * await publisher.publish(ctx, sourceEvent, chain);
 * ```
 */
export class IntegrationEventPublisher implements IIntegrationEventPublisher {
  private readonly workpool: WorkpoolClient;
  private readonly routes: Map<string, IntegrationEventRoute>;
  private readonly config: IntegrationPublisherConfig;
  private readonly logger: Logger;

  /**
   * @throws IntegrationRouteError if duplicate sourceEventType routes are provided
   */
  constructor(
    workpool: WorkpoolClient,
    routes: IntegrationEventRoute[],
    config: IntegrationPublisherConfig = {}
  ) {
    this.workpool = workpool;
    this.config = config;
    this.logger = config.logger ?? createPlatformNoOpLogger();

    // Build routes map with duplicate detection
    this.routes = new Map();
    for (const route of routes) {
      if (this.routes.has(route.sourceEventType)) {
        throw new IntegrationRouteError(
          "DUPLICATE_SOURCE_EVENT_TYPE",
          `Duplicate route for source event type: "${route.sourceEventType}"`,
          { sourceEventType: route.sourceEventType }
        );
      }
      this.routes.set(route.sourceEventType, route);
    }
  }

  /**
   * Check if a route exists for a domain event type.
   */
  hasRouteFor(sourceEventType: string): boolean {
    return this.routes.has(sourceEventType);
  }

  /**
   * Publish an integration event from a domain event.
   *
   * Returns null if no route is registered for the source event type.
   */
  async publish(
    ctx: MutationCtx,
    sourceEvent: SourceEventInfo,
    chain: CorrelationChain
  ): Promise<IntegrationPublishResult | null> {
    const route = this.routes.get(sourceEvent.eventType);

    if (!route) {
      this.logger.debug("No integration route", {
        sourceEventType: sourceEvent.eventType,
        eventId: sourceEvent.eventId,
      });
      return null; // No route registered for this event type
    }

    this.logger.debug("Integration route matched", {
      sourceEventType: sourceEvent.eventType,
      targetEventType: route.targetEventType,
      eventId: sourceEvent.eventId,
    });

    // Generate integration event ID
    const integrationEventId = generateIntegrationEventId();

    // Translate domain payload to integration payload
    const integrationPayload = route.translator(sourceEvent);

    // Build integration event
    const integrationEvent: IntegrationEvent = {
      integrationEventId,
      eventType: route.targetEventType,
      schemaVersion: route.schemaVersion,
      sourceEventId: sourceEvent.eventId,
      sourceEventType: sourceEvent.eventType,
      sourceBoundedContext: sourceEvent.boundedContext,
      correlationId: chain.correlationId,
      causationId: sourceEvent.eventId, // The domain event caused this integration event
      // Propagate userId for audit trails (only include if present)
      ...(chain.userId !== undefined && { userId: chain.userId }),
      timestamp: Date.now(),
      sourceGlobalPosition: sourceEvent.globalPosition,
      payload: integrationPayload,
    };

    // Enqueue handlers via Workpool
    let handlersInvoked = 0;

    for (const handler of route.handlers) {
      await this.workpool.enqueueMutation(ctx, handler, integrationEvent, {
        ...(this.config.onComplete ? { onComplete: this.config.onComplete } : {}),
        context: {
          integrationEventId,
          integrationEventType: route.targetEventType,
          sourceEventId: sourceEvent.eventId,
          sourceEventType: sourceEvent.eventType,
          correlationId: chain.correlationId,
        },
      });
      handlersInvoked++;

      this.logger.debug("Handler enqueued", {
        handlerIndex: handlersInvoked,
        targetEventType: route.targetEventType,
        integrationEventId,
      });
    }

    this.logger.info("Integration event published", {
      integrationEventId,
      targetEventType: route.targetEventType,
      sourceEventType: sourceEvent.eventType,
      handlersInvoked,
      correlationId: chain.correlationId,
    });

    return {
      integrationEventId,
      handlersInvoked,
      success: true,
    };
  }

  /**
   * Get all registered routes.
   */
  getRoutes(): IntegrationEventRoute[] {
    return Array.from(this.routes.values());
  }
}

/**
 * Create an IntegrationEventPublisher instance.
 *
 * @param workpool - Workpool client for enqueuing handlers
 * @param routes - Array of integration event routes
 * @param config - Optional configuration
 * @returns IntegrationEventPublisher instance
 */
export function createIntegrationPublisher(
  workpool: WorkpoolClient,
  routes: IntegrationEventRoute[],
  config?: IntegrationPublisherConfig
): IIntegrationEventPublisher {
  return new IntegrationEventPublisher(workpool, routes, config);
}

/**
 * Builder for creating integration event routes.
 */
export class IntegrationRouteBuilder<TDomainPayload = unknown, TIntegrationPayload = unknown> {
  private _sourceEventType: string = "";
  private _targetEventType: string = "";
  private _schemaVersion: number = 1;
  private _translator:
    | ((source: SourceEventInfo & { payload: TDomainPayload }) => TIntegrationPayload)
    | null = null;
  private _handlers: SafeMutationRef[] = [];

  /**
   * Set the source domain event type.
   */
  from(sourceEventType: string): this {
    this._sourceEventType = sourceEventType;
    return this;
  }

  /**
   * Set the target integration event type.
   */
  to(targetEventType: string): this {
    this._targetEventType = targetEventType;
    return this;
  }

  /**
   * Set the schema version.
   */
  version(schemaVersion: number): this {
    this._schemaVersion = schemaVersion;
    return this;
  }

  /**
   * Set the translator function.
   */
  translate(
    translator: (source: SourceEventInfo & { payload: TDomainPayload }) => TIntegrationPayload
  ): this {
    this._translator = translator;
    return this;
  }

  /**
   * Add handlers for the integration event.
   *
   * Uses SafeMutationRef (simplified type) to prevent TS2589.
   */
  notify(...handlers: SafeMutationRef[]): this {
    this._handlers = handlers;
    return this;
  }

  /**
   * Build the route configuration.
   *
   * @throws IntegrationRouteError if required fields are missing
   */
  build(): IntegrationEventRoute<TDomainPayload, TIntegrationPayload> {
    if (!this._sourceEventType) {
      throw new IntegrationRouteError(
        "MISSING_SOURCE_EVENT_TYPE",
        "Source event type is required. Call .from() before .build()"
      );
    }
    if (!this._targetEventType) {
      throw new IntegrationRouteError(
        "MISSING_TARGET_EVENT_TYPE",
        "Target event type is required. Call .to() before .build()"
      );
    }
    if (!this._translator) {
      throw new IntegrationRouteError(
        "MISSING_TRANSLATOR",
        "Translator function is required. Call .translate() before .build()"
      );
    }
    if (this._handlers.length === 0) {
      throw new IntegrationRouteError(
        "MISSING_HANDLERS",
        "At least one handler is required. Call .notify() before .build()"
      );
    }

    return {
      sourceEventType: this._sourceEventType,
      targetEventType: this._targetEventType,
      schemaVersion: this._schemaVersion,
      translator: this._translator,
      handlers: this._handlers,
    };
  }
}

/**
 * Create a route builder for integration events.
 *
 * @example
 * ```typescript
 * const route = defineIntegrationRoute<OrderSubmittedPayload, OrderPlacedIntegrationPayload>()
 *   .from("OrderSubmitted")
 *   .to("OrderPlacedIntegration")
 *   .version(1)
 *   .translate((source) => ({
 *     orderId: source.payload.orderId,
 *     customerId: source.payload.customerId,
 *     placedAt: source.timestamp,
 *   }))
 *   .notify(internal.inventory.onOrderPlaced)
 *   .build();
 * ```
 */
export function defineIntegrationRoute<
  TDomainPayload = unknown,
  TIntegrationPayload = unknown,
>(): IntegrationRouteBuilder<TDomainPayload, TIntegrationPayload> {
  return new IntegrationRouteBuilder<TDomainPayload, TIntegrationPayload>();
}
