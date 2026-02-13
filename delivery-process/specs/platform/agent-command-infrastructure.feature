@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:AgentCommandInfrastructure
@libar-docs-status:completed
@libar-docs-phase:22c
@libar-docs-effort:1w
@libar-docs-product-area:Platform
@libar-docs-depends-on:AgentLLMIntegration
@libar-docs-executable-specs:platform-core/tests/features/behavior/agent/command-infrastructure
Feature: Agent Command Infrastructure - Routing, Lifecycle, and Pattern Unification

  **Problem:** Three interconnected gaps in agent command infrastructure:
  1. **Commands go nowhere** — Agent emits commands to `agentCommands` table but nothing
     consumes or routes them to target BC handlers
  2. **No lifecycle control** — Agent cannot be paused, resumed, or reconfigured.
     The `pause()`, `resume()` stubs in `init.ts` are TODO(Phase-23) placeholders
  3. **Parallel pattern systems** — `_patterns/churnRisk.ts` defines formal `PatternDefinition`
     with `analyze()` that calls LLM, while `_config.ts` has inline `onEvent` that reimplements
     trigger logic without LLM. These are disconnected implementations

  **Solution:** Complete agent command infrastructure:
  1. **Command routing** via CommandOrchestrator — agent commands flow through existing infrastructure
  2. **Agent lifecycle FSM** — formal state machine with commands for state transitions
  3. **Unified pattern registry** — single source of truth for pattern trigger + analysis

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Commands have effect | Emitted agent commands route to actual domain handlers |
  | Agent controllability | Operators can pause/resume/reconfigure agents via commands |
  | Single pattern source | One PatternDefinition powers both trigger and LLM analysis |
  | Audit completeness | Full command lifecycle tracked through Command Bus |
  | Consistent architecture | Agent commands use same infrastructure as domain commands |
  | Operational safety | Lifecycle FSM prevents invalid state transitions |

  **Current Gap: Command Emission Dead End**
  """
  Agent detects pattern
       |
       v
  emitAgentCommand()
       |
       v
  INSERT into agentCommands table
       |
       v
  ??? (nothing consumes the command)
  """

  **Target: Full Command Routing**
  """
  Agent detects pattern
       |
       v
  CommandOrchestrator.execute(agentCommandConfig)
       |
       +--> Command Bus (idempotency, audit)
       +--> Target BC handler (e.g., customerOutreach)
       +--> Event Store (CommandEmitted event)
       +--> Projection update
  """

  **Design Decision: Command Routing Approach**

  | Option | Mechanism | Trade-off |
  | A: CommandOrchestrator (Recommended) | Agent commands flow through same orchestrator as domain commands | Consistent, audited, idempotent; adds standard indirection |
  | B: Direct handler calls | Agent calls target BC mutation directly via makeFunctionReference | Simpler but bypasses command infrastructure |
  | C: Integration events | Agent publishes integration event, consumer PM handles | Loosest coupling but most complex; better for cross-system |

  **Decision:** Option A — CommandOrchestrator provides:
  - Command idempotency via Command Bus
  - Full audit trail (command recorded, status tracked)
  - Middleware pipeline (validation, logging, authorization)
  - Consistent with how all other commands work in the platform

  **Design Decision: Agent Lifecycle FSM**

  """
  stopped ──> active ──> paused ──> active
                 |                     |
                 v                     v
              stopped              stopped
                 |
                 v
           error_recovery ──> active
  """

  | State | Description | Allowed Transitions |
  | stopped | Not processing events | -> active (via StartAgent) |
  | active | Processing events normally | -> paused, stopped, error_recovery |
  | paused | Temporarily not processing, checkpoint preserved | -> active, stopped |
  | error_recovery | Automatic recovery after repeated failures | -> active (after cooldown) |

  **Lifecycle Commands:**
  | Command | Transition | Effect |
  | StartAgent | stopped -> active | Resume/start EventBus subscription from checkpoint |
  | PauseAgent | active -> paused | Stop processing, preserve checkpoint for resume |
  | ResumeAgent | paused -> active | Resume from last checkpoint position |
  | StopAgent | any -> stopped | Stop and clear subscription (checkpoint preserved) |
  | ReconfigureAgent | active/paused -> active | Update config without losing state |

  **Design Decision: Pattern System Unification**

  **Current disconnect:**
  | Implementation | Location | Uses LLM | Used in Production |
  | _config.ts onEvent (inline) | contexts/agent/_config.ts | No | Yes (EventBus handler) |
  | PatternDefinition.analyze() | contexts/agent/_patterns/churnRisk.ts | Yes | No (never called) |

  **Target: Unified pattern flow**
  1. Remove inline `onEvent` from `AgentBCConfig`
  2. Add `patterns: PatternDefinition[]` field to `AgentBCConfig`
  3. Handler uses pattern's `trigger()` to check if analysis needed
  4. Handler uses pattern's `analyze()` for LLM analysis (in action)
  5. Single definition powers both cheap rule check and expensive LLM call

  """typescript
  // Target AgentBCConfig (simplified)
  interface AgentBCConfig {
    id: string;
    subscriptions: string[];
    patterns: PatternDefinition[];  // Replaces onEvent
    confidenceThreshold: number;
    humanInLoop?: HumanInLoopConfig;
    rateLimits?: RateLimitConfig;
    // onEvent removed - patterns handle detection + analysis
  }
  """

  **SuggestCustomerOutreach Command Registration:**

  Agent commands are domain commands — they route to target BC handlers (e.g.,
  `customerOutreach`), not back to the agent. Registration follows the existing
  `commands/registry.ts` pattern used by order and inventory commands.

  """typescript
  // commands/agent/configs.ts — agent command config
  import { z } from "zod";
  import { globalRegistry } from "@libar-dev/platform-core";

  const SuggestCustomerOutreachSchema = z.object({
    customerId: z.string(),
    suggestedAction: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    triggeringPatternId: z.string(),
  });

  globalRegistry.register("SuggestCustomerOutreach", {
    schema: SuggestCustomerOutreachSchema,
    description: "Agent-emitted suggestion for customer outreach based on detected pattern",
    category: "agent",
    version: 1,
    handler: internal.commands.agent.handleSuggestCustomerOutreach,
    projections: [],  // No projections — handler creates follow-up task or notification
  });
  """

  **Lifecycle FSM ↔ Checkpoint Status Mapping:**

  Lifecycle commands map directly to checkpoint statuses (from stubs `schema.ts:72-77`):

  | Command | From Status | To Status | EventBus Effect | Checkpoint Effect |
  | StartAgent | stopped | active | Subscription activated from checkpoint position | Status → active |
  | PauseAgent | active | paused | Subscription deactivated | Status → paused, position preserved |
  | ResumeAgent | paused | active | Subscription reactivated from lastProcessedPosition + 1 | Status → active |
  | StopAgent | any | stopped | Subscription removed | Status → stopped, position preserved |
  | (automatic) | active | error_recovery | Subscription paused after repeated failures | Status → error_recovery, cooldown starts |
  | (automatic) | error_recovery | active | Auto-resume after cooldown period | Status → active |

  The `error_recovery` state is NOT triggered by commands but by the agent framework
  detecting repeated failures (e.g., 5 consecutive dead letters). After a configurable
  cooldown period, the agent auto-resumes to `active`. This prevents tight retry loops
  that amplify transient failures.

  **ReconfigureAgent** applies runtime config overrides stored in checkpoint's
  `configOverrides: v.optional(v.any())` field (forward-declared in stubs). Overrides
  are merged with base `AgentBCConfig` at handler invocation time, allowing threshold
  changes without redeployment.

  **Pattern Registry Concrete API:**

  """typescript
  // Agent pattern registry — maps pattern names to definitions
  const patternRegistry = new Map<string, PatternDefinition>();

  export function registerPattern(name: string, definition: PatternDefinition): void {
    if (patternRegistry.has(name)) throw new Error(`Pattern '${name}' already registered`);
    patternRegistry.set(name, definition);
  }

  export function getPattern(name: string): PatternDefinition | undefined {
    return patternRegistry.get(name);
  }

  // Registration at module init (existing patterns from _patterns/)
  registerPattern("churn-risk", churnRiskPattern);
  registerPattern("high-value-churn", highValueChurnPattern);
  """

  Agent config references patterns by name string, resolved at initialization:
  """typescript
  const churnRiskAgentConfig: AgentBCConfig = {
    id: "churn-risk-agent",
    subscriptions: ["OrderCancelled", "OrderSubmitted", "PaymentFailed"],
    patterns: ["churn-risk", "high-value-churn"],  // Resolved from registry
    confidenceThreshold: 0.8,
  };
  """

  **Migration Notes — Inline onEvent to Pattern-Based Architecture:**

  Backward-compatible transition in 4 phases:

  | Phase | Change | Breaking |
  | 1 | Add optional `patterns` field to `AgentBCConfig` (alongside existing `onEvent`) | No |
  | 2 | Handler checks: if `patterns` present → use pattern registry; if `onEvent` → legacy path | No |
  | 3 | Migrate `churnRiskAgentConfig` from `onEvent` to `patterns` array | No (both paths work) |
  | 4 | Deprecate `onEvent` field (log warning when used) | No (soft deprecation) |

  The existing `_config.ts` inline `onEvent` handler and `_patterns/churnRisk.ts` formal
  `PatternDefinition` converge into a single code path: patterns handle both cheap trigger
  evaluation (formerly inline in `onEvent`) and expensive LLM analysis (formerly unreachable
  in `_patterns/churnRisk.ts`).

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Agent command router | Done | @libar-dev/platform-core/src/agent/command-router.ts | Yes | unit |
      | CommandOrchestrator integration for agent commands | Done | @libar-dev/platform-core/src/agent/command-bridge.ts | Yes | unit |
      | Agent lifecycle FSM | Done | @libar-dev/platform-core/src/agent/lifecycle-fsm.ts | Yes | unit |
      | StartAgent command handler | Done | @libar-dev/platform-core/src/agent/lifecycle-handlers.ts | Yes | unit |
      | PauseAgent command handler | Done | @libar-dev/platform-core/src/agent/lifecycle-handlers.ts | Yes | unit |
      | ResumeAgent command handler | Done | @libar-dev/platform-core/src/agent/lifecycle-handlers.ts | Yes | unit |
      | StopAgent command handler | Done | @libar-dev/platform-core/src/agent/lifecycle-handlers.ts | Yes | unit |
      | ReconfigureAgent command handler | Done | @libar-dev/platform-core/src/agent/lifecycle-handlers.ts | Yes | unit |
      | Unified pattern executor | Done | @libar-dev/platform-core/src/agent/pattern-executor.ts | Yes | unit |
      | Pattern registry | Done | @libar-dev/platform-core/src/agent/pattern-registry.ts | Yes | unit |
      | AgentBCConfig patterns field | Done | @libar-dev/platform-core/src/agent/types.ts | Yes | unit |

  # ============================================================================
  # RULE 1: Emitted Commands Are Routed to Handlers
  # ============================================================================

  Rule: Emitted commands are routed to handlers

    **Invariant:** Commands emitted by agents must flow through CommandOrchestrator and
    be processed by registered handlers. Commands cannot remain unprocessed in a table.

    **Rationale:** The current `agentCommands` table receives inserts from `emitAgentCommand()`
    but nothing acts on them. The emitted `SuggestCustomerOutreach` command sits with status
    "pending" forever. For the agent to have real impact, its commands must reach domain handlers.

    **Command Routing Flow:**
    | Step | Action | Component |
    | 1 | Agent decides to emit command | Agent action handler |
    | 2 | Command recorded in onComplete | Agent component |
    | 3 | CommandOrchestrator.execute() | Platform orchestrator |
    | 4 | Target BC handler processes command | Domain BC |
    | 5 | Command status updated | Agent component |

    **Verified by:** Command routes to handler, status lifecycle tracked,
    unknown command rejected

    @acceptance-criteria @happy-path
    Scenario: Agent command routes through CommandOrchestrator to handler
      Given an agent has emitted a SuggestCustomerOutreach command
      When the command is routed via CommandOrchestrator
      Then the registered handler for SuggestCustomerOutreach is called
      And the command status transitions pending -> processing -> completed
      And an audit event records the command execution

    @acceptance-criteria @validation
    Scenario: Unknown command type is rejected with validation error
      Given an agent emits a command with unregistered type "UnknownAction"
      When the command routing attempts to find a handler
      Then the routing fails with UNKNOWN_COMMAND_TYPE error
      And the command status transitions to "failed"
      And an audit event records the failure

    @acceptance-criteria @happy-path
    Scenario: Command idempotency prevents duplicate processing
      Given an agent emits a SuggestCustomerOutreach command with commandId "cmd_123"
      And the command has already been processed successfully
      When the same commandId is submitted again
      Then the Command Bus rejects it as a duplicate
      And no handler is called

  # ============================================================================
  # RULE 2: Agent Lifecycle Is Controlled Via Commands
  # ============================================================================

  Rule: Agent lifecycle is controlled via commands

    **Invariant:** Agent state changes (start, pause, resume, stop, reconfigure) must
    happen via commands, not direct database manipulation. Each transition is validated
    by the lifecycle FSM and recorded in the audit trail.

    **Rationale:** Commands provide audit trail, FSM validation, and consistent state
    transitions. Direct DB manipulation bypasses these safeguards. The lifecycle FSM
    prevents invalid transitions (e.g., pausing an already-stopped agent).

    **Verified by:** Valid transitions succeed, invalid transitions rejected,
    paused agent stops processing

    @acceptance-criteria @happy-path
    Scenario: PauseAgent transitions active agent to paused
      Given a churn-risk agent in "active" state
      When a PauseAgent command is executed
      Then the agent state transitions to "paused"
      And the checkpoint is preserved at current position
      And new events are not processed while paused
      And an AgentPaused audit event is recorded

    @acceptance-criteria @happy-path
    Scenario: ResumeAgent resumes from checkpoint position
      Given a churn-risk agent in "paused" state
      And the checkpoint is at position 42
      When a ResumeAgent command is executed
      Then the agent state transitions to "active"
      And event processing resumes from position 43
      And an AgentResumed audit event is recorded

    @acceptance-criteria @validation
    Scenario: Invalid lifecycle transition is rejected
      Given a churn-risk agent in "stopped" state
      When a PauseAgent command is executed
      Then the command is rejected with INVALID_LIFECYCLE_TRANSITION
      And the agent remains in "stopped" state
      And the rejection is recorded in audit trail

    @acceptance-criteria @edge-case
    Scenario: ReconfigureAgent updates configuration without losing state
      Given an active churn-risk agent with confidenceThreshold 0.8
      When a ReconfigureAgent command changes threshold to 0.7
      Then the agent continues from its current checkpoint
      And future analysis uses the new threshold
      And the config change is recorded in audit trail

  # ============================================================================
  # RULE 3: Pattern Definitions Are the Single Source of Truth
  # ============================================================================

  Rule: Pattern definitions are the single source of truth

    **Invariant:** Each agent references named patterns from a registry. The pattern's
    `trigger()` and `analyze()` functions are used by the event handler, eliminating
    parallel implementations.

    **Rationale:** The current codebase has two disconnected pattern implementations:
    `_config.ts` with inline rule-based detection and `_patterns/churnRisk.ts` with
    formal `PatternDefinition` including LLM analysis. This creates confusion about
    which code path runs in production and makes the LLM analysis unreachable.

    **Unified Flow:**
    """
    Event arrives at agent
         |
         v
    For each pattern in agent.patterns:
         |
         +--- pattern.trigger(events) -> boolean
         |         |
         |    No?  +--- Skip to next pattern
         |    Yes? |
         |         v
         +--- pattern.analyze(events, agent) -> AnalysisResult
         |         |
         |         v
         +--- Build AgentDecision from analysis
    """

    **Verified by:** Config references patterns by name, handler uses pattern methods,
    inline onEvent removed

    @acceptance-criteria @happy-path
    Scenario: Agent config references patterns from registry
      Given a pattern "churn-risk" registered in the pattern registry
      When configuring a churn-risk agent
      Then the agent config references patterns by name
      And the handler loads pattern definitions from registry at startup

    @acceptance-criteria @happy-path
    Scenario: Handler uses pattern trigger for cheap detection
      Given an event delivered to the agent handler
      When the handler evaluates patterns
      Then it calls pattern.trigger(eventHistory) first
      And only proceeds to pattern.analyze() if trigger returns true
      And this avoids unnecessary LLM calls for non-matching events

    @acceptance-criteria @happy-path
    Scenario: Handler uses pattern analyze for LLM analysis
      Given a pattern trigger has fired for 3+ cancellations
      When the handler calls pattern.analyze(eventHistory, agentContext)
      Then the LLM analysis provides confidence, reasoning, and suggested action
      And the result is wrapped in an AgentDecision
      And the analysis method is recorded as "llm" in the audit trail

    @acceptance-criteria @validation
    Scenario: Unknown pattern name in config fails validation
      Given an agent config referencing pattern "nonexistent-pattern"
      When the agent is initialized
      Then initialization fails with PATTERN_NOT_FOUND error
      And the error includes the pattern name for debugging
