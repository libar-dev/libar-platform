Feature: Cross-Context Integration
  Saga-based coordination between Orders and Inventory bounded contexts.

  Delivered OrderFulfillment saga coordinating Orders and Inventory contexts via durable
  workflow with automatic compensation. Implemented event-triggered saga routing,
  cross-context projections, and workflow status tracking via onComplete callbacks.
  Established pattern for cross-context views at app level while maintaining bounded
  context isolation.

  Key Deliverables:
  - OrderFulfillment saga with Orders ↔ Inventory coordination
  - Automatic compensation (ReleaseReservation on failures)
  - Saga status tracking via workflow onComplete callbacks (ADR-025)
  - Event router for saga triggering from OrderSubmitted events
  - Cross-context projections at app level (OrderWithInventory view)
  - Secondary projections pattern (multiple projections per event)

  Major Patterns Introduced:
  - Cross-context saga coordination (durable workflow)
  - Automatic compensation (saga rollback)
  - Workflow onComplete for status tracking
  - Event-triggered saga activation
  - App-level cross-context projections (ADR-023)

  Architecture Decision Records:
  - ADR-021: CommandOrchestrator Abstraction (7-step execution)
  - ADR-023: Projections at App Level (cross-context views)
  - ADR-024: Transaction Boundaries & OCC (component isolation)
  - ADR-025: Workflow onComplete for Saga Status
  - ADR-026: Workflow Internal Workpool

  Implemented in: examples/order-management/convex/sagas/orderFulfillment.ts
