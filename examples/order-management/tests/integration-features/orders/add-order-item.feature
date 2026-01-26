@orders @integration @commands
Feature: Add Order Item (Integration)
  As a customer
  I want to add items to my order
  So that I can purchase multiple products

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Add item to draft order and verify projection
    Given an order "ord-add-item-01" exists in draft status
    When I add an item to order "ord-add-item-01":
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 2        | 15.00     |
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-add-item-01" should have 1 items
    And the order "ord-add-item-01" total should be 30

  @validation
  Scenario: Reject adding item to submitted order
    Given a submitted order "ord-add-item-02" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I add an item to order "ord-add-item-02":
      | productId | productName | quantity | unitPrice |
      | prod_002  | Gadget      | 1        | 20.00     |
    Then the command should be rejected with code "ORDER_NOT_IN_DRAFT"
