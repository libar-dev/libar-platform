@products
Feature: Browse Product Catalog

  @happy-path
  Scenario: View products with stock levels
    Given products exist with various stock levels
    When I navigate to the products page
    Then I should see products with their stock badges
    And in-stock products should show green badge
    And low-stock products should show yellow badge
    And out-of-stock products should show red badge

  @loading-state
  Scenario: Loading state
    When I navigate to the products page
    Then I should see loading skeletons
    And eventually products should appear
