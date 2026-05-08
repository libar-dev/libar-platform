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

- Implementing any platform durability helper or app-side durable handler
- Sharing a common type vocabulary for event append, publication, and recovery flows
- Typing retry-safe interfaces passed between platform-core and mounted components

---

[← Back to Pattern Registry](../PATTERNS.md)
