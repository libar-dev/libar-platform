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

    The command bridge uses a scheduled mutation from onComplete (not inline)
    to keep persistence and routing in separate transactions.

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-4 | Command bridge via scheduled mutation from onComplete | CommandOrchestrator is complex (7 steps, Workpool triggers). Separate transaction allows independent retry. Failure in routing does not affect audit/checkpoint persistence |
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
          ctx.scheduler.runAfter(0, routeAgentCommand, {
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

    Why Scheduled Mutation (Not Inline or Workpool):

    | Option | Pros | Cons | Verdict |
    | Inline in onComplete | Single transaction | Complex onComplete, routing failure blocks checkpoint | Rejected |
    | Scheduled mutation | Clean separation, independent retry | Extra scheduling hop | Chosen |
    | Workpool | Built-in retry, ordering, monitoring | Over-engineering for current needs | Deferred to DS-6 |

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

    Each agent references named patterns from a registry. The patterns trigger()
    and analyze() functions are used by the action handler, eliminating parallel
    implementations (inline onEvent vs formal PatternDefinition).

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-1 | PatternRegistry follows CommandRegistry singleton pattern | Consistency with established platform patterns. Enables discoverability for admin UI and validation at registration time |
    | AD-2 | AgentBCConfig uses XOR for onEvent vs patterns | Backward compatible: existing onEvent agents unchanged. New agents use patterns. Clean migration path with validation preventing ambiguity |
    | AD-3 | PatternExecutor iterates with short-circuit on first match | Simple, predictable. Array order equals developer-controlled priority. Avoids unnecessary LLM calls after first detection |
    | AD-7 | Fail-closed default for analyze() failures | LLM outage must not cause mass command emission. onAnalyzeFailure defaults to "skip". Patterns opt into "fallback-to-trigger" explicitly |
    | AD-8 | defaultCommand on PatternDefinition for trigger-only patterns | Without defaultCommand, trigger-only patterns produce command: null decisions that cannot route. Enables simple threshold patterns to emit commands without analyze() |

    PatternRegistry API (mirrors CommandRegistry):
    """typescript
    class PatternRegistry {
      static getInstance(): PatternRegistry;
      static resetForTesting(): void;
      register(pattern: PatternDefinition, tags?: readonly string[]): void;
      get(name: string): PatternDefinition | undefined;
      has(name: string): boolean;
      list(): PatternInfo[];
      listByTag(tag: string): PatternInfo[];
      size(): number;
      clear(): void;
    }

    export const globalPatternRegistry = PatternRegistry.getInstance();
    """

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
      readonly patterns?: readonly string[];       // New: pattern names from registry
    }
    """

    XOR Validation:

    | Condition | Result | Error Code |
    | Neither onEvent nor patterns | Invalid | NO_EVENT_HANDLER |
    | Both onEvent and patterns | Invalid | CONFLICTING_HANDLERS |
    | Pattern name not in registry | Invalid | PATTERN_NOT_FOUND |
    | Only onEvent set | Valid (legacy) | - |
    | Only patterns set | Valid (new) | - |

    PatternExecutor Control Flow:
    """
    For each pattern in config.patterns (array order = priority):
      1. Resolve pattern from registry by name
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
    Scenario: Agent config references patterns from registry
      Given a PatternDefinition "churn-risk" is registered in globalPatternRegistry
      And an AgentBCConfig has patterns ["churn-risk"]
      When the config is validated
      Then validation passes because the pattern exists in the registry
      And the agent handler resolves patterns by name at startup

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

    @acceptance-criteria @validation
    Scenario: Unknown pattern name fails validation
      Given an AgentBCConfig with patterns ["nonexistent-pattern"]
      And "nonexistent-pattern" is NOT registered in globalPatternRegistry
      When the config is validated
      Then validation fails with code PATTERN_NOT_FOUND
      And the error message includes the pattern name "nonexistent-pattern"

    @acceptance-criteria @error-handling
    Scenario: LLM failure defaults to skip (fail-closed)
      Given a pattern with trigger requiring 3+ events AND an analyze function
      And an event stream with 5 matching events (trigger would fire)
      And the LLM is unavailable (analyze throws)
      When the PatternExecutor evaluates this pattern
      Then pattern.trigger returns true
      And pattern.analyze throws an error
      And the pattern is SKIPPED (no command emitted) because onAnalyzeFailure defaults to "skip"
      And the executor continues to the next pattern

    @acceptance-criteria @error-handling
    Scenario: Pattern opts into trigger fallback on LLM failure
      Given a pattern with onAnalyzeFailure set to "fallback-to-trigger"
      And the LLM is unavailable (analyze throws)
      When the PatternExecutor evaluates this pattern
      Then pattern.trigger returns true
      And pattern.analyze throws an error
      And a rule-based-fallback decision is produced from trigger data
