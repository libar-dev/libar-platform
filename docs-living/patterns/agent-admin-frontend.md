# 📋 Agent Admin Frontend

**Purpose:** Detailed documentation for the Agent Admin Frontend pattern

---

## Overview

| Property | Value   |
| -------- | ------- |
| Status   | planned |
| Category | DDD     |
| Phase    | 22      |

## Description

**Problem:** The admin UI at `/admin/agents` has implementation gaps identified
  in the E2E feature file (`agent-approvals.feature`) and investigation:

  1. **Only one agent implemented** — The churn-risk agent (22d) is the only backend
     agent. The admin UI can only show churn-risk data. A second agent that triggers
     on a different event (no cancellation required) is needed for demo and validation.
  2. **Dead letter management missing** — Backend has full API (`queryDeadLetters`,
     `replayDeadLetter`, `ignoreDeadLetter`) but no frontend UI.
  3. **Decision history incomplete** — E2E spec describes decision history tab with
     filtering, but component is not built.
  4. **No action feedback** — Approve/reject has no success/error toast notifications.
  5. **No loading states** — No skeleton UI during Suspense boundaries.
  6. **E2E steps missing** — `agent-approvals.feature` has ~50 scenarios with no step
     definitions, causing CI failures (179 missing steps including journey scenarios).
  7. **Authentication placeholder** — `useReviewerId()` returns `"reviewer-placeholder"`.

  **Solution:** Complete the agent admin frontend with multi-agent support:
  1. **High-value order detection agent** — Second agent backend + frontend integration
  2. **Dead letter management panel** — List, replay, ignore with feedback for both agents
  3. **Decision history with filtering** — By agent ID, action type, time range
  4. **Toast notifications** — Success/error feedback for all mutating actions
  5. **E2E step definitions** — For churn-risk + high-value-order scenarios
  6. **Tag unimplemented agents @skip** — Low stock alert, order consolidation agents

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Multi-agent validation | Two different agents prove the platform pattern is reusable |
  | Operational visibility | Dead letters visible and actionable by operators |
  | Agent observability | Decision history filterable by agent for analysis and debugging |
  | User feedback | Toast notifications confirm approve/reject/replay/ignore actions |
  | Test coverage | E2E tests validate full UI-to-backend agent workflow |
  | Demo-friendly | High-value order agent triggers without needing 3 cancellations |

  **Current Admin UI Structure (from Phase 22a-22c):**
  | Tab | Status | Component |
  | Dashboard | Implemented | AgentDashboard (3 summary cards) |
  | Pending Approvals | Implemented | PendingApprovalsList, ApprovalDetail |
  | Monitoring | Implemented | AgentMonitoring (checkpoint cards) |
  | Decision History | Not built | (planned — this spec) |
  | Dead Letters | Not built | (planned — this spec) |

  **Existing Hooks (working):**
  | Hook | File | Purpose |
  | usePendingApprovals() | hooks/use-pending-approvals.ts | Pending approvals list |
  | useApprovalDetail(id) | hooks/use-approval-detail.ts | Single approval with events |
  | useApprovalActions() | hooks/use-approval-actions.ts | Approve/reject mutations |
  | useActiveAgents() | hooks/use-active-agents.ts | Active agent checkpoints |

  **Backend Queries (ready, from `queries/agent.ts`):**
  | Query | Purpose | Frontend Hook Needed |
  | getDeadLetters | Dead letters by agent/status | useDeadLetters |
  | getDeadLetterStats | Pending counts per agent | useDeadLetterStats |
  | getAuditEvents | Audit events by agent/type | useDecisionHistory |
  | getCheckpoint | Agent checkpoint by ID | (exists via useActiveAgents) |
  | getActiveAgents | All active checkpoints | (exists) |
  | getPendingApprovals | Approvals by agent/status | (exists) |
  | getApprovalById | Single approval lookup | (exists) |

## Dependencies

- Depends on: AgentChurnRiskCompletion

## Acceptance Criteria

**Dead letter list displays failed events from both agents**

- Given 2 dead letter entries exist for the churn-risk agent
- And 1 dead letter entry exists for the high-value-order agent
- When I navigate to the Monitoring tab
- Then I see a "Dead Letters" section with 3 entries
- And each entry shows agent ID, event type, error, and timestamp
- And each entry has "Replay" and "Ignore" action buttons

**Replay action triggers backend mutation with toast feedback**

- Given a dead letter entry for the churn-risk agent
- When I click the "Replay" button
- Then the replayDeadLetter mutation is called
- And a success toast shows "Dead letter replayed successfully"
- And the entry status updates to "replayed"
- And the Replay button is replaced with a "Replayed" status indicator

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

**Filter dead letters by agent**

- Given dead letters exist for both churn-risk and high-value-order agents
- When I select "high-value-order-agent" in the agent filter
- Then only dead letters for the high-value-order agent are shown

**View decision history with decisions from both agents**

