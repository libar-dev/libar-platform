/**
 * ## Agent as Bounded Context - AI Agent Event Reactor Pattern
 *
 * Enable AI agents as first-class bounded contexts that subscribe to domain events
 * and emit commands autonomously.
 *
 * Implements Agent as Bounded Context pattern where AI agents subscribe to domain
 * events via EventBus and emit commands based on pattern detection. Integrates
 * with @convex-dev/agent for LLM reasoning. Establishes patterns for agent state
 * management, EventBus subscriptions, and command validation.
 *
 * ### When to Use
 *
 * - When implementing AI-driven automation based on domain events
 * - When you need autonomous command emission from agents
 * - When integrating LLM reasoning with event-sourced systems
 * - When building intelligent event reactors
 *
 * ### Key Concepts
 *
 * - **Agent BC**: AI agent as first-class bounded context
 * - **Event Subscription**: Agent subscribes to EventBus events
 * - **Pattern Detection**: Agent detects patterns in event streams
 * - **Autonomous Commands**: Agent emits commands based on detected patterns
 *
 * @example
 * ```typescript
 * import { initializeAgentBC, type AgentBCConfig } from "@libar-dev/platform-core/agent";
 *
 * const config: AgentBCConfig = {
 *   id: "churn-risk-agent",
 *   subscriptions: ["OrderCancelled", "OrderRefunded"],
 *   patternWindow: { duration: "30d", minEvents: 3 },
 *   confidenceThreshold: 0.8,
 *   onEvent: async (event, ctx) => {
 *     const analysis = await ctx.agent.analyze(
 *       "Detect customer churn risk based on cancellation patterns",
 *       ctx.history
 *     );
 *
 *     if (analysis.confidence > ctx.config.confidenceThreshold) {
 *       return {
 *         command: "SuggestCustomerOutreach",
 *         payload: { customerId: event.streamId, risk: analysis.confidence },
 *         confidence: analysis.confidence,
 *         reason: analysis.reasoning,
 *         requiresApproval: analysis.confidence < 0.9,
 *         triggeringEvents: analysis.patterns[0]?.matchingEventIds ?? [event.eventId],
 *       };
 *     }
 *     return null;
 *   },
 * };
 * ```
 *
 * @module agent
 */

// ============================================================================
// Error Codes
// ============================================================================

export { AGENT_CONFIG_ERROR_CODES } from "./types.js";
export type { AgentConfigErrorCode } from "./types.js";

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Pattern Window
  PatternWindow,

  // Human-in-Loop
  HumanInLoopConfig,

  // Rate Limiting
  AgentRateLimitConfig,

  // Decision Types
  AgentDecision,
  LLMAnalysisResult,
  DetectedPattern,
  LLMContext,

  // Execution Context
  AgentExecutionContext,
  AgentInterface,
  AgentCheckpointState,

  // Configuration
  AgentEventHandler,
  AgentBCConfig,

  // Validation
  AgentConfigValidationResult,
} from "./types.js";

// ============================================================================
// Validation
// ============================================================================

export { validateAgentBCConfig } from "./types.js";

// ============================================================================
// Checkpoint
// ============================================================================

export {
  // Constants
  AGENT_CHECKPOINT_STATUSES,

  // Schemas
  AgentCheckpointStatusSchema,
  AgentCheckpointSchema,

  // Factory Functions
  createInitialAgentCheckpoint,
  applyCheckpointUpdate,

  // Helper Functions
  shouldProcessAgentEvent,
  isAgentActive,
  isAgentPaused,
  isAgentStopped,
  isAgentInErrorRecovery,
  isValidAgentCheckpoint,

  // Config Resolution
  resolveEffectiveConfig,
} from "./checkpoint.js";

export type {
  // Types
  AgentCheckpointStatus,
  AgentCheckpoint,
  AgentCheckpointUpdate,

  // Schema Types
  AgentCheckpointSchemaType,
  AgentCheckpointStatusSchemaType,
} from "./checkpoint.js";

// ============================================================================
// Patterns
// ============================================================================

export {
  // Error Codes
  PATTERN_ERROR_CODES,

  // Schemas
  PatternWindowSchema,

  // Factory Functions
  definePattern,

  // Duration Parsing
  parseDuration,
  isValidDuration,

  // Validation
  validatePatternDefinition,

  // Helper Functions
  calculateWindowBoundary,
  filterEventsInWindow,
  hasMinimumEvents,

  // Common Triggers
  PatternTriggers,
} from "./patterns.js";

export type {
  // Error Types
  PatternErrorCode,

  // Pattern Types
  PatternTrigger,
  PatternAnalyzer,
  PatternAnalysisResult,
  PatternDefinition,
  PatternValidationResult,

  // Schema Types
  PatternWindowSchemaType,
} from "./patterns.js";

