# Current Work

**Purpose:** Active development work currently in progress
**Detail Level:** Phase summaries with links to details

---

## Summary

**Overall Progress:** [████████████░░░░░░░░] 60/97 (62%)

| Metric         | Value |
| -------------- | ----- |
| Total Patterns | 97    |
| Completed      | 60    |
| Active         | 5     |
| Planned        | 32    |
| Active Phases  | 2     |

---

## Active Phases

### 🚧 AgentChurnRiskCompletion

[████████░░░░░░░] 3/6 50% complete (3 done, 3 active)

| Pattern                         | Description                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 🚧 Agent BC Component Isolation | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...      |
| 🚧 Agent LLM Integration        | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs. |
| 🚧 Confirmed Order Cancellation | Problem: The Order FSM treats `confirmed` as terminal.                                                         |

#### Deliverables

- ✅ Order FSM confirmed->cancelled transition
- ✅ CancelOrder decider remove confirmed rejection
- ✅ ReservationReleaseOnOrderCancel PM
- ✅ PM subscription registration
- ✅ order-evolve.feature update
- ✅ cancel-order.decider.feature update
- ✅ cancel-order.feature (behavior) update
- ✅ cancel-order.feature (integration) update
- 📋 Agent action handler factory
- 📋 LLM-integrated onComplete handler
- 📋 Rate limiter integration
- 📋 Cost budget tracking
- 📋 @convex-dev/agent thread adapter
- 📋 onComplete in CreateAgentSubscriptionOptions
- 📋 Circuit breaker for LLM
- 📋 Agent workpool configuration
- 📋 Action/mutation integration test
- 📋 Agent component definition
- 📋 Agent component schema
- 📋 Checkpoint public API
- 📋 Audit public API
- 📋 Dead letter public API
- 📋 Command public API
- 📋 Approval public API
- 📋 Cross-component query pattern
- ✅ Design session methodology
- ✅ Argument injection pattern

[View AgentChurnRiskCompletion details →](current/phase-22-agent-churn-risk-completion.md)

---

### 🚧 ThemedDecisionArchitecture

[████████░░░░░░░] 3/6 50% complete (3 done, 1 active, 2 planned)

| Pattern                 | Description                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| 🚧 Process Enhancements | Vision: Transform the delivery process from a documentation tool into a delivery operating system. |

[View ThemedDecisionArchitecture details →](current/phase-100-themed-decision-architecture.md)

---

## All Active Patterns

| Pattern                                    | Phase     | Effort | Description                                                                                                    |
| ------------------------------------------ | --------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 🚧 Agent BC Component Isolation            | Phase 22  | 1w     | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...      |
| 🚧 Agent LLM Integration                   | Phase 22  | 1w     | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs. |
| 🚧 Confirmed Order Cancellation            | Phase 22  | 2d     | Problem: The Order FSM treats `confirmed` as terminal.                                                         |
| 🚧 Process Enhancements                    | Phase 100 | 4w     | Vision: Transform the delivery process from a documentation tool into a delivery operating system.             |
| 🚧 Command Config Partition Key Validation | -         | -      | Validates that all projection configurations in a command config have explicit partition keys defined.         |

---
