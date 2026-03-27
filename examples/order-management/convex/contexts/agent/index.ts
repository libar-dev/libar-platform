/**
 * @architect
 * @architect-ddd @architect-core
 * @architect-implements AgentAsBoundedContext
 * @architect-status active
 * @architect-phase 22
 * @architect-depends-on IntegrationPatterns,ReactiveProjections
 * @architect-brief docs/project-management/aggregate-less-pivot/pattern-briefs/08-agent-as-bc.md
 *
 * ## Agent as Bounded Context - AI-Driven Event Reactors
 *
 * Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to
 * domain events via EventBus and emit commands based on pattern detection.
 *
 * ### Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           EventBus                                      │
 * │  (publishes OrderCancelled, OrderRefunded, OrderComplaintFiled, etc.)  │
 * └────────────────────────────────┬────────────────────────────────────────┘
 *                                  │ subscribe
 *                                  ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                      Agent BC (Churn Risk)                             │
 * │ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
 * │ │   Checkpoint    │ │     Pattern     │ │     Config      │            │
 * │ │   (Position)    │ │   (Detection)   │ │  (Subscriptions)│            │
 * │ └─────────────────┘ └─────────────────┘ └─────────────────┘            │
 * │           │                   │                   │                    │
 * │           └───────────────────┼───────────────────┘                    │
 * │                               ▼                                        │
 * │ ┌───────────────────────────────────────────────────────────────────┐  │
 * │ │                     Event Handler                                 │  │
 * │ │  1. Load checkpoint (idempotency)                                 │  │
 * │ │  2. Load event history (pattern window)                           │  │
 * │ │  3. Evaluate pattern trigger                                      │  │
 * │ │  4. Make decision (rule-based or LLM)                             │  │
 * │ │  5. Emit command (with explainability)                            │  │
 * │ │  6. Update checkpoint                                             │  │
 * │ └───────────────────────────────────────────────────────────────────┘  │
 * └────────────────────────────────┬────────────────────────────────────────┘
 *                                  │ emit command
 *                                  ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           Command Bus                                   │
 * │              (routes SuggestCustomerOutreach, etc.)                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ### Key Concepts
 *
 * - **Agent BC**: AI agent treated as a first-class bounded context
 * - **Pattern Detection**: Rules + optional LLM for complex patterns
 * - **Autonomous Commands**: Agent emits commands with full explainability
 * - **Human-in-Loop**: Configurable approval workflow for low-confidence decisions
 * - **Checkpoint Pattern**: Position tracking for exactly-once semantics
 *
 * ### Example: Churn Risk Detection
 *
 * This example implements a churn risk agent that:
 * 1. Subscribes to OrderCancelled events via EventBus
 * 2. Tracks cancellation patterns per customer (30-day window)
 * 3. Detects churn risk when a customer cancels 3+ orders
 * 4. Emits SuggestCustomerOutreach command with confidence score
 *
 * @example
 * ```typescript
 * import { createAgentSubscription } from "@libar-dev/platform-bus/agent-subscription";
 * import { churnRiskAgentConfig } from "./config";
 *
 * // Create EventBus subscription for the agent
 * const subscription = createAgentSubscription(churnRiskAgentConfig, {
 *   actionHandler: internal.contexts.agent.handlers.analyzeEvent.analyzeChurnRiskEvent,
 *   onComplete: internal.contexts.agent.handlers.onComplete.handleChurnRiskOnComplete,
 *   priority: 250, // Run after projections (100) and PMs (200)
 * });
 *
 * // Register with EventBus
 * const subscriptions = defineSubscriptions((registry) => {
 *   registry.add(subscription);
 * });
 * ```
 *
 * @module contexts/agent
 */

// ============================================================================
// Configuration
// ============================================================================

export { CHURN_RISK_AGENT_ID, CHURN_RISK_SUBSCRIPTIONS, churnRiskAgentConfig } from "./_config.js";

// Agent utilities — import from _utils/ directly
export { extractCustomerId, calculateChurnConfidence, buildChurnReason } from "./_utils/index.js";

// ============================================================================
// Patterns
// ============================================================================

export {
  CHURN_RISK_PATTERN_NAME,
  MIN_CANCELLATIONS,
  CHURN_RISK_WINDOW_DURATION,
  churnRiskPattern,
  createCustomerCancellationTrigger,
  __testing as patternsTesting,
} from "./_patterns/churnRisk.js";

// ============================================================================
// Command Types
// ============================================================================

export {
  CHURN_RISK_COMMANDS,
  type SuggestCustomerOutreachPayload,
  type LogChurnRiskPayload,
  type FlagCustomerForReviewPayload,
} from "./tools/emitCommand.js";

// ============================================================================
// Re-exports from Platform Core (for convenience)
// ============================================================================

export type {
  // Core Types
  AgentBCConfig,
  AgentDecision,
  AgentExecutionContext,
  PatternWindow,
  HumanInLoopConfig,

  // Pattern Types
  PatternDefinition,
  PatternTrigger,
  PatternAnalysisResult,

  // Checkpoint Types
  AgentCheckpoint,
  AgentCheckpointStatus,

  // Command Types
  EmittedAgentCommand,
  EmittedAgentCommandMetadata,

  // Approval Types
  PendingApproval,
  ApprovalStatus,

  // Dead Letter Types
  AgentDeadLetter,
  AgentDeadLetterStatus,

  // Audit Types
  AgentAuditEvent,
  AgentAuditEventType,
} from "@libar-dev/platform-core/agent";

export {
  // Pattern Helpers
  definePattern,
  PatternTriggers,
  parseDuration,
  calculateWindowBoundary,
  filterEventsInWindow,

  // Checkpoint Helpers
  createInitialAgentCheckpoint,
  shouldProcessAgentEvent,
  isAgentActive,

  // Command Helpers
  createEmittedAgentCommand,
  createCommandFromDecision,

  // Approval Helpers
  shouldRequireApproval,
  createPendingApproval,

  // Audit Helpers
  createPatternDetectedAudit,

  // Init Helpers
  createMockAgentRuntime,
  initializeAgentBC,
} from "@libar-dev/platform-core/agent";

// Re-export subscription helper from platform-bus
export {
  createAgentSubscription,
  DEFAULT_AGENT_SUBSCRIPTION_PRIORITY,
  type AgentEventHandlerArgs,
  type AgentDefinitionForSubscription,
  type CreateAgentSubscriptionOptions,
} from "@libar-dev/platform-bus/agent-subscription";
