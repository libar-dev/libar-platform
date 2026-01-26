Feature: Orders Bounded Context
  Complete reference implementation demonstrating all DDD/ES/CQRS patterns.

  Delivered full Orders bounded context with domain model, events, commands, invariants,
  projections, and saga infrastructure. Implemented OrderCMS with lazy upcast pattern,
  comprehensive OrderStatus state machine, and OrderSummary projections with globalPosition
  checkpointing. Includes 63+ domain unit tests and 5 Gherkin feature files with 124+ steps.

  Key Deliverables:
  - OrderCMS domain model with lazy upcast and stateVersion tracking
  - 6 domain events (OrderCreated, ItemAdded/Removed, Submitted, Confirmed, Cancelled)
  - 6 commands with comprehensive invariants and typed error codes
  - OrderSummary projection with DLQ integration and idempotency
  - OrderFulfillment saga infrastructure with event router
  - 63+ Vitest unit tests, 5 Gherkin feature files (create, add-items, submit, confirm, cancel)

  Major Patterns Introduced:
  - Dual-write pattern (CMS + Event Store atomically)
  - globalPosition checkpointing for projection idempotency
  - CMS lazy upcast with stateVersion field
  - Typed invariants with error codes
  - Workpool-based projections with guaranteed delivery

  Implemented in: examples/order-management/convex/contexts/orders/
