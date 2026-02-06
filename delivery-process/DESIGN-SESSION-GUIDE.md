# Design Session Guide

> Agent-as-BC design sessions (DS-1 through DS-7). Use this guide to start design sessions,
> track progress across sessions, and prepare for holistic review.
>
> **Process methodology** (stub management, decision categories, naming conventions)
> is captured in PDR-009 (Design Session Methodology).

**Make breaking changes to improve the design:** We are designing bespoke application architecture and none of the packages are released. Example app does not have a permanent state - it is a demo app.

---

## Source Spec Reference

Plan-level specs that drive each design session. Include the relevant spec(s) as context
when starting a session.

| Phase | Pattern                    | Spec File                                               | Product Area |
| ----- | -------------------------- | ------------------------------------------------------- | ------------ |
| 22    | AgentAsBoundedContext      | `specs/platform/agent-as-bounded-context.feature`       | Platform     |
| 22a   | AgentBCComponentIsolation  | `specs/platform/agent-bc-component-isolation.feature`   | Platform     |
| 22b   | AgentLLMIntegration        | `specs/platform/agent-llm-integration.feature`          | Platform     |
| 22c   | AgentCommandInfrastructure | `specs/platform/agent-command-infrastructure.feature`   | Platform     |
| 22d   | AgentChurnRiskCompletion   | `specs/example-app/agent-churn-risk-completion.feature` | ExampleApp   |
| 22e   | AgentAdminFrontend         | `specs/example-app/agent-admin-frontend.feature`        | ExampleApp   |

**Two-layer relationship:** Platform specs (22a-22c) define infrastructure capabilities.
Example app specs (22d-22e) consume those capabilities and serve as outside-in validation
for platform design sessions.

---

## Design Session Prompt Template

Use this prompt to start each design session. Replace `**DS-X**` with the session number
and include the source spec(s) listed in the DS-X section.

---

```
Please make design-level (NOT IMPLEMENTATION!) specs based on plan-level specs we created.
For this session we should do **DS-X**.

## Context

@libar-platform/delivery-process/DELIVERY-PROCESS-GUIDE.md
@libar-platform/delivery-process/DESIGN-SESSION-GUIDE.md
@deps-packages/delivery-process/docs/METHODOLOGY.md
@deps-packages/delivery-process/docs/SESSION-GUIDES.md

## Source Specs (from DS-X section in DESIGN-SESSION-GUIDE.md)

Include the plan-level spec for this DS session:
@libar-platform/delivery-process/specs/...  (see Source Spec Reference table)

For platform DS sessions (DS-2 through DS-5), also include consumer specs
for outside-in validation:
@libar-platform/delivery-process/specs/example-app/agent-churn-risk-completion.feature
@libar-platform/delivery-process/specs/example-app/agent-admin-frontend.feature

## Critical Reminders

1. This is NOT an implementation session. Once we do all design sessions we will do
   holistic reviews and iterate on details as necessary.
2. No design documents. Record important decisions as decision specs (.feature)
   in delivery-process/decisions/.
3. Code stubs go in delivery-process/stubs/{pattern-name}/ with @target comments
   indicating real destination. Never directly in package source.
4. Open questions section: note interactions with other DS sessions.
   These get resolved during holistic review.
5. Check consumer specs (22d, 22e) for requirements that validate your design.
   Note API gaps or mismatches as open questions for holistic review.
```

---

## Design Session Breakdown

### Dependency Chain

Root dependency `AgentAsBoundedContext` (Phase 22) is completed.

Linear dependency:
`AgentAsBoundedContext` (22) -> `AgentBCComponentIsolation` (22a) -> `AgentLLMIntegration` (22b) -> `AgentCommandInfrastructure` (22c) -> `AgentChurnRiskCompletion` (22d) -> `AgentAdminFrontend` (22e)

### Session Graph

