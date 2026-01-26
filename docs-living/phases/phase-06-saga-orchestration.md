# SagaOrchestration

**Purpose:** Detailed patterns for SagaOrchestration

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

### ✅ Saga Orchestration

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 4w        |

**Problem:** Cross-BC operations (e.g., Order -> Inventory -> Shipping) cannot
use atomic transactions because bounded contexts have isolated databases. Without
coordination infrastructure, partial failures leave the system in inconsistent states.

**Solution:** Sagas use @convex-dev/workflow for durable multi-step orchestration:

- Each step calls into a bounded context via the CommandOrchestrator
- Failures trigger compensation logic to rollback partial operations
- Saga idempotency prevents duplicate workflows from the same trigger event
- onComplete callback updates saga status external to the workflow

**Note:** This pattern was implemented before the delivery process existed
and is documented retroactively to provide context for IntegrationPatterns
and AgentAsBoundedContext phases.

#### Dependencies

- Depends on: CommandBusFoundation
- Depends on: BoundedContextFoundation

#### Acceptance Criteria

**Successful cross-context coordination**

- Given an OrderSubmitted event for order "ord-123"
- When the Order Fulfillment saga processes the event
- Then it calls Inventory BC to reserve stock
- And on success, it confirms the order
- And the saga completes with status "completed"

**Compensation on step failure**

- Given an OrderSubmitted event for order "ord-456"
- When the Inventory BC rejects the reservation (insufficient stock)
- Then the saga executes compensation
- And the order is cancelled
- And the saga completes with status "compensated"

**First trigger starts saga**

- Given no saga exists for order "ord-789"
- When startSagaIfNotExists is called with sagaId "ord-789"
- Then a new saga record is created with status "pending"
- And the workflow is started
- And the result indicates isNew = true

**Duplicate trigger returns existing saga**

- Given a saga exists for order "ord-789" with status "pending"
- When startSagaIfNotExists is called with sagaId "ord-789" again
- Then no new saga is created
- And the existing saga info is returned
- And the result indicates isNew = false

#### Business Rules

**Sagas orchestrate operations across multiple bounded contexts**

When a business process spans multiple bounded contexts (e.g., Orders,
Inventory, Shipping), a Saga coordinates the steps:

    1. Receive trigger event (e.g., OrderSubmitted)
    2. Call Inventory BC to reserve stock
    3. On success: Confirm reservation and update order
    4. On failure: Execute compensation (cancel order)

    Each step uses the CommandOrchestrator to maintain dual-write semantics
    within the target bounded context.

_Verified by: Successful cross-context coordination, Compensation on step failure_

**@convex-dev/workflow provides durability across server restarts**

Sagas use Convex Workflow for durable execution: - Workflow state is persisted automatically - Server restarts resume from the last completed step - External events (awaitEvent) allow pausing for external input

    This durability is critical for long-running processes that may span
    minutes or hours (e.g., waiting for payment confirmation).

**Compensation reverses partial operations on failure**

If step N fails after steps 1..N-1 succeeded, compensation logic
must undo the effects of the completed steps:

    | Step | Success Action | Compensation |
    | Reserve inventory | Stock reserved | Release reservation |
    | Charge payment | Payment captured | Refund payment |
    | Update order | Order confirmed | Cancel order |

    Compensation runs in reverse order of the original steps.

**Saga idempotency prevents duplicate workflows via sagaId**

Each saga has a unique sagaId (typically the entity ID triggering it).
The registry checks for existing sagas before starting:

    - If saga exists: Return existing saga info, do not start duplicate
    - If new: Create saga record, start workflow

    This ensures network retries and event redelivery don't create
    multiple workflows for the same business operation.

_Verified by: First trigger starts saga, Duplicate trigger returns existing saga_

**Saga status is updated via onComplete callback, not inside workflow**

The workflow's onComplete handler updates the saga's status in the
sagas table. This separation ensures:

    - Workflow code remains pure (no database access)
    - Status updates are atomic with workflow completion
    - Failed status updates can be retried independently

    Status values: pending -> running -> completed | failed | compensating

---

[← Back to Roadmap](../ROADMAP.md)
