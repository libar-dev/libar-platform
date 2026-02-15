# 🚧 Agent as Bounded Context - AI-Driven Event Reactors

**Purpose:** Detailed documentation for the Agent as Bounded Context - AI-Driven Event Reactors pattern

---

## Overview

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Category | DDD    |
| Phase    | 22     |

## Description

Demonstrates the Agent as Bounded Context pattern where AI agents subscribe to
domain events via EventBus and emit commands based on pattern detection.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EventBus                                      │
│  (publishes OrderCancelled, OrderRefunded, OrderComplaintFiled, etc.)  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ subscribe
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Agent BC (Churn Risk)                             │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│ │   Checkpoint    │ │     Pattern     │ │     Config      │            │
│ │   (Position)    │ │   (Detection)   │ │  (Subscriptions)│            │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘            │
│           │                   │                   │                    │
│           └───────────────────┼───────────────────┘                    │
│                               ▼                                        │
│ ┌───────────────────────────────────────────────────────────────────┐  │
│ │                     Event Handler                                 │  │
│ │  1. Load checkpoint (idempotency)                                 │  │
│ │  2. Load event history (pattern window)                           │  │
│ │  3. Evaluate pattern trigger                                      │  │
│ │  4. Make decision (rule-based or LLM)                             │  │
│ │  5. Emit command (with explainability)                            │  │
│ │  6. Update checkpoint                                             │  │
│ └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ emit command
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Command Bus                                   │
│              (routes SuggestCustomerOutreach, etc.)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

- **Agent BC**: AI agent treated as a first-class bounded context
- **Pattern Detection**: Rules + optional LLM for complex patterns
- **Autonomous Commands**: Agent emits commands with full explainability
- **Human-in-Loop**: Configurable approval workflow for low-confidence decisions
- **Checkpoint Pattern**: Position tracking for exactly-once semantics

### Example: Churn Risk Detection

This example implements a churn risk agent that:

1. Subscribes to OrderCancelled events via EventBus
2. Tracks cancellation patterns per customer (30-day window)
3. Detects churn risk when a customer cancels 3+ orders
4. Emits SuggestCustomerOutreach command with confidence score

## Dependencies

- Depends on: IntegrationPatterns
- Depends on: ReactiveProjections

---

[← Back to Pattern Registry](../PATTERNS.md)
