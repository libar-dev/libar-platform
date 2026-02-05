# ✅ Correlation Chain System

**Purpose:** Detailed documentation for the Correlation Chain System pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Pattern   |
| Phase    | 9         |

## Description

Correlation types for tracking causal relationships in command-event flows.
Provides structured tracing via commandId, correlationId, and causationId.

### When to Use

- Tracking causal relationships between commands and events
- Idempotency via commandId in Command Bus
- Request tracing across BC boundaries via correlationId
- Deriving new correlation chains from parent events (PMs, Sagas)

---

[← Back to Pattern Registry](../PATTERNS.md)
