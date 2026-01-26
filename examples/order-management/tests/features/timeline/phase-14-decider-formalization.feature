Feature: Decider Formalization
  Pure decide functions extracted from command handlers for testable domain logic.

  Extracted pure `decide(state, command) → events` functions from all 12 command
  handlers (6 orders + 6 inventory), establishing the Decider pattern as foundation
  for aggregate-less architecture. Implemented FSM module for explicit state machine
  definition and validation. Created handler factories (createDeciderHandler,
  createEntityDeciderHandler) that compose deciders with infrastructure concerns.
  Introduced evolve() functions for event application enabling pure state reconstruction.
  Migrated all handlers to factory pattern, achieving full BDD parity with 8 new
  Gherkin feature files for inventory deciders.

  Key Deliverables:
  - Decider types (Decider<S,C,E>, DeciderOutput with success/rejected/failed)
  - FSM module (defineFSM, canTransition, assertTransition)
  - OrderFSM and ReservationFSM extracted from handlers
  - 12 pure deciders (6 orders + 6 inventory) in domain/ folders
  - Handler factories (createDeciderHandler for updates, createEntityDeciderHandler for creation)
  - evolve() functions for all 12 deciders (pure event application)
  - 8 BDD feature files for Inventory BC (full parity with Orders)
  - Multi-entity hybrid approach documented (pure decide + handler coordination)

  Sessions:
  - 14.1: Decider Types — ✅ Complete
  - 14.2: FSM Module — ✅ Complete
  - 14.3: Handler Factory + evolve() — ✅ Complete (Orders BC)
  - 14.4: Inventory BC Migration — ✅ Complete

  Major Patterns Introduced:
  - Decider pattern (pure decide function)
  - FSM module for state machine definition
  - Handler factory pattern (infrastructure + decider composition)
  - evolve() for event application
  - Multi-entity hybrid approach (decider + handler coordination)
  - Entity creation pattern (TState | null with tryLoadState)

  Implemented in: deps/libar-dev-packages/packages/platform/core/src/decider/, deps/libar-dev-packages/packages/platform/fsm/src/, examples/order-management/convex/contexts/*/domain/
