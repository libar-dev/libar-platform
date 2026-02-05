# Design Session Guide

> Agent-as-BC design sessions (DS-1 through DS-7). Use this guide to start design sessions,
> track progress across sessions, and prepare for holistic review.
>
> **Process methodology** (stub management, decision categories, naming conventions)
> is captured in PDR-009 (Design Session Methodology).

---

## Design Session Prompt Template

Use this prompt to start each design session. Replace `**DS-X**` with the session number.

---

```
Please make design-level (NOT IMPLEMENTATION!) specs based on plan-level specs we created.
For this session we should do **DS-X**.

## Context

@libar-platform/delivery-process/DELIVERY-PROCESS-GUIDE.md
@libar-platform/delivery-process/DESIGN-SESSION-GUIDE.md
@deps-packages/delivery-process/docs/METHODOLOGY.md
@deps-packages/delivery-process/docs/SESSION-GUIDES.md

## Critical Reminders

1. This is NOT an implementation session. Once we do all design sessions we will do
   holistic reviews and iterate on details as necessary.
2. No design documents. Record important decisions as decision specs (.feature)
   in delivery-process/decisions/.
3. Code stubs go in delivery-process/stubs/{pattern-name}/ with @target comments
   indicating real destination. Never directly in package source.
4. Open questions section: note interactions with other DS sessions.
   These get resolved during holistic review.
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

**Status: NOT STARTED**
**Source:** 22b core (Rule 1 + Rule 3)
**Depends on:** DS-1

**Scope:**

- `createAgentActionHandler()` factory replacing current `createAgentEventHandler()`
- Action -> onComplete flow: how action results (AgentDecision) flow to persistence mutation
- State loading pattern: `runQuery` in action for checkpoint + event history
- `onComplete` field addition to `CreateAgentSubscriptionOptions` (platform-bus change)
- LLM fallback strategy (graceful degradation to rules)
- Error handling: action failure vs onComplete failure

**Key Design Decisions:**

| Decision                            | Why It Needs Design                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EventStore access for event history | `loadHistory` queries EventStore (separate component) — not covered by PDR-010 argument injection. Options: extend injection, direct cross-component query, or hybrid. |
| Factory API shape                   | Must work for both LLM-enabled and rule-only agents                                                                                                                    |
| State loading                       | Actions can't use `ctx.db` -- need `runQuery` through component API                                                                                                    |
| onComplete contract                 | What data flows from action -> onComplete? Full decision or just result?                                                                                               |
| Retry semantics                     | Workpool retries actions but not mutations -- idempotency implications                                                                                                 |

---

### DS-3: LLM Integration & Cost Control

**Status: NOT STARTED**
**Source:** 22b (Rule 2 + remaining deliverables)
**Depends on:** DS-2
**Can parallel with:** DS-4, DS-5

**Scope:**

- `@convex-dev/agent` thread adapter for EventBus subscription model
- Thread-per-customer conversation state
- Rate limiter integration (`@convex-dev/rate-limiter` token bucket per agent)
- Cost budget tracking: daily USD limit with auto-pause
- Circuit breaker for LLM outages

**Key Design Decisions:**

| Decision               | Options                                  | Why Complex                 |
| ---------------------- | ---------------------------------------- | --------------------------- |
| Thread model           | Per-customer vs per-event vs per-pattern | Affects context and costs   |
| Rate limit enforcement | Before enqueue vs inside action          | Inside wastes Workpool slot |
| Cost tracking schema   | Agent component table vs separate        | Where does spend data live? |
| Circuit breaker state  | In-memory vs persisted                   | Across action invocations?  |

---

### DS-4: Command Routing & Pattern Unification

**Status: NOT STARTED**
**Source:** 22c (Rules 1, 3)
**Depends on:** DS-2
**Can parallel with:** DS-3, DS-5

**Scope:**

- Agent command router: `SuggestCustomerOutreach` -> CommandOrchestrator
- Command config registration pattern
- Unified `PatternDefinition` API: `trigger()` + `analyze()`
- Pattern registry: named pattern lookup
- `AgentBCConfig` redesign: `patterns: PatternDefinition[]` replaces `onEvent`

**Key Design Decisions:**

| Decision                      | Why Complex                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| Command routing integration   | Decision -> onComplete -> command -> orchestrator flow        |
| Pattern executor control flow | Iterate patterns, short-circuit, aggregate results            |
| Config backward compatibility | `AgentBCConfig` shape change, migration for churn-risk config |

---

### DS-5: Agent Lifecycle FSM

**Status: NOT STARTED**
**Source:** 22c (Rule 2)
**Depends on:** DS-1, DS-2
**Can parallel with:** DS-3, DS-4
**Off critical path** -- agent works without pause/resume

**Scope:**

- Lifecycle FSM: `stopped -> active -> paused -> active`, `error_recovery`
- 5 command handlers (Start, Pause, Resume, Stop, Reconfigure)
- Pause/resume interaction with EventBus subscription
- Checkpoint preservation across state transitions

**Key Design Decisions:**

| Decision                    | Why Complex                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| Subscription management     | "Paused" must stop event delivery; Workpool doesn't support pause |
| Error recovery automation   | `error_recovery -> active` via timer? backoff?                    |
| Reconfigure without restart | Hot-reload config while preserving checkpoint                     |

---

### DS-6: Churn-Risk Agent Integration

**Status: NOT STARTED**
**Source:** 22d (full spec)
**Depends on:** DS-1, DS-2, DS-3, DS-4
**Can parallel with:** DS-7

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
**Depends on:** DS-1 (component API shape for hooks)
**Can parallel with:** DS-6
**Off critical path**

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
| DS-2    | 22b (core)      | 3            | 2     | Heavy         | Not started |
| DS-3    | 22b (rest)      | 5            | 1     | Medium        | Not started |
| DS-4    | 22c (Rules 1,3) | 6            | 2     | Medium        | Not started |
| DS-5    | 22c (Rule 2)    | 5            | 1     | Medium        | Not started |
| DS-6    | 22d             | 8            | 3     | Light-medium  | Not started |
| DS-7    | 22e             | 12           | 3     | Light-medium  | Not started |

---

## Holistic Review Checklist

After all design sessions complete, review across all DS sessions:

- [ ] Cross-DS dependencies resolved (open questions from each DS)
- [ ] API contracts consistent across component boundary
- [ ] TS2589 strategy covers all new references
- [ ] Decision specs created for lasting architectural choices
- [ ] Stubs reviewed for completeness before implementation