// ============================================================================
// Pattern Registry
// ============================================================================

export {
  // Error Codes
  PATTERN_REGISTRY_ERROR_CODES,

  // Validation
  validatePatternDefinitions,
} from "./pattern-registry.js";

export type {
  // Error Types
  PatternRegistryErrorCode,

  // Validation Types
  PatternRegistryValidationResult,
} from "./pattern-registry.js";

// ============================================================================
// Pattern Executor
// ============================================================================

export {
  // Core Executor
  executePatterns,

  // Decision Builders
  buildDecisionFromAnalysis,
  buildDecisionFromTrigger,
} from "./pattern-executor.js";

export type {
  // Execution Types
  PatternExecutionSummary,
} from "./pattern-executor.js";

// ============================================================================
// Rate Limiting
// ============================================================================

export {
  // Error Codes
  RATE_LIMIT_ERROR_CODES,

  // Schemas
  CostBudgetSchema,
  AgentRateLimitConfigSchema,

  // Constants
  DEFAULT_RATE_LIMIT_VALUES,

  // Factory Functions
  createDefaultRateLimitConfig,
  createRateLimitConfigWithBudget,
  createRateLimitError,

  // Validation
  validateRateLimitConfig,

  // Type Guards
  isRateLimitError,
  isRetryableError,
  isPermanentError,

  // Helper Functions
  calculateBackoffDelay,
  getEffectiveRateLimitConfig,
  wouldExceedBudget,
  isAtAlertThreshold,
} from "./rate-limit.js";

export type {
  // Error Types
  RateLimitErrorCode,
  RateLimitError,
  RateLimitValidationResult,

  // Schema Types
  CostBudgetSchemaType,
  AgentRateLimitConfigSchemaType,
} from "./rate-limit.js";

// ============================================================================
// Dead Letter
// ============================================================================

export {
  // Error Codes
  DEAD_LETTER_ERROR_CODES,

  // Constants
  AGENT_DEAD_LETTER_STATUSES,

  // Schemas
  AgentDeadLetterStatusSchema,
  AgentDeadLetterContextSchema,
  AgentDeadLetterSchema,

  // Error Sanitization
  sanitizeErrorMessage,

  // Factory Functions
  createAgentDeadLetter,
  incrementDeadLetterAttempt,

  // Status Transition Functions
  markDeadLetterReplayed,
  markDeadLetterIgnored,

  // Type Guards
  isAgentDeadLetterStatus,
  isDeadLetterPending,
  isDeadLetterReplayed,
  isDeadLetterIgnored,

  // Validation
  validateAgentDeadLetter,
} from "./dead-letter.js";

export type {
  // Error Types
  DeadLetterErrorCode,

  // Types
  AgentDeadLetterStatus,
  AgentDeadLetterContext,
  AgentDeadLetter,

  // Schema Types
  AgentDeadLetterSchemaType,
  AgentDeadLetterStatusSchemaType,
  AgentDeadLetterContextSchemaType,
} from "./dead-letter.js";

// ============================================================================
// Audit
// ============================================================================

export {
  // Constants
  AGENT_AUDIT_EVENT_TYPES,

  // Schemas
  AgentAuditEventTypeSchema,
  AuditLLMContextSchema,
  AuditActionSchema,
  PatternDetectedPayloadSchema,
  ApprovalGrantedPayloadSchema,
  ApprovalRejectedPayloadSchema,
  ApprovalExpiredPayloadSchema,
  AgentAuditEventSchema,

  // ID Generation
  generateDecisionId,
  createLifecycleDecisionId,

  // Factory Functions
  createPatternDetectedAudit,
  createApprovalGrantedAudit,
  createApprovalRejectedAudit,
  createApprovalExpiredAudit,
  createGenericAuditEvent,

  // Type Guards
  isAgentAuditEventType,
  isPatternDetectedEvent,
  isApprovalGrantedEvent,
  isApprovalRejectedEvent,

  // Validation
  validateAgentAuditEvent,
} from "./audit.js";

export type {
  // Types
  AgentAuditEventType,
  AuditLLMContext,
  AuditAction,
  PatternDetectedPayload,
  ApprovalGrantedPayload,
  ApprovalRejectedPayload,
  ApprovalExpiredPayload,
  AgentAuditEventBase,
  AgentAuditEvent,

  // Lifecycle Payload Types
  AgentStartedPayload,
  AgentPausedPayload,
  AgentResumedPayload,
  AgentStoppedPayload,
  AgentReconfiguredPayload,
  AgentErrorRecoveryStartedPayload,
} from "./audit.js";

