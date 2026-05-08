@architect
@architect-pattern:ProjectionCategoriesExecutableTests
@architect-implements:ProjectionCategories
@architect-status:active
@architect-phase:15
@architect-product-area:PlatformCore
Feature: Projection Category Definitions

  As a platform developer
  I want projections classified into four distinct categories
  So that I can route queries and optimize projection behavior

  Background: Category taxonomy
    Given the projection category taxonomy:
      | Category    | Purpose                           | Query Pattern   | Example              |
      | logic       | Minimal data for command validation | Internal only   | orderExists(id)      |
      | view        | Denormalized for UI queries        | Client queries  | orderSummaries       |
      | reporting   | Analytics and aggregations         | Async/batch     | dailySalesReport     |
      | integration | Cross-context synchronization      | EventBus        | orderStatusForShipping |

  Rule: Projections are classified into four distinct categories

    **Invariant:** Every projection must belong to exactly one of four categories:
    Logic, View, Reporting, or Integration. Categories are mutually exclusive.

    **Rationale:** Without explicit categories, developers must guess which projection
    to use for which purpose, leading to misuse (e.g., using Logic projections for UI)
    and performance issues (e.g., subscribing to Reporting projections reactively).

    **Verified by:** PROJECTION_CATEGORIES tuple contains all valid categories,
    isProjectionCategory validates category strings,
    Category helper functions identify correct categories

    # ============================================================================
    # PROJECTION_CATEGORIES Tuple
    # ============================================================================

    @acceptance-criteria @happy-path
    Scenario: PROJECTION_CATEGORIES tuple contains all valid categories
      When I access PROJECTION_CATEGORIES
      Then it contains exactly "logic", "view", "reporting", "integration"
      And it is a readonly tuple

    # ============================================================================
    # Type Guard
    # ============================================================================

    @acceptance-criteria @happy-path
    Scenario Outline: isProjectionCategory validates category strings
      When I call isProjectionCategory with "<value>"
      Then I receive <result>

      Examples:
        | value       | result |
        | logic       | true   |
        | view        | true   |
        | reporting   | true   |
        | integration | true   |
        | custom      | false  |
        | VIEW        | false  |
        | Logic       | false  |

    # ============================================================================
    # Helper Functions
    # ============================================================================

    @acceptance-criteria @happy-path
    Scenario Outline: Category helper functions identify correct categories
      Given a projection category "<category>"
      Then isLogicProjection returns <isLogic>
      And isViewProjection returns <isView>
      And isReportingProjection returns <isReporting>
      And isIntegrationProjection returns <isIntegration>

      Examples:
        | category    | isLogic | isView | isReporting | isIntegration |
        | logic       | true    | false  | false       | false         |
        | view        | false   | true   | false       | false         |
        | reporting   | false   | false  | true        | false         |
        | integration | false   | false  | false       | true          |

  Rule: Category determines client exposure

    **Invariant:** Client exposure is determined solely by category. Logic and
    Integration projections are never client-accessible. View projections are
    always client-accessible. Reporting projections require admin role.

    **Rationale:** Security and performance concerns require clear boundaries.
    Logic projections contain internal validation state that shouldn't leak.
    Integration projections are for cross-BC communication, not direct queries.

    **Verified by:** isClientExposed returns correct exposure status

    # ============================================================================
    # Client Exposure
    # ============================================================================

    @acceptance-criteria @happy-path
    Scenario Outline: isClientExposed returns correct exposure status
      Given a projection category "<category>"
      When I call isClientExposed
      Then I receive <exposed>

      Examples:
        | category    | exposed |
        | logic       | false   |
        | view        | true    |
        | reporting   | false   |
        | integration | false   |
