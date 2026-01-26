@orders
Feature: View Orders List

  @happy-path
  Scenario: View all orders
    Given orders exist with different statuses
    When I navigate to the orders page
    Then I should see all orders
    And each order should show its status badge

  @navigation
  Scenario: Navigate to create order
    When I am on the orders page
    And I click "New Order"
    Then I should be on the create order page
