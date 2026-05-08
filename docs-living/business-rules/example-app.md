# Example App Business Rules

**Purpose:** Business rules for the Example App product area

---

**5 rules** from 1 features. 5 rules have explicit invariants.

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

---

[← Back to Business Rules](../BUSINESS-RULES.md)
