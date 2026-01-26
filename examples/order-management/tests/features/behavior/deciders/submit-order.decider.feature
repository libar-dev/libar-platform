@deciders @orders @pattern:DeciderTypes @pattern:FSMTypes
Feature: Submit Order Decider
  Pure domain logic for submitting an order.

  The SubmitOrder decider validates that:
  - Order must be in draft status
  - Order must have at least one item

  On success, it emits OrderSubmitted and transitions to submitted status.

  Background:
    Given a decider context with timestamp 1704067200000

  @happy-path
  Scenario: Decide to submit draft order with items
    Given an order state:
      | field       | value        |
      | orderId     | ord_001      |
      | customerId  | cust_001     |
      | status      | draft        |
      | itemCount   | 1            |
      | total       | 20.00        |
    When I decide to submit the order
    Then the decision should be "success"
    And the event type should be "OrderSubmitted"
    And the event payload should contain "submittedAt" with value 1704067200000
    And the state update should set status to "submitted"

  @validation
  Scenario: Reject submit for order not in draft status
    Given an order state:
      | field  | value     |
      | status | submitted |
    When I decide to submit the order
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_NOT_IN_DRAFT"

  @validation
  Scenario: Reject submit for order with no items
    Given an order state:
      | field     | value |
      | status    | draft |
      | itemCount | 0     |
    When I decide to submit the order
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_HAS_NO_ITEMS"