- Given the churn-risk agent has detected 3 patterns
- And the high-value-order agent has flagged 2 orders
- When I click the "Decision History" tab
- Then I see 5 audit entries in chronological order
- And entries from both agents are interleaved by timestamp

**Filter decision history by agent**

- Given decisions exist for "churn-risk-agent" and "high-value-order-agent"
- When I select "churn-risk-agent" in the agent filter
- Then only churn-risk agent decisions are displayed
- And the entry count updates to reflect the filter

**Filter decision history by action type**

- Given decisions with actions "SuggestCustomerOutreach" and "FlagForVIPReview"
- When I select "FlagForVIPReview" in the action filter
- Then only FlagForVIPReview decisions are displayed

**View decision detail with full reasoning**

- Given the churn-risk agent has made a decision with confidence 0.87
- When I click on the decision entry
- Then I see the full LLM reasoning text
- And I see the triggering event IDs
- And I see whether a command was emitted
- And I see whether approval was required

**Empty decision history shows guidance message**

- Given no agents have made any decisions yet
- When I view the "Decision History" tab
- Then I see a message explaining what will appear here
- And the message mentions both active agents by name

**Approve action shows success toast**

- Given a pending approval for the churn-risk agent
- When I click "Approve"
- Then a success toast appears with "Approval recorded"
- And the toast auto-dismisses after 5 seconds
- And the approval list refreshes

**Reject action shows success toast**

- Given a pending approval for the high-value-order agent
- When I click "Reject" and provide a note
- Then a success toast appears with "Action rejected"
- And the approval is removed from the pending list

**Error action shows descriptive error toast**

- Given a pending approval that has already been expired
- When I attempt to approve it
- Then an error toast appears with "Approval has expired"
- And the toast has role="alert" for accessibility
- And the approval status shows "expired"

**Multiple rapid actions show stacked toasts**

- Given 3 pending approvals from different agents
- When I quickly approve all 3
- Then 3 success toasts appear in sequence
- And each toast is individually dismissable
- And they auto-dismiss in order

**High-value order detected and surfaces as VIP approval**

- Given a product exists with price $200 per unit
- And the product has sufficient stock
- When a customer creates an order with 3 units (total $600)
- And the order is submitted and confirmed by the saga
- Then the high-value-order-agent detects the OrderConfirmed event
- And the LLM analyzes the order for VIP treatment
- And a FlagForVIPReview approval appears in the admin dashboard
- And the approval shows confidence, reasoning, and order details

**Low-value order does not trigger agent**

- Given a product exists with price $10 per unit
- When a customer creates an order with 2 units (total $20)
- And the order is submitted and confirmed
- Then the high-value-order-agent receives the event
- But the pattern trigger does not fire (totalAmount < $500)
- And no approval is created

**Admin approves VIP flag for high-value order**

- Given there is a pending FlagForVIPReview approval
- And the approval shows order total $1,200 with confidence 0.91
- When the admin reviews the reasoning and clicks "Approve"
- Then a success toast shows "Approval recorded for high-value-order-agent"
- And the FlagForVIPReview command is routed to the VIP handler
- And the decision appears in the decision history tab

**Both agents trigger from same customer activity**

- Given a customer has cancelled 2 orders previously
- And the customer places a new high-value order ($800)
- When the customer cancels the high-value order (3rd cancellation)
- Then the churn-risk agent detects the 3+ cancellation pattern
- And the high-value-order agent had previously flagged the order
- And both decisions appear in the decision history
- And the admin can filter by agent to see each agent's perspective

**Dashboard shows both active agents**

- Given the churn-risk agent has processed 100 events
- And the high-value-order agent has processed 50 events
- When I view the agents dashboard
- Then the Active Agents count shows "2"
- And the Events Processed count shows "150"
- And both agent names are visible

**Pending approvals count includes both agents**

- Given there are 2 pending approvals from churn-risk agent
- And there is 1 pending approval from high-value-order agent
- When I view the agents dashboard
- Then the Pending Approvals count shows "3"
- And the Pending Approvals tab badge shows "3"

**One agent stopped, one active**

- Given the churn-risk agent is in "active" status
- And the high-value-order agent is in "stopped" status
- When I view the monitoring tab
- Then I see the churn-risk agent with "Active" badge
- And I see the high-value-order agent with "Stopped" badge
- And the Active Agents count on dashboard shows "1"

## Business Rules

**Dead letters are visible and actionable**

