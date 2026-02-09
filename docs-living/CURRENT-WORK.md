# Current Work

**Purpose:** Active development work currently in progress
**Detail Level:** Phase summaries with links to details

---

## Summary

**Overall Progress:** [███████████████░░░░░] 57/75 (76%)

| Metric         | Value |
| -------------- | ----- |
| Total Patterns | 75    |
| Completed      | 57    |
| Active         | 3     |
| Planned        | 15    |
| Active Phases  | 2     |

---

## Active Phases

### 🚧 AgentChurnRiskCompletion

[██░░░░░░░░░░░░░] 1/7 14% complete (1 done, 1 active, 5 planned)

| Pattern                         | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| 🚧 Confirmed Order Cancellation | Problem: The Order FSM treats `confirmed` as terminal. |

#### Deliverables

- ✅ Order FSM confirmed->cancelled transition
- ✅ CancelOrder decider remove confirmed rejection
- ✅ ReservationReleaseOnOrderCancel PM
- ✅ PM subscription registration
- ✅ order-evolve.feature update
- ✅ cancel-order.decider.feature update
- ✅ cancel-order.feature (behavior) update
- ✅ cancel-order.feature (integration) update

[View AgentChurnRiskCompletion details →](current/phase-22-agent-churn-risk-completion.md)

---

### 🚧 ThemedDecisionArchitecture

[█████░░░░░░░░░░] 2/6 33% complete (2 done, 1 active, 3 planned)

| Pattern                 | Description                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| 🚧 Process Enhancements | Vision: Transform the delivery process from a documentation tool into a delivery operating system. |

[View ThemedDecisionArchitecture details →](current/phase-100-themed-decision-architecture.md)

---

## All Active Patterns

| Pattern                                    | Phase     | Effort | Description                                                                                            |
| ------------------------------------------ | --------- | ------ | ------------------------------------------------------------------------------------------------------ |
| 🚧 Confirmed Order Cancellation            | Phase 22  | 2d     | Problem: The Order FSM treats `confirmed` as terminal.                                                 |
| 🚧 Process Enhancements                    | Phase 100 | 4w     | Vision: Transform the delivery process from a documentation tool into a delivery operating system.     |
| 🚧 Command Config Partition Key Validation | -         | -      | Validates that all projection configurations in a command config have explicit partition keys defined. |

---
