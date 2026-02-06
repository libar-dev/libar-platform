@libar-docs
@libar-docs-adr:013
@libar-docs-adr-status:accepted
@libar-docs-adr-category:design
@libar-docs-pattern:AgentLifecycleFSM
Feature: PDR-013 Agent Lifecycle FSM

  Formal state machine governing agent start/pause/resume/stop/reconfigure transitions.
  The lifecycle FSM uses the established event-driven Map pattern (PM lifecycle precedent)
  with checkpoint status as the single source of truth.

  Lifecycle commands are infrastructure mutations — they do NOT route through CommandOrchestrator.
  Paused events advance the checkpoint position (seen-but-skipped semantics).

  Companion to PDR-011 (action handler), PDR-012 (command routing), PDR-010 (argument injection).

  Design Session: DS-5 (Agent Lifecycle FSM)
  Source Spec: agent-command-infrastructure.feature (Rule 2)
  Date: 2026-02-06

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | delivery-process/decisions/pdr-013-agent-lifecycle-fsm.feature |
      | Lifecycle FSM stub | stub complete | delivery-process/stubs/agent-lifecycle-fsm/lifecycle-fsm.ts |
      | Lifecycle command types stub | stub complete | delivery-process/stubs/agent-lifecycle-fsm/lifecycle-command-types.ts |
      | Lifecycle command handlers stub | stub complete | delivery-process/stubs/agent-lifecycle-fsm/lifecycle-command-handlers.ts |
      | Lifecycle audit events stub | stub complete | delivery-process/stubs/agent-lifecycle-fsm/lifecycle-audit-events.ts |
      | Checkpoint status extension stub | stub complete | delivery-process/stubs/agent-lifecycle-fsm/checkpoint-status-extension.ts |

  # ============================================================================
  # RULE 1: Agent lifecycle transitions are validated by a formal FSM
  # ============================================================================

  Rule: Agent lifecycle transitions are validated by a formal FSM

    Agent state changes must go through the lifecycle FSM which validates every transition.
    The FSM follows the event-driven Map pattern established by ProcessManagerLifecycle
    and ProjectionLifecycle in the platform.

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-1 | Follow PM lifecycle Map pattern (not platform-fsm/defineFSM) | The generic defineFSM only supports state-to-state transitions without named event triggers. Lifecycle commands map to named events (START, PAUSE, RESUME). PM lifecycle and Projection lifecycle both use the Map<from:event, toState> pattern — established codebase precedent |
    | AD-2 | Lifecycle state stored in checkpoint status field | DS-1 schema already declares 4 states (active, paused, stopped, error_recovery). The checkpoints.updateStatus mutation (DS-1) is the write path. No new table needed |

    FSM State Diagram:
    """
    States:  stopped | active | paused | error_recovery
    Events:  START | PAUSE | RESUME | STOP | RECONFIGURE | ENTER_ERROR_RECOVERY | RECOVER

                          START
              ┌──────────────────────────────┐
              │                              │
              ▼         PAUSE                │
          ┌────────┐ ─────────► ┌────────┐  │
          │ active │             │ paused │  │
          └────────┘ ◄───────── └────────┘  │
              │  │     RESUME        │       │
              │  │                   │ STOP  │
         STOP │  │ ENTER_ERROR_     │       │
              │  │  RECOVERY         ▼       │
              ▼  ▼              ┌─────────┐  │
        ┌─────────┐             │ stopped │──┘
        │  error  │  STOP       └─────────┘
        │recovery │──────────────────^
        └─────────┘
             │
        RECOVER│
             ▼
          active

        RECONFIGURE: active -> active, paused -> active
    """

    Complete Transition Table:

    | From | Event | To | Trigger |
    | stopped | START | active | StartAgent command |
    | active | PAUSE | paused | PauseAgent command |
    | active | STOP | stopped | StopAgent command |
    | active | ENTER_ERROR_RECOVERY | error_recovery | Circuit breaker (DS-3) |
    | active | RECONFIGURE | active | ReconfigureAgent (config-only update) |
    | paused | RESUME | active | ResumeAgent command |
    | paused | STOP | stopped | StopAgent command |
    | paused | RECONFIGURE | active | ReconfigureAgent (resume + config update) |
    | error_recovery | RECOVER | active | Automatic cooldown timer |
    | error_recovery | STOP | stopped | StopAgent command |

    No terminal states: stopped is restartable via START.

    FSM API (mirrors PM lifecycle):
    """typescript
    type AgentLifecycleState = "stopped" | "active" | "paused" | "error_recovery";

    type AgentLifecycleEvent =
      | "START" | "PAUSE" | "RESUME" | "STOP"
      | "RECONFIGURE" | "ENTER_ERROR_RECOVERY" | "RECOVER";

    // O(1) lookups via pre-built Map<"from:event", toState>
    function isValidAgentTransition(from, event): boolean;
    function transitionAgentState(from, event): AgentLifecycleState | null;
    function assertValidAgentTransition(from, event, agentId): AgentLifecycleState;
    function getValidAgentEventsFrom(state): AgentLifecycleEvent[];
    function getAllAgentTransitions(): readonly AgentLifecycleTransition[];
    """

    @acceptance-criteria @validation
    Scenario: Invalid lifecycle transition is rejected
      Given a churn-risk agent in "stopped" state
      When a PauseAgent command is executed
      Then the FSM rejects the transition with INVALID_LIFECYCLE_TRANSITION
      And the agent remains in "stopped" state
      And the rejection is recorded in audit trail

    @acceptance-criteria @happy-path
    Scenario: StopAgent works from any non-stopped state
      Given a churn-risk agent in "active" state
      When a StopAgent command is executed
      Then the agent transitions to "stopped"
      And from "paused" state StopAgent also transitions to "stopped"
      And from "error_recovery" state StopAgent also transitions to "stopped"

  # ============================================================================
  # RULE 2: Lifecycle commands are infrastructure mutations
  # ============================================================================

  Rule: Lifecycle commands are infrastructure mutations not domain commands

    Lifecycle commands (StartAgent, PauseAgent, ResumeAgent, StopAgent, ReconfigureAgent)
    are direct internalMutation calls on the agent component. They do NOT route through
    the 7-step CommandOrchestrator.

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-3 | Lifecycle commands bypass CommandOrchestrator | Infrastructure control, not domain commands. Naturally idempotent via checkpoint status check. Avoids circular dependency: agent infra -> command infra -> agent. Agent-emitted domain commands (SuggestCustomerOutreach) DO use CommandOrchestrator per DS-4 |

    Handler Pattern (all 5 commands follow this):
    """
    1. Load checkpoint from agent component (getByAgentId)
    2. Validate FSM transition (assertValidAgentTransition)
    3. Update checkpoint status (updateStatus)
    4. Record lifecycle audit event (audit.record)
    5. Return AgentLifecycleResult
    """

    Multi-Checkpoint Handling:
    An agent may have multiple checkpoints (one per subscription). Lifecycle commands
    affect ALL checkpoints for an agentId by querying the by_agentId index and
    updating each checkpoint. Lifecycle is agent-level, not subscription-level.

    Concurrency:
    Two concurrent lifecycle mutations are resolved naturally by Convex OCC. One succeeds
    (reads current state, writes new state), the other retries (reads new state, validates
    against it). No additional locking needed.

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

  # ============================================================================
  # RULE 3: Paused events advance checkpoint (seen-but-skipped)
  # ============================================================================

  Rule: Paused events advance checkpoint position

    When an agent is paused, events continue to be delivered by EventBus via Workpool.
    The action handler checks isAgentActive(checkpoint) and returns null decision. The
    onComplete handler advances the checkpoint position. Events are "seen but skipped"
    — not "queued for later."

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-4 | Paused events advance checkpoint position | Prevents replay storm on resume. Without advancement, all events received during pause period would replay. "Seen but skipped" is the correct semantic — pause means "temporarily stop analyzing", not "queue for later". If operators want catch-up, they use stop + manual rewind. Existing gate at init.ts:432-439 already implements this pattern |

    Interaction with DS-2 Action Handler:
    """
    Event arrives at agent action handler (DS-2):
      1. Load checkpoint via ctx.runQuery
      2. Check isAgentActive(checkpoint) -- EXISTING GATE
      3. If not active: return { decision: null }  -- no LLM call, no analysis
      4. onComplete receives success with null decision
      5. onComplete advances checkpoint position -- event is "consumed"
    """

    No changes needed to DS-2 action handler or onComplete handler. The existing
    isAgentActive gate works correctly with the new lifecycle FSM.

    Pending Commands During Pause:
    Pausing stops new event analysis but does NOT affect:
    - Commands already in the routing pipeline (they complete normally)
    - Pending approvals (they follow their own expiration lifecycle)

  # ============================================================================
  # RULE 4: ReconfigureAgent uses checkpoint config overrides
  # ============================================================================

  Rule: ReconfigureAgent stores runtime overrides on checkpoint

    Runtime-configurable fields are stored as configOverrides on the checkpoint table,
    not a separate table. Base config from AgentBCConfig (code-level) is merged with
    runtime overrides at handler execution time.

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-5 | Config overrides stored on checkpoint table | Keeps per-agent state co-located. Atomically updateable with status. No new table or cross-table consistency concerns |
    | AD-6 | error_recovery transition deferred to DS-3 | FSM defines ENTER_ERROR_RECOVERY and RECOVER events. Trigger mechanism (consecutive failure threshold, cooldown duration, backoff) is circuit breaker design — properly scoped to DS-3 |

    Runtime-Configurable Fields:

    | Field | Configurable | Why / Why Not |
    | confidenceThreshold | Yes | Tune sensitivity without restart |
    | patternWindowDuration | Yes | Adjust analysis window |
    | rateLimits | Yes | Adjust throughput limits |
    | id | No | Identity, cannot change |
    | subscriptions | No | Requires new EventBus registration |
    | patterns / onEvent | No | Requires handler restart |

    Config Override Schema:
    """typescript
    interface AgentConfigOverrides {
      confidenceThreshold?: number;
      patternWindowDuration?: string;
      rateLimits?: AgentRateLimitConfig;
    }
    """

    Config Resolution at Runtime:
    """
    effectiveConfig = {
      ...agentBCConfig,                    // Code-level base
      ...checkpoint.configOverrides,        // Runtime overrides (if any)
    }
    """

    ReconfigureAgent Transitions:
    - From active: stays active (config-only update)
    - From paused: transitions to active (implicit resume + config update)

    @acceptance-criteria @edge-case
    Scenario: ReconfigureAgent updates configuration without losing state
      Given an active churn-risk agent with confidenceThreshold 0.8
      When a ReconfigureAgent command changes threshold to 0.7
      Then the agent continues from its current checkpoint
      And future analysis uses the new threshold
      And the config change is recorded in audit trail
