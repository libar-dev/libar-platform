@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:AgentAdminFrontend
@libar-docs-status:roadmap
@libar-docs-phase:22e
@libar-docs-effort:2w
@libar-docs-product-area:ExampleApp
@libar-docs-depends-on:AgentChurnRiskCompletion
@libar-docs-executable-specs:apps/frontend/tests/e2e/features/admin
Feature: Agent Admin Frontend - Complete Management UI with Multi-Agent Support

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

  # ============================================================================
  # HIGH-VALUE ORDER DETECTION AGENT — BACKEND DESIGN
  # ============================================================================
  #
  # Second agent that triggers on OrderConfirmed events. Designed for easy demo:
  # just create one expensive order (no cancellation prerequisites needed).
  #
  # Architecture: Follows identical pattern to churn-risk agent (action/mutation
  # split, Workpool action, EventBus subscription). Shares agentBC component,
  # agentPool workpool, and OpenRouter LLM runtime.
  # ============================================================================

  """
  High-Value Order Detection Agent Design

  Agent ID: high-value-order-agent
  Subscribes to: OrderConfirmed
  Pattern trigger: totalAmount > $500 (configurable)
  LLM analysis: Analyze order value, customer context, product categories
                → recommend VIP treatment level and priority
  Command: FlagForVIPReview
  Human-in-loop: Requires approval for all VIP flags (confidence < 0.95)
  Rate limits: Same pool as churn-risk (shared agentPool)

  Demo flow:
  1. Create product with stock (e.g., "Premium Widget" at $200/unit)
  2. Create order with 3+ units (total > $500)
  3. Submit order → OrderSubmitted → saga → ReserveStock → ConfirmOrder
  4. OrderConfirmed fires → EventBus delivers to high-value-order-agent
  5. Agent loads checkpoint, checks totalAmount > $500
  6. LLM analysis via OpenRouter → confidence, reasoning, VIP level
  7. FlagForVIPReview command emitted (or approval if low confidence)
  8. Admin sees VIP flag in dashboard, approves/rejects

  End-to-end flow:
    OrderConfirmed event
         |
    EventBus → agentPool action (priority 250)
         |
    Action handler: load checkpoint, check totalAmount
         |
    totalAmount > $500? ─── No → Skip, advance checkpoint
         |
        Yes → LLM analysis: VIP recommendation
         |
    Confidence >= 0.95? ─── Yes → Auto-emit FlagForVIPReview
         |
        No → Create pending approval for human review
         |
    onComplete: persist audit → command → approval → checkpoint
         |
    Admin UI: approve/reject VIP flag
  """

  """
  High-Value Agent Configuration:

    id: "high-value-order-agent"
    subscriptions: ["OrderConfirmed"]
    patternWindow:
      duration: "7d"    # Shorter window (VIP is per-order, not pattern over time)
      minEvents: 1      # Single high-value order is enough
      eventLimit: 10
    confidenceThreshold: 0.95   # High bar for auto-execution (VIP is significant)
    humanInLoop:
      confidenceThreshold: 0.95
      requiresApproval: ["FlagForVIPReview"]
      approvalTimeout: "24h"
    rateLimits:
      maxRequestsPerMinute: 60
      maxConcurrent: 5
      costBudget: { daily: 10.0, alertThreshold: 0.8 }
    patterns: [highValueOrderPattern]
  """

  """
  High-Value Pattern Definition:

    name: "high-value-order"
    description: "Detect high-value orders for VIP review"
    window: { duration: "7d", minEvents: 1, eventLimit: 10 }

    trigger: totalAmount > VALUE_THRESHOLD (from event payload)
      - Extract totalAmount from OrderConfirmed payload
      - Compare against configurable threshold ($500 default)
      - Single event is enough to trigger (not a multi-event pattern)

    analyze(events, agent):
      - Build prompt with order details (totalAmount, items, customerId)
      - LLM analyzes: VIP priority level, recommended actions, reasoning
      - Returns confidence + FlagForVIPReview command with priority
      - NO rule-based fallback — LLM failure → retry → dead letter

  FlagForVIPReview Command Payload:
    | Field | Source |
    | orderId | From OrderConfirmed event payload |
    | customerId | From OrderConfirmed event payload |
    | totalAmount | From OrderConfirmed event payload |
    | vipLevel | LLM recommendation ("gold" / "platinum") |
    | priority | LLM recommendation ("standard" / "expedited") |
    | reasoning | LLM analysis text |
  """

  """
  File Structure (under order-management/convex/contexts/agent/):

    high-value/
      _config.ts              — AgentBCConfig for high-value-order-agent
      _patterns/
        highValueOrder.ts     — PatternDefinition with trigger + analyze
      handlers/
        analyzeEvent.ts       — internalAction (action half)
        onComplete.ts         — internalMutation (persistence half)
        routeCommand.ts       — FlagForVIPReview command routing

  Registration (in eventSubscriptions.ts):
    - Add createAgentSubscription(highValueOrderConfig, { ... })
    - Same agentPool, same retry config, priority 250
  """

  **Design Decision: Authentication Pattern**

  | Option | Trade-off |
  | A: Convex Auth | Full auth stack, but adds complexity to example app |
  | B: Clerk integration | Proven pattern, but external dependency |
  | C: Mock with pattern (Recommended) | Document integration point, use mock for now |

  **Decision:** Option C. Document where `useReviewerId()` connects to real auth
  (Convex Auth or Clerk). Provide mock for development and E2E tests. Real auth
  is a separate concern outside this spec's scope.

  **Design Decision: Toast Notification Library**

  Use Sonner for toast notifications:
  - Lightweight and accessible (ARIA live regions)
  - Works with React 19 and TanStack Start
  - No additional peer dependencies
  - Commonly used in Convex example apps

  **Design Decision: E2E Test Scope**

  The `agent-approvals.feature` file has ~50 scenarios covering 4 agent types.
  Only churn-risk and high-value-order agents have backend implementations.

  | Agent | Scenarios | Status |
  | churn-risk-agent | Dashboard, approvals, monitoring, history, risk preview | Implement steps |
  | high-value-order-agent | Dashboard, approvals, history | Implement steps |
  | low-stock-alert-agent | 4 approval + 2 stock preview + 2 history | Tag @skip |
  | order-consolidation-agent | 4 approval + 1 history | Tag @skip |

  **Step implementation approach:**
  - Page object pattern (consistent with existing `BasePage`, `OrdersPage`, etc.)
  - Shared `AgentAdminPage` page object for the agents admin section
  - `waitUntilProjection()` for eventual consistency waits (existing utility)
  - `prefixName()` / `prefixSku()` for test data isolation (existing utility)

  **Design Decision: Dead Letter Panel vs. Tab**

  | Option | Trade-off |
  | Separate tab | Clean navigation, but adds a 5th tab |
  | Section in Monitoring (Recommended) | Contextually related to agent health |

  **Decision:** Add dead letters as a section within the Monitoring tab. Dead letters
  are operational concerns closely related to agent health monitoring. This avoids
  tab proliferation while keeping operational tools grouped.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | High-value agent config | pending | order-management/convex/contexts/agent/high-value/_config.ts | Yes | unit |
      | High-value pattern definition | pending | order-management/convex/contexts/agent/high-value/_patterns/highValueOrder.ts | Yes | unit |
      | High-value action handler | pending | order-management/convex/contexts/agent/high-value/handlers/analyzeEvent.ts | Yes | integration |
      | High-value onComplete handler | pending | order-management/convex/contexts/agent/high-value/handlers/onComplete.ts | Yes | integration |
      | High-value command route | pending | order-management/convex/contexts/agent/high-value/handlers/routeCommand.ts | Yes | integration |
      | High-value EventBus subscription | pending | order-management/convex/eventSubscriptions.ts | Yes | integration |
      | High-value integration test (real LLM) | pending | order-management/tests/integration/agent/high-value-order.integration.test.ts | Yes | integration |
      | Dead letter management section in Monitoring | pending | apps/frontend/app/admin/agents.tsx (Monitoring tab extension) | Yes | e2e |
      | useDeadLetters hook | pending | apps/frontend/hooks/use-dead-letters.ts | Yes | unit |
      | useDeadLetterActions hook | pending | apps/frontend/hooks/use-dead-letter-actions.ts | Yes | unit |
      | Decision history tab | pending | apps/frontend/app/admin/agents.tsx (new tab) | Yes | e2e |
      | useDecisionHistory hook with filters | pending | apps/frontend/hooks/use-decision-history.ts | Yes | unit |
      | Toast notification integration (Sonner) | pending | apps/frontend/components/toast-provider.tsx | Yes | unit |
      | Action feedback toasts | pending | apps/frontend/hooks/use-approval-actions.ts (enhance) | Yes | e2e |
      | Dashboard update for multi-agent | pending | apps/frontend/app/admin/agents.tsx | Yes | e2e |
      | E2E step definitions | pending | apps/frontend/tests/e2e/steps/agent.steps.ts | Yes | e2e |
      | AgentAdminPage page object | pending | apps/frontend/tests/e2e/support/pages/AgentAdminPage.ts | Yes | e2e |
      | Tag unimplemented agent e2e scenarios @skip | pending | apps/frontend/tests/e2e/features/admin/agent-approvals.feature | No | - |
      | Auth integration documentation | pending | apps/frontend/hooks/use-reviewer-id.ts (JSDoc) | No | - |

  # ============================================================================
  # RULE 1: Dead Letters Are Visible and Actionable
  # ============================================================================

  Rule: Dead letters are visible and actionable

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

    @acceptance-criteria @happy-path
    Scenario: Dead letter list displays failed events from both agents
      Given 2 dead letter entries exist for the churn-risk agent
      And 1 dead letter entry exists for the high-value-order agent
      When I navigate to the Monitoring tab
      Then I see a "Dead Letters" section with 3 entries
      And each entry shows agent ID, event type, error, and timestamp
      And each entry has "Replay" and "Ignore" action buttons

    @acceptance-criteria @happy-path
    Scenario: Replay action triggers backend mutation with toast feedback
      Given a dead letter entry for the churn-risk agent
      When I click the "Replay" button
      Then the replayDeadLetter mutation is called
      And a success toast shows "Dead letter replayed successfully"
      And the entry status updates to "replayed"
      And the Replay button is replaced with a "Replayed" status indicator

    @acceptance-criteria @happy-path
    Scenario: Ignore action with reason provides confirmation
      Given a dead letter entry for event "evt_456"
      When I click "Ignore" and enter reason "Duplicate event, already processed"
      Then the ignoreDeadLetter mutation is called with the reason
      And a success toast shows "Dead letter ignored"
      And the entry status updates to "ignored"

    @acceptance-criteria @validation
    Scenario: Replay failure shows error toast
      Given a dead letter entry whose original event no longer exists
      When I click the "Replay" button
      Then the mutation fails with an error
      And an error toast shows a descriptive message
      And the entry remains in "pending" status

    @acceptance-criteria @edge-case
    Scenario: Filter dead letters by agent
      Given dead letters exist for both churn-risk and high-value-order agents
      When I select "high-value-order-agent" in the agent filter
      Then only dead letters for the high-value-order agent are shown

  # ============================================================================
  # RULE 2: Decision History Supports Multi-Agent Filtering
  # ============================================================================

  Rule: Decision history supports multi-agent filtering

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

    @acceptance-criteria @happy-path
    Scenario: View decision history with decisions from both agents
      Given the churn-risk agent has detected 3 patterns
      And the high-value-order agent has flagged 2 orders
      When I click the "Decision History" tab
      Then I see 5 audit entries in chronological order
      And entries from both agents are interleaved by timestamp

    @acceptance-criteria @happy-path
    Scenario: Filter decision history by agent
      Given decisions exist for "churn-risk-agent" and "high-value-order-agent"
      When I select "churn-risk-agent" in the agent filter
      Then only churn-risk agent decisions are displayed
      And the entry count updates to reflect the filter

    @acceptance-criteria @happy-path
    Scenario: Filter decision history by action type
      Given decisions with actions "SuggestCustomerOutreach" and "FlagForVIPReview"
      When I select "FlagForVIPReview" in the action filter
      Then only FlagForVIPReview decisions are displayed

    @acceptance-criteria @happy-path
    Scenario: View decision detail with full reasoning
      Given the churn-risk agent has made a decision with confidence 0.87
      When I click on the decision entry
      Then I see the full LLM reasoning text
      And I see the triggering event IDs
      And I see whether a command was emitted
      And I see whether approval was required

    @acceptance-criteria @edge-case
    Scenario: Empty decision history shows guidance message
      Given no agents have made any decisions yet
      When I view the "Decision History" tab
      Then I see a message explaining what will appear here
      And the message mentions both active agents by name

  # ============================================================================
  # RULE 3: Actions Provide Feedback Via Toast
  # ============================================================================

  Rule: Actions provide feedback via toast

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

    @acceptance-criteria @happy-path
    Scenario: Approve action shows success toast
      Given a pending approval for the churn-risk agent
      When I click "Approve"
      Then a success toast appears with "Approval recorded"
      And the toast auto-dismisses after 5 seconds
      And the approval list refreshes

    @acceptance-criteria @happy-path
    Scenario: Reject action shows success toast
      Given a pending approval for the high-value-order agent
      When I click "Reject" and provide a note
      Then a success toast appears with "Action rejected"
      And the approval is removed from the pending list

    @acceptance-criteria @validation
    Scenario: Error action shows descriptive error toast
      Given a pending approval that has already been expired
      When I attempt to approve it
      Then an error toast appears with "Approval has expired"
      And the toast has role="alert" for accessibility
      And the approval status shows "expired"

    @acceptance-criteria @edge-case
    Scenario: Multiple rapid actions show stacked toasts
      Given 3 pending approvals from different agents
      When I quickly approve all 3
      Then 3 success toasts appear in sequence
      And each toast is individually dismissable
      And they auto-dismiss in order

  # ============================================================================
  # RULE 4: High-Value Order Agent Functions End-to-End
  # ============================================================================

  Rule: High-value order agent functions end-to-end

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

    @acceptance-criteria @happy-path
    Scenario: High-value order detected and surfaces as VIP approval
      Given a product exists with price $200 per unit
      And the product has sufficient stock
      When a customer creates an order with 3 units (total $600)
      And the order is submitted and confirmed by the saga
      Then the high-value-order-agent detects the OrderConfirmed event
      And the LLM analyzes the order for VIP treatment
      And a FlagForVIPReview approval appears in the admin dashboard
      And the approval shows confidence, reasoning, and order details

    @acceptance-criteria @happy-path
    Scenario: Low-value order does not trigger agent
      Given a product exists with price $10 per unit
      When a customer creates an order with 2 units (total $20)
      And the order is submitted and confirmed
      Then the high-value-order-agent receives the event
      But the pattern trigger does not fire (totalAmount < $500)
      And no approval is created

    @acceptance-criteria @happy-path
    Scenario: Admin approves VIP flag for high-value order
      Given there is a pending FlagForVIPReview approval
      And the approval shows order total $1,200 with confidence 0.91
      When the admin reviews the reasoning and clicks "Approve"
      Then a success toast shows "Approval recorded for high-value-order-agent"
      And the FlagForVIPReview command is routed to the VIP handler
      And the decision appears in the decision history tab

    @acceptance-criteria @edge-case
    Scenario: Both agents trigger from same customer activity
      Given a customer has cancelled 2 orders previously
      And the customer places a new high-value order ($800)
      When the customer cancels the high-value order (3rd cancellation)
      Then the churn-risk agent detects the 3+ cancellation pattern
      And the high-value-order agent had previously flagged the order
      And both decisions appear in the decision history
      And the admin can filter by agent to see each agent's perspective

  # ============================================================================
  # RULE 5: Dashboard Reflects Multi-Agent State
  # ============================================================================

  Rule: Dashboard reflects multi-agent state

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

    @acceptance-criteria @happy-path
    Scenario: Dashboard shows both active agents
      Given the churn-risk agent has processed 100 events
      And the high-value-order agent has processed 50 events
      When I view the agents dashboard
      Then the Active Agents count shows "2"
      And the Events Processed count shows "150"
      And both agent names are visible

    @acceptance-criteria @happy-path
    Scenario: Pending approvals count includes both agents
      Given there are 2 pending approvals from churn-risk agent
      And there is 1 pending approval from high-value-order agent
      When I view the agents dashboard
      Then the Pending Approvals count shows "3"
      And the Pending Approvals tab badge shows "3"

    @acceptance-criteria @edge-case
    Scenario: One agent stopped, one active
      Given the churn-risk agent is in "active" status
      And the high-value-order agent is in "stopped" status
      When I view the monitoring tab
      Then I see the churn-risk agent with "Active" badge
      And I see the high-value-order agent with "Stopped" badge
      And the Active Agents count on dashboard shows "1"
