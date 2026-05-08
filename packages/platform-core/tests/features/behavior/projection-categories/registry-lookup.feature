@architect
@architect-pattern:ProjectionCategoriesExecutableTests
@architect-implements:ProjectionCategories
@architect-status:active
@architect-phase:15
@architect-product-area:PlatformCore
Feature: Registry Category Lookup

  As a platform developer
  I want to query projections by category from the registry
  So that I can target specific projection types for different purposes

  Background: Registry with projections
    Given a projection registry with the following projections:
      """
      | name               | category    | context       |
      | orderSummary       | view        | orders        |
      | productCatalog     | view        | inventory     |
      | orderExistence     | logic       | orders        |
      | dailySales         | reporting   | analytics     |
      | orderStatusFeed    | integration | cross-context |
      """

  # ============================================================================
  # getByCategory Method
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: getByCategory returns all view projections
    When I call getByCategory with "view"
    Then I receive 2 projections
    And the result contains "orderSummary"
    And the result contains "productCatalog"

  @acceptance-criteria @happy-path
  Scenario: getByCategory returns all logic projections
    When I call getByCategory with "logic"
    Then I receive 1 projection
    And the result contains "orderExistence"

  @acceptance-criteria @happy-path
  Scenario: getByCategory returns all reporting projections
    When I call getByCategory with "reporting"
    Then I receive 1 projection
    And the result contains "dailySales"

  @acceptance-criteria @happy-path
  Scenario: getByCategory returns all integration projections
    When I call getByCategory with "integration"
    Then I receive 1 projection
    And the result contains "orderStatusFeed"

  @acceptance-criteria @edge-case
  Scenario: getByCategory returns empty array for category with no projections
    Given an empty projection registry
    When I call getByCategory with "view"
    Then I receive 0 projections

  # ============================================================================
  # Use Cases
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Target view projections for reactive layer
    When I call getByCategory with "view"
    Then all returned projections have category "view"
    And these are candidates for reactive subscriptions

  @acceptance-criteria @happy-path
  Scenario: Target integration projections for EventBus routing
    When I call getByCategory with "integration"
    Then all returned projections have category "integration"
    And these are candidates for EventBus publication

  # ============================================================================
  # Non-executable Invariants
  # ============================================================================

  # Invariant: The projection registry exposes getByCategory(category) returning
  # the complete subset of registered projections whose declared category matches.
  # Projections of other categories are never included; lookups against an empty
  # registry return an empty collection rather than failing.
  # Rationale: Infrastructure layers (reactive subscriber, EventBus publisher,
  # admin reporting surface) need to enumerate exactly the projections relevant to
  # their concern. Category-keyed lookup is the canonical routing primitive that
  # makes client exposure and reactive targeting implementable.
  # Covered by executable category lookup scenarios above.

  # Invariant: When infrastructure resolves the set of reactive-eligible
  # projections, it queries the registry by the "view" category. Logic, Reporting,
  # and Integration projections are never enrolled in the reactive layer.
  # Rationale: Reactive infrastructure (WebSocket connections, change detection,
  # client memory) is expensive. Limiting reactivity to View projections ensures
  # those resources are spent only on UI-visible state. Cross-context (Integration)
  # flows route through EventBus, not direct reactive subscriptions.
  # Covered by executable routing use-case scenarios above.
