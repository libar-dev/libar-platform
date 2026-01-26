# HandlerFactories

**Purpose:** Detailed patterns for HandlerFactories

---

## Summary

**Progress:** [████████████████████] 2/2 (100%)

| Status       | Count |
| ------------ | ----- |
| ✅ Completed | 2     |
| 🚧 Active    | 0     |
| 📋 Planned   | 0     |
| **Total**    | 2     |

---

## ✅ Completed Patterns

### ✅ Decider Pattern

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Effort   | 4w        |

**Problem:** Domain logic embedded in handlers makes testing require infrastructure.
Mutable aggregates complicate state management and prevent property-based testing.

**Solution:** The Decider pattern separates domain logic into pure functions:

- `decide(state, command) -> events[]` — Determines what should happen
- `evolve(state, event) -> state` — Applies the change

This eliminates mutable aggregates and enables testing without Docker.

**Executable Specs:** Detailed behavior tests live at the package level per PDR-007.
See `@libar-docs-executable-specs` tag for locations.

#### Dependencies

- Depends on: platform-fsm

#### Business Rules

**Deciders must be pure functions**

Pure functions have no I/O, no ctx access, no side effects.
They receive state and command, return events or rejection.

    **Executable tests:** platform-decider/tests/features/behavior/decider-outputs.feature

**DeciderOutput encodes three outcomes**

- **Success:** Command executed, event emitted, state updated
  - **Rejected:** Business rule violation, no event, clear error code
  - **Failed:** Unexpected failure, audit event, context preserved

  **Executable tests:** platform-decider/tests/features/behavior/decider-outputs.feature
  - Scenarios covering success, rejected, failed outputs
  - Type guard tests (isSuccess, isRejected, isFailed)
  - Edge cases for mutually exclusive outcomes

**FSM enforces valid state transitions**

State machines prevent invalid transitions at runtime with clear errors.
Terminal states (confirmed, cancelled) have no outgoing transitions.

    **Executable tests:** platform-fsm/tests/features/behavior/fsm-transitions.feature
    - Scenarios covering valid/invalid transitions
    - Terminal state detection
    - Error messages with allowed transitions

**Evolve functions use event payload as source of truth**

Evolve must not recalculate values - events are immutable source of truth.
Same event + same state = same result (deterministic).

**Handler factories wrap deciders with infrastructure**

- `createDeciderHandler()` for modifications (loads existing state)
  - `createEntityDeciderHandler()` for creation (handles null state)

---

### ✅ Handler Factories

| Property | Value     |
| -------- | --------- |
| Status   | completed |

## Handler Factories - Decider-to-Handler Wrappers

## Decider Pattern - Pure Domain Decision Logic

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

[← Back to Roadmap](../ROADMAP.md)