```
DS-1: Component Isolation        <- MUST be first
  |
  v
DS-2: Action/Mutation Handler    <- Core execution model
  |
  +---> DS-3: LLM & Cost Control    \
  |                                   |
  +---> DS-4: Commands & Patterns     |-- Can parallel
  |                                   |
  +---> DS-5: Lifecycle FSM          /
  |
  v  (all three complete)
DS-6: Churn-Risk Integration ---\
                                 |-- Can parallel
DS-7: Admin Frontend -----------/
```

**Critical path:** DS-1 -> DS-2 -> {DS-3, DS-4} -> DS-6

DS-5 (Lifecycle) and DS-7 (Frontend) are off the critical path.

---

### DS-1: Agent Component Isolation Architecture

**Status: COMPLETE**
**Source:** 22a (full spec)
**Spec:** `specs/platform/agent-bc-component-isolation.feature`

**Scope:**

- `defineComponent("agent")` + isolated schema design
- Public API surface: 5 handler groups (checkpoints, audit, dead letters, commands, approvals)
- Cross-component query pattern: argument injection for `customerCancellations` projection (PDR-010)
- Component isolation constraints (no `ctx.auth`, IDs as strings, no `process.env`)

**Key Decisions (7 total):**

| AD   | Decision                                                   | Category       | PDR     |
| ---- | ---------------------------------------------------------- | -------------- | ------- |
| AD-1 | Component in platform-core (not separate package)          | architecture   | —       |
| AD-2 | Single instance, multi-tenant by agentId                   | architecture   | —       |
| AD-3 | Argument injection for cross-component data                | architecture   | PDR-010 |
| AD-4 | 5-file API split (12 mutations + 10 queries)               | design         | —       |
| AD-5 | Identical schema (tables move from app to component)       | design         | —       |
| AD-6 | Direct swap (no staged migration — local dev resets daily) | design         | —       |
| AD-7 | TS2589 prevention via SafeMutationRef                      | infrastructure | —       |

**Deliverables:**

| #   | Deliverable                       | Location                                                                                   |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Design document (historical)      | `docs/project-management/plans/designs/draft/DESIGN-2026-005-agent-component-isolation.md` |
| 2   | Component definition stub         | `delivery-process/stubs/agent-component-isolation/component/convex.config.ts`              |
| 3   | Component schema stub             | `delivery-process/stubs/agent-component-isolation/component/schema.ts`                     |
| 4   | Checkpoint API stub (5 handlers)  | `delivery-process/stubs/agent-component-isolation/component/checkpoints.ts`                |
| 5   | Audit API stub (3 handlers)       | `delivery-process/stubs/agent-component-isolation/component/audit.ts`                      |
| 6   | Dead Letter API stub (4 handlers) | `delivery-process/stubs/agent-component-isolation/component/deadLetters.ts`                |
| 7   | Command API stub (4 handlers)     | `delivery-process/stubs/agent-component-isolation/component/commands.ts`                   |
| 8   | Approval API stub (6 handlers)    | `delivery-process/stubs/agent-component-isolation/component/approvals.ts`                  |
| 9   | Cross-BC query types              | `delivery-process/stubs/agent-component-isolation/cross-bc-query.ts`                       |
| 10  | Design session methodology        | `delivery-process/decisions/pdr-009-design-session-methodology.feature`                    |
| 11  | Argument injection pattern        | `delivery-process/decisions/pdr-010-cross-component-argument-injection.feature`            |

**Open Questions for Holistic Review:**

1. DS-2: How does `createAgentEventHandler` adapt? New `ComponentContext` parameter?
2. DS-2: How does agent component access EventStore for event history?
   `loadHistory` (init.ts:363-366) currently queries EventStore directly. After isolation,
   this is a cross-component query not covered by PDR-010 (which only addresses app-level projections).
3. DS-4: Command routing extensibility — `commands.record` may need additional fields
4. DS-5: Lifecycle FSM states — verify `status` union covers all states
5. DS-7: Admin UI queries — ensure responses have enough data without N+1

