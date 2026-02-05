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

  @happy-path
  Scenario: Cancel confirmed order and verify projection
    Given a confirmed order "ord-cancel-04" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_001  | Widget      | 1        | 10.00     |
    When I cancel order "ord-cancel-04" with reason "Changed mind after confirmation"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-cancel-04" should exist with status "cancelled"

  @process-manager @reservation-release
  Scenario: Reservation is released when confirmed order is cancelled
    Given a product "prod-cancel-res-01" exists with 100 available stock
    And a draft order "ord-cancel-res-01" exists with items:
      | productId          | productName | quantity | unitPrice |
      | prod-cancel-res-01 | Widget      | 10       | 10.00     |
    When I submit order "ord-cancel-res-01"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the order "ord-cancel-res-01" should have status "confirmed"
    And the product "prod-cancel-res-01" should have 90 available and 10 reserved stock
    When I cancel order "ord-cancel-res-01" with reason "Customer changed mind"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-cancel-res-01" should have status "cancelled"
    And the reservation for order "ord-cancel-res-01" should have status "released"
    And the product "prod-cancel-res-01" should have 100 available and 0 reserved stock

  @edge-case @process-manager
  Scenario: Cancelling draft order does not trigger reservation release
    Given a draft order "ord-draft-pm-01" exists
    When I cancel order "ord-draft-pm-01" with reason "Changed mind early"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-draft-pm-01" should have status "cancelled"
    And the order "ord-draft-pm-01" should have no reservation

  @edge-case @process-manager
  Scenario: Cancelling submitted order before saga completion releases pending reservation
    Given a product "prod-pending-01" exists with 100 available stock
    And a draft order "ord-pending-01" exists with items:
      | productId       | productName | quantity | unitPrice |
      | prod-pending-01 | Widget      | 10       | 10.00     |
    When I submit order "ord-pending-01"
    Then the command should succeed
    And I wait for reservation to be created for order "ord-pending-01"
    And the product "prod-pending-01" should have reserved stock
    When I cancel order "ord-pending-01" with reason "Changed mind before confirmation"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-pending-01" should have status "cancelled"
    And the reservation for order "ord-pending-01" should have status "released"
    And the product "prod-pending-01" should have 100 available and 0 reserved stock

  @idempotency @process-manager
  Scenario: PM handles already released reservation gracefully
    Given a product "prod-idemp-01" exists with 100 available stock
    And a draft order "ord-idemp-01" exists with items:
      | productId      | productName | quantity | unitPrice |
      | prod-idemp-01  | Widget      | 10       | 10.00     |
    When I submit order "ord-idemp-01"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the order "ord-idemp-01" should have status "confirmed"
    And the product "prod-idemp-01" should have 90 available and 10 reserved stock
    When I cancel order "ord-idemp-01" with reason "First cancel"
    Then the command should succeed
    And I wait for projections to process
    And the reservation for order "ord-idemp-01" should have status "released"
    And the product "prod-idemp-01" should have 100 available and 0 reserved stock

  @edge-case @process-manager
  Scenario: PM skips expired reservation when order is cancelled
    Given a product "prod-expired-01" exists with 100 available stock
    And a draft order "ord-expired-01" exists with items:
      | productId         | productName | quantity | unitPrice |
      | prod-expired-01   | Widget      | 10       | 10.00     |
    When I submit order "ord-expired-01"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the order "ord-expired-01" should have status "confirmed"
    And I set the reservation status to "expired" for order "ord-expired-01"
    And the product "prod-expired-01" should have 90 available and 10 reserved stock
    When I cancel order "ord-expired-01" with reason "Cancel after expiration"
    Then the command should succeed
    And I wait for projections to process
    And the order "ord-expired-01" should have status "cancelled"
    # Stock should remain unchanged because PM skipped expired reservation
    And the product "prod-expired-01" should have 90 available and 10 reserved stock
