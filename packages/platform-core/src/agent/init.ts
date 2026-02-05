/**
 * Agent BC Initialization - Bootstrap Agent Bounded Contexts
 *
 * Provides initialization and lifecycle management for agent bounded contexts.
 * Handles:
 * - Creating/resuming checkpoints
 * - Setting up EventBus subscriptions
 * - Managing agent lifecycle (pause, resume, shutdown)
 *
 * @module agent/init
 */

import type { FunctionReference, FunctionVisibility } from "convex/server";
import { v7 as uuidv7 } from "uuid";
import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";
import type {
  EventBus,
  EventSubscription,
  PublishedEvent,
  PartitionKey,
} from "../eventbus/types.js";
import type { CorrelationChain } from "../correlation/types.js";
import type { UnknownRecord } from "../types.js";
import type {
  AgentBCConfig,
  AgentDecision,
  AgentExecutionContext,
  AgentInterface,
  LLMAnalysisResult,
} from "./types.js";
import { validateAgentBCConfig } from "./types.js";
import type { AgentCheckpoint } from "./checkpoint.js";
import { createInitialAgentCheckpoint, isAgentActive } from "./checkpoint.js";
import { createEmittedAgentCommand, type EmittedAgentCommand } from "./commands.js";
import { createPendingApproval, shouldRequireApproval, type PendingApproval } from "./approval.js";
import { createAgentDeadLetter, type AgentDeadLetter } from "./dead-letter.js";
import { filterEventsInWindow, hasMinimumEvents } from "./patterns.js";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for agent initialization and lifecycle.
 */
export const AGENT_INIT_ERROR_CODES = {
  /** Agent configuration is invalid */
  INVALID_CONFIG: "INVALID_CONFIG",
  /** Agent is already initialized */
  ALREADY_INITIALIZED: "ALREADY_INITIALIZED",
  /** Agent is not initialized */
  NOT_INITIALIZED: "NOT_INITIALIZED",
  /** Agent is already paused */
  ALREADY_PAUSED: "ALREADY_PAUSED",
  /** Agent is already active */
  ALREADY_ACTIVE: "ALREADY_ACTIVE",
  /** Agent is stopped and cannot be resumed */
  AGENT_STOPPED: "AGENT_STOPPED",
  /** EventBus is required */
  EVENTBUS_REQUIRED: "EVENTBUS_REQUIRED",
} as const;

export type AgentInitErrorCode =
  (typeof AGENT_INIT_ERROR_CODES)[keyof typeof AGENT_INIT_ERROR_CODES];

// ============================================================================
// Agent Subscription Types
// ============================================================================

/**
 * Active subscription handle for an agent.
 *
 * Provides methods to control the subscription lifecycle.
 */
export interface AgentSubscription {
  /** Unique subscription ID */
  readonly subscriptionId: string;

  /** Agent BC identifier */
  readonly agentId: string;

  /** Event subscription name for EventBus */
  readonly subscriptionName: string;

  /**
   * Pause the subscription.
   * Events will be buffered but not processed until resumed.
   */
  readonly pause: () => Promise<void>;

  /**
   * Resume a paused subscription.
   * Buffered events will be processed.
   */
  readonly resume: () => Promise<void>;

  /**
   * Unsubscribe from events.
   * This is a permanent operation - the subscription cannot be resumed.
   */
  readonly unsubscribe: () => Promise<void>;
}

/**
 * Opaque handle to an initialized agent BC.
 *
 * Provides access to agent state and subscription control.
 */
export interface AgentBCHandle {
  /** Agent BC identifier */
  readonly agentId: string;

  /** Active subscription handle */
  readonly subscription: AgentSubscription;

  /** Current checkpoint state */
  readonly checkpoint: AgentCheckpoint;

  /** Agent configuration (read-only) */
  readonly config: Readonly<AgentBCConfig>;
}

// ============================================================================
// Agent Runtime Configuration
// ============================================================================

/**
 * Runtime configuration for agent LLM integration.
 *
 * Abstracts the LLM backend to allow:
 * - Testing with mock implementations
 * - Different LLM backends (@convex-dev/agent, direct API, etc.)
 * - Rule-only agents without LLM
 */
export interface AgentRuntimeConfig {
  /**
   * Analyze events using LLM for pattern detection.
   *
   * @param prompt - Analysis prompt for the LLM
   * @param events - Events to analyze
   * @returns Analysis result with patterns and confidence
   */
  readonly analyze: (
    prompt: string,
    events: readonly PublishedEvent[]
  ) => Promise<LLMAnalysisResult>;

