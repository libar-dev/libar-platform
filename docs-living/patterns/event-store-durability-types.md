# ✅ Event Store Durability Types

**Purpose:** Detailed documentation for the Event Store Durability Types pattern

---

## Overview

| Property | Value          |
| -------- | -------------- |
| Status   | completed      |
| Category | Event Sourcing |

## Description

Core types for durable event persistence patterns:

- Outbox pattern for action result capture
- Idempotent event append
- Durable cross-context publication
- Intent/completion bracketing
- Poison event handling

### When to Use

Import these types when implementing any durability pattern. They provide
the shared vocabulary for event append operations, outbox handling,
cross-context publication, and failure recovery.

---

[← Back to Pattern Registry](../PATTERNS.md)
