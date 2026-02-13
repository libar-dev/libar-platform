# AgentChurnRiskCompletion - Remaining Work

**Purpose:** Detailed remaining work for AgentChurnRiskCompletion

---

## Summary

**Progress:** [██████░░░░░░░░░░░░░░] 2/7 (29%)

**Remaining:** 5 patterns (3 active, 2 planned)

---

## 🚧 In Progress

| Pattern                         | Effort | Business Value |
| ------------------------------- | ------ | -------------- |
| 🚧 Agent BC Component Isolation | 1w     | -              |
| 🚧 Agent LLM Integration        | 1w     | -              |
| 🚧 Confirmed Order Cancellation | 2d     | -              |

---

## ✅ Ready to Start

These patterns can be started immediately:

| Pattern                        | Effort | Business Value |
| ------------------------------ | ------ | -------------- |
| 📋 Agent Churn Risk Completion | 1w     | -              |

---

## ⚠️ Blocked

These patterns are waiting on dependencies:

| Pattern              | Blocked By               | Effort |
| -------------------- | ------------------------ | ------ |
| Agent Admin Frontend | AgentChurnRiskCompletion | 1w     |

---

## All Remaining Patterns

### 📋 Agent Admin Frontend

| Property     | Value                    |
| ------------ | ------------------------ |
| Status       | planned                  |
| Effort       | 1w                       |
| Dependencies | AgentChurnRiskCompletion |

**Problem:** The admin UI at `/admin/agents` has several gaps identified in the
E2E feature file (`agent-approvals.feature`) and investigation:

1. **Dead letter management missing** — Backend has full API (`queryDeadLetters`,
   `replayDeadLetter`, `ignoreDeadLetter`) but no frontend UI
2. **Decision history incomplete** — E2E spec describes decision history tab with
   filtering, but component is not built
3. **Authentication placeholder** — `useReviewerId()` returns `"reviewer-placeholder"`
   with a TODO comment
4. **No action feedback** — Approve/reject has no success/error toast notifications
5. **No loading states** — No skeleton UI during Suspense boundaries
6. **E2E steps missing** — `agent-approvals.feature` has 56 scenarios with no step
   definitions, causing CI failures

**Solution:** Complete the agent admin frontend:

1. **Dead letter management panel** — List, replay, ignore with feedback
2. **Decision history with filtering** — By agent ID, action type, time range
3. **Auth integration pattern** — Document integration point, implement mock for tests
4. **Toast notifications** — Success/error feedback for all mutating actions
5. **E2E step definitions** — Implement steps for existing feature scenarios

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Operational visibility | Dead letters visible and actionable by operators |
| Agent observability | Decision history filterable for analysis and debugging |
| User feedback | Toast notifications confirm approve/reject/replay/ignore actions |
| Test coverage | E2E tests validate full UI-to-backend agent workflow |
| Production readiness | Auth integration pattern ready for Convex Auth/Clerk |

**Current Admin UI Structure:**
| Tab | Status | Component |
| Dashboard | Implemented | AgentDashboard |
| Pending Approvals | Implemented | PendingApprovalsList, ApprovalDetail |
| Monitoring | Implemented | AgentMonitoring |
| Decision History | Not built | (planned) |
| Dead Letters | Not built | (planned) |

**Existing Hooks (implemented):**
| Hook | Purpose | Status |
| usePendingApprovals() | List pending approvals | Working |
| useApprovalDetail(id) | Single approval with events | Working |
| useActiveAgents() | Active agent list | Working |
| useApprovalActions() | Approve/reject mutations | Working (no feedback) |

**Missing Hooks (planned):**
| Hook | Purpose |
| useDeadLetters(agentId?) | Dead letter list with optional agent filter |
| useDeadLetterActions() | Replay/ignore mutations with feedback |
| useDecisionHistory(filters) | Filtered audit events for decision history |
| useReviewerId() | Real auth integration (replace placeholder) |

**Design Decision: Authentication Pattern**

| Option | Trade-off |
| A: Convex Auth | Full auth stack, but adds complexity to example app |
| B: Clerk integration | Proven pattern, but external dependency |
| C: Mock with pattern (Recommended) | Document integration point, use mock for now |

**Decision:** Option C. The example app is a reference implementation, not a production
app. We document the exact integration point where `useReviewerId()` should connect
to real auth (Convex Auth or Clerk), and provide a mock implementation that works
for development and E2E tests. Real auth is a separate concern outside this spec's scope.

**Design Decision: Toast Notification Library**

Use Sonner for toast notifications:

- Lightweight and accessible (ARIA live regions)
- Works with React 19 and TanStack Start
- No additional peer dependencies
- Commonly used in Convex example apps

**Design Decision: E2E Test Strategy**

The `agent-approvals.feature` file exists at `apps/frontend/tests/e2e/features/admin/`
with 56 scenarios. Strategy:

1. Add `@skip` tag to scenarios NOT covered by this spec (future work)
2. Implement step definitions for scenarios that ARE covered
3. Remove `@skip` tags as implementations are completed
4. Use Playwright page object pattern (consistent with existing E2E structure)

**Existing E2E Feature Scenarios (from agent-approvals.feature):**
| Category | Scenario Count | This Spec Covers |
| Dashboard overview | 8 | Yes (already partially working) |
| Pending approvals list | 10 | Yes (approve/reject + toast) |
| Approval detail | 8 | Yes (detail view + actions) |
| Monitoring | 6 | Yes (already partially working) |
| Decision history | 8 | Yes (new tab + filters) |
| Dead letter management | 8 | Yes (new panel) |
| Customer risk preview | 4 | No (future work, @skip) |
| Cross-agent filtering | 4 | Partial (basic filters) |

#### Acceptance Criteria

**Dead letter list displays failed events**

- Given 3 dead letter entries exist for the churn-risk agent
- When I navigate to the dead letters panel
- Then I see 3 entries with agent, event type, error, and timestamp
- And each entry has "Replay" and "Ignore" action buttons

**Replay action triggers backend mutation with feedback**

- Given a dead letter entry for event "evt_123"
- When I click the "Replay" button
- Then the replayDeadLetter mutation is called
- And a success toast shows "Dead letter replayed successfully"
- And the entry status updates to "replayed"

**Ignore action with reason provides confirmation**

- Given a dead letter entry for event "evt_456"
- When I click "Ignore" and enter reason "Duplicate event, already processed"
- Then the ignoreDeadLetter mutation is called with the reason
- And a success toast shows "Dead letter ignored"
- And the entry status updates to "ignored"

**Replay failure shows error toast**