**Note:** DS-1 was created before the stubs-in-delivery-process pattern was established.
The design document (DESIGN-2026-005) has been superseded per PDR-009 methodology.

---

### DS-2: Action/Mutation Handler Architecture

**Status: COMPLETE**
**Source:** 22b core (Rule 1 + Rule 3)
**Spec:** `specs/platform/agent-llm-integration.feature` Rules 1, 3
**Depends on:** DS-1

**Scope:**

- `createAgentActionHandler()` factory replacing current `createAgentEventHandler()`
- Action -> onComplete flow: how action results (AgentDecision) flow to persistence mutation
- State loading pattern: `runQuery` in action for checkpoint + event history + injected data
- EventSubscription as discriminated union (`MutationSubscription | ActionSubscription`)
- Agent subscription factory extension for action handlers
- LLM fallback strategy (graceful degradation to rules)
- Error handling: action failure vs onComplete failure
- Two-layer idempotency: action check (best-effort) + onComplete OCC check (correctness)

**Key Decisions (9 total):**

| AD   | Decision                                                       | Category     | PDR     |
| ---- | -------------------------------------------------------------- | ------------ | ------- |
| AD-1 | Unified action model (no dual mutation/action paths)           | architecture | PDR-011 |
| AD-2 | EventSubscription as discriminated union with handlerType      | architecture | PDR-011 |
| AD-3 | State loading via ctx.runQuery (not ctx.db)                    | architecture | —       |
| AD-4 | Explicit injectedData in AgentExecutionContext                 | architecture | PDR-011 |
| AD-5 | onComplete data contract: AgentActionResult + AgentWorkpoolCtx | design       | PDR-011 |
| AD-6 | Two-layer idempotency (no partition ordering available)        | architecture | PDR-011 |
| AD-7 | Persistence ordering: checkpoint updated LAST                  | design       | PDR-011 |
| AD-8 | Two factory APIs: action handler + onComplete handler          | design       | PDR-011 |
| AD-9 | AgentBCConfig.onEvent callback stays unchanged                 | design       | PDR-011 |

**Deliverables:**

| #   | Deliverable                     | Location                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Decision spec                   | `delivery-process/decisions/pdr-011-agent-action-handler-architecture.feature` |
| 2   | Action handler factory stub     | `delivery-process/stubs/agent-action-handler/action-handler.ts`                |
| 3   | onComplete handler factory stub | `delivery-process/stubs/agent-action-handler/oncomplete-handler.ts`            |
| 4   | EventSubscription type stub     | `delivery-process/stubs/agent-action-handler/event-subscription-types.ts`      |
| 5   | Agent subscription options stub | `delivery-process/stubs/agent-action-handler/agent-subscription.ts`            |

**DS-1 Open Questions Resolved:**

| Question                                                | Answer                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1: How does `createAgentEventHandler` adapt?           | Replaced by `createAgentActionHandler`. Returns internalAction, not internalMutation.                                                                                 |
| Q2: How does agent access EventStore for event history? | Action uses `ctx.runQuery()` to app-level projection query handlers. The `customerCancellations` projection suffices for churn-risk. Full EventStore access deferred. |

**Open Questions for Holistic Review:**

1. DS-3: Rate limiter check point — inside action (before LLM) wastes Workpool slot when rate-limited. Consider rate-limit-then-enqueue at EventBus level?
2. DS-4: How does `AgentBCConfig.onEvent` evolve into `PatternDefinition[]`? The `injectedData` addition needs to be compatible.
3. DS-5: Lifecycle FSM pause/resume — paused agent should reject events in the action (fast return null), not just rely on checkpoint status check.
4. DS-7: Admin UI needs the same app-level query handlers that actions use. Shared query layer opportunity.
5. Future: When Workpool adds key-based ordering, update EventBus to pass `partitionKey.value` as `key`. This eliminates the concurrent-action concern entirely and makes the onComplete checkpoint check a pure defense-in-depth measure.

