# Example App Business Rules

**Purpose:** Business rules for the Example App product area

---

**12 rules** from 3 features. 8 rules have explicit invariants.

---

## Phase 22

### Agent Admin Frontend

*The admin UI at `/admin/agents` has implementation gaps identified*

---

#### Dead letters are visible and actionable

> **Invariant:** Admin UI must display dead letter entries from all agents with replay/ignore actions. Each action must provide feedback via toast notification. Dead letters are operational concerns for system health monitoring.
>
> **Rationale:** Without dead letter UI, operators cannot manage failed agent event processing. With the removal of rule-based fallback in 22d, LLM failures create dead letters that MUST be visible for operator triage.

| Column     | Source               | Purpose                   |
| ---------- | -------------------- | ------------------------- |
| Agent      | deadLetter.agentId   | Which agent failed        |
| Event Type | deadLetter.eventType | What event failed         |
| Error      | deadLetter.error     | Why it failed (truncated) |
| Status     | deadLetter.status    | pending/replayed/ignored  |
| Timestamp  | deadLetter.createdAt | When it failed            |
| Actions    | buttons              | Replay / Ignore           |

**Verified by:**
- Dead letter list displays failed events from both agents
- Replay action triggers backend mutation with toast feedback
- Ignore action with reason provides confirmation
- Replay failure shows error toast
- Filter dead letters by agent
- List displays correctly
- replay works
- ignore works
- toast shows

---

#### Decision history supports multi-agent filtering

> **Invariant:** Decision history must be filterable by agent ID, action type, and time range. The tab displays audit events from all active agents, providing a unified view of agent decision-making across the system.
>
> **Rationale:** With multiple agents producing decisions, the history view must let operators quickly narrow to specific agents or action types. This is critical for debugging (why did the agent make this decision?) and analysis (how often does each agent trigger?).

| Column      | Source                         | Purpose                                   |
| ----------- | ------------------------------ | ----------------------------------------- |
| Agent       | auditEvent.agentId             | Which agent made the decision             |
| Event Type  | auditEvent.eventType           | PatternDetected, CommandEmitted, etc.     |
| Action Type | auditEvent.payload.commandType | SuggestCustomerOutreach, FlagForVIPReview |
| Confidence  | auditEvent.payload.confidence  | 0-1 confidence score                      |
| Timestamp   | auditEvent.timestamp           | When the decision was made                |
| Detail Link | navigation                     | Click to expand full reasoning            |

| Filter      | Default     | Description              |
| ----------- | ----------- | ------------------------ |
| Agent ID    | All agents  | Filter by specific agent |
| Action Type | All actions | Filter by command type   |
| Time Range  | Last 7 days | Date range filter        |

**Verified by:**
- View decision history with decisions from both agents
- Filter decision history by agent
- Filter decision history by action type
- View decision detail with full reasoning
- Empty decision history shows guidance message
- Filters work
- multi-agent data shows
- detail expands

---

#### Actions provide feedback via toast

> **Invariant:** All mutating actions (approve, reject, replay, ignore) must show toast notifications for success and error states. Toasts use accessible ARIA attributes and auto-dismiss after a reasonable timeout.
>
> **Rationale:** Users need immediate feedback that their action was processed. The current implementation performs mutations silently — the user clicks "Approve" and has no visual confirmation that it worked or failed.

| Action             | Success Message                     | Error Behavior         |
| ------------------ | ----------------------------------- | ---------------------- |
| Approve            | "Approval recorded for {agentId}"   | Show error with reason |
| Reject             | "Action rejected"                   | Show error with reason |
| Replay dead letter | "Dead letter replayed successfully" | Show error with reason |
| Ignore dead letter | "Dead letter ignored"               | Show error with reason |

**Verified by:**
- Approve action shows success toast
- Reject action shows success toast
- Error action shows descriptive error toast
- Multiple rapid actions show stacked toasts
- Success toast appears
- error toast appears
- auto-dismiss works

---

#### High-value order agent functions end-to-end

> **Invariant:** The high-value order detection agent must detect orders above the value threshold ($500), analyze via LLM, and surface in the admin UI as a FlagForVIPReview approval — demonstrating the full agent infrastructure without requiring order cancellations.
>
> **Rationale:** A single-agent demo requires 3+ order cancellations which is cumbersome. The high-value order agent triggers on any expensive order, making it easy to demonstrate the entire agent pipeline in a presentation or review.

| Field       | Threshold | Source                       |
| ----------- | --------- | ---------------------------- |
| totalAmount | > $500    | OrderConfirmed event payload |

