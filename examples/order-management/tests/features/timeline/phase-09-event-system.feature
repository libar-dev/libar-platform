Feature: Event System Enhancement
  Advanced event categorization, upcasting, and correlation tracking.

  Delivered comprehensive event system with 4-tier type taxonomy (domain, integration,
  trigger, fat) and schema factories for each category. Implemented sequential event
  upcasting pipeline with multi-hop migrations for schema evolution. Built correlation
  chain system for command-event tracking with causation lineage. Introduced EventBus
  abstraction with Workpool-backed pub/sub and declarative subscription registry.
  Created integration event publishing infrastructure with route builder pattern.

  Key Deliverables:
  - Event Type Taxonomy (ADR-029): domain, integration, trigger, fat categories
  - Event schema factories (createDomainEventSchema, createIntegrationEventSchema, etc.)
  - Event upcasting pipeline with sequential multi-hop migrations (v1 → v2 → v3)
  - Correlation chain system (commandId → correlationId → causationId)
  - ConvexEventBus with Workpool-backed pub/sub and priority ordering
  - Integration event publishing with IntegrationRouteBuilder pattern
  - 196 unit tests for events (62 new), 12 new test files

  Major Patterns Introduced:
  - Event type taxonomy (domain vs integration vs trigger vs fat)
  - Sequential event upcasting with migration helpers
  - Correlation chain tracking (command → event lineage)
  - Subscription registry with fluent builder
  - Integration event translation pattern
  - Published Language implementation

  Architecture Decision Records:
  - ADR-029: Event Type Taxonomy and Schema Versioning

  Implemented in: deps/libar-dev-packages/packages/platform/core/src/events/, deps/libar-dev-packages/packages/platform/core/src/eventbus/
