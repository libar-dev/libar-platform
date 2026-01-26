Feature: Service Independence
  Enable bounded contexts to operate independently via ECST/Fat Events and Reservation Pattern.

  Implement Event-Carried State Transfer (ECST) with Fat Events carrying full context
  for downstream consumers, eliminating query dependencies between bounded contexts.
  Create Reservation Pattern for optimistic uniqueness constraints (reserve/confirm/release
  workflow) with TTL-based cleanup. Introduce deterministic ID hashing for conflict
  detection on unique fields. Build createFatEvent() utilities for context embedding
  with schema validation. Enable bounded contexts to function independently without
  synchronous cross-context queries.

  Sessions:
  - 20.1: ECST/Fat Event Builder (createFatEvent(), context embedding) — Planned
  - 20.2: Reservation Pattern (TTL-based uniqueness, reserve/confirm/release) — Planned
  - 20.3: Deterministic ID Hashing (conflict detection for uniqueness) — Planned

  Key Deliverables:
  - ECST module in @libar-dev/platform-core/src/ecst/
  - createFatEvent() builder with context embedding
  - Reservation module in @libar-dev/platform-core/src/reservations/
  - Reservation workflow (reserve/confirm/release with TTL)
  - Deterministic ID hashing utilities
  - Fat event example (OrderCreated with full customer/product context)
  - Schema validation for embedded context
  - Uniqueness conflict detection patterns

  Major Patterns Introduced:
  - Event-Carried State Transfer (ECST)
  - Fat Events with embedded context
  - Reservation Pattern for optimistic uniqueness
  - TTL-based reservation cleanup
  - Deterministic ID hashing
  - Service independence architecture

  Implemented in: deps/libar-dev-packages/packages/platform/core/src/ecst/, deps/libar-dev-packages/packages/platform/core/src/reservations/

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                       | Status | Tests | Location                                  |
      | ECST module                       | 🔲     | 0     | @libar-dev/platform-core/src/ecst/                 |
      | createFatEvent() builder          | 🔲     | 0     | @libar-dev/platform-core/src/ecst/                 |
      | Reservation module                | 🔲     | 0     | @libar-dev/platform-core/src/reservations/         |
      | Reservation workflow (TTL-based)  | 🔲     | 0     | @libar-dev/platform-core/src/reservations/         |
      | Deterministic ID hashing          | 🔲     | 0     | @libar-dev/platform-core/src/reservations/         |
      | Fat event example (OrderCreated)  | 🔲     | 0     | examples/order-management/                |
      | Schema validation for context     | 🔲     | 0     | @libar-dev/platform-core/src/ecst/                 |
