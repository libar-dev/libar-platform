/**
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status completed
 * @libar-docs-event-sourcing
 * @libar-docs-core
 *
 * @libar-docs-uses EventStoreFoundation, DurableFunctionAdapters, WorkpoolPartitioningStrategy
 * @libar-docs-used-by CommandOrchestrator, SagaEngine, ProjectionProcessor
 *
 * ## Event Store Durability
 *
 * Guaranteed event persistence patterns for Convex-native event sourcing.
 *
 * ### Patterns
 *
 * - **Outbox Pattern** - Action results captured via onComplete mutation
 * - **Idempotent Append** - Event append with idempotency key check
 * - **Durable Append** - Failed appends retried via Workpool actions
 * - **Durable Publication** - Cross-context events with tracking and retry
 * - **Intent/Completion** - Long-running operations bracketed with events
 * - **Poison Events** - Malformed events quarantined after failures
 *
 * ### Usage
 *
 * ```typescript
 * import {
 *   idempotentAppendEvent,
 *   createOutboxHandler,
 *   durableAppendEvent,
 *   createDurableEventPublisher,
 *   recordIntent,
 *   recordCompletion,
 *   withPoisonEventHandling,
 * } from "@libar-dev/platform-core/durability";
 * ```
 *
 * @libar-docs-uses EventStoreFoundation, DurableFunctionAdapters
 * @libar-docs-used-by CommandOrchestrator, SagaEngine
 */

// Types
export type {
  // Base types
  BaseHandlerContext,
  // Idempotent append
  IdempotentAppendResult,
  IdempotentAppendConfig,
  IdempotentAppendEventData,
  IdempotentAppendDependencies,
  // Outbox
  ActionResult,
  OutboxHandlerConfig,
  // Publication
  PublicationStatus,
  EventPublication,
  DurablePublisherConfig,
  // Intent/Completion
  IntentEvent,
  CompletionEvent,
  CompletionStatus,
  IntentCompletionConfig,
  // Poison events
  PoisonEventRecord,
  PoisonEventConfig,
  // Dead letters
  DeadLetterRecord,
  DeadLetterStats,
} from "./types.js";

// Idempotent Append
export {
  idempotentAppendEvent,
  buildCommandIdempotencyKey,
  buildActionIdempotencyKey,
  buildSagaStepIdempotencyKey,
  buildScheduledJobIdempotencyKey,
} from "./idempotentAppend.js";

// Outbox Pattern
export type { OutboxHandlerContext, OutboxHandlerFullConfig } from "./outbox.js";
export { createOutboxHandler } from "./outbox.js";

// Durable Append
export type {
  WorkpoolLike,
  DurableAppendActionArgs,
  DurableAppendRetryConfig,
  DurableAppendOptions,
  DurableAppendEnqueueConfig,
  DurableAppendEnqueueResult,
} from "./durableAppend.js";
export {
  durableAppendEvent,
  createAppendPartitionKey,
  createDurableAppendActionHandler,
} from "./durableAppend.js";

// Publication
export type {
  PublishableEvent,
  PublishEventArgs,
  DurablePublishResult,
  DurableEventPublisher,
  DurablePublisherDependencies,
  DurablePublisherFullConfig,
} from "./publication.js";
export { createDurableEventPublisher, createPublicationPartitionKey } from "./publication.js";

// Intent/Completion
export type {
  IntentCompletionDependencies,
  RecordIntentArgs,
  RecordIntentResult,
  RecordCompletionArgs,
  CheckIntentTimeoutArgs,
  QueryOrphanedIntentsArgs,
} from "./intentCompletion.js";
export {
  recordIntent,
  recordCompletion,
  checkIntentTimeout,
  queryOrphanedIntents,
  buildIntentKey,
} from "./intentCompletion.js";

// Poison Events
export type {
  EventHandler,
  PoisonEventDependencies,
  PoisonEventFullConfig,
  IsEventQuarantinedArgs,
  GetPoisonEventRecordArgs,
  UnquarantineEventArgs,
  ListQuarantinedEventsArgs,
  GetPoisonEventStatsArgs,
  PoisonEventStats,
} from "./poisonEvent.js";
export {
  withPoisonEventHandling,
  isEventQuarantined,
  getPoisonEventRecord,
  unquarantineEvent,
  listQuarantinedEvents,
  getPoisonEventStats,
} from "./poisonEvent.js";
