Feature: Integration Patterns
  Formalize cross-context communication with Context Map, Published Language, and ACL.

  Formalize DDD strategic patterns for cross-context integration. Document Context
  Map showing Orders ↔ Inventory relationship (Customer/Supplier, Conformist patterns).
  Build Published Language Schema Registry for integration event versioning with
  backward compatibility rules. Implement Anti-Corruption Layer (ACL) example for
  external payment gateway integration. Establish integration event contract testing
  and schema evolution guidelines.

  Sessions:
  - 21.1: Context Map Documentation (Orders ↔ Inventory relationship) — Planned
  - 21.2: Published Language Schema Registry — Planned
  - 21.3: ACL Implementation Example — Planned

  Key Deliverables:
  - Context Map documentation (docs/architecture/CONTEXT_MAP.md)
  - Published Language Schema Registry with versioning
  - Integration event contract testing
  - ACL example for payment gateway
  - Schema evolution guidelines (backward compatibility rules)
  - Integration event versioning strategy
  - Cross-context relationship patterns (Customer/Supplier, Conformist, ACL)

  Major Patterns Introduced:
  - Context Map pattern
  - Published Language with schema registry
  - Anti-Corruption Layer (ACL)
  - Integration event versioning
  - Contract testing for integration events
  - DDD strategic patterns formalization

  Implemented in: docs/architecture/CONTEXT_MAP.md, deps/libar-dev-packages/packages/platform/core/src/integration/, examples/order-management/convex/integration/

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                      | Status | Tests | Location                                  |
      | Context Map documentation        | 🔲     | 0     | docs/architecture/CONTEXT_MAP.md          |
      | Published Language Schema Registry | 🔲   | 0     | @libar-dev/platform-core/src/integration/          |
      | Integration event contract tests | 🔲     | 0     | examples/order-management/tests/          |
      | ACL example (payment gateway)    | 🔲     | 0     | examples/order-management/convex/integration/ |
      | Schema evolution guidelines      | 🔲     | 0     | docs/architecture/                        |
      | Integration event versioning     | 🔲     | 0     | @libar-dev/platform-core/src/integration/          |
      | DDD strategic patterns guide     | 🔲     | 0     | docs/architecture/                        |
