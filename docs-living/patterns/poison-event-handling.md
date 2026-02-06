# ✅ Poison Event Handling

**Purpose:** Detailed documentation for the Poison Event Handling pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Events that cause projection processing failures are tracked; after N
failures, they are quarantined and skipped to prevent infinite retry loops.

### Why Poison Event Handling?

A single malformed event should not block all downstream projections
indefinitely. Quarantine allows progress while alerting operators for
manual investigation.

### Poison Event Flow

| Attempt | Action                                             |
| ------- | -------------------------------------------------- |
| 1       | Process event, catch error, record attempt         |
| 2       | Retry with backoff, catch error, record attempt    |
| 3       | Quarantine event, skip in future processing, alert |

### Recovery

Quarantined events can be:

- Manually fixed and reprocessed after code fix deployed
- Permanently ignored if event data is invalid
- Used to generate compensating events

### Usage

```typescript
// In projection processor
const handler = withPoisonEventHandling(
  async (ctx, event) => {
    // Projection logic that might fail
    await processOrderEvent(ctx, event);
  },
  { projectionName: "orderSummary", maxAttempts: 3 }
);

// Will automatically track failures and quarantine
await handler(ctx, event);
```

## Use Cases

- When projection processing must not be blocked by malformed events

---

[← Back to Pattern Registry](../PATTERNS.md)