- Given a dead letter entry whose original event no longer exists
- When I click the "Replay" button
- Then the mutation fails with an error
- And an error toast shows a descriptive message
- And the entry remains in "pending" status

**Filter by agent shows only that agent's decisions**

- Given decisions exist for "churn-risk" and "low-stock" agents
- When I select "churn-risk" in the agent filter
- Then only churn-risk agent decisions are displayed
- And the URL updates to include ?agent=churn-risk

**Filter by action type shows matching decisions**

- Given decisions with actions "SuggestCustomerOutreach" and "LogChurnRisk"
- When I select "SuggestCustomerOutreach" in the action filter
- Then only SuggestCustomerOutreach decisions are displayed

**Clear filters shows all decisions**

- Given filters are active for agent and action type
- When I click "Clear Filters"
- Then all decisions are displayed
- And the URL query parameters are removed

**Loading decision history from shared URL**

- Given the URL contains ?agent=churn-risk&action=SuggestCustomerOutreach
- When the page loads
- Then filters are pre-populated from URL parameters
- And only matching decisions are displayed

**Approve action shows success toast**

- Given a pending approval for the churn-risk agent
- When I click "Approve"
- Then a success toast appears with "Approval recorded"
- And the toast auto-dismisses after 5 seconds
- And the approval list refreshes

**Reject action shows success toast**

- Given a pending approval for the churn-risk agent
- When I click "Reject" and confirm
- Then a success toast appears with "Action rejected"
- And the approval is removed from the pending list

**Error action shows descriptive error toast**

- Given a pending approval that has already been expired
- When I attempt to approve it
- Then an error toast appears with "Approval has expired"
- And the toast has role="alert" for accessibility
- And the approval status shows "expired"

**Multiple rapid actions show stacked toasts**

- Given 3 pending approvals
- When I quickly approve all 3
- Then 3 success toasts appear in sequence
- And each toast is individually dismissable
- And they auto-dismiss in order

#### Business Rules

**Dead letters are visible and actionable**

**Invariant:** Admin UI must display dead letter entries with replay/ignore actions.
Each action must provide feedback via toast notification. Dead letters are operational
concerns that require visibility for system health monitoring.

    **Rationale:** Without dead letter UI, operators cannot manage failed agent event
    processing. The backend has full API support (`queryDeadLetters`, `replayDeadLetter`,
    `ignoreDeadLetter`) but this data is invisible to users.

    **Dead Letter Panel Structure:**
    | Column | Source | Purpose |
    | Agent | deadLetter.agentId | Which agent failed |
    | Event Type | deadLetter.eventType | What event failed |
    | Error | deadLetter.error | Why it failed |
    | Status | deadLetter.status | pending/replayed/ignored |
    | Timestamp | deadLetter.createdAt | When it failed |
    | Actions | buttons | Replay / Ignore |

    **Verified by:** List displays correctly, replay works, ignore works, toast shows

_Verified by: Dead letter list displays failed events, Replay action triggers backend mutation with feedback, Ignore action with reason provides confirmation, Replay failure shows error toast_

**Decision history supports filtering**

**Invariant:** Decision history must be filterable by agent ID, action type, and
time range. Filters persist in URL query parameters for shareability and browser
back/forward navigation.

    **Rationale:** High-volume agents produce many audit events. Without filtering,
    the decision history is unusable for analysis. URL-persisted filters enable sharing
    specific views with team members and support browser navigation.

    **Filter Parameters:**
    | Filter | URL Param | Default | Description |
    | Agent ID | ?agent=churn-risk | All agents | Filter by specific agent |
    | Action Type | ?action=SuggestCustomerOutreach | All actions | Filter by command type |
    | Time Range | ?from=2026-01-01&to=2026-02-01 | Last 7 days | Date range filter |

    **Verified by:** Filters work, URL persists, clear restores all

_Verified by: Filter by agent shows only that agent's decisions, Filter by action type shows matching decisions, Clear filters shows all decisions, Loading decision history from shared URL_

**Actions provide feedback via toast**

**Invariant:** All mutating actions (approve, reject, replay, ignore) must show
toast notifications for success and error states. Toasts use accessible ARIA
attributes and auto-dismiss after a reasonable timeout.

    **Rationale:** Users need immediate feedback that their action was processed.
    The current implementation performs mutations silently — the user clicks
    "Approve" and has no visual confirmation that it worked or failed.

    **Toast Behavior:**
    | Action | Success Message | Error Behavior |
    | Approve | "Approval recorded for {agentId}" | Show error with reason |
    | Reject | "Action rejected" | Show error with reason |
    | Replay dead letter | "Dead letter replayed successfully" | Show error with reason |
    | Ignore dead letter | "Dead letter ignored" | Show error with reason |

    **Verified by:** Success toast appears, error toast appears, auto-dismiss works

_Verified by: Approve action shows success toast, Reject action shows success toast, Error action shows descriptive error toast, Multiple rapid actions show stacked toasts_

### 🚧 Agent BC Component Isolation

| Property     | Value                 |
| ------------ | --------------------- |
| Status       | active                |
| Effort       | 1w                    |
| Dependencies | AgentAsBoundedContext |

