# ✅ Handler Factories

**Purpose:** Detailed documentation for the Handler Factories pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | Pattern   |
| Phase    | 14        |

## Description

The **Decider** pattern separates pure business logic from infrastructure concerns,
enabling unit testing without database dependencies.

### When to Use

- Command validation requires complex business rules
- You want property-based testing of domain invariants
- Multiple handlers share similar decision logic
- Decoupling domain logic from Convex mutation context

### Core Types

| Type              | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `DeciderOutput`   | Union of success, rejected, or failed                   |
| `DeciderSuccess`  | Successful decision with event and state update         |
| `DeciderRejected` | Validation failure, no event emitted                    |
| `DeciderFailed`   | Business failure WITH event (e.g., `ReservationFailed`) |
| `DeciderContext`  | Timestamp, commandId, correlationId                     |

### Helper Functions

| Function       | Returns           | Purpose                           |
| -------------- | ----------------- | --------------------------------- |
| `success()`    | `DeciderSuccess`  | Build successful output           |
| `rejected()`   | `DeciderRejected` | Build validation failure          |
| `failed()`     | `DeciderFailed`   | Build business failure with event |
| `isSuccess()`  | `boolean`         | Type guard for success            |
| `isRejected()` | `boolean`         | Type guard for rejection          |
| `isFailed()`   | `boolean`         | Type guard for failure            |

### Decider vs Handler

| Concern      | Decider (**Pure**) | Handler (Effectful)        |
| ------------ | ------------------ | -------------------------- |
| I/O          | None               | Load CMS, persist, enqueue |
| Testability  | Unit tests         | Integration tests          |
| Side effects | Never              | Always                     |
| Returns      | `DeciderOutput`    | `CommandHandlerResult`     |

### Relationship to Other Patterns

- Uses **FSM** for state transition validation
- Wrapped by **createDeciderHandler** factory
- Called by **CommandOrchestrator** through handlers

---

[← Back to Pattern Registry](../PATTERNS.md)
