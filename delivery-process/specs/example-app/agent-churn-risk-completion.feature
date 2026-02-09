@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:AgentChurnRiskCompletion
@libar-docs-status:roadmap
@libar-docs-phase:22d
@libar-docs-effort:1w
@libar-docs-product-area:ExampleApp
@libar-docs-depends-on:AgentCommandInfrastructure
@libar-docs-executable-specs:order-management/tests/features/agent
Feature: Agent Churn Risk Completion - Full LLM Integration in Example App

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
       +--- No  --> Skip, update checkpoint
       +--- Yes --> Continue to step 6
       |
  6. LLM analysis: confidence score + reasoning + suggested action
       |
  7. Confidence >= threshold?
       |
       +--- Yes --> Emit SuggestCustomerOutreach command
       +--- No  --> Queue for human approval
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

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Churn-risk action handler | pending | order-management/convex/contexts/agent/handlers/eventAction.ts | Yes | integration |
      | Churn-risk onComplete handler update | pending | order-management/convex/contexts/agent/handlers/onComplete.ts | Yes | integration |
      | LLM analysis wiring | pending | order-management/convex/contexts/agent/_patterns/churnRisk.ts | Yes | unit |
      | Agent component migration | pending | order-management/convex/contexts/agent/component/ | Yes | integration |
      | SuggestCustomerOutreach command handler | pending | order-management/convex/commands/customerOutreach.ts | Yes | integration |
      | Approval expiration cron enhancement | pending | order-management/convex/crons.ts | Yes | integration |
      | Full flow integration test | pending | order-management/tests/integration/agent/churn-risk-flow.test.ts | Yes | integration |
      | Churn-risk BDD feature file | pending | order-management/tests/integration-features/agent/churn-risk.feature | Yes | integration |

  # ============================================================================
  # RULE 1: Churn-Risk Agent Uses Hybrid LLM Flow
  # ============================================================================

  Rule: Churn-risk agent uses hybrid LLM flow

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

    @acceptance-criteria @happy-path
    Scenario: Three cancellations trigger LLM analysis
      Given customer "cust_123" has cancelled 3 orders in the last 30 days
      When an OrderCancelled event is published for "cust_123"
      Then the pattern trigger fires (3+ cancellations detected)
      And LLM analysis is called with event history
      And the analysis returns confidence score and reasoning
      And the decision includes suggestedAction "SuggestCustomerOutreach"

    @acceptance-criteria @happy-path
    Scenario: Two cancellations do not trigger LLM
      Given customer "cust_456" has cancelled 2 orders in the last 30 days
      When an OrderCancelled event is published for "cust_456"
      Then the pattern trigger does not fire
      And no LLM call is made
      And the checkpoint advances without emitting a command

    @acceptance-criteria @edge-case
    Scenario: LLM unavailable falls back to rule-based confidence
      Given customer "cust_789" has cancelled 5 orders in the last 30 days
      And the LLM API is unreachable
      When an OrderCancelled event triggers analysis
      Then the agent falls back to rule-based confidence calculation
      And the confidence is derived from cancellation count and frequency
      And the audit records analysisMethod as "rule-based-fallback"

    @acceptance-criteria @edge-case
    Scenario: LLM analysis with low confidence queues for approval
      Given customer "cust_101" has cancelled 3 orders in the last 30 days
      And the LLM returns confidence 0.65 (below threshold 0.8)
      When the agent processes the analysis result
      Then a pending approval is created with the LLM reasoning
      And no command is emitted immediately
      And an AgentDecisionPending audit event is recorded

  # ============================================================================
  # RULE 2: Approvals Expire After Configured Timeout
  # ============================================================================

  Rule: Approvals expire after configured timeout

    **Invariant:** Pending approvals must transition to "expired" status after
    `approvalTimeout` elapses (default 24 hours). A cron job runs periodically
    to expire stale approvals.

    **Rationale:** Pending approvals cannot linger indefinitely. Without expiration,
    the system accumulates stale decisions that may no longer be relevant. The cron
    approach is pragmatic for 24h timeouts where up-to-1-hour latency is acceptable.

    **Verified by:** Expiration transitions correctly, expired cannot be acted on

    @acceptance-criteria @happy-path
    Scenario: Cron expires approval after timeout
      Given a pending approval created 25 hours ago
      And the approval timeout is 24 hours
      When the expiration cron runs
      Then the approval status transitions to "expired"
      And an AgentApprovalExpired audit event is recorded

    @acceptance-criteria @validation
    Scenario: Expired approval cannot be approved or rejected
      Given an approval that has been expired by the cron
      When a reviewer attempts to approve the expired item
      Then the action is rejected with APPROVAL_EXPIRED error
      And the approval remains in "expired" status

    @acceptance-criteria @happy-path
    Scenario: Approved before timeout succeeds normally
      Given a pending approval created 12 hours ago
      When a reviewer approves the action
      Then the approval status transitions to "approved"
      And the associated command is submitted for execution

  # ============================================================================
  # RULE 3: Emitted Commands Route to Domain Handlers
  # ============================================================================

  Rule: Emitted commands route to domain handlers

    **Invariant:** `SuggestCustomerOutreach` command emitted by the agent routes through
    CommandOrchestrator to a handler that creates the actual outreach task and emits
    a domain event.

    **Rationale:** Currently commands are stored in `agentCommands` but never processed.
    Completing the routing makes the agent actionable — its analysis leads to real
    business outcomes rather than entries in a table.

    **Verified by:** Command routes to handler, handler creates outreach, event emitted

    @acceptance-criteria @happy-path
    Scenario: SuggestCustomerOutreach routes to outreach handler
      Given the agent has emitted a SuggestCustomerOutreach command
      And the command includes customerId, reason, and confidence
      When the CommandOrchestrator processes the command
      Then the customerOutreach handler creates an outreach task
      And an OutreachCreated event is emitted
      And the agent command status updates to "completed"

    @acceptance-criteria @happy-path
    Scenario: Full end-to-end flow from cancellation to outreach
      Given a customer who has cancelled 2 orders previously
      When the customer cancels a third order
      Then the churn-risk agent detects the pattern
      And LLM analysis returns high confidence
      And SuggestCustomerOutreach command is emitted
      And the command is routed to the outreach handler
      And an OutreachCreated event confirms the action

    @acceptance-criteria @edge-case
    Scenario: Command failure records error and creates dead letter
      Given the agent has emitted a SuggestCustomerOutreach command
      And the outreach handler throws an error
      When the CommandOrchestrator reports the failure
      Then the agent command status updates to "failed"
      And an AgentCommandFailed audit event is recorded
      And the failure is available for retry via dead letter management
