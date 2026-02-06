# ✅ Event Bus Abstraction

**Purpose:** Detailed documentation for the Event Bus Abstraction pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |
| Phase    | 9              |

## Description

Durable event pub/sub using Workpool for parallelism, retries, and dead letter handling.
Publishes domain events to matching subscriptions with priority-based ordering.

### When to Use

- Publishing domain events to multiple subscribers via Workpool
- Priority-based subscription ordering for event handlers
- Building projections, process managers, or sagas that react to events

---

[← Back to Pattern Registry](../PATTERNS.md)