// ============================================================================
// Approval
// ============================================================================

export {
  // Error Codes
  APPROVAL_ERROR_CODES,

  // Constants
  APPROVAL_STATUSES,
  DEFAULT_APPROVAL_TIMEOUT_MS,

  // Schemas
  ApprovalStatusSchema,
  ApprovalActionSchema,
  PendingApprovalSchema,

  // Timeout Parsing
  parseApprovalTimeout,
  isValidApprovalTimeout,
  calculateExpirationTime,

  // Approval Determination
  shouldRequireApproval,

  // ID Generation
  generateApprovalId,

  // Factory Functions
  createPendingApproval,

  // Status Transition Functions
  approveAction,
  rejectAction,
  expireAction,

  // Type Guards
  isApprovalStatus,
  isApprovalPending,
  isApprovalApproved,
  isApprovalRejected,
  isApprovalExpired,
  isApprovalActionable,

  // Validation
  validatePendingApproval,

  // Helper Functions
  getRemainingApprovalTime,
  formatRemainingApprovalTime,

  // Authorization
  ApprovalAuthContextSchema,
  isAuthorizedReviewer,
  safeApproveAction,
  safeRejectAction,
} from "./approval.js";

export type {
  // Error Types
  ApprovalErrorCode,

  // Types
  ApprovalStatus,
  ApprovalAction,
  PendingApproval,
  ApprovalAuthContext,
  ApprovalOperationResult,

  // Schema Types
  ApprovalStatusSchemaType,
  PendingApprovalSchemaType,
  ApprovalActionSchemaType,
} from "./approval.js";

// ============================================================================
// Commands
// ============================================================================

export {
  // Error Codes
  COMMAND_EMISSION_ERROR_CODES,

  // Schemas
  EmittedAgentCommandMetadataSchema,
  EmittedAgentCommandSchema,

  // Validation
  validateAgentCommand,

  // Factory Functions
  createEmittedAgentCommand,
  createCommandFromDecision,

  // Type Guards
  isEmittedAgentCommand,
  hasPatternId,
  hasAnalysisData,
} from "./commands.js";

export type {
  // Error Types
  CommandEmissionErrorCode,

  // Types
  EmittedAgentCommandMetadata,
  EmittedAgentCommand,
  CommandEmissionValidationResult,
  ValidateCommandArgs,
  CreateEmittedAgentCommandOptions,
  CreateCommandFromDecisionOptions,

  // Schema Types
  EmittedAgentCommandMetadataSchemaType,
  EmittedAgentCommandSchemaType,
} from "./commands.js";

// ============================================================================
// Initialization
// ============================================================================

export {
  // Error Codes
  AGENT_INIT_ERROR_CODES,

  // Mock Runtime
  createMockAgentRuntime,
  createAgentInterface,

  // Handler Transform
  toAgentHandlerArgs,

  // Event Handler Factory
  createAgentEventHandler,

  // Lifecycle Functions
  generateSubscriptionId,
  initializeAgentBC,
  shutdownAgentBC,
} from "./init.js";

// NOTE: createAgentSubscription is intentionally NOT exported from platform-core.
// Use @libar-dev/platform-bus/agent-subscription instead - it's the public API
// with better caching and context-aware subscription naming.

export type {
  // Error Types
  AgentInitErrorCode,

  // Subscription Types
  AgentSubscription,
  AgentBCHandle,

  // Runtime Types
  AgentRuntimeConfig,

  // Initialization Types
  InitializeAgentBCOptions,
  InitializeAgentBCResult,

  // Handler Types
  AgentEventHandlerArgs,
  CreateAgentEventHandlerContext,
  AgentEventHandlerResult,
} from "./init.js";

// NOTE: CreateAgentSubscriptionOptions is available from @libar-dev/platform-bus/agent-subscription

// ============================================================================
// Action Handler (Action/Mutation Split Pattern)
// ============================================================================

export {
  // Factory Function
  createAgentActionHandler,
} from "./action-handler.js";

export type {
  // State Loading Types
  AgentStateLoader,
  AgentActionState,

  // Action Result Types
  AgentActionResult,

  // Factory Configuration
  AgentActionHandlerConfig,
} from "./action-handler.js";

// ============================================================================
// Shared Handler Types
// ============================================================================

export { getAgentSubscriptionId } from "./handler-types.js";

export type { AgentComponentAPI, RunMutationCtx } from "./handler-types.js";

// ============================================================================
// onComplete Handler (Action/Mutation Split Pattern)
// ============================================================================

export {
  // Factory Function
  createAgentOnCompleteHandler,
} from "./oncomplete-handler.js";

