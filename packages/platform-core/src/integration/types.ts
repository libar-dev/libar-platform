/**
 * Integration event types for cross-context communication.
 *
 * Integration events implement the Published Language pattern from DDD:
 * - Minimal payload (only stable, public data)
 * - Versioned schemas for backward compatibility
 * - Translators convert domain events to integration events
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";
import type { MutationCtx, WorkpoolOnCompleteArgs } from "../orchestration/types.js";
import type { CorrelationChain } from "../correlation/types.js";
import type { Logger } from "../logging/types.js";
import type { SafeMutationRef } from "../function-refs/types.js";

/**
 * Metadata for integration events.
 * Tracks lineage back to the source domain event.
 */
export interface IntegrationEventMetadata {
  /** Unique ID for the integration event */
  integrationEventId: string;

  /** Event type name (e.g., "OrderPlacedIntegration") */
  eventType: string;

  /** Schema version for the integration event */
  schemaVersion: number;

  /** Source domain event ID that triggered this integration event */
  sourceEventId: string;

  /** Source domain event type */
  sourceEventType: string;

  /** Source bounded context */
  sourceBoundedContext: string;

  /** Correlation ID for tracing */
  correlationId: string;

  /** Causation ID (the domain event that caused this) */
  causationId: string;

  /** User ID that initiated the original command (optional) */
  userId?: string;

  /** Timestamp when integration event was created */
  timestamp: number;

  /** Global position of the source event */
  sourceGlobalPosition: number;
}

/**
 * A published integration event with typed payload.
 */
export interface IntegrationEvent<TPayload = unknown> extends IntegrationEventMetadata {
  /** The integration event payload (minimal DTO) */
  payload: TPayload;
  /** Index signature for Convex FunctionReference compatibility */
  [key: string]: unknown;
}

/**
 * Source event info used by translators.
 */
export interface SourceEventInfo {
  eventId: string;
  eventType: string;
  boundedContext: string;
  globalPosition: number;
  payload: unknown;
  correlation: {
    correlationId: string;
    causationId: string;
    userId?: string;
  };
  timestamp: number;
}

/**
 * Translator function that converts a domain event to an integration event.
 *
 * @template TDomainPayload - The domain event payload type
 * @template TIntegrationPayload - The integration event payload type
 */
export type IntegrationEventTranslator<TDomainPayload, TIntegrationPayload> = (
  sourceEvent: SourceEventInfo & { payload: TDomainPayload }
) => TIntegrationPayload;

/**
 * Route configuration for integration event publishing.
 */
export interface IntegrationEventRoute<TDomainPayload = unknown, TIntegrationPayload = unknown> {
  /** Domain event type to translate (e.g., "OrderSubmitted") */
  sourceEventType: string;

  /** Integration event type to produce (e.g., "OrderPlacedIntegration") */
  targetEventType: string;

  /** Schema version for the integration event */
  schemaVersion: number;

  /** Translator function */
  translator: IntegrationEventTranslator<TDomainPayload, TIntegrationPayload>;

  /**
   * Handlers to invoke with the integration event.
   *
   * Uses SafeMutationRef (simplified type) to prevent TS2589.
   * Type safety is maintained via the translator's generic constraints.
   */
  handlers: SafeMutationRef[];
}

/**
 * Result of publishing an integration event.
 */
export interface IntegrationPublishResult {
  /** The integration event ID */
  integrationEventId: string;

  /** Number of handlers invoked */
  handlersInvoked: number;

  /** Whether all handlers were successfully enqueued */
  success: boolean;
}

/**
 * Interface for the IntegrationEventPublisher.
 */
export interface IIntegrationEventPublisher {
  /**
   * Check if a route exists for a domain event type.
   */
  hasRouteFor(sourceEventType: string): boolean;

  /**
   * Publish an integration event from a domain event.
   *
   * @param ctx - Mutation context
   * @param sourceEvent - The source domain event
   * @param chain - Correlation chain for tracing
   */
  publish(
    ctx: MutationCtx,
    sourceEvent: SourceEventInfo,
    chain: CorrelationChain
  ): Promise<IntegrationPublishResult | null>;

  /**
   * Get all registered routes.
   */
  getRoutes(): IntegrationEventRoute[];
}

/**
 * Configuration for the IntegrationEventPublisher.
 */
export interface IntegrationPublisherConfig {
  /**
   * Optional onComplete handler for tracking delivery.
   */
  onComplete?: FunctionReference<"mutation", FunctionVisibility, WorkpoolOnCompleteArgs, unknown>;

  /**
   * Optional logger for integration event publishing tracing.
   * If not provided, logging is disabled.
   *
   * Logging points:
   * - DEBUG: No integration route (sourceEventType, eventId)
   * - DEBUG: Integration route matched (sourceEventType, targetEventType)
   * - DEBUG: Handler enqueued (handlerIndex, targetEventType)
   * - INFO: Integration event published (integrationEventId, targetEventType, handlersInvoked)
   */
  logger?: Logger;
}