  /**
   * Simple reasoning about a single event.
   *
   * @param event - Event to reason about
   * @returns Reasoning result (implementation-specific)
   */
  readonly reason: (event: PublishedEvent) => Promise<unknown>;
}

/**
 * Create a mock agent runtime for testing.
 *
 * @returns Mock AgentRuntimeConfig that returns empty results
 */
export function createMockAgentRuntime(): AgentRuntimeConfig {
  return {
    analyze: async () => ({
      patterns: [],
      confidence: 0,
      reasoning: "Mock runtime - no analysis performed",
    }),
    reason: async () => ({}),
  };
}

/**
 * Create an agent interface from runtime config.
 *
 * Wraps the runtime config to provide the AgentInterface used in handlers.
 *
 * @param runtime - Agent runtime configuration
 * @returns AgentInterface for use in AgentExecutionContext
 */
export function createAgentInterface(runtime: AgentRuntimeConfig): AgentInterface {
  return {
    analyze: runtime.analyze,
    reason: runtime.reason,
  };
}

// ============================================================================
// Initialization Options
// ============================================================================

/**
 * Options for initializing an agent BC.
 */
export interface InitializeAgentBCOptions {
  /**
   * Agent runtime configuration for LLM integration.
   * If not provided, uses a mock runtime (for rule-only agents).
   */
  readonly runtime?: AgentRuntimeConfig;

  /**
   * EventBus for subscribing to events.
   * Required for event processing.
   */
  readonly eventBus: EventBus;

  /**
   * Handler function reference for event processing.
   * This mutation will be called for each matching event.
   */
  readonly handler: FunctionReference<"mutation", FunctionVisibility, AgentEventHandlerArgs, void>;

  /**
   * Optional logger for agent operations.
   */
  readonly logger?: Logger;

  /**
   * Optional existing checkpoint to resume from.
   * If not provided, a new checkpoint will be created.
   */
  readonly existingCheckpoint?: AgentCheckpoint;

  /**
   * Optional callback when an emitted command is ready.
   * Called after the agent decides to emit a command.
   */
  readonly onCommandEmitted?: (command: EmittedAgentCommand) => Promise<void>;

  /**
   * Optional callback when an approval is created.
   * Called when a command requires human approval.
   */
  readonly onApprovalCreated?: (approval: PendingApproval) => Promise<void>;

  /**
   * Optional callback when event processing fails.
   * Called when an event is sent to dead letter.
   */
  readonly onDeadLetter?: (deadLetter: AgentDeadLetter) => Promise<void>;
}

/**
 * Result of agent BC initialization.
 */
export type InitializeAgentBCResult =
  | {
      readonly success: true;
      readonly handle: AgentBCHandle;
    }
  | {
      readonly success: false;
      readonly code: AgentInitErrorCode;
      readonly message: string;
    };

// ============================================================================
// Agent Event Handler
// ============================================================================

/**
 * Handler arguments for agent event processing.
 */
export interface AgentEventHandlerArgs {
  /** Event ID */
  readonly eventId: string;

  /** Event type */
  readonly eventType: string;

  /** Global position for idempotency */
  readonly globalPosition: number;

  /** Correlation ID */
  readonly correlationId: string;

  /** Stream type */
  readonly streamType: string;

  /** Stream ID */
  readonly streamId: string;

  /** Event payload */
  readonly payload: Record<string, unknown>;

  /** Event timestamp */
  readonly timestamp: number;

  /** Event category */
  readonly category: string;

  /** Bounded context */
  readonly boundedContext: string;

  /** Agent ID for routing */
  readonly agentId: string;

  /** Index signature for UnknownRecord compatibility */
  [key: string]: unknown;
}

/**
 * Type guard to check if a value is a valid record payload.
 *
 * @param value - Value to check
 * @returns True if value is a non-null object (not array)
 */
function isRecordPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Transform a published event to agent handler args.
 *
 * @param event - Published event
 * @param chain - Correlation chain
 * @param agentId - Agent BC identifier
 * @returns Agent event handler arguments
 */
export function toAgentHandlerArgs(
  event: PublishedEvent,
  chain: CorrelationChain,
  agentId: string
): AgentEventHandlerArgs {
  // Validate payload is a proper record object
  const payload = isRecordPayload(event.payload) ? event.payload : { _raw: event.payload };

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    globalPosition: event.globalPosition,
    correlationId: chain.correlationId,
    streamType: event.streamType,
    streamId: event.streamId,
    payload,
    timestamp: event.timestamp,
    category: event.category,
    boundedContext: event.boundedContext,
    agentId,
  };
}