---

### DS-3: LLM Integration & Cost Control

**Status: NOT STARTED**
**Source:** 22b (Rule 2 + remaining deliverables)
**Spec:** `specs/platform/agent-llm-integration.feature` Rule 2
**Depends on:** DS-2
**Can parallel with:** DS-4, DS-5

**Consumer validation:**

- 22d Rule 1: Hybrid LLM flow — fallback to rules validates circuit breaker design
- 22d Rule 1 S3: "LLM unavailable falls back to rule-based confidence" — validates degradation path
- 22d Rule 1 S4: Confidence threshold 0.8 is config-driven — validates cost budget doesn't break threshold logic

**Scope:**

- `@convex-dev/agent` thread adapter for EventBus subscription model
- Thread-per-customer conversation state
- Rate limiter integration (`@convex-dev/rate-limiter` token bucket per agent)
- Cost budget tracking: daily USD limit with auto-pause
- Circuit breaker for LLM outages

**Critical Constraint (from DS-1/DS-2 review):**

`rateLimiter.limit()` runs in mutations only. Agent handlers are actions. Actions cannot
call mutations atomically — `ctx.runMutation()` from an action is a separate transaction.
DS-3 must use the **reservation pattern** (`reserve: true`) to atomically check AND reserve
capacity in a single mutation call before enqueueing the action:

```typescript
const { ok, retryAfter } = await rateLimiter.limit(ctx, "llmTokens", {
  count: numTokens,
  reserve: true,
});
```

**Key Design Decisions:**

| Decision               | Options                                  | Why Complex                 |
| ---------------------- | ---------------------------------------- | --------------------------- |
| Thread model           | Per-customer vs per-event vs per-pattern | Affects context and costs   |
| Rate limit enforcement | Before enqueue vs inside action          | Inside wastes Workpool slot |
| Cost tracking schema   | Agent component table vs separate        | Where does spend data live? |
| Circuit breaker state  | In-memory vs persisted                   | Across action invocations?  |

---

### DS-4: Command Routing & Pattern Unification

**Status: COMPLETE**
**Source:** 22c (Rules 1, 3)
**Spec:** `specs/platform/agent-command-infrastructure.feature` Rules 1, 3
**Depends on:** DS-2
**Can parallel with:** DS-3, DS-5

**Consumer validation:**

- 22d Rule 3: SuggestCustomerOutreach is the first concrete command needing routing
- 22d Rule 3 S1: "CommandOrchestrator processes the command" — validates command bridge design
- 22d Rule 3 S3: "handler throws → dead letter" — validates failure-to-dead-letter flow
- **API gap (command bridge):** RESOLVED — Command bridge via scheduled mutation from onComplete

**Scope:**

- Agent command router: `SuggestCustomerOutreach` -> CommandOrchestrator
- Command config registration pattern
- Unified `PatternDefinition` API: `trigger()` + `analyze()`
- Pattern registry: named pattern lookup
- `AgentBCConfig` redesign: `patterns: string[]` (names from registry) replaces `onEvent`
- Command bridge: scheduled mutation routes commands through orchestrator

**Key Decisions (6 total):**

| AD   | Decision                                                           | Category     | PDR     |
| ---- | ------------------------------------------------------------------ | ------------ | ------- |
| AD-1 | PatternRegistry follows CommandRegistry singleton pattern          | architecture | PDR-012 |
| AD-2 | AgentBCConfig uses XOR for onEvent vs patterns                     | architecture | PDR-012 |
| AD-3 | PatternExecutor iterates with short-circuit on first match         | design       | PDR-012 |
| AD-4 | Command bridge via scheduled mutation from onComplete              | architecture | PDR-012 |
| AD-5 | AgentCommandRouter maps agent command types to orchestrator routes | design       | PDR-012 |
| AD-6 | AgentActionResult gains patternId field                            | design       | PDR-012 |

