# ✅ Saga Orchestration Executable Tests

**Purpose:** Detailed requirements for the Saga Orchestration Executable Tests feature

---

## Overview

| Property     | Value     |
| ------------ | --------- |
| Status       | completed |
| Product Area | Platform  |

## Description

**Provenance:** This file was authored under the refactoring carve-out
  to expose SagaOrchestration in the PatternGraph. The pattern was originally
  implemented before the `@architect-implements:` convention. Rule
  invariants and rationales below are transferred verbatim from
  `libar-platform/architect/specs/platform/saga-orchestration.feature`.
  The reference saga implementation lives in
  `examples/order-management/convex/sagas/`; this file's scenarios are
  shape-only stubs at file-creation time.

  **Transitional status:** This carrier is graph-continuity scaffolding,
  not runnable coverage yet. Every scenario below is intentionally tagged
  `@stub` until backlog item `T5-009` wires the order-management harness
  and step definitions. Backlog item `T5-010` expands the current
  transfer set with compensation, concurrency, and edge-case coverage
  once wiring is real.

## Acceptance Criteria

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

**Workflow resumes from the last completed step after restart**

- Given a saga workflow that has completed step 1 and is mid-step 2
- When the server restarts
- Then the workflow resumes at step 2 without re-running step 1

**Compensation executes in reverse order of completed steps**

- Given a saga that completed steps 1 and 2 then failed at step 3
- When compensation runs
- Then step 2's compensation runs before step 1's compensation

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

**onComplete updates saga status after workflow finishes**

- Given a saga workflow that completes successfully
- When the onComplete callback runs
- Then the sagas table row transitions to status "completed"

## Business Rules

**Sagas orchestrate operations across multiple bounded contexts**

**Invariant:** Each saga step uses the CommandOrchestrator for dual-write semantics within target BC.

    **Rationale:** Cross-BC operations cannot use atomic transactions
    because bounded contexts have isolated databases. Routing each step
    through the CommandOrchestrator preserves dual-write semantics
    within the target context while the saga coordinates the overall
    process.

    **Verified by:** Successful cross-context coordination, Compensation on step failure

_Verified by: Successful cross-context coordination, Compensation on step failure_

**@convex-dev/workflow provides durability across server restarts**

**Invariant:** Workflow state persists automatically — server restarts resume from last completed step.

    **Rationale:** Long-running cross-BC processes can span minutes or
    hours (e.g., waiting for payment confirmation). Convex Workflow
    persists step boundaries automatically so a server restart does not
    cause re-execution of already-completed steps.

    **Verified by:** Workflow resumes from the last completed step after restart

_Verified by: Workflow resumes from the last completed step after restart_

**Compensation reverses partial operations on failure**

**Invariant:** Compensation runs in reverse order of completed steps on failure.

    **Rationale:** If step N fails after steps 1..N-1 succeeded,
    compensation logic must undo the effects of completed steps in
    reverse order. This preserves consistency across BCs without
    requiring distributed transactions.

    **Verified by:** Compensation executes in reverse order of completed steps

_Verified by: Compensation executes in reverse order of completed steps_

**Saga idempotency prevents duplicate workflows via sagaId**

**Invariant:** Same sagaId never starts duplicate workflows — registry returns existing info.

    **Rationale:** Network retries and event redelivery must not create
    multiple workflows for the same business operation. The registry
    checks for existing sagas before starting a new workflow.

    **Verified by:** First trigger starts saga, Duplicate trigger returns existing saga

_Verified by: First trigger starts saga, Duplicate trigger returns existing saga_

**Saga status is updated via onComplete callback, not inside workflow**

**Invariant:** Workflow code has no database access — status updates are external via onComplete.

    **Rationale:** Keeping the workflow body pure (no database access)
    ensures status updates are atomic with workflow completion and that
    failed status updates can be retried independently from the
    workflow itself.

    **Verified by:** onComplete updates saga status after workflow finishes

_Verified by: onComplete updates saga status after workflow finishes_

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
