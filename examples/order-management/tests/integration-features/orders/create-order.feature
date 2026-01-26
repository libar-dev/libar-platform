@orders @integration @commands
Feature: Create Order (Integration)
  As a customer
  I want to create new orders
  So that I can purchase products

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Successfully create a new order and verify projection
    When I create an order with:
      | orderId    | customerId    |
      | ord-int-01 | cust-int-01   |
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-int-01" should exist with status "draft"
    And the order "ord-int-01" should have 0 items

  @validation
  Scenario: Reject duplicate order ID
    Given an order "ord-int-02" exists
    When I create an order with:
      | orderId    | customerId     |
      | ord-int-02 | cust-different |
    Then the command should be rejected with code "ORDER_ALREADY_EXISTS"

  @idempotency
  Scenario: CreateOrder is idempotent with same commandId
    When I create an order with commandId "cmd-idem-01":
      | orderId    | customerId  |
      | ord-int-03 | cust-int-03 |
    And I create an order with commandId "cmd-idem-01":
      | orderId    | customerId  |
      | ord-int-03 | cust-int-03 |
    Then the second command should return duplicate status
