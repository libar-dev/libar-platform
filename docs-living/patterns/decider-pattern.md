# ✅ Decider Pattern

**Purpose:** Detailed documentation for the Decider Pattern pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | DDD       |
| Phase    | 14        |

## Description

**Problem:** Domain logic embedded in handlers makes testing require infrastructure.
Mutable aggregates complicate state management and prevent property-based testing.

**Solution:** The Decider pattern separates domain logic into pure functions:

- `decide(state, command) -> events[]` — Determines what should happen
- `evolve(state, event) -> state` — Applies the change

This eliminates mutable aggregates and enables testing without Docker.

**Executable Specs:** Detailed behavior tests live at the package level per PDR-007.
See `@libar-docs-executable-specs` tag for locations.

## Dependencies

- Depends on: platform-fsm

## Business Rules

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

[← Back to Pattern Registry](../PATTERNS.md)
