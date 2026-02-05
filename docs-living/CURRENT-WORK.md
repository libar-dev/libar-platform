# Current Work

**Purpose:** Active development work currently in progress
**Detail Level:** Phase summaries with links to details

---

## Summary

**Overall Progress:** [█████████████████░░░] 53/62 (85%)

| Metric         | Value |
| -------------- | ----- |
| Total Patterns | 62    |
| Completed      | 53    |
| Active         | 2     |
| Planned        | 7     |
| Active Phases  | 1     |

---

## Active Phases

### 🚧 ConfirmedOrderCancellation

[████████░░░░░░░] 1/2 50% complete (1 done, 1 active)

| Pattern                         | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| 🚧 Confirmed Order Cancellation | Problem: The Order FSM treats `confirmed` as terminal. |

#### Deliverables

- 📋 Order FSM confirmed->cancelled transition
- 📋 CancelOrder decider remove confirmed rejection
- 📋 ReservationReleaseOnOrderCancel PM
- 📋 PM subscription registration
- 📋 order-evolve.feature update
- 📋 cancel-order.decider.feature update
- 📋 cancel-order.feature (behavior) update
- 📋 cancel-order.feature (integration) update

[View ConfirmedOrderCancellation details →](current/phase-22-confirmed-order-cancellation.md)

---

## All Active Patterns

| Pattern                                    | Phase    | Effort | Description                                                                                            |
| ------------------------------------------ | -------- | ------ | ------------------------------------------------------------------------------------------------------ |
| 🚧 Confirmed Order Cancellation            | Phase 22 | 2d     | Problem: The Order FSM treats `confirmed` as terminal.                                                 |
| 🚧 Command Config Partition Key Validation | -        | -      | Validates that all projection configurations in a command config have explicit partition keys defined. |

---
