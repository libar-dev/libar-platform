# ✅ Agent Churn Risk Completion

**Purpose:** Detailed requirements for the Agent Churn Risk Completion feature

---

## Overview

| Property     | Value      |
| ------------ | ---------- |
| Status       | completed  |
| Product Area | ExampleApp |
| Phase        | 22         |

## Description

**Problem:** The churn-risk agent in the order-management example app has working
infrastructure from Phases 22a-22c (action handler, onComplete handler, pattern
definition, component migration, approval cron) but critical gaps prevent it from
being a genuine AI agent reference implementation:

1. **Rule-based fallback defeats AI purpose** — `churnRisk.ts` catches LLM errors
   and falls back to `createRuleBasedAnalysis()` which produces the same
   `SuggestCustomerOutreach` command with formula-derived confidence. The AI agent
   is functionally indistinguishable from a rule engine.
2. **Command routing is a stub** — `routeCommand.ts` has a no-op orchestrator that
   returns `{ success: true }` without creating a domain record or emitting an
   `OutreachCreated` event. Commands go nowhere.
3. **No end-to-end integration test with real LLM** — Coverage exists across 3 test
   files but no single test exercises the full pipeline (cancellation → agent →
   LLM → command → outreach) with an actual OpenRouter API call.
4. **No BDD feature file** for the churn-risk flow in order-management.
5. **`highValueChurnPattern` is rule-only** — A second pattern with no `analyze()`
   function serves no purpose in an AI agent feature.

**Solution:** Complete the churn-risk agent as a genuine AI agent reference:

1. **Remove rule-based fallback** — LLM failure → Workpool retry → dead letter
2. **Real outreach handler** — Create outreach record + emit `OutreachCreated` event
3. **Full pipeline integration test** — Real LLM via OpenRouter (~$0.01/run)
4. **BDD feature file** — Executable spec for churn-risk flow
5. **Remove `highValueChurnPattern`** — Rule-only pattern contradicts AI purpose

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Production-ready example | Full AI agent pattern demonstrated end-to-end |
| LLM integration proof | Validates action/mutation split with real API calls |
| Complete command flow | Agent decisions trigger real domain actions |
| Reference implementation | Other agents follow this exact pattern |
| Operational visibility | LLM failures are visible via dead letters, not silently degraded |

**End-to-End Flow (target state):**
"""

1. Customer cancels order (OrderCancelled event)
   |
2. EventBus delivers to churn-risk agent (agentPool action, priority 250)
   |
3. Action handler loads checkpoint, checks idempotency
   |
4. Action handler loads customerCancellations projection (cross-BC query)
   |
5. Pattern trigger: 3+ cancellations in 30 days?
   |
   +--- No --> Skip, return null (onComplete advances checkpoint only)
   +--- Yes --> Continue to step 6
   |
6. LLM analysis via OpenRouter: confidence score + reasoning + command
   |
   +--- LLM error --> Error propagates → Workpool retries (3x) → dead letter
   |
7. Confidence >= 0.8 (auto-execute threshold)?
   |
   +--- Yes --> Return AgentActionResult with SuggestCustomerOutreach command
   +--- No --> Return AgentActionResult with pending approval
   |
8. onComplete (mutation): persist audit → command → approval → checkpoint
   |
9. routeCommand (scheduled mutation): routes SuggestCustomerOutreach
   |
10. Outreach handler creates outreach task record, emits OutreachCreated event
    """

**Design Decision: LLM Testing Strategy**

| Aspect | Decision |
| API calls | Real OpenRouter calls in integration tests, NOT mocked |
| API key | `OPENROUTER_INTEGRATION_TEST_API_KEY` env var (dedicated CI key) |
| Model | Gemini Flash via OpenRouter (~$0.001-0.01 per call) |
| Skip when unavailable | Tests skip (not fail) when API key is not set |
| Existing pattern | `agent-llm.integration.test.ts` already uses this approach |

**Design Decision: No Rule-Based Fallback**

| Current (wrong) | Target (correct) |
| LLM fails → same command emitted with formula confidence | LLM fails → error propagates → Workpool retries → dead letter |
| Agent indistinguishable from rule engine | LLM is essential — failure is an operational event |
| Silent degradation hides API issues | Dead letter visible in admin UI for operator triage |

**Rationale:** An AI agent that silently produces the same outcome without AI
is not an AI agent — it is a rule engine with extra steps. The LLM analysis is
the differentiating value. Its absence should be surfaced as an operational concern
(dead letter), not hidden behind a formula that mimics the same result.

**Changes:** Remove `createRuleBasedAnalysis()` and the `catch` block in
`churnRisk.ts:179-182`. Remove `highValueChurnPattern` (rule-only variant).
Workpool retry config (3 attempts, 1000ms backoff, base 2) handles transient
LLM failures. Persistent failures create dead letters visible in the admin UI.

**Design Decision: SuggestCustomerOutreach Handler**

