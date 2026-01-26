Feature: Bounded Context Formalization
  Contract-based bounded context infrastructure with declarative invariants.

  Delivered comprehensive bounded context infrastructure with @convex-es/bounded-context
  package (pure TypeScript, zero Convex dependencies). Implemented DualWriteContextContract
  for defining commands, events, CMS types, and error codes with full type inference.
  Created declarative invariant framework replacing procedural assertions with composable,
  introspectable business rules. Built repository pattern with automatic CMS upcasting
  and type-safe document IDs. Migrated all 12 handlers (orders + inventory) to use
  declarative invariants and repository pattern, eliminating ~60 lines of boilerplate.

  Key Deliverables:
  - @convex-es/bounded-context package (pure TypeScript contracts)
  - DualWriteContextContract with BoundedContextIdentity, CMSTypeDefinition
  - Declarative invariant framework (createInvariant, createInvariantSet)
  - 9 declarative invariants (6 orders + 3 inventory) with InvariantSet composition
  - Repository pattern (createCMSRepository) with auto-upcast and NotFoundError
  - Orders + Inventory context contracts with full command/event metadata
  - Domain purity verification (zero Convex imports in domain folders)
  - 1,658 tests passing (774 core + 365 packages + 519 app)

  Major Patterns Introduced:
  - Bounded context contract pattern (compile-time verification)
  - Declarative invariants (vs procedural assertions)
  - InvariantSet composition (fail-fast and collect-all modes)
  - Repository pattern with transparent upcasting
  - CMSFactory + CMSUpcasterContract types
  - Domain-driven design building blocks formalization
  - Branded types at API boundaries

  Architecture Decision Records:
  - ADR-031: Bounded Context Formalization

  Implemented in: packages/@convex-es/bounded-context/, deps/libar-dev-packages/packages/platform/core/src/invariants/, deps/libar-dev-packages/packages/platform/core/src/repository/
