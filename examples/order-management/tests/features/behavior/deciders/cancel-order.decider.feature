@deciders @orders @pattern:DeciderTypes @pattern:FSMTypes
Feature: Cancel Order Decider
  Pure domain logic for cancelling an order.

  The CancelOrder decider validates that:
  - Order must be in draft or submitted status
  - Already confirmed or cancelled orders cannot be cancelled

  On success, it emits OrderCancelled and transitions to cancelled status.

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to cancel a draft order
    Given an order state:
      | field  | value |
      | status | draft |
    When I decide to cancel the order with reason "Customer changed mind"
    Then the decision should be "success"
    And the event type should be "OrderCancelled"
    And the state update should set status to "cancelled"
    And the data should contain reason "Customer changed mind"

  @happy-path
  Scenario: Decide to cancel a submitted order
    Given an order state:
      | field  | value     |
      | status | submitted |
    When I decide to cancel the order with reason "Out of stock"
    Then the decision should be "success"
    And the event type should be "OrderCancelled"
    And the state update should set status to "cancelled"

  @validation
  Scenario: Reject cancel for confirmed order
    Given an order state:
      | field  | value     |
      | status | confirmed |
    When I decide to cancel the order with reason "Too late"
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_ALREADY_CONFIRMED"

  @validation
  Scenario: Reject cancel for already cancelled order
    Given an order state:
      | field  | value     |
      | status | cancelled |
    When I decide to cancel the order with reason "Double cancel"
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_ALREADY_CANCELLED"
