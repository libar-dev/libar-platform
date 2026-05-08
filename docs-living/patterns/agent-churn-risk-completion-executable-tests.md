# ✅ Agent Churn Risk Completion Executable Tests

**Purpose:** Detailed documentation for the Agent Churn Risk Completion Executable Tests pattern

---

## Overview

| Property | Value             |
| -------- | ----------------- |
| Status   | completed         |
| Category | Agent On Complete |

## Description

As a system operator
  I want agent failures to create dead letters for retry
  So that no events are silently lost during processing

## Acceptance Criteria

**No dead letter on success**

- When the onComplete handler receives a success result
- Then the dead letter count should be 0
- And the checkpoint should advance to the event global position

**No dead letter on canceled**

- When the onComplete handler receives a canceled result
- Then the dead letter count should be 0

**Creates dead letter on failure**

- When the onComplete handler receives a failed result with error "Test error"
- Then the dead letter count should be 1
- And the dead letter for the event should have:

| field          | value      |
| -------------- | ---------- |
| attemptCount   | 1          |
| status         | pending    |
| error          | Test error |
| globalPosition | 100        |

**Increments attemptCount on repeated failure**

- Given a first failure with error "First error"
- When the onComplete handler receives a failed result with error "Second error"
- Then the dead letter count should be 1
- And the dead letter for the event should have:

| field        | value        |
| ------------ | ------------ |
| attemptCount | 2            |
| error        | Second error |

**Does not update dead letter in terminal state**

- Given a first failure with error "Original error"
- And the dead letter is marked as ignored with reason "Test ignore"
- When the onComplete handler receives a failed result with error "Should not overwrite"
- Then the dead letter for the event should have:

| field        | value          |
| ------------ | -------------- |
| status       | ignored        |
| attemptCount | 1              |
| error        | Original error |

**Cron expires approval after timeout**

- When the onComplete handler records a pending approval for customer "cust_expired"
- And approval expiration runs after the timeout elapses
- Then the pending approval should have:
- And an "ApprovalExpired" audit event should exist for the pending approval

| field  | value   |
| ------ | ------- |
| status | expired |

**Expired approval cannot be approved**

- When the onComplete handler records a pending approval for customer "cust_expired_review"
- And approval expiration runs after the timeout elapses
- And reviewer "reviewer_late" attempts to approve the expired action
- Then the approval action should fail with error "INVALID_STATUS_TRANSITION"

**SuggestCustomerOutreach creates outreach record and emits event**

- When the onComplete handler auto-executes a SuggestCustomerOutreach command for customer "cust_outreach_123"
- And scheduled command routing completes
- Then the recorded command should have:
- And the outreach task should have:
- And an "OutreachCreated" event should be emitted for the outreach task

| field  | value                   |
| ------ | ----------------------- |
| status | completed               |
| type   | SuggestCustomerOutreach |

| field             | value             |
| ----------------- | ----------------- |
| customerId        | cust_outreach_123 |
| agentId           | churn-risk-agent  |
| riskLevel         | high              |
| cancellationCount | 4                 |
| correlationId     | corr_1            |
| status            | pending           |

## Business Rules

**Successful and canceled results do not create dead letters**

**Invariant:** Only failed results create dead letter entries. Success and
    canceled results are normal completion states that require no error tracking.
    **Rationale:** Dead letters are an error-recovery mechanism. Creating entries
    for non-error states would pollute the dead letter queue and obscure real failures.
    **Verified by:** No dead letter on success, No dead letter on canceled

_Verified by: No dead letter on success, No dead letter on canceled_

**Failed results create dead letters with error details**

**Invariant:** A failed result must create exactly one dead letter entry with
    the error message, attempt count of 1, pending status, and the event's global position.
    **Rationale:** Dead letters capture all context needed for manual retry or investigation.
    The attempt count tracks redelivery attempts for escalation policies.
    **Verified by:** Creates dead letter on failure

_Verified by: Creates dead letter on failure_

**Repeated failures increment attempt count**

**Invariant:** When the same eventId fails again, the existing dead letter's
    attemptCount is incremented and the error is updated. No duplicate entries are created.
    **Rationale:** Deduplication by eventId prevents queue bloat from redeliveries.
    The latest error is preserved for debugging the most recent failure.
    **Verified by:** Increments attemptCount on repeated failure

_Verified by: Increments attemptCount on repeated failure_

**Terminal dead letters are not updated**

**Invariant:** Once a dead letter reaches a terminal state (e.g., ignored),
    subsequent failures for the same eventId must not modify it.
    **Rationale:** Terminal states represent operator decisions (ignore, resolved).
    Overwriting them with new failures would lose the operator's intent.
    **Verified by:** Does not update dead letter in terminal state

_Verified by: Does not update dead letter in terminal state_

**Approvals expire after configured timeout**

**Invariant:** Pending approvals must transition to "expired" status after
    `approvalTimeout` elapses. Once expired, they can no longer be approved.
    **Rationale:** Stale approvals cannot linger forever or be acted on after
    their review window closes.
    **Verified by:** Cron expires approval after timeout, Expired approval cannot be approved

_Verified by: Cron expires approval after timeout, Expired approval cannot be approved_

**Emitted commands create real domain records**

**Invariant:** Auto-executed `SuggestCustomerOutreach` decisions must route
    to the real outreach handler, which creates an outreach task record and emits
    an `OutreachCreated` domain event.
    **Rationale:** Agent commands must produce observable business effects, not
    stop at command metadata.
    **Verified by:** SuggestCustomerOutreach creates outreach record and emits event

_Verified by: SuggestCustomerOutreach creates outreach record and emits event_

---

[← Back to Pattern Registry](../PATTERNS.md)
