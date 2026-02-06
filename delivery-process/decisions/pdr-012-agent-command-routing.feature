@libar-docs
@libar-docs-adr:012
@libar-docs-adr-status:accepted
@libar-docs-adr-category:architecture
@libar-docs-pattern:AgentCommandRouting
Feature: PDR-012 Agent Command Routing & Pattern Unification

  Commands emitted by agents must route through the existing CommandOrchestrator to
  registered domain handlers. Pattern detection must use the formal PatternDefinition
  framework as the single source of truth, eliminating the disconnect between inline
  onEvent handlers and unused PatternDefinition instances.

  Companion to PDR-011 (action/mutation handler architecture) and PDR-010 (argument injection).

  Design Session: DS-4 (Command Routing & Pattern Unification)
  Source Spec: agent-command-infrastructure.feature (Rule 1 + Rule 3)
  Date: 2026-02-06

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | delivery-process/decisions/pdr-012-agent-command-routing.feature |
      | Pattern registry stub | stub complete | delivery-process/stubs/agent-command-routing/pattern-registry.ts |
      | Pattern executor stub | stub complete | delivery-process/stubs/agent-command-routing/pattern-executor.ts |
      | AgentBCConfig evolution stub | stub complete | delivery-process/stubs/agent-command-routing/agent-bc-config.ts |
      | Command bridge stub | stub complete | delivery-process/stubs/agent-command-routing/command-bridge.ts |
      | AgentCommandRouter stub | stub complete | delivery-process/stubs/agent-command-routing/command-router.ts |

  # ============================================================================
  # RULE 1: Commands emitted by agents route through CommandOrchestrator
  # ============================================================================

  Rule: Commands emitted by agents route through CommandOrchestrator

    Agent decisions that produce commands must flow through the existing 7-step
    CommandOrchestrator pipeline. Commands cannot remain with status "pending"
    in the agent component indefinitely.

    The command bridge uses Workpool dispatch from onComplete (not inline)
    to keep persistence and routing in separate transactions with built-in
    retry and failure handling.

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-4 | Command bridge via Workpool dispatch from onComplete | Separate transaction with built-in retry. Failure in routing does not affect audit/checkpoint persistence |
    | AD-5 | AgentCommandRouter maps agent command types to orchestrator routes | Agent commands carry metadata (confidence, reason, patternId) that regular commands do not. Transform layer bridges the format gap |
    | AD-6 | AgentActionResult gains patternId field | PatternExecutor sets patternId. Flows through onComplete to commands.record. Placed on transport type (not AgentDecision) because it is execution metadata, not domain output |

    Command Routing Flow:
    """
    DS-2 onComplete persistence order (steps 1-4 unchanged):
      1. Record audit event (idempotent by decisionId)
      2. Record command if decision includes one
      3. Create approval if decision.requiresApproval
      4. Update checkpoint LAST

    DS-4 addition (after step 2, before step 3):
      2b. If command was recorded:
          workpool.enqueue(ctx, routeAgentCommand, {
            decisionId, commandType, agentId, correlationId
          })
    """

    routeAgentCommand Mutation Flow:
    """
    1. Load command from agent component by decisionId
    2. Look up route in AgentCommandRouter
    3. If no route:
       - Update status to "failed"
       - Record AgentCommandRoutingFailed audit event
       - Return
    4. Update status to "processing"
    5. Transform args via route.toOrchestratorArgs()
    6. Call CommandOrchestrator.execute()
    7. On success: update status to "completed"
    8. On failure: update status to "failed" with error
    """

    AgentCommandRoute Interface:
    """typescript
    interface AgentCommandRoute {
      commandType: string;
      boundedContext: string;
      toOrchestratorArgs: (
        command: RecordedAgentCommand,
        context: RoutingContext
      ) => Record<string, unknown>;
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Command routes through orchestrator to domain handler
      Given an agent emits a SuggestCustomerOutreach command
      And the command is recorded in the agent component with status "pending"
      And a route is registered mapping SuggestCustomerOutreach to the outreach handler
      When the routeAgentCommand mutation executes
      Then it loads the command from the agent component by decisionId
      And it looks up the route in AgentCommandRouter
      And it transforms the agent command payload to orchestrator args format
      And it calls CommandOrchestrator.execute with the matching CommandConfig
      And the command status transitions from "pending" to "processing" to "completed"
      And an audit event records the successful routing

    @acceptance-criteria @validation
    Scenario: Unknown command type fails with routing error
      Given an agent emits a command with type "UnknownCommand"
      And no route is registered for "UnknownCommand"
      When the routeAgentCommand mutation executes
      Then the command status is updated to "failed"
      And the error message includes "No route registered for command type: UnknownCommand"
      And an AgentCommandRoutingFailed audit event is recorded with the command type

    @acceptance-criteria @happy-path
    Scenario: Duplicate command rejected by CommandOrchestrator idempotency
      Given an agent emits a command that has already been processed
      And the CommandOrchestrator detects duplicate via Command Bus commandId
      When the routeAgentCommand mutation executes
      Then CommandOrchestrator rejects the command as duplicate
      And the command status remains "completed" from the first processing
      And no duplicate domain handler invocation occurs

  # ============================================================================
  # RULE 2: PatternDefinition is the single source of truth
  # ============================================================================

  Rule: PatternDefinition array replaces onEvent as the detection mechanism

    Each agent passes PatternDefinition[] directly on AgentBCConfig. The patterns
    trigger() and analyze() functions are used by the action handler, eliminating
    parallel implementations (inline onEvent vs formal PatternDefinition).

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-2 | AgentBCConfig uses XOR for onEvent vs patterns (PatternDefinition[]) | Backward compatible: existing onEvent agents unchanged. New agents use patterns |
    | AD-3 | PatternExecutor iterates with short-circuit on first match | Array order equals developer-controlled priority. Avoids unnecessary LLM calls |

    AgentBCConfig Evolution:
    """typescript
    interface AgentBCConfig {
      readonly id: string;
      readonly subscriptions: readonly string[];
      readonly patternWindow: PatternWindow;
      readonly confidenceThreshold: number;
      readonly humanInLoop?: HumanInLoopConfig;
      readonly rateLimits?: AgentRateLimitConfig;

      // XOR: exactly one must be set
      readonly onEvent?: AgentEventHandler;       // Legacy: manual handler
      readonly patterns?: readonly PatternDefinition[];  // New: pattern objects
    }
    """

    XOR Validation:

    | Condition | Result | Error Code |
    | Neither onEvent nor patterns | Invalid | NO_EVENT_HANDLER |
    | Both onEvent and patterns | Invalid | CONFLICTING_HANDLERS |
    | Only onEvent set | Valid (legacy) | - |
    | Only patterns set | Valid (new) | - |

    PatternExecutor Control Flow:
    """
    For each pattern in config.patterns (array order = priority):
      1. Pattern comes from config.patterns directly
      2. Filter events to patterns own window
      3. Check hasMinimumEvents — skip if insufficient
      4. Call pattern.trigger(events) — cheap boolean, no I/O
      5. If NOT triggered — continue to next pattern
      6. If triggered AND pattern.analyze exists:
         a. Call pattern.analyze(events, agent) — potentially expensive LLM call
         b. If analysis.detected — build AgentDecision, SHORT-CIRCUIT
         c. If NOT detected — continue to next pattern
      7. If triggered AND NO analyze:
         a. Build AgentDecision from trigger alone (rule-based)
         b. SHORT-CIRCUIT
    Return PatternExecutionSummary with all evaluation results
    """

    patternWindow Semantics in Patterns Mode:

    | Mode | patternWindow Role |
    | onEvent mode | Required. Used by action handler for event loading |
    | patterns mode | Master event-loading window. Each patterns own window must be a subset |

    Decision Building:
    """typescript
    // From PatternAnalysisResult (analyze returned):
    function buildDecisionFromAnalysis(
      result: PatternAnalysisResult,
      patternName: string,
      config: AgentBCConfig,
    ): AgentDecision

    // From trigger-only pattern (no analyze):
    function buildDecisionFromTrigger(
      events: readonly PublishedEvent[],
      patternName: string,
      config: AgentBCConfig,
    ): AgentDecision
    """

    @acceptance-criteria @happy-path
    Scenario: Handler uses trigger for cheap detection before LLM
      Given a pattern with trigger requiring 3+ OrderCancelled events
      And an event stream with 2 OrderCancelled events
      When the PatternExecutor evaluates this pattern
      Then pattern.trigger returns false (only 2 events)
      And pattern.analyze is NOT called (no unnecessary LLM cost)
      And the executor moves to the next pattern

    @acceptance-criteria @happy-path
    Scenario: Handler uses analyze for LLM-powered detection
      Given a pattern with trigger requiring 3+ OrderCancelled events
      And a pattern.analyze function that calls agent.analyze with an LLM prompt
      And an event stream with 5 OrderCancelled events
      When the PatternExecutor evaluates this pattern
      Then pattern.trigger returns true (5 events exceed threshold)
      And pattern.analyze is called with the filtered events and agent interface
      And the LLM returns a confidence of 0.92
      And the result is wrapped in an AgentDecision with analysisMethod "llm"
      And the executor short-circuits (no further patterns evaluated)