**Deliverables:**

| #   | Deliverable                  | Location                                                           |
| --- | ---------------------------- | ------------------------------------------------------------------ |
| 1   | Decision spec                | `delivery-process/decisions/pdr-012-agent-command-routing.feature` |
| 2   | Pattern Registry stub        | `delivery-process/stubs/agent-command-routing/pattern-registry.ts` |
| 3   | AgentBCConfig evolution stub | `delivery-process/stubs/agent-command-routing/agent-bc-config.ts`  |
| 4   | Pattern Executor stub        | `delivery-process/stubs/agent-command-routing/pattern-executor.ts` |
| 5   | AgentCommandRouter stub      | `delivery-process/stubs/agent-command-routing/command-router.ts`   |
| 6   | Command Bridge stub          | `delivery-process/stubs/agent-command-routing/command-bridge.ts`   |

**DS-2 Open Questions Resolved:**

| Question                                                                | Answer                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Q2: How does `AgentBCConfig.onEvent` evolve into `PatternDefinition[]`? | `onEvent` becomes optional. New `patterns: string[]` references registry. XOR constraint. Backward compatible. |

**Open Questions for Holistic Review:**

1. DS-3: How does PatternExecutor interact with rate limiter? Proposed: check before `analyze()` (expensive LLM), not before `trigger()` (cheap boolean).
2. DS-5: When agent is paused, should pending commands still route? Proposed: YES — pausing stops event delivery, not command lifecycle.
3. DS-6: Should command routing use Workpool instead of scheduler? Proposed: defer — scheduler sufficient for MVP, DS-6 can upgrade.
4. DS-7: Admin UI needs `commands.getByDecisionId` query (not in DS-1 API). Add during holistic review or DS-7.
5. Future: Multi-pattern matching strategy — short-circuit vs aggregate. Proposed: short-circuit for DS-4, defer aggregation to future DS.

---

### DS-5: Agent Lifecycle FSM

**Status: COMPLETE**
**Source:** 22c (Rule 2)
**Spec:** `specs/platform/agent-command-infrastructure.feature` Rule 2
**Depends on:** DS-1, DS-2
**Can parallel with:** DS-3, DS-4
**Off critical path** -- agent works without pause/resume

**Consumer validation:**

- 22d Rule 2: Approval expiration cron — pausing agent does NOT affect pending approvals (own expiration lifecycle)
- 22e Rule 1: Dead letter panel — paused agent may still have dead letters that need management (unaffected by pause)

**Scope:**

- Lifecycle FSM: `stopped -> active -> paused -> active`, `error_recovery`
- 5 command handlers (Start, Pause, Resume, Stop, Reconfigure)
- Pause mechanism: handler-level gate (events seen-but-skipped, checkpoint advances)
- Config overrides on checkpoint for ReconfigureAgent
- 6 new lifecycle audit event types

**Key Decisions (6 total):**

| AD   | Decision                                                                  | Category     | PDR     |
| ---- | ------------------------------------------------------------------------- | ------------ | ------- |
| AD-1 | Follow PM lifecycle Map pattern (not platform-fsm/defineFSM)              | architecture | PDR-013 |
| AD-2 | Lifecycle state stored in checkpoint status field                         | architecture | PDR-013 |
| AD-3 | Lifecycle commands are infrastructure mutations (not CommandOrchestrator) | architecture | PDR-013 |
| AD-4 | Paused events advance checkpoint (seen-but-skipped semantics)             | design       | PDR-013 |
| AD-5 | Config overrides stored on checkpoint table                               | design       | PDR-013 |
| AD-6 | error_recovery transition deferred to DS-3 (circuit breaker)              | design       | PDR-013 |

**Deliverables:**

