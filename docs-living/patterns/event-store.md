# ✅ Event Store

**Purpose:** Detailed documentation for the Event Store pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Core      |

## Description

Central event storage component for Event Sourcing.

Type-safe client for the Convex Event Store component. Provides the foundation
for Event Sourcing with optimistic concurrency control (OCC) and global ordering.

### When to Use

- Appending events as part of dual-write pattern
- Reading event streams for projections
- Querying events by correlation ID for tracing

### Key Features

| Feature              | Description                                            |
| -------------------- | ------------------------------------------------------ |
| **OCC**              | Version-based conflict detection via `expectedVersion` |
| **Global Position**  | Monotonic ordering for projection checkpoints          |
| **Stream Isolation** | Events grouped by `streamType` + `streamId`            |
| **Correlation**      | Event tracing via `correlationId` chain                |

### Usage Pattern

The EventStore is used by the CommandOrchestrator to append events after
successful CMS updates (dual-write pattern). It's also used by projections
to read events for building read models.

## Use Cases

- Appending events after CMS updates
- Reading events for projection processing

---

[← Back to Pattern Registry](../PATTERNS.md)