// ============================================================================
// Agent Event Handler Factory
// ============================================================================

/**
 * Context for creating agent event handlers.
 */
export interface CreateAgentEventHandlerContext {
  /** Agent BC configuration */
  readonly config: AgentBCConfig;

  /** Agent runtime for LLM integration */
  readonly runtime: AgentRuntimeConfig;

  /** Logger for operations */
  readonly logger: Logger;

  /**
   * Load event history within the pattern window.
   * Implementation depends on infrastructure.
   */
  readonly loadHistory: (streamId: string, config: AgentBCConfig) => Promise<PublishedEvent[]>;

  /**
   * Load current checkpoint state.
   * Implementation depends on infrastructure.
   */
  readonly loadCheckpoint: (agentId: string) => Promise<AgentCheckpoint | null>;

  /**
   * Update checkpoint after processing.
   * Implementation depends on infrastructure.
   */
  readonly updateCheckpoint: (
    agentId: string,
    eventId: string,
    globalPosition: number
  ) => Promise<void>;
}

/**
 * Result from agent event handler processing.
 */
export interface AgentEventHandlerResult {
  /** Whether processing was successful */
  readonly success: boolean;

  /** Decision made by the agent (if any) */
  readonly decision: AgentDecision | null;

  /** Command emitted (if decision resulted in command) */
  readonly emittedCommand?: EmittedAgentCommand;

  /** Approval created (if command requires approval) */
  readonly pendingApproval?: PendingApproval;

  /** Dead letter created (if processing failed) */
  readonly deadLetter?: AgentDeadLetter;

  /** Error message if processing failed */
  readonly error?: string;
}

/**
 * Create the agent event handler function.
 *
 * This handler:
 * 1. Loads event history within the pattern window
 * 2. Creates the AgentExecutionContext
 * 3. Calls the config.onEvent handler
 * 4. Handles the decision (emit command, queue approval, etc.)
 *
 * @param ctx - Handler context with dependencies
 * @returns Event handler function
 */