**Problem:** Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`,
`agentCommands`, `pendingApprovals`) reside in the shared app schema without physical
BC isolation. Any app mutation can read/write agent tables directly, violating the core
platform principle that bounded contexts should have isolated databases enforced by
Convex component boundaries.

**Solution:** Implement agent as a proper Convex component:

1. **`defineComponent("agent")`** with isolated schema and private tables
2. **Public API handlers** for checkpoint, audit, dead letter, and command operations
3. **Cross-component query pattern** for app-level projections like `customerCancellations`

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Physical BC isolation | Component tables are private, accessed only via API boundary |
| Schema evolution safety | Component schema evolves independently of app schema |
| Clear ownership | Agent component owns its domain data exclusively |
| Consistent patterns | Aligns with orders/inventory component architecture |
| OCC blast radius reduction | Agent writes isolated from app-level transaction conflicts |
| Testing isolation | Component can be tested with `t.registerComponent()` |

**Current State (app-level tables):**
| Table | Current Location | Issue |
| agentCheckpoints | Main schema.ts | No access control, OCC blast radius |
| agentAuditEvents | Main schema.ts | Any mutation can modify audit trail |
| agentDeadLetters | Main schema.ts | No encapsulation |
| agentCommands | Main schema.ts | No API boundary |
| pendingApprovals | Main schema.ts | Shared transaction scope |

**Target State (component isolation):**
| Table | Target Location | Access Pattern |
| agentCheckpoints | Agent component schema | Via components.agent.checkpoints._ |
| agentAuditEvents | Agent component schema | Via components.agent.audit._ |
| agentDeadLetters | Agent component schema | Via components.agent.deadLetters._ |
| agentCommands | Agent component schema | Via components.agent.commands._ |
| pendingApprovals | Agent component schema | Via components.agent.approvals.\* |

**Design Decision: Projection Ownership (customerCancellations)**

The `customerCancellations` projection is updated by CommandOrchestrator (orders BC context)
but consumed exclusively by the agent for O(1) pattern detection lookup.

| Option | Trade-off |
| A: Keep at app level (Recommended) | Agent queries via cross-component query; natural per CLAUDE.md "all projections at app level" |
| B: Move into agent component | Faster queries but requires cross-BC event subscription for updates |
| C: Duplicate to both locations | Redundant data, consistency challenges |

**Decision:** Option A. Projections often combine data from multiple BCs and belong at
the app level per platform architecture. The agent uses a cross-component query pattern
to access `customerCancellations` — the same pattern any component uses to read app data.

**Design Decision: Component API Surface**

Expose minimal API that supports all current use cases without over-engineering:

| API Group | Handlers | Purpose |
| Checkpoints | loadCheckpoint, updateCheckpoint | Exactly-once processing |
| Audit | recordAuditEvent, queryAuditEvents, getAuditEventsByAgent | Explainability |
| Dead Letters | recordDeadLetter, replayDeadLetter, ignoreDeadLetter, queryDeadLetters | Error management |
| Commands | recordCommand, updateCommandStatus, queryCommands | Command lifecycle |
| Approvals | createApproval, approveAction, rejectAction, queryPendingApprovals | Human-in-loop |

**Design Decision: Migration Strategy**

Staged migration from app tables to component tables:

1. Create component with new schema (parallel to existing tables)
2. Update handlers to use component API
3. Migrate existing data (one-time migration script)
4. Remove old tables from app schema

**Design Decision: Peer Mounting Architecture (AD-6)**

`agentBC`, `@convex-dev/agent` (as `llmAgent`), and `agentPool` workpool are all PEER
components at the app level — NOT nested (agentBC does NOT `component.use(agent)`).

| Component | Purpose | Why Peer |
| agentBC | BC state: checkpoints, audit, commands, approvals | Owns domain data |
| llmAgent (@convex-dev/agent) | LLM: threads, messages, embeddings | Needs process.env for API keys |
| agentPool (workpool) | Dedicated pool for agent actions | Separate parallelism from projections |

Components cannot access `process.env` — the app-level action handler coordinates
between both components, passing API keys as arguments.

"""typescript
// convex.config.ts — all three are app-level peers
import agentBC from "@libar-dev/platform-core/agent/convex.config";
import { agent } from "@convex-dev/agent/convex.config";
import { workpool } from "@convex-dev/workpool/convex.config";

app.use(agentBC); // BC: checkpoints, audit, commands, approvals
app.use(agent, { name: "llmAgent" }); // LLM: threads, messages, embeddings
app.use(workpool, { name: "agentPool" }); // Dedicated pool for agent actions
"""

**Data Flow with Peer Components:**
"""
EventBus → agentPool.enqueueAction() → app-level action handler
action: ctx.runQuery(agentBC.checkpoints._) + llmAgent.generateText()
onComplete: ctx.runMutation(agentBC.audit._) + ctx.runMutation(agentBC.checkpoints.\*)
"""

**Schema Evolution Notes (from design stubs):**

The component schema expands beyond the current app-level definitions:

| Aspect | Current (app schema) | Target (component schema) |
| Checkpoint statuses | 3: active, paused, stopped | 4: adds error_recovery (DS-5 lifecycle) |
| Audit event types | 6: Decision, Approved, Rejected, Expired, Completed, Failed | 16: adds DS-4 routing + DS-5 lifecycle types |
| Checkpoint indexes | by_agentId only | Adds by_agentId_subscriptionId for O(1) lookup |
| Forward declarations | None | configOverrides: v.optional(v.any()) for ReconfigureAgent (DS-5) |

All 16 audit event types declared from day one to avoid schema migration:

- DS-1 base (8): PatternDetected, CommandEmitted, ApprovalRequested/Granted/Rejected/Expired, DeadLetterRecorded, CheckpointUpdated
- DS-4 routing (2): AgentCommandRouted, AgentCommandRoutingFailed
- DS-5 lifecycle (6): AgentStarted, AgentPaused, AgentResumed, AgentStopped, AgentReconfigured, AgentErrorRecoveryStarted

**Cron Migration Note:**

The existing `expirePendingApprovals` cron runs as an `internalMutation` with direct
`ctx.db` access. After component isolation, crons cannot call component internals
directly — an app-level wrapper mutation must delegate to `components.agent.approvals.expirePending`.

**Component Isolation Constraints (per platform architecture):**
| Constraint | Impact on Agent Component |
| No ctx.auth inside component | Pass userId as argument to all handlers |
| IDs become strings at boundary | Use business IDs (agentId, eventId) not Convex doc IDs |
| Sub-transactions | Agent writes commit independently from parent mutations |
| No process.env | Pass configuration (API keys, model names) as arguments |

#### Acceptance Criteria

**Agent component registers with isolated schema**

- Given the agent component is defined with defineComponent
- When the app mounts the agent component via app.use
- Then the agent's tables are isolated from the app schema
- And the app cannot directly query agentCheckpoints
- And all access goes through components.agent.\* handlers

**Component API provides full CRUD for checkpoints**

- Given the agent component is mounted
- When a checkpoint is created via components.agent.checkpoints.load
- Then the checkpoint is stored in the component's isolated database
- And it can be updated via components.agent.checkpoints.update
- And it can be queried via components.agent.checkpoints.load

**Direct table access is not possible from parent**

- Given the agent component is mounted
- When the parent app attempts ctx.db.query("agentCheckpoints")
- Then the query returns no results
- And agent data is only accessible through component API handlers

**Component sub-transactions provide isolation**

- Given a parent mutation that calls agent component handlers
- When the agent component handler throws an error
- And the parent catches the exception
- Then only the agent component write is rolled back
- And the parent mutation's other writes succeed

**Agent handler receives projection data as argument**

- Given the agent event handler is triggered by an OrderCancelled event
- When the handler needs customer cancellation history
- Then it receives the history as a pre-loaded argument
- And it does not directly query customerCancellations table

**Missing projection data returns empty result**

- Given a new customer with no cancellation history
- When the agent handler receives an event for this customer
- Then the cancellation history argument is an empty array
- And the handler proceeds with rule-based analysis
- And no error is thrown

**Agent handler cannot directly access app-level projection tables**

- Given the agent component is processing an event
- When the handler attempts to query customerCancellations directly
- Then the query is not available inside the component context
- And the handler must use the injected data argument instead

**App-level queries can access agent data via component API**

- Given the admin UI needs to display agent audit events
- When it queries via components.agent.audit.queryAuditEvents
- Then it receives the audit events for the requested agent
- And the query respects agent component boundaries

#### Business Rules

**Agent component provides isolated database**

**Invariant:** All agent-specific state (checkpoints, audit events, dead letters,
commands, pending approvals) must reside in the agent component's isolated database.
No agent data in the shared app schema.

    **Rationale:** Physical BC isolation prevents accidental coupling. Parent app mutations
    cannot query agent tables directly — this is enforced by Convex's component architecture,
    not just convention. This matches the orders/inventory pattern where each BC owns its
    tables via `defineComponent()`.

    **Verified by:** Component isolation test, API boundary test, schema separation test

_Verified by: Agent component registers with isolated schema, Component API provides full CRUD for checkpoints, Direct table access is not possible from parent, Component sub-transactions provide isolation_

**Cross-component queries use explicit API**

**Invariant:** Agent BC must access external data (like `customerCancellations` projection)
through explicit cross-component query patterns, never through direct table access.

    **Rationale:** Maintains BC isolation while enabling necessary data access. The
    `customerCancellations` projection lives at the app level (owned by CommandOrchestrator),
    so the agent handler must receive this data as an argument or query it through
    a well-defined interface.

    **Cross-Component Data Flow:**
    | Data Source | Owner | Consumer | Access Pattern |
    | customerCancellations | App (projection) | Agent handler | Passed as argument to handler |
    | Order events | EventBus | Agent subscription | Delivered via Workpool |
    | Agent decisions | Agent component | Admin UI queries | Via component API |

    **Verified by:** Cross-component query works, missing data handled gracefully,
    no direct table coupling between agent and app

_Verified by: Agent handler receives projection data as argument, Missing projection data returns empty result, Agent handler cannot directly access app-level projection tables, App-level queries can access agent data via component API_

### 📋 Agent Churn Risk Completion

| Property     | Value                      |
| ------------ | -------------------------- |
| Status       | planned                    |
| Effort       | 1w                         |
| Dependencies | AgentCommandInfrastructure |

**Problem:** The churn-risk agent in the order-management example app has working
rule-based detection but critical gaps prevent it from being a complete reference
implementation:

1. **LLM never called** — `onEvent` in `_config.ts` is pure rule-based; the LLM
   runtime at `_llm/runtime.ts` exists but is never invoked
2. **Commands go nowhere** — `SuggestCustomerOutreach` is written to `agentCommands`
   table but no handler processes it
3. **Pattern system disconnect** — `_patterns/churnRisk.ts` (with LLM `analyze()`)
   and `_config.ts` (with inline rules) are parallel implementations
4. **Approval expiration incomplete** — `expirePendingApprovals` mutation exists
   but scheduling mechanism needs enhancement

**Solution:** Complete the churn-risk agent using new platform infrastructure from
Phases 22a-22c:

1. **Hybrid LLM flow** — rule trigger first (cheap), LLM analysis when triggered
2. **Command routing** — SuggestCustomerOutreach routes to a real handler
3. **Pattern unification** — Use formal PatternDefinition from `_patterns/`
4. **Approval cron enhancement** — Complete the expiration mechanism

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Production-ready example | Full agent pattern demonstrated end-to-end |
| LLM integration proof | Validates action/mutation split from Phase 22b |
| Complete command flow | Agent decisions trigger real domain actions |
| Reference implementation | Other agents can follow this exact pattern |
| E2E testable | Integration tests cover full cancellation-to-outreach flow |

**End-to-End Flow (target state):**
"""

1. Customer cancels order (OrderCancelled event)
   |
2. EventBus delivers to churn-risk agent (Workpool action)
   |
3. Agent loads checkpoint, checks idempotency
   |
4. Agent loads customerCancellations projection (cross-BC query)
   |
5. Pattern trigger: 3+ cancellations in 30 days?
   |
   +--- No --> Skip, update checkpoint
   +--- Yes --> Continue to step 6
   |
6. LLM analysis: confidence score + reasoning + suggested action
   |
7. Confidence >= threshold?
   |
   +--- Yes --> Emit SuggestCustomerOutreach command
   +--- No --> Queue for human approval
   |
8. onComplete: persist decision, update checkpoint, record audit
   |
9. CommandOrchestrator routes SuggestCustomerOutreach
   |
10. OutreachHandler creates outreach task, emits OutreachCreated event
    """

**Design Decision: LLM Model Configuration**

Keep existing OpenRouter + Gemini Flash configuration from `_llm/config.ts`:

- Cost-effective for analysis tasks (lower cost than GPT-4/Claude)
- Model configurable via `OPENROUTER_API_KEY` environment variable
- Mock runtime in tests (no API key required)
- Future: allow model override in AgentBCConfig

**Design Decision: Approval Expiration Mechanism**

| Option | Trade-off |
| A: Cron job (Recommended) | Simple, already partially implemented. Single cron handles all expirations |
| B: @convex-dev/workflow sleepUntil | More precise timing but creates one workflow per approval (expensive) |
| C: @convex-dev/crons dynamic | Flexible but adds component dependency |

**Decision:** Option A — The `expirePendingApprovals` mutation already exists. Enhance
the existing hourly cron in `crons.ts` to check for expired approvals. This is pragmatically
better than workflow-per-approval: lower overhead, single polling point, acceptable latency
(up to 1 hour late vs exact millisecond timing that isn't needed for 24h timeouts).

**Design Decision: SuggestCustomerOutreach Handler**

Create a simple domain handler that:

1. Records the outreach suggestion with customer context
2. Emits `OutreachCreated` event for downstream consumers
3. Future phases could add actual notification delivery (email, SMS)

This follows the "start simple, enhance later" principle — the handler exists and is
routed through CommandOrchestrator, but the actual outreach mechanism is a separate concern.

#### Acceptance Criteria

**Three cancellations trigger LLM analysis**

- Given customer "cust_123" has cancelled 3 orders in the last 30 days
- When an OrderCancelled event is published for "cust_123"
- Then the pattern trigger fires (3+ cancellations detected)
- And LLM analysis is called with event history
- And the analysis returns confidence score and reasoning
- And the decision includes suggestedAction "SuggestCustomerOutreach"

**Two cancellations do not trigger LLM**

- Given customer "cust_456" has cancelled 2 orders in the last 30 days
- When an OrderCancelled event is published for "cust_456"
- Then the pattern trigger does not fire
- And no LLM call is made
- And the checkpoint advances without emitting a command

**LLM unavailable falls back to rule-based confidence**

- Given customer "cust_789" has cancelled 5 orders in the last 30 days
- And the LLM API is unreachable
- When an OrderCancelled event triggers analysis
- Then the agent falls back to rule-based confidence calculation
- And the confidence is derived from cancellation count and frequency
- And the audit records analysisMethod as "rule-based-fallback"

**LLM analysis with low confidence queues for approval**

- Given customer "cust_101" has cancelled 3 orders in the last 30 days
- And the LLM returns confidence 0.65 (below threshold 0.8)
- When the agent processes the analysis result
- Then a pending approval is created with the LLM reasoning
- And no command is emitted immediately
- And an AgentDecisionPending audit event is recorded

**Cron expires approval after timeout**

- Given a pending approval created 25 hours ago
- And the approval timeout is 24 hours
- When the expiration cron runs
- Then the approval status transitions to "expired"
- And an AgentApprovalExpired audit event is recorded

**Expired approval cannot be approved or rejected**

- Given an approval that has been expired by the cron
- When a reviewer attempts to approve the expired item
- Then the action is rejected with APPROVAL_EXPIRED error
- And the approval remains in "expired" status

**Approved before timeout succeeds normally**

- Given a pending approval created 12 hours ago
- When a reviewer approves the action
- Then the approval status transitions to "approved"
- And the associated command is submitted for execution

**SuggestCustomerOutreach routes to outreach handler**

- Given the agent has emitted a SuggestCustomerOutreach command
- And the command includes customerId, reason, and confidence
- When the CommandOrchestrator processes the command
- Then the customerOutreach handler creates an outreach task
- And an OutreachCreated event is emitted
- And the agent command status updates to "completed"

**Full end-to-end flow from cancellation to outreach**

- Given a customer who has cancelled 2 orders previously
- When the customer cancels a third order
- Then the churn-risk agent detects the pattern
- And LLM analysis returns high confidence
- And SuggestCustomerOutreach command is emitted
- And the command is routed to the outreach handler
- And an OutreachCreated event confirms the action

**Command failure records error and creates dead letter**

- Given the agent has emitted a SuggestCustomerOutreach command
- And the outreach handler throws an error
- When the CommandOrchestrator reports the failure
- Then the agent command status updates to "failed"
- And an AgentCommandFailed audit event is recorded
- And the failure is available for retry via dead letter management

#### Business Rules

**Churn-risk agent uses hybrid LLM flow**

**Invariant:** Pattern trigger is evaluated first (rule-based, no LLM cost). If
trigger fires (3+ cancellations in 30 days), LLM analysis provides confidence score
and reasoning. Trigger failure skips LLM call entirely.

    **Rationale:** Rule-based triggers are cheap and deterministic. LLM analysis adds
    value only when patterns warrant deeper investigation. This hybrid approach minimizes
    API costs while providing rich analysis when needed.

    **Cost Model:**
    | Step | Cost | Frequency |
    | Rule trigger check | ~0 (local computation) | Every OrderCancelled event |
    | LLM analysis | ~$0.001-0.01 per call | Only when 3+ cancellations detected |
    | Total per detection | ~$0.01 | Rare (subset of customers) |

    **Verified by:** Trigger gates LLM, LLM enriches decision, fallback works

_Verified by: Three cancellations trigger LLM analysis, Two cancellations do not trigger LLM, LLM unavailable falls back to rule-based confidence, LLM analysis with low confidence queues for approval_

**Approvals expire after configured timeout**

**Invariant:** Pending approvals must transition to "expired" status after
`approvalTimeout` elapses (default 24 hours). A cron job runs periodically
to expire stale approvals.

    **Rationale:** Pending approvals cannot linger indefinitely. Without expiration,
    the system accumulates stale decisions that may no longer be relevant. The cron
    approach is pragmatic for 24h timeouts where up-to-1-hour latency is acceptable.

    **Verified by:** Expiration transitions correctly, expired cannot be acted on

_Verified by: Cron expires approval after timeout, Expired approval cannot be approved or rejected, Approved before timeout succeeds normally_

**Emitted commands route to domain handlers**

**Invariant:** `SuggestCustomerOutreach` command emitted by the agent routes through
CommandOrchestrator to a handler that creates the actual outreach task and emits
a domain event.

    **Rationale:** Currently commands are stored in `agentCommands` but never processed.
    Completing the routing makes the agent actionable — its analysis leads to real
    business outcomes rather than entries in a table.

    **Verified by:** Command routes to handler, handler creates outreach, event emitted

_Verified by: SuggestCustomerOutreach routes to outreach handler, Full end-to-end flow from cancellation to outreach, Command failure records error and creates dead letter_

### 🚧 Agent LLM Integration

| Property     | Value                     |
| ------------ | ------------------------- |
| Status       | active                    |
| Effort       | 1w                        |
| Dependencies | AgentBCComponentIsolation |

**Problem:** The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that
cannot call external APIs. The LLM runtime (`_llm/runtime.ts`) exists with OpenRouter
integration but is never invoked because mutations cannot make HTTP calls. Additionally,
rate limiting config exists as types only — no runtime enforcement protects against
runaway LLM costs.

**Solution:** Implement hybrid action/mutation handler pattern:

1. **Action handler factory** — EventBus delivers to Workpool action (not mutation)
2. **onComplete mutation** — Persists state atomically after LLM analysis
3. **Rate limiting enforcement** — `@convex-dev/rate-limiter` token bucket per agent
4. **Cost budget tracking** — Daily spend limits with automatic pause
5. **LLM fallback** — Graceful degradation to rule-based when LLM unavailable

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| LLM integration works | Actions can make external HTTP calls (mutations cannot) |
| Atomic persistence | Mutations in onComplete provide transactional guarantees |
| Cost control | Rate limiting prevents runaway LLM API costs |
| Graceful degradation | Fallback to rules when LLM unavailable or rate-limited |
| Conversation context | Thread adapter retains analysis history across events |
| Fault isolation | Circuit breaker prevents cascade failures from LLM outages |

**The Fundamental Constraint:**

| Function Type | Can Call External APIs | Database Writes | Workpool Retry |
| Mutation | No | Yes (atomic) | No (OCC auto-retry) |
| Action | Yes (fetch, LLM) | No (must use runMutation) | Yes (if enabled) |

This means the current single-mutation handler architecture fundamentally blocks LLM
integration. The solution requires splitting into action (LLM) + mutation (persist).

**Action/Mutation Split Architecture:**
"""
EventBus
|
v
Workpool.enqueueAction (agent event handler)
|
+--- 1. Load checkpoint (via runQuery)
+--- 2. Check idempotency (skip if already processed)
+--- 3. Load event history (via cross-component query)
+--- 4. Evaluate rule trigger (cheap, no LLM)
+--- 5. If triggered: call LLM analysis (external API)
+--- 6. Return AgentDecision
|
v
onComplete Mutation
|
+--- 7. Validate decision
+--- 8. Record to agent component (audit, command)
+--- 9. Create pending approval (if needed)
+--- 10. Update checkpoint
+--- 11. Handle failure (dead letter)
"""

**Design Decision: @convex-dev/agent Integration**

| Option | Trade-off |
| A: Full @convex-dev/agent | Thread management, tool execution, but opinionated patterns that may conflict with event-reactive architecture |
| B: Vercel AI SDK only (current) | More control, but must implement thread/tool patterns manually |
| C: Hybrid (Recommended) | Use @convex-dev/agent for threads and tools, keep custom EventBus subscription and pattern detection |

**Decision:** Option C — Hybrid approach.

- **@convex-dev/agent provides:** Thread management (conversation context), tool execution (structured tool calls), model abstraction
- **Platform provides:** EventBus subscription, pattern detection triggers, checkpoint/audit infrastructure, rate limiting
- **Integration point:** Agent action handler creates/resumes thread per customer, uses @convex-dev/agent for LLM call, returns result to platform's onComplete handler

**Design Decision: Rate Limiting Implementation**

Use `@convex-dev/rate-limiter` component (already installed in example app):

- **Token bucket per agent** — configurable maxRequestsPerMinute
- **Cost budget** — daily USD limit with alertThreshold and hard pause
- **Exceeded behavior** — queue event for later retry, or dead letter if queue full

| Rate Limit Type | Mechanism | Action When Exceeded |
| Requests/minute | Token bucket (@convex-dev/rate-limiter) | Queue for retry |
| Concurrent calls | Workpool maxParallelism | Natural backpressure |
| Daily cost budget | Custom tracker (agent component table) | Pause agent |
| Queue overflow | Workpool queueDepth | Dead letter |

**Design Decision: LLM Fallback Strategy**

When LLM is unavailable (API key missing, rate limited, circuit breaker open):

1. Fall back to rule-based confidence scoring (existing logic in \_config.ts)
2. Record fallback decision with `analysisMethod: "rule-based-fallback"` in audit
3. Apply lower confidence threshold for fallback decisions (configurable)

This ensures the agent continues providing value even without LLM access.

**Dedicated Agent Workpool:**

A dedicated `agentPool` peer mount exists in `convex.config.ts`, separating LLM
work from `projectionPool` to avoid resource contention.

| Config | Value | Rationale |
| Name | agentPool | Dedicated pool, separate from projectionPool |
| maxParallelism | 10 | LLM calls are slow (~1-5s) — limit concurrency to control costs |
| retryActionsByDefault | true | LLM APIs have transient failures |
| defaultRetryBehavior | 3 attempts, 1s initial, base 2 | Exponential backoff for rate limits |
| Partition key | event.streamId | Per-customer ordering (matches PM pattern) |

"""typescript
// convex.config.ts — dedicated agent pool
app.use(workpool, { name: "agentPool" });

// Agent pool configuration
const agentPool = new Workpool(components.agentPool, {
maxParallelism: 10,
retryActionsByDefault: true,
defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
});
"""

Separation of concerns: agent LLM calls don't compete with projection processing
in `projectionPool` (which handles high-throughput, low-latency CMS updates).

**createAgentActionHandler — Factory:**

`createAgentActionHandler` returns an `internalAction` that can call external APIs
(LLM). The legacy `createAgentEventHandler` (mutation-based `onEvent` callback) has
been removed — all agent event handling now uses the action-based handler.
The action handler reuses existing pure logic from the mutation handler:

- Pattern window filtering (`filterEventsInWindow`)
- Minimum event check (`hasMinimumEvents`)
- Approval determination (`shouldRequireApproval`)

The new capability is the LLM call between trigger evaluation and decision creation:
"""typescript
// Simplified action handler flow
// Steps 1-4: Same as mutation handler (reused pure functions)
// Step 5: NEW — LLM analysis (only possible in action context)
const analysis = await runtime.analyze(prompt, filteredEvents);
// Step 6: Build AgentDecision from analysis (reused pure function)
"""

**Thread Adapter Design — @convex-dev/agent Integration:**

One thread per (agentId, customerId) pair enables conversation context across events:

| Concern | Mechanism |
| Thread identity | Key: `agent:{agentId}:customer:{customerId}` |
| First event | Creates new thread, seeds with customer context |
| Subsequent events | Resumes existing thread, appends new event context |
| History window | Thread retains LLM conversation history for richer analysis |
| Thread cleanup | Threads expire naturally via @convex-dev/agent TTL |

The adapter translates between platform's `AgentInterface` (analyze/reason methods)
and `@convex-dev/agent`'s `Agent.generateText()`:
"""typescript
// Thread adapter bridges platform interface to @convex-dev/agent
class ThreadAdapter implements AgentInterface {
async analyze(prompt: string, events: FatEvent[]): Promise<LLMAnalysisResult> {
const threadId = await this.getOrCreateThread(agentId, customerId);
const result = await this.agent.generateText(ctx, { threadId }, {
prompt: buildAnalysisPrompt(prompt, events),
});
return parseAnalysisResult(result);
}
}
"""

**Circuit Breaker Integration — Phase 18 Relationship:**

Phase 18's circuit breaker (`platform-core/src/infrastructure/circuit-breaker.ts`)
provides the failure isolation pattern. Agent LLM calls use a named instance:

| Config | Value |
| Circuit name | "llm-provider" (or per-provider: "openrouter", "openai") |
| Failure threshold | 5 consecutive failures |
| Reset timeout | 60 seconds |
| Fallback | Rule-based analysis via existing `createMockAgentRuntime()` pattern |

When circuit is open:

1. LLM call is skipped (no HTTP request made)
2. Handler falls back to rule-based confidence scoring
3. Decision audit records `analysisMethod: "rule-based-fallback"` and `circuitState: "open"`
4. Circuit half-opens after timeout, allowing one probe request

#### Acceptance Criteria

**Agent action handler calls LLM and returns decision**

- Given an agent configured with LLM runtime
- And an OrderCancelled event is delivered via EventBus
- When the action handler processes the event
- Then it loads the checkpoint via runQuery
- And it loads event history via cross-component query
- And it calls the LLM for pattern analysis
- And it returns an AgentDecision with confidence and reasoning

**onComplete mutation persists decision atomically**

- Given an agent action returned a successful AgentDecision
- When the onComplete handler fires with result.kind "success"
- Then the decision is recorded as an audit event in agent component
- And the command is emitted to agent component commands table
- And the checkpoint is updated with new position
- And all writes happen in a single atomic mutation

**Action handler rejects invalid agent configuration**

- Given an agent action handler with missing LLM runtime config
- And no fallback to rule-based analysis is configured
- When the handler is initialized
- Then it fails with AGENT_RUNTIME_REQUIRED error
- And the error message indicates LLM runtime or fallback must be configured

**LLM unavailable falls back to rule-based analysis**

- Given an agent configured with LLM runtime
- And the LLM API returns an error or times out
- When the action handler processes the event
- Then it falls back to rule-based confidence scoring
- And the decision audit records analysisMethod as "rule-based-fallback"
- And processing continues without failure

**Action failure triggers dead letter via onComplete**

- Given an agent action that throws an unrecoverable error
- When the onComplete handler fires with result.kind "failed"
- Then a dead letter entry is created in agent component
- And the checkpoint is NOT advanced
- And an AgentAnalysisFailed audit event is recorded

**Rate limiter allows LLM call within limits**

- Given an agent with rate limit of 60 requests per minute
- And 30 requests have been made this minute
- When a new event triggers LLM analysis
- Then the rate limiter allows the call
- And the LLM analysis proceeds normally

**Rate limiter blocks LLM call when exceeded**

- Given an agent with rate limit of 60 requests per minute
- And 60 requests have already been made this minute
- When a new event triggers LLM analysis
- Then the rate limiter denies the call
- And the event is requeued for later processing
- And an AgentRateLimited audit event is recorded

**Cost budget exceeded pauses agent**

- Given an agent with daily cost budget of 10.00 USD
- And 9.50 USD has been spent today
- When a new LLM call would cost approximately 0.60 USD
- Then the agent is paused automatically
- And an AgentBudgetExceeded audit event is recorded
- And the event falls back to rule-based analysis

**Queue overflow triggers dead letter**

- Given an agent with queue depth of 100
- And 100 events are already queued
- When another event is rate-limited
- Then it is sent to dead letter with reason "queue_overflow"
- And an AgentQueueOverflow audit event is recorded

**Agent subscription with onComplete receives completion callbacks**

- Given an agent subscription configured with custom onComplete handler
- When the agent action completes successfully
- Then the custom onComplete handler fires with result.kind "success"
- And the handler can update the agent checkpoint
- And the handler can record agent-specific audit events

**Failed agent jobs create dead letters via onComplete**

- Given an agent subscription configured with custom onComplete handler
- When the agent action fails with an error
- Then the custom onComplete handler fires with result.kind "failed"
- And a dead letter entry is created in the agent component
- And the checkpoint is not advanced past the failed event

**Agent subscription without onComplete uses global default**

- Given an agent subscription without a custom onComplete handler
- When the agent action fails
- Then the EventBus defaultOnComplete handler fires
- And the global dead letter handler processes the failure

#### Business Rules

**Agent event handlers are actions for LLM integration**

**Invariant:** Agent event handlers that require LLM analysis must be Convex actions,
not mutations. All state changes (checkpoint, audit, commands) happen in the onComplete
mutation handler, never in the action.

    **Rationale:** Convex mutations cannot make external HTTP calls. The action/mutation
    split enables LLM integration while maintaining atomic state persistence. Actions are
    retryable by Workpool (mutations are not — they rely on OCC auto-retry).

    **Handler Factory Signature:**

```typescript
// createAgentActionHandler replaces createAgentEventHandler
// Returns an internalAction (not internalMutation)
export function createAgentActionHandler(config: {
  agentConfig: AgentBCConfig;
  runtime: AgentRuntimeConfig; // LLM runtime (or mock)
  loadHistory: (ctx: ActionCtx, event: AgentEventHandlerArgs) => Promise<EventHistory>;
}): RegisteredAction<"internal", AgentEventHandlerArgs, AgentDecision>;
```

**Verified by:** Action calls LLM, onComplete persists, fallback works, timeout handled

_Verified by: Agent action handler calls LLM and returns decision, onComplete mutation persists decision atomically, Action handler rejects invalid agent configuration, LLM unavailable falls back to rule-based analysis, Action failure triggers dead letter via onComplete_

**Rate limiting is enforced before LLM calls**

**Invariant:** Every LLM call must check rate limits before execution. Exceeded
limits queue the event for later retry or send to dead letter if queue is full.

    **Rationale:** LLM API costs can spiral quickly under high event volume. Rate limiting
    protects against runaway costs and external API throttling. The existing `rateLimits`
    config in `AgentBCConfig` defines the limits — this rule enforces them at runtime.

    **Rate Limit Check Flow:**

```text
Event arrives → Check token bucket → Allowed? → Proceed to LLM
                                        → Denied?  → Check queue depth
                                                    → Queue available? → Requeue
                                                    → Queue full?      → Dead letter
