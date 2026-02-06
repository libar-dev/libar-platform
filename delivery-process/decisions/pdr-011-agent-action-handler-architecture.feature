@libar-docs
@libar-docs-adr:011
@libar-docs-adr-status:accepted
@libar-docs-adr-category:architecture
@libar-docs-pattern:AgentActionHandlerArchitecture
Feature: PDR-011 Agent Action Handler Architecture

  Agent event handlers must be Convex actions (not mutations) to enable LLM API calls.
  All state persistence happens in onComplete mutation callbacks. EventSubscription
  gains action handler support via discriminated union. Idempotency is guaranteed by
  OCC-serialized onComplete mutations, not by Workpool partition ordering (which is
  not yet available).

  Supersedes the single-mutation handler pattern established in Phase 22.
  Companion to PDR-010 (cross-component argument injection).

  Design Session: DS-2 (Action/Mutation Handler Architecture)
  Source Spec: agent-llm-integration.feature (Rule 1 + Rule 3)
  Date: 2026-02-06

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Decision spec (this file) | accepted | delivery-process/decisions/pdr-011-agent-action-handler-architecture.feature |
      | Action handler factory stub | stub complete | delivery-process/stubs/agent-action-handler/action-handler.ts |
      | onComplete handler factory stub | stub complete | delivery-process/stubs/agent-action-handler/oncomplete-handler.ts |
      | EventSubscription type stub | stub complete | delivery-process/stubs/agent-action-handler/event-subscription-types.ts |
      | Agent subscription options stub | stub complete | delivery-process/stubs/agent-action-handler/agent-subscription.ts |

  # ============================================================================
  # RULE 1: Agent handlers split into action (analysis) + mutation (persistence)
  # ============================================================================

  Rule: Agent handlers split into action (analysis) and mutation (persistence)

    Agent event processing uses a two-phase architecture:

    Phase 1 (Action): Load state, run pattern detection, call LLM if enabled, return decision.
    No database writes. May call external APIs.

    Phase 2 (onComplete Mutation): Persist audit event, record command, create approval,
    update checkpoint. All writes through agent component API. Checkpoint updated LAST.

    Architectural Decisions:

    | AD | Decision | Rationale |
    | AD-1 | Unified action model (no dual mutation/action paths) | Single code path. Rule-only agents skip LLM but use same action-onComplete flow |
    | AD-4 | Explicit injectedData in AgentExecutionContext | Separates projection data from event history. No more fake PublishedEvents from projections |
    | AD-5 | onComplete data contract: action returns AgentActionResult, context carries event metadata | Clean separation. onComplete has everything needed for persistence |
    | AD-7 | Persistence ordering: checkpoint read FIRST, updated LAST | Read-first ensures checkpoint enters OCC read set early, maximizing conflict detection window. Write ordering within a single atomic mutation is a code readability convention, not a failure recovery mechanism |
    | AD-8 | Two factory APIs: createAgentActionHandler + createAgentOnCompleteHandler | onComplete is generic and reusable across agents. Action is agent-specific |
    | AD-9 | AgentBCConfig.onEvent callback stays unchanged | Infrastructure changes around it. DS-4 may evolve to PatternDefinition API. Note: onEvent is unchanged within DS-2 scope. DS-4 (PDR-012 AD-2) adds `patterns: string[]` as an XOR alternative — agents use either onEvent OR patterns, not both. This maintains backward compatibility: existing agents keep onEvent, new agents can use the patterns API |

    The Fundamental Constraint:

    | Function Type | External API Calls | Database Writes | Workpool Retry |
    | Mutation | No | Yes (atomic, OCC) | No (OCC auto-retry) |
    | Action | Yes (fetch, LLM) | No (must use runMutation) | Yes (configurable) |

    Action-Mutation Split Flow:
    """
    EventBus
       |
       v
    Workpool.enqueueAction (agent action handler)
       |
       +--- 1. Load checkpoint (via ctx.runQuery to agent component)
       +--- 2. Check idempotency (skip if already processed — best-effort)
       +--- 3. Load event history (via ctx.runQuery to app-level projection)
       +--- 4. Load injected data (via ctx.runQuery to app-level queries)
       +--- 5. Create AgentExecutionContext with history + injectedData
       +--- 6. Call config.onEvent(event, executionContext)
       +--- 7. If LLM enabled and triggered: call LLM analysis
       +--- 8. Return AgentActionResult
       |
       v
    onComplete Mutation (Workpool callback)
       |
       +--- 9. Check result.kind
       +--- 10a. If "success": validate decision, persist atomically
       |         - Record audit event (idempotent by decisionId)
       |         - Record command if decision has one
       |         - Create pending approval if needed
       |         - Update checkpoint LAST
       +--- 10b. If "failed": record dead letter, do NOT advance checkpoint
       +--- 10c. If "canceled": log, do NOT advance checkpoint
    """

    Factory API Shapes:
    """typescript
    // Action handler factory
    function createAgentActionHandler(config: AgentActionHandlerConfig)
      // Returns an internalAction

    // onComplete handler factory
    function createAgentOnCompleteHandler(config: AgentOnCompleteConfig)
      // Returns an internalMutation
    """

    State Loading Pattern (actions use ctx.runQuery, not ctx.db):
    """typescript
    // In action handler, state is loaded via callbacks:
    loadState: async (ctx, args) => ({
      checkpoint: await ctx.runQuery(components.agent.checkpoints.getByAgentId, ...),
      eventHistory: await ctx.runQuery(api.projections.customers.getHistory, ...),
      injectedData: { customerCancellationHistory: history },
    })
    """

    AgentExecutionContext Evolution:
    """typescript
    // Before (current): projection data squeezed into fake PublishedEvents
    interface AgentExecutionContext {
      history: readonly PublishedEvent[];  // Mixed real events + fake projection data
    }

    // After (DS-2): explicit separation
    interface AgentExecutionContext {
      history: readonly PublishedEvent[];        // Real events ONLY
      injectedData: Record<string, unknown>;     // Cross-component projection data
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Action handler performs analysis without persistence
      Given an agent action handler configured with LLM runtime
      And an OrderCancelled event is delivered via Workpool.enqueueAction
      When the action handler processes the event
      Then it loads the checkpoint via ctx.runQuery to agent component
      And it loads event history via ctx.runQuery to app-level projection
      And it populates AgentExecutionContext with separate history and injectedData
      And it calls config.onEvent to get an AgentDecision
      And it returns an AgentActionResult without writing any database state
      And the result includes analysisMethod indicating "llm" or "rule-based"

    @acceptance-criteria @happy-path
    Scenario: onComplete mutation persists decision atomically
      Given an agent action returned a successful AgentActionResult
      When the onComplete handler fires with result.kind "success"
      Then the decision is recorded as an audit event via agent component API
      And the command is recorded via agent component commands API if present
      And a pending approval is created if decision.requiresApproval is true
      And the checkpoint is updated LAST with the new globalPosition
      And all writes use agent component API, not ctx.db directly

    @acceptance-criteria @edge-case
    Scenario: LLM unavailable falls back to rule-based analysis
      Given an agent action handler configured with LLM runtime
      And the LLM API returns an error or times out
      When the action handler catches the LLM error
      Then it falls back to rule-based confidence scoring via config.onEvent
      And the AgentActionResult has analysisMethod "rule-based-fallback"
      And processing continues without failure

    @acceptance-criteria @edge-case
    Scenario: Action failure triggers dead letter via onComplete
      Given an agent action that throws an unrecoverable error
      And Workpool exhausts retry attempts
      When the onComplete handler fires with result.kind "failed"
      Then a dead letter entry is created via agent component deadLetters API
      And the checkpoint is NOT advanced past the failed event
      And an AgentAnalysisFailed audit event is recorded

    @acceptance-criteria @edge-case
    Scenario: Null decision advances checkpoint without side effects
      Given an agent action processes an event
      And the onEvent handler returns null (no pattern detected)
      When the onComplete handler fires with result.kind "success"
      Then no audit event, command, or approval is recorded
      And the checkpoint IS advanced to the events globalPosition
      And processing continues normally

  # ============================================================================
  # RULE 2: EventSubscription is a discriminated union
  # ============================================================================

  Rule: EventSubscription is a discriminated union supporting action handlers

    EventSubscription becomes a discriminated union with handlerType as the discriminant:

    | Variant | handlerType | handler type | onComplete | retry |
    | MutationSubscription | "mutation" | FunctionReference mutation | Optional | Not applicable |
    | ActionSubscription | "action" | FunctionReference action | Required | Optional RetryBehavior |

    This follows the codebase established pattern for variant types:
    - DeciderOutput = DeciderSuccess or DeciderRejected or DeciderFailed
    - ActionResult = success or failed or canceled
    - WorkpoolRunResult = success or failed or canceled

    onComplete is required for ActionSubscription because actions cannot persist state.
    All writes must happen in the onComplete mutation callback.

    ConvexEventBus dispatch logic:
    """typescript
    if (subscription.handlerType === "action") {
      await workpool.enqueueAction(ctx, subscription.handler, args, {
        onComplete: subscription.onComplete,
        retry: subscription.retry,
      });
    } else {
      await workpool.enqueueMutation(ctx, subscription.handler, args, {
        onComplete: subscription.onComplete,
      });
    }
    """

    Agent subscription factory produces ActionSubscription:
    """typescript
    createAgentSubscription(config, {
      actionHandler: internal.agents.churnRisk.analyzeEvent,  // action ref
      onComplete: internal.agents.churnRisk.onComplete,       // mutation ref (required)
      retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
      priority: 250,
    })
    // Returns ActionSubscription with handlerType: "action"
    """

    @acceptance-criteria @happy-path
    Scenario: EventBus dispatches action subscription via enqueueAction
      Given an EventSubscription with handlerType "action"
      And it has both handler (action ref) and onComplete (mutation ref)
      When EventBus.publish matches this subscription
      Then it calls workpool.enqueueAction with the action handler
      And it passes the onComplete mutation to Workpool
      And it passes the retry configuration to Workpool

    @acceptance-criteria @happy-path
    Scenario: Existing mutation subscriptions remain unchanged
      Given an EventSubscription with handlerType "mutation"
      When EventBus.publish matches this subscription
      Then it calls workpool.enqueueMutation with the mutation handler
      And existing projections and process managers continue to work
      And onComplete is optional as before

    @acceptance-criteria @validation
    Scenario: ActionSubscription requires onComplete at the type level
      Given a developer defines an ActionSubscription
      When they omit the onComplete field
      Then the TypeScript compiler rejects the definition
      And the error indicates onComplete is required for action subscriptions

  # ============================================================================
  # RULE 3: Idempotency via OCC-serialized onComplete
  # ============================================================================

  Rule: Idempotency is guaranteed by OCC-serialized onComplete mutations

    Workpool partition-key ordering is NOT yet implemented. The partitionKey
    extracted by EventBus is used for context and debugging only. Two concurrent
    actions for the same entity CAN run simultaneously.

    Idempotency uses two layers:

    | Layer | Location | Mechanism | Purpose |
    | Action check | In action via ctx.runQuery | Best-effort, not atomic | Performance: skip unnecessary LLM calls |
    | onComplete check | In onComplete mutation | OCC-serialized by Convex | Correctness: prevent duplicate persistence |

    The action loads checkpoint via ctx.runQuery and checks if the events
    globalPosition exceeds the checkpoints lastProcessedPosition. This is a
    performance optimization: if two concurrent actions for the same entity
    both pass this check, both will return decisions. The onComplete mutation
    is the true serialization point.

    Two concurrent onComplete mutations touching the same checkpoint document
    are OCC-serialized by Convex. The second mutation retries and sees the
    checkpoint already advanced past its event. It skips persistence.

    The checkpoint read-FIRST ordering (AD-7) ensures the checkpoint document
    enters the OCC read set early, maximizing the conflict detection window
    for concurrent onComplete mutations. Within a single atomic Convex mutation,
    all writes commit or none do — there is no "partial failure" scenario.
    The idempotent audit recording is a defense-in-depth measure for OCC retries.

    Partition Ordering Future:
    """
    When Workpool adds key-based ordering support, EventBus should pass
    partitionKey.value as the key parameter. This eliminates concurrent
    processing entirely, making the onComplete checkpoint check a pure
    defense-in-depth measure rather than the primary correctness mechanism.
    """

    @acceptance-criteria @happy-path
    Scenario: Sequential events process correctly
      Given an agent with checkpoint at globalPosition 10
      And event E11 with globalPosition 11 arrives
      When the action handler loads checkpoint and checks position
      Then it processes E11 because 11 exceeds 10
      And the onComplete handler advances checkpoint to 11

    @acceptance-criteria @edge-case
    Scenario: Concurrent actions for same entity are serialized at onComplete
      Given an agent with checkpoint at globalPosition 10
      And events E11 and E12 are dispatched concurrently by Workpool
      When both action handlers load checkpoint (both see position 10)
      And both pass the position check and return decisions
      Then the first onComplete advances checkpoint to 11
      And the second onComplete retries via OCC
      And the second onComplete sees checkpoint at 11
      And the second onComplete advances checkpoint to 12
      And no duplicate audit events or commands are created

    @acceptance-criteria @edge-case
    Scenario: Already-processed event is skipped in action
      Given an agent with checkpoint at globalPosition 15
      And a retried event with globalPosition 12 arrives
      When the action handler loads checkpoint and checks position
      Then it skips processing because 12 does not exceed 15
      And it returns a null decision
      And no LLM call is made (performance optimization)

    @acceptance-criteria @edge-case
    Scenario: Partial onComplete failure replays safely
      Given an action returned a decision for event at globalPosition 20
      When the onComplete handler records the audit event successfully
      But fails before updating the checkpoint
      Then Convex OCC retries the onComplete mutation
      And the audit record operation is idempotent via decisionId
      And the checkpoint is updated on retry
      And no duplicate audit events exist

  # ============================================================================
  # AMENDMENT: Holistic Review Findings F-3, F-6 (2026-02-06)
  # ============================================================================

  Rule: Amendment — Holistic review findings F-3, F-6

    Applied during cross-DS architectural review of DS-1/DS-2/DS-4/DS-5.

    F-3 Confirmation (Orphaned onComplete):

    The existing mutation-based agent handler (handleChurnRiskOnComplete at
    examples/order-management/convex/contexts/agent/onComplete.ts) is never invoked
    because the current CreateAgentSubscriptionOptions in platform-bus/src/agent-subscription.ts
    lacks an onComplete field. Agent dead letters fall through to the projection-specific
    default handler (projections/deadLetters.ts). This is a pre-existing bug, not a design
    regression. PDR-011 Rule 2 ActionSubscription with REQUIRED onComplete is the fix.
    The mutation overload CreateAgentSubscriptionOptions should also gain an OPTIONAL
    onComplete field to wire custom dead letter handling for non-action agents.

    F-6 Decision (AD-10 — Per-Subscription Pool Routing):

    | AD | Decision | Rationale |
    | AD-10 | ActionSubscription and MutationSubscription gain optional pool field | Agent LLM actions (1-10s) must not block sub-50ms projection processing. EventBus uses subscription.pool when present, falls back to default shared pool |

    Pool topology at app level:
    """
    app.use(workpool, { name: "agentPool" });      // For agent LLM actions
    app.use(workpool, { name: "projectionPool" });  // For projection mutations
    """

    EventBus dispatch with pool routing:
    """typescript
    const pool = subscription.pool ?? this.defaultWorkpool;
    if (subscription.handlerType === "action") {
      await pool.enqueueAction(ctx, subscription.handler, args, { ... });
    } else {
      await pool.enqueueMutation(ctx, subscription.handler, args, { ... });
    }
    """

    @amendment @holistic-review
    Scenario: EventBus uses subscription-specific pool when available
      Given an ActionSubscription with a dedicated agentPool
      And a MutationSubscription with no pool specified
      When EventBus dispatches to the ActionSubscription
      Then it uses agentPool.enqueueAction
      When EventBus dispatches to the MutationSubscription
      Then it uses the default shared workpool.enqueueMutation
