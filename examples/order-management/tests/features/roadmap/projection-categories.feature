@roadmap @status:roadmap @phase:15 @enables:ReactiveProjections
Feature: Projection Categories
  A taxonomy that categorizes projections by their purpose and query pattern.

  Projection categories enable:
  - Clear separation between internal and client-facing projections
  - Targeted reactivity (only View projections need reactive layer)
  - Performance optimization based on category
  - Query routing to appropriate read models

  Background:
    Given the projection category system is available

  # ==========================================================================
  # Category Definition
  # ==========================================================================

  @category @definition
  Scenario: Define a Logic projection for command validation
    When I define a projection with category "logic":
      | field      | value       |
      | name       | orderExists |
      | subscribes | OrderCreated, OrderCancelled |
    Then the projection should not be client-exposed
    And the projection should not be reactive
    And the projection should be minimal (validation-only fields)

  @category @definition
  Scenario: Define a View projection for UI queries
    When I define a projection with category "view":
      | field      | value          |
      | name       | orderSummaries |
      | subscribes | OrderCreated, OrderSubmitted, OrderConfirmed |
    Then the projection should be client-exposed
    And the projection should be reactive
    And the projection should support denormalized data

  @category @definition
  Scenario: Define a Reporting projection for analytics
    When I define a projection with category "reporting":
      | field      | value            |
      | name       | dailySalesReport |
      | subscribes | OrderConfirmed   |
    Then the projection should be admin-only exposed
    And the projection should not be reactive
    And the projection should support aggregations

  @category @definition
  Scenario: Define an Integration projection for cross-context sync
    When I define a projection with category "integration":
      | field      | value                   |
      | name       | orderStatusForShipping  |
      | subscribes | OrderConfirmed, OrderCancelled |
    Then the projection should not be client-exposed
    And the projection should publish to EventBus
    And the projection should define a contract schema

  # ==========================================================================
  # Category Queries
  # ==========================================================================

  @category @query
  Scenario: Query projections by category
    Given projections exist:
      | name           | category    |
      | orderExists    | logic       |
      | orderSummaries | view        |
      | dailySales     | reporting   |
      | orderSync      | integration |
    When I query projections by category "view"
    Then I should get ["orderSummaries"]

  @category @query
  Scenario: Query all reactive projections
    Given projections exist:
      | name           | category    |
      | orderExists    | logic       |
      | orderSummaries | view        |
      | productViews   | view        |
      | dailySales     | reporting   |
    When I query all reactive projections
    Then I should get ["orderSummaries", "productViews"]

  # ==========================================================================
  # Category Validation
  # ==========================================================================

  @category @validation
  Scenario: Prevent client query on Logic projection
    Given a projection "orderExists" with category "logic"
    When a client attempts to query "orderExists"
    Then the query should be rejected with "Logic projections are not client-exposed"

  @category @validation
  Scenario: Warn when View projection is not optimized for reactivity
    Given a projection "slowView" with category "view"
    And the projection handler contains expensive computations
    When the projection is validated
    Then a warning should be raised about reactive performance

  # ==========================================================================
  # Migration Support
  # ==========================================================================

  @category @migration
  Scenario: Migrate existing projection to categorized system
    Given an uncategorized projection "orderSummaries"
    When I apply category migration
    Then the projection should have inferred category "view"
    And the migration log should record the change
