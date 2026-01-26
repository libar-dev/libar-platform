Feature: Reactive Projections
  Hybrid Workpool + reactive model for 10-50ms UI updates without polling.

  Implement reactive layer on top of existing Workpool-based projections to enable
  near-instant UI updates (10-50ms) without client polling. Create hybrid architecture
  where Workpool ensures durability while reactive pushes provide speed. Build
  useReactiveProjection() React hook for optimistic updates with automatic rollback
  on conflicts. Share event application logic between server (durable) and client
  (optimistic) for consistency. Integrate with DCB for conflict detection (optional).
  Target only View category projections (determined by Phase 15).

  Sessions:
  - 17.1: Hybrid Model Design (Workpool + Reactive) — Planned
  - 17.2: useReactiveProjection() Hook + Optimistic Updates — Planned

  Key Deliverables:
  - Reactive projection module in @libar-dev/platform-core/src/projections/reactive.ts
  - useReactiveProjection() React hook with optimistic updates
  - Shared event application logic (server + client)
  - Hybrid architecture (Workpool for durability, reactive for speed)
  - Example reactive projection in order-management
  - Conflict detection integration with DCB (optional)
  - Category-based reactive targeting (View projections only)

  Major Patterns Introduced:
  - Hybrid projection architecture (durable + reactive)
  - Optimistic UI updates with server reconciliation
  - Shared event application logic
  - Client-side state reconstruction
  - Reactive subscription management

  Implemented in: deps/libar-dev-packages/packages/platform/core/src/projections/reactive.ts, examples/order-management/

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                         | Status | Tests | Location                                  |
      | Reactive projection module          | 🔲     | 0     | @libar-dev/platform-core/src/projections/reactive.ts |
      | useReactiveProjection() React hook  | 🔲     | 0     | @libar-dev/platform-core/src/projections/reactive.ts |
      | Shared event application logic      | 🔲     | 0     | @libar-dev/platform-core/src/projections/          |
      | Hybrid architecture implementation  | 🔲     | 0     | @libar-dev/platform-core/src/projections/          |
      | Example reactive projection         | 🔲     | 0     | examples/order-management/                |
      | DCB conflict detection integration  | 🔲     | 0     | @libar-dev/platform-core/src/projections/          |
