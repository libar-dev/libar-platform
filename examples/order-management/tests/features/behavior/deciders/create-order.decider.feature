@deciders @orders @pattern:DeciderTypes
Feature: Create Order Decider
  Pure domain logic for creating a new order.

  The CreateOrder decider validates that:
  - No order with the same ID already exists

  On success, it emits OrderCreated with draft status.

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to create a new order when none exists
    Given no existing order state
    When I decide to create order with orderId "ord_new_001" and customerId "cust_001"
    Then the decision should be "success"
    And the event type should be "OrderCreated"
    And the data should contain orderId "ord_new_001"

  @validation
  Scenario: Reject create when order already exists
    Given an existing order state with orderId "ord_existing"
    When I decide to create order with orderId "ord_existing" and customerId "cust_002"
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_ALREADY_EXISTS"