```

**Verified by:** Rate limit blocks excess calls, cost budget pauses agent,
queue overflow creates dead letter

_Verified by: Rate limiter allows LLM call within limits, Rate limiter blocks LLM call when exceeded, Cost budget exceeded pauses agent, Queue overflow triggers dead letter_

**Agent subscriptions support onComplete callbacks**

**Invariant:** `CreateAgentSubscriptionOptions` must include an optional `onComplete`
field that receives Workpool completion callbacks, enabling agent-specific dead letter
handling and checkpoint updates.

    **Rationale:** The current `CreateAgentSubscriptionOptions` type lacks the `onComplete`
    field. While the EventBus falls back to the global `defaultOnComplete` (dead letter handler),
    agents need custom completion logic: checkpoint updates, agent-specific audit events,
    and rate limit tracking. Without this field, the agent-specific `handleChurnRiskOnComplete`
    handler is orphaned — defined but never wired.

    **Current Gap:**

```typescript
// CreateAgentSubscriptionOptions (current - missing onComplete)
    interface CreateAgentSubscriptionOptions {
      handler: FunctionReference<...>;
      priority?: number;
      toHandlerArgs?: ...;
      getPartitionKey?: ...;
      logger?: Logger;
      // No onComplete field!
    }
```

**Target:**

```typescript
// CreateAgentSubscriptionOptions (target - with onComplete)
    interface CreateAgentSubscriptionOptions {
      handler: FunctionReference<...>;
      onComplete?: FunctionReference<...>; // Agent-specific completion handler
      priority?: number;
      toHandlerArgs?: ...;
      getPartitionKey?: ...;
      logger?: Logger;
    }