**Invariant:** Admin UI must display dead letter entries from all agents with
    replay/ignore actions. Each action must provide feedback via toast notification.
    Dead letters are operational concerns for system health monitoring.

    **Rationale:** Without dead letter UI, operators cannot manage failed agent event
    processing. With the removal of rule-based fallback in 22d, LLM failures create
    dead letters that MUST be visible for operator triage.

    **Dead Letter Section (within Monitoring tab):**
    | Column | Source | Purpose |
    | Agent | deadLetter.agentId | Which agent failed |
    | Event Type | deadLetter.eventType | What event failed |
    | Error | deadLetter.error | Why it failed (truncated) |
    | Status | deadLetter.status | pending/replayed/ignored |
    | Timestamp | deadLetter.createdAt | When it failed |
    | Actions | buttons | Replay / Ignore |

    **Data source:** `getDeadLetters` query from `queries/agent.ts`, supports
    filtering by agentId and status. `getDeadLetterStats` provides counts.

    **Verified by:** List displays correctly, replay works, ignore works, toast shows

_Verified by: Dead letter list displays failed events from both agents, Replay action triggers backend mutation with toast feedback, Ignore action with reason provides confirmation, Replay failure shows error toast, Filter dead letters by agent_

**Decision history supports multi-agent filtering**

**Invariant:** Decision history must be filterable by agent ID, action type, and
    time range. The tab displays audit events from all active agents, providing a
    unified view of agent decision-making across the system.

    **Rationale:** With multiple agents producing decisions, the history view must
    let operators quickly narrow to specific agents or action types. This is critical
    for debugging (why did the agent make this decision?) and analysis (how often does
    each agent trigger?).

    **Decision History Entry:**
    | Column | Source | Purpose |
    | Agent | auditEvent.agentId | Which agent made the decision |
    | Event Type | auditEvent.eventType | PatternDetected, CommandEmitted, etc. |
    | Action Type | auditEvent.payload.commandType | SuggestCustomerOutreach, FlagForVIPReview |
    | Confidence | auditEvent.payload.confidence | 0-1 confidence score |
    | Timestamp | auditEvent.timestamp | When the decision was made |
    | Detail Link | navigation | Click to expand full reasoning |

    **Filter Parameters:**
    | Filter | Default | Description |
    | Agent ID | All agents | Filter by specific agent |
    | Action Type | All actions | Filter by command type |
    | Time Range | Last 7 days | Date range filter |

    **Data source:** `getAuditEvents` query from `queries/agent.ts`, supports
    filtering by agentId and eventType.

    **Verified by:** Filters work, multi-agent data shows, detail expands

_Verified by: View decision history with decisions from both agents, Filter decision history by agent, Filter decision history by action type, View decision detail with full reasoning, Empty decision history shows guidance message_

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

    **Implementation:** Wrap existing mutation calls in `useApprovalActions` and
    new `useDeadLetterActions` with try/catch + `toast.success()` / `toast.error()`.
    Sonner's `<Toaster>` component added to the root layout.

    **Verified by:** Success toast appears, error toast appears, auto-dismiss works

_Verified by: Approve action shows success toast, Reject action shows success toast, Error action shows descriptive error toast, Multiple rapid actions show stacked toasts_

**High-value order agent functions end-to-end**

**Invariant:** The high-value order detection agent must detect orders above
    the value threshold ($500), analyze via LLM, and surface in the admin UI as
    a FlagForVIPReview approval — demonstrating the full agent infrastructure
    without requiring order cancellations.

    **Rationale:** A single-agent demo requires 3+ order cancellations which is
    cumbersome. The high-value order agent triggers on any expensive order, making
    it easy to demonstrate the entire agent pipeline in a presentation or review.

    **Trigger Condition:**
    | Field | Threshold | Source |
    | totalAmount | > $500 | OrderConfirmed event payload |

    **LLM Analysis Prompt Context:**
    | Data | Source | Purpose |
    | Order total | Event payload | Primary trigger value |
    | Customer ID | Event payload | Customer context for LLM |
    | Confirmed timestamp | Event payload | Recency context |

    **Verified by:** High-value order triggers agent, approval appears in admin UI

_Verified by: High-value order detected and surfaces as VIP approval, Low-value order does not trigger agent, Admin approves VIP flag for high-value order, Both agents trigger from same customer activity_

**Dashboard reflects multi-agent state**

**Invariant:** The dashboard summary cards must aggregate data across all active
    agents. Individual agent status must be distinguishable.

    **Rationale:** With two active agents, the dashboard must show which agents are
    active and give a consolidated view of the system's agent-driven activity.

    **Dashboard Cards (updated):**
    | Card | Source | Shows |
    | Pending Approvals | usePendingApprovals() | Total count across all agents |
    | Active Agents | useActiveAgents() | Count + agent name list |
    | Events Processed | checkpoint data | Total across all agents |

    **Per-Agent Detail (within dashboard or monitoring):**
    | Agent | Events Processed | Status | Last Activity |
    | churn-risk-agent | 1,247 | Active | 2 min ago |
    | high-value-order-agent | 89 | Active | 5 min ago |

    **Verified by:** Dashboard shows both agents, counts are correct

_Verified by: Dashboard shows both active agents, Pending approvals count includes both agents, One agent stopped, one active_

---

[← Back to Pattern Registry](../PATTERNS.md)
