Feature: Projection Categories
  Formalize projection taxonomy with explicit Logic/View/Reporting/Integration categories.

  Introduce explicit projection categorization to distinguish between minimal command
  validation data (Logic), denormalized UI queries (View), analytics aggregations
  (Reporting), and cross-context synchronization (Integration). Update all existing
  projections with category metadata. Implement validation warnings for incorrect
  category usage patterns. Enable category-based reactive targeting (only View
  projections need reactive layer) and query routing validation.

  Sessions:
  - 15.1: Category Types and Definitions — Planned
  - 15.2: Categorize Existing Projections + Validation Warnings — Planned

  Key Deliverables:
  - ProjectionCategory type (Logic, View, Reporting, Integration)
  - Updated projection definitions with explicit category metadata
  - Category guidelines (cardinality, freshness, client exposure)
  - Validation warnings for wrong category usage
  - All existing projections categorized (orderSummaries = View, etc.)
  - Category-based query routing foundations

  Major Patterns Introduced:
  - Projection category taxonomy
  - Category-based optimization targeting
  - Query pattern validation
  - Cross-context contract definition via Integration category

  Implemented in: deps/libar-dev-packages/packages/platform/core/src/projections/

  Background: Key Deliverables
    Given the following deliverables are planned:
      | Deliverable                       | Status | Tests | Location                                 |
      | ProjectionCategory type           | 🔲     | 0     | @libar-dev/platform-core/src/projections/         |
      | Category validation logic         | 🔲     | 0     | @libar-dev/platform-core/src/projections/         |
      | Update existing projections (12+) | 🔲     | 0     | examples/order-management/convex/        |
      | Category guidelines documentation | 🔲     | 0     | docs/architecture/                       |
      | Query routing foundations         | 🔲     | 0     | @libar-dev/platform-core/src/projections/         |
