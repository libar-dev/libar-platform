Feature: Projection Engine (Deferred)
  Centralized projection management beyond Workpool capabilities.

  This phase was evaluated and deferred. Workpool (ADR-015) provides sufficient
  projection processing for current needs. The dedicated engine may be valuable
  for advanced subscription patterns, complex multi-projection coordination,
  specialized rebuild orchestration, or cross-context projection aggregation.

  This phase will be reconsidered when:
  - Workpool limitations are encountered
  - Advanced subscription patterns are required
  - Complex multi-projection coordination is needed

  Sessions:
  - 7.1: Evaluation (go/no-go decision) — Deferred
  - 7.2: Implementation (if proceeding) — Deferred

  Key Deliverables:
  - Decision document with rationale
  - Component (if needed) integrating with Workpool

  Implemented in: Deferred pending evaluation

  Background: Deferred Deliverables
    Given the following deliverables are deferred:
      | Deliverable                      | Status   | Tests | Location                                  |
      | Evaluation decision document     | Deferred | 0     | docs/project-management/roadmap/          |
      | Projection registry schema       | Deferred | 0     | @libar-dev/platform-core/src/projections/          |
      | Subscription management          | Deferred | 0     | @libar-dev/platform-core/src/projections/          |
      | Event routing with filtering     | Deferred | 0     | @libar-dev/platform-core/src/projections/          |
      | Rebuild utilities with progress  | Deferred | 0     | @libar-dev/platform-core/src/projections/          |
