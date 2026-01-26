@deciders @orders @pattern:DeciderTypes @pattern:FSMTypes
Feature: Confirm Order Decider
  Pure domain logic for confirming an order.

  The ConfirmOrder decider validates that:
  - Order must be in submitted status

  On success, it emits OrderConfirmed and transitions to confirmed status.

  Background:
    Given a decider context with timestamp 1704067200000

  @happy-path
  Scenario: Decide to confirm a submitted order
    Given an order state:
      | field     | value     |
      | status    | submitted |
      | itemCount | 1         |
      | total     | 20.00     |
    When I decide to confirm the order
    Then the decision should be "success"
    And the event type should be "OrderConfirmed"
    And the event payload should contain "confirmedAt" with value 1704067200000
    And the state update should set status to "confirmed"

  @validation
  Scenario: Reject confirm for order in draft status
    Given an order state:
      | field  | value |
      | status | draft |
    When I decide to confirm the order
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_NOT_SUBMITTED"

  @validation
  Scenario: Reject confirm for already confirmed order
    Given an order state:
      | field  | value     |
      | status | confirmed |
    When I decide to confirm the order
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_NOT_SUBMITTED"

  @validation
  Scenario: Reject confirm for cancelled order
    Given an order state:
      | field  | value     |
      | status | cancelled |
    When I decide to confirm the order
    Then the decision should be "rejected"
    And the rejection code should be "ORDER_NOT_SUBMITTED"
