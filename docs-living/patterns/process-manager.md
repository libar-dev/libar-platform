# ✅ Process Manager

**Purpose:** Detailed documentation for the Process Manager pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Core      |

## Description

Process Manager module for event-reactive coordination.

Process Managers react to events and emit commands.
They are distinct from:

- **Sagas**: Multi-step orchestration with compensation logic
- **Projections**: Events → Read model updates

### When to Use

- Event → Command reactions without orchestration state
- Fire-and-forget command emission (no compensation needed)
- Time-triggered or hybrid event/time coordination patterns
- **Avoid when:** You need compensation logic (use Sagas instead)

### Key Characteristics

| Aspect           | Process Manager             | Saga                |
| ---------------- | --------------------------- | ------------------- |
| **State**        | Minimal (position + custom) | Full workflow state |
| **Compensation** | None                        | Yes                 |
| **Trigger**      | Event, Time, or Hybrid      | Event only          |
| **Pattern**      | Fire-and-forget             | Orchestrated        |

### Components

- **Lifecycle FSM**: State transitions for PM instances
- **Registry**: Registration and lookup by trigger event
- **Checkpoint**: Idempotency via position tracking
- **Executor**: Runtime execution with storage callbacks
- **EventBus Subscription**: Integration with EventBus

## Use Cases

- Event-reactive coordination without orchestration
- Fire-and-forget command emission from events
- Time-triggered or hybrid event/time patterns

---

[← Back to Pattern Registry](../PATTERNS.md)
