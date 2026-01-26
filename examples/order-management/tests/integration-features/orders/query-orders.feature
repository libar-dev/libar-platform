@orders @integration @query
Feature: Query Orders (Integration)
  As a user
  I want to query orders by various criteria
  So that I can find and view order information

  Background:
    Given the backend is running and clean

  @query
  Scenario: Query orders by customer ID
    Given customer "cust-query-01" has multiple orders:
      | orderId        | status |
      | ord-query-01-a | draft  |
      | ord-query-01-b | draft  |
    And I wait for projections to process
    When I query orders for customer "cust-query-01"
    Then I should receive 2 orders

  @query
  Scenario: Query orders by status
    Given orders with different statuses exist:
      | orderId     | customerId | status    |
      | ord-stat-01 | cust-st-01 | draft     |
      | ord-stat-02 | cust-st-02 | submitted |
    And I wait for projections to process
    When I query orders with status "draft"
    Then I should receive at least 1 order
    When I query orders with status "submitted"
    Then I should receive at least 1 order

  @happy-path
  Scenario: Remove item from draft order and verify projection
    Given a draft order "ord-remove-01" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 2        | 10.00     |
      | prod_002  | Gadget      | 1        | 25.00     |
    When I remove item "prod_001" from order "ord-remove-01"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-remove-01" should have 1 items
    And the order "ord-remove-01" total should be 25