```

**Verified by:** onComplete receives callbacks, dead letters created on failure,
checkpoint updated on success

_Verified by: Agent subscription with onComplete receives completion callbacks, Failed agent jobs create dead letters via onComplete, Agent subscription without onComplete uses global default_

### 🚧 Confirmed Order Cancellation

| Property     | Value                                    |
| ------------ | ---------------------------------------- |
| Status       | active                                   |
| Effort       | 2d                                       |
| Dependencies | SagaOrchestration, AgentAsBoundedContext |

**Problem:** The Order FSM treats `confirmed` as terminal. Orders cannot be
cancelled after saga confirmation, blocking the Agent BC demo which requires
3+ cancellations to trigger churn risk detection. The Reservation FSM already
supports `confirmed -> released`, but no coordination exists to release
reservations when confirmed orders are cancelled.

**Solution:** Enable cancellation of confirmed orders with automatic reservation release:

1. **FSM change:** Add `confirmed -> cancelled` transition to Order FSM
2. **Decider change:** Remove `ORDER_ALREADY_CONFIRMED` rejection in CancelOrder
3. **Process Manager:** ReservationReleaseOnOrderCancel PM releases reservation
   when a confirmed order is cancelled

**Why It Matters:**
| Benefit | How |
| Agent BC enablement | 3+ cancellations trigger churn risk pattern detection |
| Business flexibility | Customers can cancel even after confirmation |
| Stock recovery | Reserved inventory returns to available pool |
| Consistency | Order and Reservation states stay synchronized |

**Cross-Context Coordination:**
| Event Source | Event | PM Action | Target BC |
| Orders BC | OrderCancelled | Trigger | PM |
| PM | ReleaseReservation | Command | Inventory BC |
| Inventory BC | ReservationReleased | Audit | - |

**Design Decision: PM vs Saga:**

- No compensation needed (simple event -> command)
- No multi-step coordination
- No external event awaits
- Therefore: **Process Manager** is the correct choice (per ADR-033)

#### Acceptance Criteria

**Cancel a confirmed order**

- Given an order "ord-conf-cancel-01" exists with status "confirmed"
- When I send a CancelOrder command for "ord-conf-cancel-01" with reason "Customer changed mind"
- Then the command should succeed
- And the order "ord-conf-cancel-01" status should be "cancelled"

**Cannot cancel already cancelled order (unchanged behavior)**

- Given an order "ord-conf-cancel-02" exists with status "cancelled"
- When I send a CancelOrder command for "ord-conf-cancel-02" with reason "Double cancel attempt"
- Then the command should be rejected with code "ORDER_ALREADY_CANCELLED"

**OrderCancelled evolves confirmed state to cancelled**

- Given an order state with status "confirmed"
- When OrderCancelled event is applied
- Then state should have status "cancelled"

**Reservation is released after confirmed order cancellation**

- Given a product "prod-rel-01" exists with 10 available and 5 reserved stock
- And a confirmed order "ord-rel-01" with a confirmed reservation for 5 units
- When I cancel order "ord-rel-01" with reason "Customer changed mind"
- Then the order "ord-rel-01" should have status "cancelled"
- And I wait for projections to process
- And the reservation for order "ord-rel-01" should have status "released"
- And the product "prod-rel-01" should have 15 available and 0 reserved stock

**Cancelling draft order does not trigger reservation release**

- Given a draft order "ord-rel-02" exists
- When I cancel order "ord-rel-02" with reason "Changed mind early"
- Then the order "ord-rel-02" should have status "cancelled"
- And no ReleaseReservation command should be emitted

**Cancelling submitted order with pending reservation releases it**

- Given a submitted order "ord-rel-03" with a pending reservation
- When I cancel order "ord-rel-03" with reason "Changed mind before confirmation"
- Then the order "ord-rel-03" should have status "cancelled"
- And the reservation for order "ord-rel-03" should have status "released"

**PM is idempotent for duplicate OrderCancelled events**

- Given a confirmed order "ord-rel-04" with a confirmed reservation
- When OrderCancelled event is delivered twice for "ord-rel-04"
- Then the reservation should only be released once

**Three cancellations trigger churn risk agent**

- Given a customer "cust-churn-01" exists
- And 3 confirmed orders for customer "cust-churn-01"
- When I cancel all 3 orders for customer "cust-churn-01"
- Then the churn risk agent should detect the pattern
- And an approval request should be created for customer outreach

#### Business Rules

**Confirmed orders can be cancelled**

The Order FSM must allow transitioning from `confirmed` to `cancelled`.
The CancelOrder decider must accept cancellation requests for confirmed orders.

    **FSM Change:**

```typescript
// Before:
    confirmed: [], // terminal state

    // After:
    confirmed: ["cancelled"], // can cancel confirmed orders
