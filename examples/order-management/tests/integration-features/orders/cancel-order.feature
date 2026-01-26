@orders @integration @commands
Feature: Cancel Order (Integration)
  As a customer
  I want to cancel my order
  So that I don't have to complete the purchase

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Cancel draft order and verify projection
    Given a draft order "ord-cancel-01" exists
    When I cancel order "ord-cancel-01" with reason "Changed my mind"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-cancel-01" should exist with status "cancelled"

  @happy-path
  Scenario: Cancel submitted order and verify projection
    Given a submitted order "ord-cancel-02" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I cancel order "ord-cancel-02" with reason "Found better price"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-cancel-02" should exist with status "cancelled"

  @validation
  Scenario: Reject cancelling already cancelled order
    Given a cancelled order "ord-cancel-03" exists
    When I cancel order "ord-cancel-03" with reason "Double cancel"
    Then the command should be rejected with code "ORDER_ALREADY_CANCELLED"

  @validation
  Scenario: Reject cancelling confirmed order
    Given a confirmed order "ord-cancel-04" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I cancel order "ord-cancel-04" with reason "Too late"
    Then the command should be rejected with code "ORDER_ALREADY_CONFIRMED"
