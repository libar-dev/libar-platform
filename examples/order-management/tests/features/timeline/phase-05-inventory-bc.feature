Feature: Inventory Bounded Context
  Multi-aggregate inventory management with stock tracking and reservations.

  Delivered Inventory bounded context with separate Product and Reservation aggregates,
  demonstrating the multi-aggregate pattern within a single context. Implemented atomic
  multi-item reservations with all-or-nothing semantics for saga compensation support.
  Includes TTL-based reservation expiration and comprehensive stock level tracking with
  available + reserved quantity separation.

  Key Deliverables:
  - inventoryCMS + reservationCMS tables for dual-aggregate lifecycle
  - Product aggregate with stock level tracking (available + reserved quantities)
  - Reservation aggregate with TTL expiration and status state machine
  - 6 commands (CreateProduct, AddStock, ReserveStock, ConfirmReservation, ReleaseReservation, ExpireReservation)
  - 7 domain events (ProductCreated, StockAdded, StockReserved, ReservationFailed/Confirmed/Released/Expired)
  - All-or-nothing multi-item reservation for saga compensation
  - 6 Gherkin feature files for acceptance criteria

  Major Patterns Introduced:
  - Multi-aggregate pattern (separate CMS tables per aggregate root)
  - All-or-nothing semantics (atomic multi-item operations)
  - TTL-based expiration (time-limited reservations)
  - Reservation lifecycle state machine

  Implemented in: examples/order-management/convex/contexts/inventory/
