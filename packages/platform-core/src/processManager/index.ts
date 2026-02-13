/**
 * @libar-docs
 * @libar-docs-saga @libar-docs-ddd @libar-docs-core
 * @libar-docs-pattern ProcessManager
 * @libar-docs-status completed
 * @libar-docs-usecase "Event-reactive coordination without orchestration"
 * @libar-docs-usecase "Fire-and-forget command emission from events"
 * @libar-docs-usecase "Time-triggered or hybrid event/time patterns"
 * @libar-docs-uses EventBusAbstraction
 * @libar-docs-used-by BoundedContextHandlers
 *
 * ## ProcessManager - Event-Reactive Coordination
 *
 * Process Manager module for event-reactive coordination.
 *
 * Process Managers react to events and emit commands.
 * They are distinct from:
 * - **Sagas**: Multi-step orchestration with compensation logic
 * - **Projections**: Events → Read model updates
 *
 * ### When to Use
 *
 * - Event → Command reactions without orchestration state
 * - Fire-and-forget command emission (no compensation needed)
 * - Time-triggered or hybrid event/time coordination patterns
 * - **Avoid when:** You need compensation logic (use Sagas instead)
 *
 * ### Key Characteristics
 *
 * | Aspect | Process Manager | Saga |
 * |--------|-----------------|------|
 * | **State** | Minimal (position + custom) | Full workflow state |
 * | **Compensation** | None | Yes |
 * | **Trigger** | Event, Time, or Hybrid | Event only |
 * | **Pattern** | Fire-and-forget | Orchestrated |
 *
 * ### Components
 *
 * - **Lifecycle FSM**: State transitions for PM instances
 * - **Registry**: Registration and lookup by trigger event
 * - **Checkpoint**: Idempotency via position tracking
 * - **Executor**: Runtime execution with storage callbacks
 * - **EventBus Subscription**: Integration with EventBus
 *
 * @example
 * ```typescript
 * import {
 *   createProcessManagerRegistry,
 *   pmTransitionState,
 *   isPMValidTransition,
 * } from "@libar-dev/platform-core/processManager";
 * import { defineProcessManager } from "@libar-dev/platform-bc";
 *
 * // Define a process manager
 * const orderNotificationPM = defineProcessManager({
 *   processManagerName: "orderNotification",
 *   description: "Sends notification when order is confirmed",
 *   triggerType: "event",
 *   eventSubscriptions: ["OrderConfirmed"] as const,
 *   emitsCommands: ["SendNotification"],
 *   context: "orders",
 * });
 *
 * // Register it
 * const registry = createProcessManagerRegistry();
 * registry.register(orderNotificationPM);
 *
 * // Find handlers for an event
 * const handlers = registry.getByTriggerEvent("OrderConfirmed");
 * ```
 *
 * @see ADR-033 for Process Manager vs Saga distinction
 */

// Types
export type {
  ProcessManagerStatus,
  ProcessManagerState,
  ProcessManagerDeadLetter,
  ProcessManagerProcessResult,
  ProcessManagerQueryOptions,
} from "./types.js";

export {
  PROCESS_MANAGER_STATUSES,
  isProcessManagerStatus,
  MAX_PM_QUERY_LIMIT,
  DEFAULT_PM_QUERY_LIMIT,
} from "./types.js";

// Lifecycle State Machine
export type {
  ProcessManagerLifecycleState,
  ProcessManagerLifecycleEvent,
  PMStateTransition,
} from "./lifecycle.js";

export {
  isPMValidTransition,
  pmTransitionState,
  getPMValidEventsFrom,
  getAllPMTransitions,
  assertPMValidTransition,
  isTerminalState,
  isErrorState,
} from "./lifecycle.js";

// Registry
export type { ProcessManagerRegistry } from "./registry.js";
export { createProcessManagerRegistry } from "./registry.js";

// Checkpoint (idempotency)
export type {
  PMCheckpointResult,
  EmittedCommand,
  WithPMCheckpointConfig,
} from "./withPMCheckpoint.js";
export { withPMCheckpoint, createPMCheckpointHelper } from "./withPMCheckpoint.js";

// Executor (runtime)
export type {
  PMDomainEvent,
  PMStorageCallbacks,
  PMHandler,
  InstanceIdResolver,
  ProcessManagerExecutorConfig,
  ProcessManagerExecutor,
  MultiPMExecutor,
  MultiPMProcessResult,
} from "./executor.js";
export { createProcessManagerExecutor, createMultiPMExecutor } from "./executor.js";

// EventBus Subscription (integration)
export type {
  PMDefinitionForSubscription,
  PMEventHandlerArgs,
  CreatePMSubscriptionOptions,
} from "./subscription.js";
export {
  DEFAULT_PM_SUBSCRIPTION_PRIORITY,
  computePMInstanceId,
  createPMSubscription,
  createPMSubscriptions,
} from "./subscription.js";