| Data                | Source        | Purpose                  |
| ------------------- | ------------- | ------------------------ |
| Order total         | Event payload | Primary trigger value    |
| Customer ID         | Event payload | Customer context for LLM |
| Confirmed timestamp | Event payload | Recency context          |

**Verified by:**
- High-value order detected and surfaces as VIP approval
- Low-value order does not trigger agent
- Admin approves VIP flag for high-value order
- Both agents trigger from same customer activity
- High-value order triggers agent
- approval appears in admin UI

---

#### Dashboard reflects multi-agent state

> **Invariant:** The dashboard summary cards must aggregate data across all active agents. Individual agent status must be distinguishable.
>
> **Rationale:** With two active agents, the dashboard must show which agents are active and give a consolidated view of the system's agent-driven activity.

| Card              | Source                | Shows                         |
| ----------------- | --------------------- | ----------------------------- |
| Pending Approvals | usePendingApprovals() | Total count across all agents |
| Active Agents     | useActiveAgents()     | Count + agent name list       |
| Events Processed  | checkpoint data       | Total across all agents       |

| Agent                  | Events Processed | Status | Last Activity |
| ---------------------- | ---------------- | ------ | ------------- |
| churn-risk-agent       | 1,247            | Active | 2 min ago     |
| high-value-order-agent | 89               | Active | 5 min ago     |

**Verified by:**
- Dashboard shows both active agents
- Pending approvals count includes both agents
- One agent stopped, one active
- Dashboard shows both agents
- counts are correct

*agent-admin-frontend.feature*

### Agent Churn Risk Completion

*The churn-risk agent in the order-management example app has working*

---

#### LLM analysis is essential, not optional

> **Invariant:** When the pattern trigger fires (3+ cancellations in 30 days for the same customer), the LLM MUST be called. There is no rule-based fallback that produces the same outcome. If the LLM is unavailable, the event is retried by Workpool (3 attempts with exponential backoff). If all retries fail, a dead letter is created for operator triage.
>
> **Rationale:** An AI agent's value comes from LLM analysis — confidence scoring, pattern reasoning, contextual recommendations. A rule-based formula that produces `SuggestCustomerOutreach` regardless of LLM availability makes the AI irrelevant. Failure should be visible (dead letter), not invisible (silent fallback).

| Step                    | What Happens                                             |
| ----------------------- | -------------------------------------------------------- |
| LLM call fails          | Error propagates from `analyze()` to pattern executor    |
| Pattern executor throws | Error propagates to action handler                       |
| Action handler throws   | Workpool catches, retries (attempt 1/3)                  |
| All 3 retries fail      | Workpool onComplete receives `kind: "failed"`            |
| onComplete failure path | Creates dead letter, records `AgentAnalysisFailed` audit |
| Dead letter visible     | Admin UI shows failed event for operator replay/ignore   |

**Verified by:**
- Three cancellations trigger LLM analysis via OpenRouter
- Two cancellations do not trigger LLM
- High confidence triggers auto-execution of SuggestCustomerOutreach
- Low confidence queues for human approval
- LLM failure exhausts retries and creates dead letter
- LLM called on trigger
- failure creates dead letter
- no silent fallback

---

#### Approvals expire after configured timeout

> **Invariant:** Pending approvals must transition to "expired" status after `approvalTimeout` elapses (default 24 hours). A cron job runs hourly to expire stale approvals.
>
> **Rationale:** Pending approvals cannot linger indefinitely. Without expiration, the system accumulates stale decisions that may no longer be relevant. The hourly cron approach is pragmatic for 24h timeouts where up-to-1-hour latency is acceptable.

**Verified by:**
- Cron expires approval after timeout
- Expired approval cannot be approved or rejected
- Approved before timeout succeeds normally
- Expiration transitions correctly
- expired cannot be acted on

---

#### Emitted commands create real domain records

> **Invariant:** `SuggestCustomerOutreach` command emitted by the agent routes through the command bridge to a handler that creates an outreach task record and emits an `OutreachCreated` domain event. The current no-op stub that returns `{ success: true }` must be replaced with a real domain handler.
>
> **Rationale:** A command that produces no domain effect is not a command — it is a log entry. Completing the routing makes the agent actionable: analysis leads to real business outcomes (outreach records) rather than entries in a table.