| #   | Deliverable                     | Location                                                                    |
| --- | ------------------------------- | --------------------------------------------------------------------------- |
| 1   | Decision spec                   | `delivery-process/decisions/pdr-013-agent-lifecycle-fsm.feature`            |
| 2   | Lifecycle FSM stub              | `delivery-process/stubs/agent-lifecycle-fsm/lifecycle-fsm.ts`               |
| 3   | Lifecycle command types stub    | `delivery-process/stubs/agent-lifecycle-fsm/lifecycle-command-types.ts`     |
| 4   | Lifecycle command handlers stub | `delivery-process/stubs/agent-lifecycle-fsm/lifecycle-command-handlers.ts`  |
| 5   | Lifecycle audit events stub     | `delivery-process/stubs/agent-lifecycle-fsm/lifecycle-audit-events.ts`      |
| 6   | Checkpoint status extension     | `delivery-process/stubs/agent-lifecycle-fsm/checkpoint-status-extension.ts` |

**DS-2 Open Questions Resolved:**

| Question                                                                         | Answer                                                                                  |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Q3: Lifecycle FSM pause/resume — paused agent should reject events in the action | Confirmed: handler-level gate advances checkpoint (AD-4). Action returns null decision. |

**DS-4 Open Questions Resolved:**

| Question                                                       | Answer                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Q2: When agent is paused, should pending commands still route? | YES — pausing stops event analysis, not command lifecycle. Commands already in pipeline complete normally. |

**Open Questions for Holistic Review:**

1. DS-3: error_recovery trigger mechanism — consecutive failure threshold, cooldown duration, exponential backoff. DS-5 only provides FSM transitions.
2. DS-3: Rate limiter check point — should cost budget exceeded auto-trigger PauseAgent via ENTER_ERROR_RECOVERY?
3. DS-7: Admin UI lifecycle controls — `checkpoints.getByAgentId` query (DS-1) sufficient for displaying agent state. No additional API needed.
4. Future: Skipped-event audit trail — should action handler record lightweight "EventSkipped" entries during pause? Currently events are silently skipped.
5. Future: Multiple subscriptions per agent — lifecycle is agent-level, not subscription-level. Should individual subscription pause be supported?
6. Future: ReconfigureAgent field set — could `humanInLoop` config also be runtime-configurable?

---

### DS-6: Churn-Risk Agent Integration

**Status: NOT STARTED**
**Source:** 22d (full spec)
**Spec:** `specs/example-app/agent-churn-risk-completion.feature`
**Depends on:** DS-1, DS-2, DS-3, DS-4
**Can parallel with:** DS-7

**Consumes platform APIs from:**

- DS-1: `components.agent.*` for checkpoints, audit, commands, approvals, dead letters
- DS-2: `createAgentActionHandler` + `createAgentOnCompleteHandler` factories
- DS-3: LLM thread adapter, rate limiter, circuit breaker
- DS-4: CommandOrchestrator integration, PatternDefinition API

**Scope:**

- Wire action handler + onComplete for churn-risk using platform infra
- `SuggestCustomerOutreach` command handler (domain handler)
- Approval expiration cron enhancement
- Full E2E flow validation
- Integration test strategy (mock LLM in CI)

**Design weight:** Light-medium (mostly wiring exercise using platform APIs from DS-1 through DS-5)

---

### DS-7: Admin Frontend Completion

**Status: NOT STARTED**
**Source:** 22e (full spec)
**Spec:** `specs/example-app/agent-admin-frontend.feature`
**Depends on:** DS-1 (component API shape for hooks)
**Can parallel with:** DS-6
**Off critical path**

**Consumes platform APIs from:**

- DS-1: `components.agent.deadLetters.*`, `components.agent.audit.*`, `components.agent.approvals.*`

**Known API gaps (from consumer spec analysis):**

- Audit query lacks `actionType` top-level field for decision history filtering by command type
  (22e Rule 2 S2: "filter by SuggestCustomerOutreach"). Currently buried in `payload`.
- Audit query lacks `fromTimestamp`/`toTimestamp` args for time range filtering
  (22e Rule 2: `?from=2026-01-01&to=2026-02-01`). Index `by_agentId_timestamp` supports it
  but query API doesn't expose it.