export type {
  // Workpool Context Type
  AgentWorkpoolContext,

  // onComplete Args Type
  AgentOnCompleteArgs,

  // Factory Configuration
  AgentOnCompleteConfig,
} from "./oncomplete-handler.js";

// ============================================================================
// Thread Adapter (LLM Integration)
// ============================================================================

export { createThreadAdapter } from "./thread-adapter.js";

export type { ThreadAdapterConfig, GenerateTextResult } from "./thread-adapter.js";

// ============================================================================
// Agent Rate Limiter (Runtime Integration)
// ============================================================================

export { withRateLimit } from "./agent-rate-limiter.js";

export type { AgentRateLimiterConfig, RateLimitedResult } from "./agent-rate-limiter.js";

// ============================================================================
// Cost Budget Tracking
// ============================================================================

export { checkBudget, estimateCost, DEFAULT_MODEL_COSTS } from "./cost-budget.js";

export type { CostBudgetConfig, CostTracker, BudgetCheckResult } from "./cost-budget.js";

// ============================================================================
// Lifecycle FSM
// ============================================================================

export {
  // Constants
  AGENT_LIFECYCLE_STATES,
  AGENT_LIFECYCLE_EVENTS,

  // Transition Functions
  isValidAgentTransition,
  transitionAgentState,
  assertValidAgentTransition,

  // Query Functions
  getValidAgentEventsFrom,
  getAllAgentTransitions,

  // State Classification
  isAgentErrorState,
  isAgentProcessingState,
  commandToEvent,
} from "./lifecycle-fsm.js";

export type {
  // Types
  AgentLifecycleState,
  AgentLifecycleEvent,
  AgentLifecycleTransition,
} from "./lifecycle-fsm.js";

// ============================================================================
// Lifecycle Commands
// ============================================================================

export {
  // Error Codes
  AGENT_LIFECYCLE_ERROR_CODES,

  // Convex Validators
  lifecycleStateValidator,
  costBudgetOverridesValidator,
  rateLimitOverridesValidator,
  configOverridesValidator,
  startAgentArgsValidator,
  pauseAgentArgsValidator,
  resumeAgentArgsValidator,
  stopAgentArgsValidator,
  reconfigureAgentArgsValidator,
} from "./lifecycle-commands.js";

export type {
  // Config Types
  AgentConfigOverrides,

  // Command Types
  StartAgentCommand,
  PauseAgentCommand,
  ResumeAgentCommand,
  StopAgentCommand,
  ReconfigureAgentCommand,
  AgentLifecycleCommand,

  // Error Types
  AgentLifecycleErrorCode,

  // Result Types
  AgentLifecycleSuccess,
  AgentLifecycleFailure,
  AgentLifecycleResult,
} from "./lifecycle-commands.js";

// ============================================================================
// Cross-BC Query Types
// ============================================================================

export type {
  CancellationRecord,
  CustomerCancellationHistory,
  AgentEventHandlerInjectedData,
} from "./cross-bc-query.js";

// ============================================================================
// Command Router (DS-4)
// ============================================================================

export {
  // Error Codes
  COMMAND_ROUTING_ERROR_CODES,

  // Route Lookup
  getRoute,

  // Route Validation
  validateRoutes,
} from "./command-router.js";

export type {
  // Error Types
  CommandRoutingErrorCode,

  // Types
  RecordedAgentCommand,
  RoutingContext,
  AgentCommandRoute,
  AgentCommandRouteMap,
  RouteResult,
} from "./command-router.js";

// ============================================================================
// Command Bridge (DS-4)
// ============================================================================

export {
  // Factory Function
  createCommandBridgeHandler,
} from "./command-bridge.js";

export type {
  // Bridge Args
  RouteAgentCommandArgs,

  // Audit Event Types
  AgentCommandRoutedEvent,
  AgentCommandRoutingFailedEvent,

  // Dependencies
  CommandRegistryInterface,
  CommandOrchestratorInterface,

  // Configuration
  CommandBridgeConfig,
} from "./command-bridge.js";

// ============================================================================
// Lifecycle Handlers (DS-5)
// ============================================================================

export {
  // Factory
  createLifecycleHandlers,

  // Individual Handlers
  handleStartAgent,
  handlePauseAgent,
  handleResumeAgent,
  handleStopAgent,
  handleReconfigureAgent,
} from "./lifecycle-handlers.js";

export type {
  // Configuration
  LifecycleHandlerConfig,

  // Args Types
  StartAgentArgs,
  PauseAgentArgs,
  ResumeAgentArgs,
  StopAgentArgs,
  ReconfigureAgentArgs,

  // Factory Return Type
  LifecycleHandlers,
} from "./lifecycle-handlers.js";