Replace the no-op minimal orchestrator in `routeCommand.ts` with a handler that:

1. Validates customerId and riskLevel from command payload
2. Atomically creates outreach task + appends `OutreachCreated` event (same mutation, dual-write)
3. Records the outreach in a queryable projection for the admin UI
   Idempotency enforced by command bus (commandId-based dedup prevents replay duplicates).

This completes the loop: cancellation → agent → LLM → command → outreach record.
Future phases can add actual notification delivery (email, SMS) as outreach
consumers — the handler itself is simple domain record creation.

**Design Decision: Approval Expiration Mechanism**

| Aspect | Decision |
| Approach | Hourly cron job (already implemented) |
| Location | `crons.ts` → `expirePendingApprovals` mutation |
| Timeout | 24h default from `AgentBCConfig.humanInLoop.approvalTimeout` |
| Status | **Complete** — cron, mutation, and integration tests all working |

**Infrastructure Completed by Phases 22a-22c:**
| Component | Status | Location |
| Action handler factory | Complete | `platform-core/src/agent/action-handler.ts` |
| onComplete handler factory | Complete | `platform-core/src/agent/oncomplete-handler.ts` |
| Pattern executor | Complete | `platform-core/src/agent/pattern-executor.ts` |
| Agent component (5 tables) | Complete | `platform-core/src/agent/component/` |
| Command bridge | Complete | `platform-core/src/agent/commands.ts` |
| Dead letter handler | Complete | `platform-core/src/agent/dead-letter.ts` |
| Agent rate limiter | Complete | `platform-core/src/agent/agent-rate-limiter.ts` |
| Thread adapter | Complete | `platform-core/src/agent/thread-adapter.ts` |
| Lifecycle FSM | Complete | `platform-core/src/agent/lifecycle-handlers.ts` |
| EventBus action subscription | Complete | `platform-bus/agent-subscription.ts` |

## Acceptance Criteria

**Three cancellations trigger LLM analysis via OpenRouter**

- Given customer "cust_123" has cancelled 3 orders in the last 30 days
- When an OrderCancelled event is published for "cust_123"
- Then the pattern trigger fires (3+ cancellations detected)
- And the LLM is called via OpenRouter with event history
- And the analysis returns a confidence score and reasoning
- And the analysisMethod is "llm"

**Two cancellations do not trigger LLM**

- Given customer "cust_456" has cancelled 2 orders in the last 30 days
- When an OrderCancelled event is published for "cust_456"
- Then the pattern trigger does not fire
- And no LLM call is made
- And the checkpoint advances without emitting a command

**High confidence triggers auto-execution of SuggestCustomerOutreach**

- Given customer "cust_789" has cancelled 4 orders in the last 30 days
- And the LLM returns confidence 0.92 (above threshold 0.8)
- When the agent processes the OrderCancelled event
- Then a SuggestCustomerOutreach command is included in the AgentActionResult
- And the onComplete handler persists the command and audit event
- And the command is scheduled for routing via routeAgentCommand

**Low confidence queues for human approval**

- Given customer "cust_101" has cancelled 3 orders in the last 30 days
- And the LLM returns confidence 0.65 (below threshold 0.8)
- When the agent processes the analysis result
- Then a pending approval is created with the LLM reasoning
- And no command is emitted immediately
- And an ApprovalRequested audit event is recorded
- And the approval expires after 24 hours if not acted on

**LLM failure exhausts retries and creates dead letter**

- Given customer "cust_err" has cancelled 3 orders in the last 30 days
- And the LLM API is unreachable (network error)
- When an OrderCancelled event triggers analysis
- Then the Workpool retries the action 3 times with exponential backoff
- And after all retries fail, onComplete receives kind "failed"
- And a dead letter is created with the error details
- And an AgentAnalysisFailed audit event is recorded
- And no SuggestCustomerOutreach command is emitted
- And the dead letter is visible in the admin UI for operator triage

**Cron expires approval after timeout**

- Given a pending approval created 25 hours ago
- And the approval timeout is 24 hours
- When the expiration cron runs
- Then the approval status transitions to "expired"
- And an ApprovalExpired audit event is recorded

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

**SuggestCustomerOutreach creates outreach record and emits event**

- Given the agent has emitted a SuggestCustomerOutreach command
- And the command includes customerId "cust_123", riskLevel "high", cancellationCount 4
- When the command bridge routes to the outreach handler
- Then an outreach task record is created with the customer context
- And an OutreachCreated domain event is emitted with the outreach details
- And the agent command status updates to "completed"

**Full end-to-end flow from cancellation to outreach record**

- Given a customer who has cancelled 2 orders previously
- When the customer cancels a third order
- Then the churn-risk agent detects the pattern (3+ cancellations)
- And the LLM is called via OpenRouter and returns high confidence
- And a SuggestCustomerOutreach command is emitted
- And the command is routed to the outreach handler
- And an outreach task record is created
- And an OutreachCreated event confirms the action end-to-end