- Both are minor schema/API extensions — design during this session or holistic review.

**Scope:**

- Dead letter management panel (list, detail, replay/ignore)
- Decision history tab with URL-persisted filters
- Sonner toast integration for action feedback
- E2E step definitions strategy + page objects
- Auth integration documentation

---

## Summary Table

| Session | Source Spec     | Deliverables | Rules | Design Weight | Status      |
| ------- | --------------- | ------------ | ----- | ------------- | ----------- |
| DS-1    | 22a             | 11           | 2     | Heavy         | Complete    |
| DS-2    | 22b (core)      | 5            | 3     | Heavy         | Complete    |
| DS-3    | 22b (rest)      | 5            | 1     | Medium        | Not started |
| DS-4    | 22c (Rules 1,3) | 6            | 2     | Medium        | Complete    |
| DS-5    | 22c (Rule 2)    | 6            | 1     | Medium        | Complete    |
| DS-6    | 22d             | 8            | 3     | Light-medium  | Not started |
| DS-7    | 22e             | 12           | 3     | Light-medium  | Not started |

---

## Holistic Review Checklist

> **Holistic Review Update (2026-02-06):** Cross-DS review applied improvements to:
> type unification (AgentComponentAPI), registry simplification (PatternRegistry → array,
> AgentCommandRouter → config map), command bridge (Workpool instead of scheduler),
> spec dedup (rate limiting consolidated to 22b), and convention fixes (error code patterns).
> See plan: `.claude/plans/crispy-leaping-thompson.md`

After all design sessions complete, review across all DS sessions:

- [ ] Cross-DS dependencies resolved (open questions from each DS)
- [x] API contracts consistent across component boundary — Resolved: unified AgentComponentAPI (holistic review)
- [ ] TS2589 strategy covers all new references
- [ ] Decision specs created for lasting architectural choices
- [ ] Stubs reviewed for completeness before implementation
- [ ] Consumer spec validation: platform APIs satisfy 22d/22e requirements
- [ ] API gap: audit `actionType` field for decision history filtering (DS-7)
- [ ] API gap: audit `fromTimestamp`/`toTimestamp` for time range queries (DS-7)
- [x] API gap: command bridge from agent component to CommandOrchestrator (DS-4) — RESOLVED: scheduled mutation via `routeAgentCommand`
- [x] API gap: `commands.getByDecisionId` query needed for command bridge (DS-4 open Q4) — RESOLVED: Added to DS-1 commands stub
- [ ] PatternExecutor + rate limiter interaction point (DS-4 open Q1 / DS-3) — Blocked: DS-3
- [ ] error_recovery trigger mechanism: consecutive failure threshold + cooldown (DS-5 open Q1 / DS-3) — Blocked: DS-3
- [ ] Cost budget exceeded auto-pause via ENTER_ERROR_RECOVERY (DS-5 open Q2 / DS-3)
- [ ] Skipped-event audit trail during pause — silent skip vs lightweight audit (DS-5 open Q4)
- [x] ReconfigureAgent runtime-configurable field set — extend beyond confidenceThreshold/patternWindow/rateLimits? (DS-5 open Q6) — Resolved: documented in checkpoint-status-extension.ts
- [ ] 22d deliverable location: "Agent component migration" location correction
- [ ] DS-3 prereq: AgentRuntimeConfig vs Agent class integration boundary
- [ ] DS-3 prereq: AI SDK v4→v5 migration (peer dep conflict)
- [ ] DS-3 prereq: LLM call pattern (generateObject vs Agent.generateText)
- [ ] DS-3 prereq: Built-in usageHandler vs custom cost tracking
- [ ] DS-3 prereq: Rate limiter enforcement point (app-level action, handler, or EventBus?)

~~DS-3 Pre-requisites~~ — Moved to holistic review checklist above.
