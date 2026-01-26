@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:DeciderPattern
@libar-docs-status:completed
@libar-docs-phase:14
@libar-docs-effort:4w
@libar-docs-completed:2026-01-08
@libar-docs-product-area:Platform
@libar-docs-executable-specs:platform-decider/tests/features/behavior,platform-fsm/tests/features/behavior
@libar-docs-depends-on:platform-fsm
@libar-docs-unlock-reason:initial-completion
Feature: Decider Pattern - Pure Domain Logic Extraction

  **Problem:** Domain logic embedded in handlers makes testing require infrastructure.
  Mutable aggregates complicate state management and prevent property-based testing.

  **Solution:** The Decider pattern separates domain logic into pure functions:
  - `decide(state, command) -> events[]` — Determines what should happen
  - `evolve(state, event) -> state` — Applies the change

  This eliminates mutable aggregates and enables testing without Docker.

  **Executable Specs:** Detailed behavior tests live at the package level per PDR-007.
  See `@libar-docs-executable-specs` tag for locations.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Executable Spec |
      | Decider types (Decider<S,C,E>) | complete | @libar-dev/platform-decider/src/types.ts | - |
      | DeciderOutput helpers | complete | @libar-dev/platform-decider/src/types.ts | decider-outputs.feature |
      | FSM types (FSMDefinition, FSM) | complete | @libar-dev/platform-fsm/src/types.ts | - |
      | defineFSM() factory | complete | @libar-dev/platform-fsm/src/defineFSM.ts | fsm-transitions.feature |
      | canTransition(), assertTransition() | complete | @libar-dev/platform-fsm/src/operations.ts | fsm-transitions.feature |
      | OrderFSM extraction | complete | examples/order-management/orders/domain/orderFSM.ts | - |
      | Pure decider functions (6 deciders) | complete | examples/order-management/orders/domain/deciders/ | - |
      | createDeciderHandler() factory | complete | @libar-dev/platform-decider/src/factory.ts | - |
      | createEntityDeciderHandler() factory | complete | @libar-dev/platform-decider/src/factory.ts | - |
      | BDD tests | complete | examples/order-management/tests/features/ | - |

  # =============================================================================
  # RULES: High-level descriptions (detailed scenarios in package specs)
  # =============================================================================

  Rule: Deciders must be pure functions
    Pure functions have no I/O, no ctx access, no side effects.
    They receive state and command, return events or rejection.

    **Executable tests:** platform-decider/tests/features/behavior/decider-outputs.feature

  Rule: DeciderOutput encodes three outcomes
    - **Success:** Command executed, event emitted, state updated
    - **Rejected:** Business rule violation, no event, clear error code
    - **Failed:** Unexpected failure, audit event, context preserved

    **Executable tests:** platform-decider/tests/features/behavior/decider-outputs.feature
    - Scenarios covering success, rejected, failed outputs
    - Type guard tests (isSuccess, isRejected, isFailed)
    - Edge cases for mutually exclusive outcomes

  Rule: FSM enforces valid state transitions
    State machines prevent invalid transitions at runtime with clear errors.
    Terminal states (confirmed, cancelled) have no outgoing transitions.

    **Executable tests:** platform-fsm/tests/features/behavior/fsm-transitions.feature
    - Scenarios covering valid/invalid transitions
    - Terminal state detection
    - Error messages with allowed transitions

  Rule: Evolve functions use event payload as source of truth
    Evolve must not recalculate values - events are immutable source of truth.
    Same event + same state = same result (deterministic).

  Rule: Handler factories wrap deciders with infrastructure
    - `createDeciderHandler()` for modifications (loads existing state)
    - `createEntityDeciderHandler()` for creation (handles null state)