| Step                           | Action                                        |
| ------------------------------ | --------------------------------------------- |
| 1. Validate payload            | Ensure customerId, riskLevel, agentId present |
| 2. Create outreach record      | Write to outreach CMS/projection table        |
| 3. Emit OutreachCreated event  | Via event store append in same mutation       |
| 4. Update agent command status | Mark as "completed" via agent component       |

| Field             | Source                                   |
| ----------------- | ---------------------------------------- |
| outreachId        | Generated UUID                           |
| customerId        | From command payload                     |
| agentId           | From command context                     |
| riskLevel         | From command payload ("high" / "medium") |
| cancellationCount | From command payload                     |
| correlationId     | From command context                     |
| createdAt         | Current timestamp                        |

**Verified by:**
- SuggestCustomerOutreach creates outreach record and emits event
- Full end-to-end flow from cancellation to outreach record
- Command with missing customerId fails validation
- Command handler failure creates dead letter for operator triage
- Command routes to handler
- handler creates record
- event emitted

*agent-churn-risk-completion.feature*

---

## Phase 23

### Example App Modernization

*The `order-management` example app has grown organically during platform*

---

#### Order submission uses DCB for multi-product inventory reservation

The order submission flow should demonstrate Dynamic Consistency Boundaries (DCB)
    by atomically reserving inventory across multiple products in a single operation.

**Verified by:**
- Multi-product order uses DCB for atomic reservation
- Insufficient inventory for one product rejects entire reservation

---

#### Order detail view uses reactive projection for instant updates

The order detail page should demonstrate ReactiveProjections by showing
    instant UI updates without polling.

| Component             | Purpose                               | Location                                 |
| --------------------- | ------------------------------------- | ---------------------------------------- |
| Durable Projection    | Workpool-processed, always consistent | convex/orders/projections/orderDetail.ts |
| Shared Evolve         | Same logic client + server            | convex/orders/projections/evolve.ts      |
| useReactiveProjection | Hook with optimistic updates          | src/hooks/useOrderDetail.ts              |
| Event Stream Query    | Recent events for client apply        | convex/orders/queries/recentEvents.ts    |

**Verified by:**
- Order detail view shows instant updates
- Optimistic update rolls back on conflict

---

#### OrderSubmitted event includes customer snapshot for downstream consumers

The OrderSubmitted event should demonstrate Fat Events (ECST) by including
    relevant customer data at the time of submission.

| Field         | Source            | Purpose                  |
| ------------- | ----------------- | ------------------------ |
| customerName  | CustomerCMS       | Display in notifications |
| customerEmail | CustomerCMS       | Delivery receipts        |
| submittedAt   | Command timestamp | Audit trail              |

**Verified by:**
- OrderSubmitted includes customer snapshot
- Customer snapshot is immutable in event

---

#### README documents the app as a Reference Implementation

The README should clearly communicate that this is a reference implementation,
    not a production application.

| Section                        | Content                                          |
| ------------------------------ | ------------------------------------------------ |
| Reference Implementation Badge | Clear designation at top                         |
| Patterns Demonstrated          | Table of patterns with code links                |
| Architecture Diagram           | Visual diagram showing BCs and pattern locations |
| Running Locally                | Development setup instructions                   |
| Development Guidelines         | Link to ADR-008 for purpose and change criteria  |

| Pattern                   | Phase | Location                                              | Documentation Link                |
| ------------------------- | ----- | ----------------------------------------------------- | --------------------------------- |
| CMS Dual-Write            | 02    | convex/orders/mutations.ts                            | CLAUDE.md#cms-is-the-snapshot     |
| Pure Deciders             | 14    | convex/orders/deciders/                               | CLAUDE.md#pure-deciders           |
| Projection Categories     | 15    | convex/projections/definitions.ts                     | docs/PROJECTION-CATEGORIES.md     |
| DCB                       | 16    | convex/inventory/mutations.ts                         | docs/DCB-ARCHITECTURE.md          |
| Reactive Projections      | 17    | convex/orders/projections/                            | docs/REACTIVE-PROJECTIONS.md      |
| Durable Function Adapters | 18a   | convex/inventoryInternal.ts, convex/infrastructure.ts | docs/DURABLE-FUNCTION-ADAPTERS.md |
| Fat Events                | 20    | convex/orders/events/                                 | CLAUDE.md#ecst-fat-events         |
| Reservation Pattern       | 20    | convex/inventory/reservations/                        | docs/RESERVATION-PATTERN.md       |

**Verified by:**
- README has Reference Implementation designation
- All demonstrated patterns are cataloged

*example-app-modernization.feature*

---

[← Back to Business Rules](../BUSINESS-RULES.md)
