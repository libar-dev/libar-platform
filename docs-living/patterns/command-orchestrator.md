# ✅ Command Orchestrator

**Purpose:** Detailed documentation for the Command Orchestrator pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Core      |

## Description

The CommandOrchestrator encapsulates the 7-step dual-write + projection execution
pattern that is central to this DDD/ES/CQRS architecture.

### When to Use

- Every command handler uses this pattern
- Implementing new commands in a bounded context
- Understanding command execution flow and error handling

### Orchestration Steps

| Step | Action             | Component       | Purpose                    |
| ---- | ------------------ | --------------- | -------------------------- |
| 1    | Record command     | Command Bus     | Idempotency check          |
| 2    | Call handler       | Bounded Context | CMS update                 |
| 3    | Handle rejection   | -               | Early exit if invalid      |
| 4    | Append event       | Event Store     | Audit trail                |
| 5    | Trigger projection | Workpool        | Update read models         |
| 6    | Route saga         | Workflow        | Cross-context coordination |
| 7    | Update status      | Command Bus     | Final status               |

### Key Features

- **Idempotency**: Commands with same `commandId` return cached results
- **OCC Support**: Event Store version conflicts are detected and rejected
- **Dead Letter Support**: Failed projections are tracked via `onComplete`
- **Saga Routing**: Cross-context workflows triggered via Workpool

## Use Cases

- Executing commands with dual-write pattern
- Coordinating CMS update, event append, and projection trigger
- Ensuring command idempotency across retries

---

[← Back to Pattern Registry](../PATTERNS.md)
