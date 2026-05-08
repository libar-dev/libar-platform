# ✅ Event Store Durability

**Purpose:** Detailed documentation for the Event Store Durability pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Guaranteed event persistence patterns for Convex-native event sourcing.

### Patterns

- **Outbox Pattern** - Action results captured via onComplete mutation
- **Idempotent Append** - Event append with idempotency key check
- **Durable Append** - Failed appends retried via Workpool actions
- **Durable Publication** - Cross-context events with tracking and retry
- **Intent/Completion** - Long-running operations bracketed with events
- **Poison Events** - Malformed events quarantined after failures

### When to Use

- Importing the platform's durable event-persistence helpers from one place
- Combining outbox, retry, publication, and recovery patterns in application code
- Standardizing the event-store durability surface shared by sagas and projections

### Usage

```typescript
import {
  idempotentAppendEvent,
  createOutboxHandler,
  durableAppendEvent,
  createDurableEventPublisher,
  recordIntent,
  recordCompletion,
  withPoisonEventHandling,
} from "@libar-dev/platform-core/durability";
```

---

[← Back to Pattern Registry](../PATTERNS.md)
