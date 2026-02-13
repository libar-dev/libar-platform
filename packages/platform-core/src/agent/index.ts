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
  isValidAgentCheckpoint,
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

  // Schema Types
  AgentAuditEventTypeSchemaType,
  PatternDetectedPayloadSchemaType,
  ApprovalGrantedPayloadSchemaType,
  ApprovalRejectedPayloadSchemaType,
  ApprovalExpiredPayloadSchemaType,
  AuditLLMContextSchemaType,
  AuditActionSchemaType,
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
// Cross-BC Query Types
// ============================================================================

export type {
  CancellationRecord,
  CustomerCancellationHistory,
  AgentEventHandlerInjectedData,
} from "./cross-bc-query.js";