**Command with missing customerId fails validation**

- Given the agent emitted a SuggestCustomerOutreach command
- And the command payload has no customerId
- When the command bridge attempts to route the command
- Then the routing fails with a validation error
- And an AgentCommandRoutingFailed audit event is recorded

**Command handler failure creates dead letter for operator triage**

- Given the agent has emitted a SuggestCustomerOutreach command
- And the outreach handler throws an error during record creation
- When the command bridge reports the failure
- Then the agent command status updates to "failed"
- And an AgentCommandRoutingFailed audit event is recorded
- And the failure is visible in the dead letter management panel

## Business Rules

**LLM analysis is essential, not optional**

**Invariant:** When the pattern trigger fires (3+ cancellations in 30 days for
the same customer), the LLM MUST be called. There is no rule-based fallback that
produces the same outcome. If the LLM is unavailable, the event is retried by
Workpool (3 attempts with exponential backoff). If all retries fail, a dead letter
is created for operator triage.

    **Rationale:** An AI agent's value comes from LLM analysis — confidence scoring,
    pattern reasoning, contextual recommendations. A rule-based formula that produces
    `SuggestCustomerOutreach` regardless of LLM availability makes the AI irrelevant.
    Failure should be visible (dead letter), not invisible (silent fallback).

    **Error Handling Chain:**
    | Step | What Happens |
    | LLM call fails | Error propagates from `analyze()` to pattern executor |
    | Pattern executor throws | Error propagates to action handler |
    | Action handler throws | Workpool catches, retries (attempt 1/3) |
    | All 3 retries fail | Workpool onComplete receives `kind: "failed"` |
    | onComplete failure path | Creates dead letter, records `AgentAnalysisFailed` audit |
    | Dead letter visible | Admin UI shows failed event for operator replay/ignore |

    **Verified by:** LLM called on trigger, failure creates dead letter, no silent fallback

_Verified by: Three cancellations trigger LLM analysis via OpenRouter, Two cancellations do not trigger LLM, High confidence triggers auto-execution of SuggestCustomerOutreach, Low confidence queues for human approval, LLM failure exhausts retries and creates dead letter_

**Approvals expire after configured timeout**

**Invariant:** Pending approvals must transition to "expired" status after
`approvalTimeout` elapses (default 24 hours). A cron job runs hourly to expire
stale approvals.

    **Rationale:** Pending approvals cannot linger indefinitely. Without expiration,
    the system accumulates stale decisions that may no longer be relevant. The hourly
    cron approach is pragmatic for 24h timeouts where up-to-1-hour latency is acceptable.

    **Status:** The approval expiration mechanism is **complete** (cron, mutation,
    integration tests). These scenarios document the expected behavior for reference.

    **Verified by:** Expiration transitions correctly, expired cannot be acted on

_Verified by: Cron expires approval after timeout, Expired approval cannot be approved or rejected, Approved before timeout succeeds normally_

**Emitted commands create real domain records**

**Invariant:** `SuggestCustomerOutreach` command emitted by the agent routes
through the command bridge to a handler that creates an outreach task record
and emits an `OutreachCreated` domain event. The current no-op stub that returns
`{ success: true }` must be replaced with a real domain handler.

    **Rationale:** A command that produces no domain effect is not a command — it is
    a log entry. Completing the routing makes the agent actionable: analysis leads to
    real business outcomes (outreach records) rather than entries in a table.

    **Outreach Handler Design:**
    | Step | Action |
    | 1. Validate payload | Ensure customerId, riskLevel, agentId present |
    | 2. Create outreach record | Write to outreach CMS/projection table |
    | 3. Emit OutreachCreated event | Via event store append in same mutation |
    | 4. Update agent command status | Mark as "completed" via agent component |

    **OutreachCreated Event Payload:**
    | Field | Source |
    | outreachId | Generated UUID |
    | customerId | From command payload |
    | agentId | From command context |
    | riskLevel | From command payload ("high" / "medium") |
    | cancellationCount | From command payload |
    | correlationId | From command context |
    | createdAt | Current timestamp |

    **Verified by:** Command routes to handler, handler creates record, event emitted

_Verified by: SuggestCustomerOutreach creates outreach record and emits event, Full end-to-end flow from cancellation to outreach record, Command with missing customerId fails validation, Command handler failure creates dead letter for operator triage_

## Deliverables

- Churn-risk action handler (complete)
- Churn-risk onComplete handler (complete)
- LLM analysis wiring (pattern definition) (complete)
- Agent component migration (complete)
- Approval expiration cron (complete)
- Remove rule-based fallback from churnRisk.ts (complete)
- Remove highValueChurnPattern (complete)
- SuggestCustomerOutreach outreach handler (complete)
- Full pipeline integration test (real LLM) (complete)
- Churn-risk BDD feature file (complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
