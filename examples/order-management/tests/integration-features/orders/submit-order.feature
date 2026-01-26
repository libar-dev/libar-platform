@orders @integration @commands
Feature: Submit Order (Integration)
  As a customer
  I want to submit my order
  So that it can be processed for fulfillment

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Submit order with items and verify projection
    Given a draft order "ord-submit-01" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 2        | 10.00     |
      | prod_002  | Gadget      | 1        | 25.00     |
    When I submit order "ord-submit-01"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-submit-01" should exist with status "submitted"
    And the order "ord-submit-01" total should be 45

  @validation
  Scenario: Reject submitting empty order
    Given an empty draft order "ord-submit-02" exists
    When I submit order "ord-submit-02"
    Then the command should be rejected with code "ORDER_HAS_NO_ITEMS"

  @validation
  Scenario: Reject submitting already submitted order
    Given a submitted order "ord-submit-03" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I submit order "ord-submit-03"
    Then the command should be rejected with code "ORDER_NOT_IN_DRAFT"
