@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:AgentAdminFrontend
@libar-docs-status:roadmap
@libar-docs-phase:22e
@libar-docs-effort:1w
@libar-docs-product-area:ExampleApp
@libar-docs-depends-on:AgentChurnRiskCompletion
@libar-docs-executable-specs:apps/frontend/tests/e2e/features/admin
Feature: Agent Admin Frontend - Complete Management UI

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

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Dead letter management panel | pending | apps/frontend/app/admin/agents/dead-letters/index.tsx | Yes | e2e |
      | Dead letter detail with replay/ignore | pending | apps/frontend/app/admin/agents/dead-letters/[id].tsx | Yes | e2e |
      | useDeadLetters hook | pending | apps/frontend/hooks/use-dead-letters.ts | Yes | unit |
      | useDeadLetterActions hook | pending | apps/frontend/hooks/use-dead-letter-actions.ts | Yes | unit |
      | Decision history tab | pending | apps/frontend/app/admin/agents/history/index.tsx | Yes | e2e |
      | useDecisionHistory hook with filters | pending | apps/frontend/hooks/use-decision-history.ts | Yes | unit |
      | Toast notification integration (Sonner) | pending | apps/frontend/components/toast-provider.tsx | Yes | unit |
      | Action feedback toasts | pending | apps/frontend/hooks/use-agent-actions.ts | Yes | e2e |
      | Auth integration documentation | pending | apps/frontend/docs/AUTH-INTEGRATION.md | No | - |
      | E2E step definitions for agent scenarios | pending | apps/frontend/tests/e2e/steps/agent.steps.ts | Yes | e2e |
      | AgentDeadLettersPage page object | pending | apps/frontend/tests/e2e/support/pages/AgentDeadLettersPage.ts | Yes | e2e |
      | AgentHistoryPage page object | pending | apps/frontend/tests/e2e/support/pages/AgentHistoryPage.ts | Yes | e2e |

  # ============================================================================
  # RULE 1: Dead Letters Are Visible and Actionable
  # ============================================================================

  Rule: Dead letters are visible and actionable

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

    @acceptance-criteria @happy-path
    Scenario: Dead letter list displays failed events
      Given 3 dead letter entries exist for the churn-risk agent
      When I navigate to the dead letters panel
      Then I see 3 entries with agent, event type, error, and timestamp
      And each entry has "Replay" and "Ignore" action buttons

    @acceptance-criteria @happy-path
    Scenario: Replay action triggers backend mutation with feedback
      Given a dead letter entry for event "evt_123"
      When I click the "Replay" button
      Then the replayDeadLetter mutation is called
      And a success toast shows "Dead letter replayed successfully"
      And the entry status updates to "replayed"

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

  # ============================================================================
  # RULE 2: Decision History Supports Filtering
  # ============================================================================

  Rule: Decision history supports filtering

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

    @acceptance-criteria @happy-path
    Scenario: Filter by agent shows only that agent's decisions
      Given decisions exist for "churn-risk" and "low-stock" agents
      When I select "churn-risk" in the agent filter
      Then only churn-risk agent decisions are displayed
      And the URL updates to include ?agent=churn-risk

    @acceptance-criteria @happy-path
    Scenario: Filter by action type shows matching decisions
      Given decisions with actions "SuggestCustomerOutreach" and "LogChurnRisk"
      When I select "SuggestCustomerOutreach" in the action filter
      Then only SuggestCustomerOutreach decisions are displayed

    @acceptance-criteria @happy-path
    Scenario: Clear filters shows all decisions
      Given filters are active for agent and action type
      When I click "Clear Filters"
      Then all decisions are displayed
      And the URL query parameters are removed

    @acceptance-criteria @edge-case
    Scenario: Loading decision history from shared URL
      Given the URL contains ?agent=churn-risk&action=SuggestCustomerOutreach
      When the page loads
      Then filters are pre-populated from URL parameters
      And only matching decisions are displayed

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
      Given a pending approval for the churn-risk agent
      When I click "Reject" and confirm
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
      Given 3 pending approvals
      When I quickly approve all 3
      Then 3 success toasts appear in sequence
      And each toast is individually dismissable
      And they auto-dismiss in order