export function createAgentEventHandler(
  ctx: CreateAgentEventHandlerContext
): (event: PublishedEvent, checkpoint: AgentCheckpoint) => Promise<AgentEventHandlerResult> {
  const { config, runtime, logger, loadHistory, updateCheckpoint } = ctx;

  const agentInterface = createAgentInterface(runtime);

  return async (
    event: PublishedEvent,
    checkpoint: AgentCheckpoint
  ): Promise<AgentEventHandlerResult> => {
    try {
      // Check if agent is active
      if (!isAgentActive(checkpoint)) {
        logger.debug("Agent is not active, skipping event", {
          agentId: config.id,
          eventId: event.eventId,
          status: checkpoint.status,
        });
        return { success: true, decision: null };
      }

      // Load event history within the pattern window
      const history = await loadHistory(event.streamId, config);
      const filteredHistory = filterEventsInWindow(history, config.patternWindow);

      // Check minimum events requirement
      if (!hasMinimumEvents(filteredHistory, config.patternWindow)) {
        logger.debug("Insufficient events for pattern detection", {
          agentId: config.id,
          eventId: event.eventId,
          historyCount: filteredHistory.length,
          minEvents: config.patternWindow.minEvents ?? 1,
        });
        // Still update checkpoint to mark event as processed
        await updateCheckpoint(config.id, event.eventId, event.globalPosition);
        return { success: true, decision: null };
      }

      // Create execution context
      const executionContext: AgentExecutionContext = {
        agent: agentInterface,
        history: filteredHistory,
        checkpoint: {
          lastProcessedPosition: checkpoint.lastProcessedPosition,
          lastEventId: checkpoint.lastEventId,
          eventsProcessed: checkpoint.eventsProcessed,
        },
        config,
      };

      // Call the agent's event handler
      const decision = await config.onEvent(event, executionContext);

      // Update checkpoint
      await updateCheckpoint(config.id, event.eventId, event.globalPosition);

      // If no decision, we're done
      if (decision === null) {
        logger.debug("Agent made no decision for event", {
          agentId: config.id,
          eventId: event.eventId,
        });
        return { success: true, decision: null };
      }

      // If decision has no command, we're done
      if (decision.command === null) {
        logger.debug("Agent decision has no command", {
          agentId: config.id,
          eventId: event.eventId,
          reason: decision.reason,
        });
        return { success: true, decision };
      }

      // Determine if approval is required
      const requiresApproval =
        decision.requiresApproval ||
        (config.humanInLoop !== undefined &&
          shouldRequireApproval(config.humanInLoop, decision.command, decision.confidence));

      if (requiresApproval) {
        // Create pending approval
        const approval = createPendingApproval(
          config.id,
          `dec_${Date.now()}_${uuidv7().slice(0, 8)}`,
          { type: decision.command, payload: decision.payload },
          decision.confidence,
          decision.reason,
          config.humanInLoop ?? { confidenceThreshold: config.confidenceThreshold }
        );

        logger.info("Created pending approval for agent decision", {
          agentId: config.id,
          approvalId: approval.approvalId,
          command: decision.command,
          confidence: decision.confidence,
        });

        return {
          success: true,
          decision,
          pendingApproval: approval,
        };
      }

      // Create and emit command
      const emittedCommand = createEmittedAgentCommand(
        config.id,
        decision.command,
        decision.payload,
        decision.confidence,
        decision.reason,
        decision.triggeringEvents
      );

      logger.info("Agent emitting command", {
        agentId: config.id,
        commandType: emittedCommand.type,
        decisionId: emittedCommand.metadata.decisionId,
        confidence: decision.confidence,
      });

      return {
        success: true,
        decision,
        emittedCommand,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("Agent event processing failed", {
        agentId: config.id,
        eventId: event.eventId,
        error: errorMessage,
      });

      // Create dead letter
      const deadLetter = createAgentDeadLetter(
        config.id,
        checkpoint.subscriptionId,
        event.eventId,
        event.globalPosition,
        errorMessage
      );

      return {
        success: false,
        decision: null,
        deadLetter,
        error: errorMessage,
      };
    }
  };
}

// ============================================================================
// Subscription Factory
// ============================================================================

/**
 * Default agent subscription priority.
 * Agents run after projections (100) and process managers (200),
 * but before sagas (300).
 */
export const DEFAULT_AGENT_SUBSCRIPTION_PRIORITY = 250;

/**
 * Options for creating an agent subscription.
 */
export interface CreateAgentSubscriptionOptions<THandlerArgs extends UnknownRecord> {
  /**
   * Handler function reference.
   * This mutation will be called for each matching event.
   */
  readonly handler: FunctionReference<"mutation", FunctionVisibility, THandlerArgs, unknown>;

  /**
   * Priority for ordering subscriptions (lower runs first).
   * @default 250 (after projections and PMs)
   */
  readonly priority?: number;

  /**
   * Custom transformer for handler args.
   * If not provided, uses default AgentEventHandlerArgs transformer.
   */
  readonly toHandlerArgs?: (
    event: PublishedEvent,
    chain: CorrelationChain,
    agentId: string
  ) => THandlerArgs;

  /**
   * Custom partition key extractor.
   * If not provided, partitions by streamId.
   */
  readonly getPartitionKey?: (event: PublishedEvent) => PartitionKey;

  /**
   * Optional logger for subscription-level logging.
   */
  readonly logger?: Logger;
}

/**
 * Create an EventBus subscription from an agent BC configuration.
 *
 * This bridges agent configurations to the EventBus infrastructure,
 * allowing agents to receive events automatically.
 *
 * @param config - Agent BC configuration
 * @param options - Subscription options
 * @returns EventSubscription for the EventBus
 *
 * @example
 * ```typescript
 * const subscription = createAgentSubscription(churnRiskAgentConfig, {
 *   handler: internal.agents.churnRisk.handleEvent,
 * });
 *
 * // Use in defineSubscriptions
 * const subscriptions = defineSubscriptions((registry) => {
 *   registry.add(subscription);
 * });
 * ```
 */
export function createAgentSubscription<THandlerArgs extends UnknownRecord = AgentEventHandlerArgs>(
  config: AgentBCConfig,
  options: CreateAgentSubscriptionOptions<THandlerArgs>
): EventSubscription<THandlerArgs> {
  const {
    handler,
    priority = DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
    toHandlerArgs: customToHandlerArgs,
    getPartitionKey: customGetPartitionKey,
  } = options;

  // Build subscription name: agent:<agentId>
  const subscriptionName = `agent:${config.id}`;

  return {
    name: subscriptionName,
    filter: {
      eventTypes: [...config.subscriptions],
    },
    handler,
    toHandlerArgs: (event: PublishedEvent, chain: CorrelationChain) => {
      if (customToHandlerArgs) {
        return customToHandlerArgs(event, chain, config.id);
      }
      // Cast through unknown for default transformer
      return toAgentHandlerArgs(event, chain, config.id) as unknown as THandlerArgs;
    },
    getPartitionKey: (event: PublishedEvent) => {
      if (customGetPartitionKey) {
        return customGetPartitionKey(event);
      }
      // Default: partition by streamId for ordering
      return { name: "streamId", value: event.streamId };
    },
    priority,
  };
}

// ============================================================================
// Lifecycle Functions
// ============================================================================

/**
 * Generate a unique subscription ID.
 *
 * @param agentId - Agent BC identifier
 * @returns Unique subscription ID
 */
export function generateSubscriptionId(agentId: string): string {
  const timestamp = Date.now();
  const random = uuidv7().slice(0, 8);
  return `sub_${agentId}_${timestamp}_${random}`;
}

/**
 * Initialize an agent bounded context.
 *
 * Creates or resumes the checkpoint, validates configuration,
 * and returns a handle for lifecycle management.
 *
 * Note: This function creates the handle but does NOT automatically
 * register with the EventBus. Use createAgentSubscription separately
 * to create the subscription for registration.
 *
 * @param config - Agent BC configuration
 * @param options - Initialization options
 * @returns Initialization result with handle or error
 *
 * @example
 * ```typescript
 * const result = initializeAgentBC(churnRiskAgentConfig, {
 *   eventBus,
 *   handler: internal.agents.churnRisk.handleEvent,
 *   runtime: myAgentRuntime,
 *   logger,
 * });
 *
 * if (result.success) {
 *   console.log(`Agent ${result.handle.agentId} initialized`);
 * }
 * ```
 */
export function initializeAgentBC(
  config: AgentBCConfig,
  options: InitializeAgentBCOptions
): InitializeAgentBCResult {
  const log = options.logger ?? createPlatformNoOpLogger();

  // Validate configuration
  const validationResult = validateAgentBCConfig(config);
  if (!validationResult.valid) {
    return {
      success: false,
      code: AGENT_INIT_ERROR_CODES.INVALID_CONFIG,
      message: validationResult.message,
    };
  }

  // Create or use existing checkpoint
  const subscriptionId = generateSubscriptionId(config.id);
  const checkpoint =
    options.existingCheckpoint ?? createInitialAgentCheckpoint(config.id, subscriptionId);

  // Create subscription handle
  // Note: pause/resume/unsubscribe are stubs that should be implemented
  // at the infrastructure layer (e.g., with Workpool pause functionality)
  // TODO(Phase-23): Implement pause/resume with Workpool subscription management
  // TODO(Phase-23): Implement unsubscribe with EventBus unregistration
  const subscription: AgentSubscription = {
    subscriptionId,
    agentId: config.id,
    subscriptionName: `agent:${config.id}`,
    pause: async () => {
      log.info("Pausing agent subscription", { agentId: config.id, subscriptionId });
      // TODO(Phase-23): Integrate with Workpool.pause() for durable pause
      // This should update checkpoint status to "paused" and stop event processing
    },
    resume: async () => {
      log.info("Resuming agent subscription", { agentId: config.id, subscriptionId });
      // TODO(Phase-23): Integrate with Workpool.resume() for durable resume
      // This should update checkpoint status to "active" and resume event processing
    },
    unsubscribe: async () => {
      log.info("Unsubscribing agent", { agentId: config.id, subscriptionId });
      // TODO(Phase-23): Integrate with EventBus unregister and Workpool cleanup
      // This should update checkpoint status to "stopped" and remove subscription
    },
  };

  // Create handle
  const handle: AgentBCHandle = {
    agentId: config.id,
    subscription,
    checkpoint,
    config,
  };

  log.info("Agent BC initialized", {
    agentId: config.id,
    subscriptionId,
    subscriptions: config.subscriptions,
    checkpointStatus: checkpoint.status,
  });

  return { success: true, handle };
}

/**
 * Shutdown an agent BC.
 *
 * Unsubscribes from events and marks the checkpoint as stopped.
 *
 * @param handle - Agent BC handle
 * @returns Promise that resolves when shutdown is complete
 */
export async function shutdownAgentBC(handle: AgentBCHandle): Promise<void> {
  await handle.subscription.unsubscribe();
}