```

**Decider Change:**

```typescript
// Remove this rejection:
// if (state.status === "confirmed") {
//   return rejected("ORDER_ALREADY_CONFIRMED", "...");
// }
// Let FSM handle the transition validation
```

_Verified by: Cancel a confirmed order, Cannot cancel already cancelled order (unchanged behavior), OrderCancelled evolves confirmed state to cancelled_

**Reservation is released when confirmed order is cancelled**

The ReservationReleaseOnOrderCancel PM subscribes to OrderCancelled events.
When triggered, it checks if the order had a reservation and releases it.

    **PM Definition:**
    | Property | Value |
    | processManagerName | reservationReleaseOnOrderCancel |
    | eventSubscriptions | OrderCancelled |
    | emitsCommands | ReleaseReservation |
    | context | orders |
    | correlationStrategy | orderId |

    **PM Logic:**

```typescript
async function handleOrderCancelled(ctx, event) {
  // Query orderWithInventoryStatus projection for reservationId
  const orderStatus = await ctx.db
    .query("orderWithInventoryStatus")
    .withIndex("by_orderId", (q) => q.eq("orderId", event.payload.orderId))
    .first();

  // Only release if reservation exists and is not already released
  if (orderStatus?.reservationId && orderStatus.reservationStatus !== "released") {
    return [
      {
        commandType: "ReleaseReservation",
        payload: {
          reservationId: orderStatus.reservationId,
          reason: `Order ${event.payload.orderId} cancelled: ${event.payload.reason}`,
        },
        causationId: event.eventId,
        correlationId: event.correlationId,
      },
    ];
  }

  return []; // No command to emit
}
```

_Verified by: Reservation is released after confirmed order cancellation, Cancelling draft order does not trigger reservation release, Cancelling submitted order with pending reservation releases it, PM is idempotent for duplicate OrderCancelled events_

**Agent BC demo flow is enabled**

The primary use case is enabling the Agent BC churn risk detection demo.

_Verified by: Three cancellations trigger churn risk agent_

---

[← Back to Remaining Work](../REMAINING-WORK.md)
