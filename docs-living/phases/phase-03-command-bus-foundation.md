# CommandBusFoundation

**Purpose:** Detailed patterns for CommandBusFoundation

---

## Summary

**Progress:** [████████████████████] 1/1 (100%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 1     |
| 🚧 Active    | 0     |
| 📋 Planned   | 0     |
| **Total**    | 1     |

---

## ✅ Completed Patterns

### ✅ Command Bus Foundation

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 3w        |

**Problem:** Command execution requires idempotency (same command = same result),
status tracking, and a standardized flow from receipt through execution. Without
infrastructure-level idempotency, duplicate requests could corrupt domain state.

**Solution:** The Command Bus component provides:

- Infrastructure-level idempotency via commandId deduplication
- Status lifecycle tracking (pending -> executed | rejected | failed)
- The 7-step CommandOrchestrator pattern for dual-write execution
- Correlation tracking via correlationId for distributed tracing
- TTL-based cleanup of expired command records

**Note:** This pattern was implemented before the delivery process existed
and is documented retroactively to provide context for IntegrationPatterns
and AgentAsBoundedContext phases.

#### Dependencies

- Depends on: EventStoreFoundation

#### Acceptance Criteria

**First command execution is recorded**

- Given no command exists with id "cmd-123"
- When recording command "cmd-123" of type "CreateOrder"
- Then the command is recorded with status "pending"
- And the response indicates isNew = true

**Duplicate command returns cached result**

- Given command "cmd-123" exists with status "executed" and result "success"
- When recording command "cmd-123" again
- Then the response indicates isNew = false
- And the cached result is returned

**Successful command transitions to executed**

- Given a command in "pending" status
- When the command handler returns success
- Then the status becomes "executed"
- And the result contains success data

**Business rejection transitions to rejected**

- Given a command in "pending" status
- When the command handler returns rejected with code "INVALID_STATUS"
- Then the status becomes "rejected"
- And the result contains the rejection code

**Unexpected error transitions to failed**

- Given a command in "pending" status
- When the command handler throws an unexpected error
- Then the status becomes "failed"
- And the result contains error details

#### Business Rules

**Commands are idempotent via commandId deduplication**

Every command has a unique commandId. When a command is recorded, the
Command Bus checks if that commandId already exists: - If new: Record command with status "pending", proceed to execution - If duplicate: Return cached result without re-execution

    This ensures retries are safe - network failures don't cause duplicate
    domain state changes.

_Verified by: First command execution is recorded, Duplicate command returns cached result_

**Status tracks the complete command lifecycle**

Commands progress through well-defined states: - **pending**: Command received, execution in progress - **executed**: Command succeeded, event(s) emitted - **rejected**: Business rule violation, no event emitted - **failed**: Unexpected error during execution

    The status is updated atomically with the command result, ensuring
    consistent state even under concurrent access.

_Verified by: Successful command transitions to executed, Business rejection transitions to rejected, Unexpected error transitions to failed_

**The CommandOrchestrator is the only command execution path**

Every command in the system flows through the same 7-step orchestration:

    | Step | Action | Component | Purpose |
    | 1 | Record command | Command Bus | Idempotency check |
    | 2 | Middleware | - | Auth, logging, validation |
    | 3 | Call handler | Bounded Context | CMS update via Decider |
    | 4 | Handle rejection | - | Early exit if business rule violated |
    | 5 | Append event | Event Store | Audit trail |
    | 6 | Trigger projection | Workpool | Update read models |
    | 7 | Update status | Command Bus | Final status + result |

    This standardized flow ensures:
    - Consistent dual-write semantics (CMS + Event in same transaction)
    - Automatic projection triggering
    - Consistent error handling and status reporting

**correlationId links commands, events, and projections**

Every command carries a correlationId that flows through the entire
execution path: - Command -> Handler -> Event metadata -> Projection processing - Enables tracing a user action through all system components - Supports debugging and audit trail reconstruction

    The commandEventCorrelations table tracks which events were produced
    by each command, enabling forward (command -> events) lookups.

**Middleware provides composable cross-cutting concerns**

The CommandOrchestrator supports a middleware pipeline that wraps
command execution with before/after hooks:

    - **Validation middleware**: Schema validation before handler
    - **Authorization middleware**: Permission checks
    - **Logging middleware**: Structured command logging
    - **Rate limiting**: Throttling by user/context

    Middleware executes in registration order, with early exit on failure.
    This separates infrastructure concerns from domain logic.

---

[← Back to Roadmap](../ROADMAP.md)
