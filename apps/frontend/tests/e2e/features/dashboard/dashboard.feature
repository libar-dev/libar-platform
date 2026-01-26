@dashboard
Feature: Dashboard
  As a user I want to see system overview

  @happy-path
  Scenario: View dashboard stats
    Given products and orders exist in the system
    When I navigate to the dashboard
    Then I should see the product count
    And I should see the order count
    And I should see the pending orders count

  @warning-state
  Scenario: Show low stock warning
    Given a product with low stock exists
    When I navigate to the dashboard
    Then I should see the low stock warning

  @navigation
  Scenario: Quick action navigates to create order
    When I am on the dashboard
    And I click the "New Order" quick action
    Then I should be on the create order page
