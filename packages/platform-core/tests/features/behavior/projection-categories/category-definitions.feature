@libar-docs-implements:ProjectionCategories
@libar-docs-status:active
@libar-docs-phase:15
@libar-docs-product-area:PlatformCore
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
