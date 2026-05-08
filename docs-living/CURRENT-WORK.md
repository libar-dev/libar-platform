# Current Work

**Purpose:** Active development work currently in progress
**Detail Level:** Phase summaries with links to details

---

## Summary

**Overall Progress:** [████████████░░░░░░░░] 90/152 (59%)

| Metric         | Value |
| -------------- | ----- |
| Total Patterns | 152   |
| Completed      | 90    |
| Active         | 10    |
| Planned        | 52    |
| Active Phases  | 3     |

---

## Active Phases

### 🚧 ProjectionCategoriesExecutableTests

[░░░░░░░░░░░░░░░] 0/3 0% complete (0 done, 3 active)

| Pattern                                   | Description                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 🚧 Projection Categories Executable Tests | As a platform developer I want projections classified into four distinct categories So that I can route queries and... |
| 🚧 Projection Categories Executable Tests | As a platform developer I want projections to require explicit category declaration So that all projections have...    |
| 🚧 Projection Categories Executable Tests | As a platform developer I want to query projections by category from the registry So that I can target specific...     |

[View ProjectionCategoriesExecutableTests details →](current/phase-15-projection-categories-executable-tests.md)

---

### 🚧 Agent as Bounded Context - AI-Driven Event Reactors

[███░░░░░░░░░░░░] 1/6 17% complete (1 done, 4 active, 1 planned)

| Pattern                                                | Description                                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 🚧 Agent as Bounded Context - AI-Driven Event Reactors | Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to domain events via EventBus and emit... |
| 🚧 Agent BC Component Isolation                        | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...             |
| 🚧 Agent LLM Integration                               | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.        |
| 🚧 Confirmed Order Cancellation                        | Problem: The Order FSM treats `confirmed` as terminal.                                                                |

#### Deliverables

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
- 📋 Agent action handler factory
- 📋 LLM-integrated onComplete handler
- 📋 Rate limiter integration
- 📋 Cost budget tracking
- 📋 @convex-dev/agent thread adapter
- 📋 onComplete in CreateAgentSubscriptionOptions
- 📋 Circuit breaker for LLM
- 📋 Agent workpool configuration
- 📋 Action/mutation integration test
- ✅ Order FSM confirmed->cancelled transition
- ✅ CancelOrder decider remove confirmed rejection
- ✅ ReservationReleaseOnOrderCancel PM
- ✅ PM subscription registration
- ✅ order-evolve.feature update
- ✅ cancel-order.decider.feature update
- ✅ cancel-order.feature (behavior) update
- ✅ cancel-order.feature (integration) update

[View Agent as Bounded Context - AI-Driven Event Reactors details →](current/phase-22-agent-as-bounded-context-ai-driven-event-reactors.md)

---

### 🚧 CodecDrivenReferenceGeneration

[████░░░░░░░░░░░] 1/4 25% complete (1 done, 1 active, 2 planned)

| Pattern                 | Description                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| 🚧 Process Enhancements | Vision: Transform the delivery process from a documentation tool into a delivery operating system. |

[View CodecDrivenReferenceGeneration details →](current/phase-100-codec-driven-reference-generation.md)

---

## All Active Patterns

| Pattern                                                | Phase     | Effort | Description                                                                                                            |
| ------------------------------------------------------ | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 🚧 Projection Categories Executable Tests              | Phase 15  | -      | As a platform developer I want projections classified into four distinct categories So that I can route queries and... |
| 🚧 Projection Categories Executable Tests              | Phase 15  | -      | As a platform developer I want projections to require explicit category declaration So that all projections have...    |
| 🚧 Projection Categories Executable Tests              | Phase 15  | -      | As a platform developer I want to query projections by category from the registry So that I can target specific...     |
| 🚧 Agent as Bounded Context - AI-Driven Event Reactors | Phase 22  | -      | Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to domain events via EventBus and emit...  |
| 🚧 Agent BC Component Isolation                        | Phase 22  | 1w     | Problem: Agent BC tables (`agentCheckpoints`, `agentAuditEvents`, `agentDeadLetters`, `agentCommands`,...              |
| 🚧 Agent LLM Integration                               | Phase 22  | 1w     | Problem: The agent event handler (`handleChurnRiskEvent`) is a Convex mutation that cannot call external APIs.         |
| 🚧 Confirmed Order Cancellation                        | Phase 22  | 2d     | Problem: The Order FSM treats `confirmed` as terminal.                                                                 |
| 🚧 Process Enhancements                                | Phase 100 | 4w     | Vision: Transform the delivery process from a documentation tool into a delivery operating system.                     |
| 🚧 Command Config Partition Key Validation             | -         | -      | Validates that all projection configurations in a command config have explicit partition keys defined.                 |
| 🚧 DCB Retry Execution                                 | -         | -      | DCB Retry Execution — reference implementation for integrating withDCBRetry into command handlers.                     |

---
