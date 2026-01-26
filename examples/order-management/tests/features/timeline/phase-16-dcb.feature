Feature: Dynamic Consistency Boundaries
  Enable cross-entity invariants within bounded contexts via scope-based OCC.

  Introduce Dynamic Consistency Boundaries (DCB) for enforcing invariants spanning
  multiple aggregates within a single bounded context. Implement dcbScopes table in
  Event Store for scope-level optimistic concurrency control. Create executeWithDCB
  wrapper that composes multiple Deciders into virtual streams with unified version
  tracking. Enable multi-entity operations like ReserveStock across products without
  distributed locking. Constrain DCB to single-BC only (cross-BC uses Sagas) with
  mandatory tenantId validation for all scopes.

  Sessions:
  - 16.1: DCB Schema & Scope Table — Planned
  - 16.2: executeWithDCB() Wrapper and OCC on Scopes — Planned
  - 16.3: Virtual Stream Composition — Planned

  Key Deliverables:
  - dcbScopes table in Event Store (scope key, expectedVersion, lastUpdatedAt)
  - executeWithDCB() wrapper for scope-based coordination
  - Scope key pattern (tenant:${tenantId}:product:${productId})
  - Virtual stream composition (logical events across physical streams)
  - ReserveStock refactored to use DCB for multi-product consistency
  - Tenant validation enforcement for all scopes

  Major Patterns Introduced:
  - Dynamic Consistency Boundary pattern
  - Scope-based optimistic concurrency control
  - Virtual stream composition
  - Multi-entity Decider coordination
  - Scope key naming conventions

  Implemented in: deps/libar-dev-packages/packages/platform/store/src/component/schema.ts, deps/libar-dev-packages/packages/platform/core/src/dcb/

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                       | Status | Tests | Location                                  |
      | dcbScopes table schema            | 🔲     | 0     | @libar-dev/platform-store/src/component/  |
      | executeWithDCB() wrapper          | 🔲     | 0     | @libar-dev/platform-core/src/dcb/                  |
      | Scope key pattern utilities       | 🔲     | 0     | @libar-dev/platform-core/src/dcb/                  |
      | Virtual stream composition logic  | 🔲     | 0     | @libar-dev/platform-core/src/dcb/                  |
      | ReserveStock DCB refactor         | 🔲     | 0     | examples/order-management/convex/contexts/|
      | Tenant validation enforcement     | 🔲     | 0     | @libar-dev/platform-core/src/dcb/                  |
