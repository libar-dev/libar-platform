# ✅ Command Bus

**Purpose:** Detailed documentation for the Command Bus pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Command   |

## Description

Type-safe client for the Convex Command Bus component providing infrastructure-level idempotency. Provides command
idempotency at the infrastructure layer, ensuring commands with the same
`commandId` are only executed once.

### When to Use

- Ensuring commands are only processed once
- Tracking command status (pending/executed/rejected/failed)
- Recording command-event correlations for audit trails

### Key Features

| Feature             | Description                                     |
| ------------------- | ----------------------------------------------- |
| **Idempotency**     | Duplicate commands return cached results        |
| **Status Tracking** | `pending` → `executed` / `rejected` / `failed`  |
| **Correlation**     | Commands linked via `correlationId` for tracing |
| **TTL Cleanup**     | Expired commands cleaned up periodically        |

### Command Flow

1. **recordCommand** - Check for duplicate, register if new
2. **Execute handler** - Process the business logic (in bounded context)
3. **updateCommandResult** - Record final status and result

This pattern ensures exactly-once semantics even with retries.

## Use Cases

- Ensuring command idempotency
- Tracking command execution status

---

[← Back to Pattern Registry](../PATTERNS.md)
