@sagas @integration @workflow @pattern:Saga
Feature: Order Fulfillment Saga (Integration)
  As an order management system
  I want to coordinate order fulfillment across bounded contexts
  So that orders are confirmed when stock is available and cancelled when not

  Background:
    Given the backend is running and clean

  # =============================================================================
  # Happy Path Scenarios
  # =============================================================================

  @happy-path
  Scenario: Complete saga when stock is available for single item order
    Given a product "prod-saga-01" exists with 100 available stock
    And a draft order "order-saga-01" exists with items:
      | productId      | productName  | quantity | unitPrice |
      | prod-saga-01   | Test Widget  | 5        | 10        |
    When I submit order "order-saga-01"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"
    And the order "order-saga-01" should have status "confirmed"
    And the reservation for order "order-saga-01" should have status "confirmed"
    And the product "prod-saga-01" should have less than 100 available stock

  @happy-path
  Scenario: Complete saga when stock is available for multi-item order
    Given a product "prod-saga-02a" exists with 50 available stock
    And a product "prod-saga-02b" exists with 30 available stock
    And a draft order "order-saga-02" exists with items:
      | productId       | productName | quantity | unitPrice |
      | prod-saga-02a   | Product 1   | 5        | 10        |
      | prod-saga-02b   | Product 2   | 3        | 20        |
    When I submit order "order-saga-02"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"
    And the order "order-saga-02" should have status "confirmed"

  # =============================================================================
  # Compensation Scenarios
  # =============================================================================

  @compensation
  Scenario: Cancel order when insufficient stock for single item
    Given a product "prod-saga-03" exists with 3 available stock
    And a draft order "order-saga-03" exists with items:
      | productId      | productName           | quantity | unitPrice |
      | prod-saga-03   | Limited Stock Product | 10       | 10        |
    When I submit order "order-saga-03"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"
    And the order "order-saga-03" should have status "cancelled"
    And the product "prod-saga-03" should have 3 available and 0 reserved stock

  @compensation
  Scenario: Cancel order when one item in multi-item order has insufficient stock
    Given a product "prod-saga-04a" exists with 100 available stock
    And a product "prod-saga-04b" exists with 2 available stock
    And a draft order "order-saga-04" exists with items:
      | productId       | productName   | quantity | unitPrice |
      | prod-saga-04a   | Plenty Stock  | 5        | 10        |
      | prod-saga-04b   | Limited Stock | 10       | 20        |
    When I submit order "order-saga-04"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"
    And the order "order-saga-04" should have status "cancelled"
    And the product "prod-saga-04a" should have 100 available and 0 reserved stock

  # =============================================================================
  # Idempotency Scenarios
  # =============================================================================

  @idempotency
  Scenario: Saga runs only once per order
    Given a product "prod-saga-05" exists with 100 available stock
    And a draft order "order-saga-05" exists with items:
      | productId      | productName  | quantity | unitPrice |
      | prod-saga-05   | Test Product | 5        | 10        |
    When I submit order "order-saga-05"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"
    And only one saga should exist for order "order-saga-05"
    And the reservation for order "order-saga-05" should have status "confirmed"

  # =============================================================================
  # Workflow State Scenarios
  # =============================================================================

  @workflow-state
  Scenario: Saga status is completed after successful fulfillment
    Given a product "prod-saga-06" exists with 100 available stock
    And a draft order "order-saga-06" exists with items:
      | productId      | productName  | quantity | unitPrice |
      | prod-saga-06   | Test Product | 5        | 10        |
    When I submit order "order-saga-06"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"
    And the saga should have a workflow ID

  @workflow-state
  Scenario: Saga status is completed after compensation
    Given a product "prod-saga-07" exists with 2 available stock
    And a draft order "order-saga-07" exists with items:
      | productId      | productName     | quantity | unitPrice |
      | prod-saga-07   | Limited Product | 10       | 10        |
    When I submit order "order-saga-07"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"

  @workflow-state
  Scenario: Saga has completedAt timestamp after completion
    Given a product "prod-saga-08" exists with 100 available stock
    And a draft order "order-saga-08" exists with items:
      | productId      | productName  | quantity | unitPrice |
      | prod-saga-08   | Test Product | 5        | 10        |
    When I submit order "order-saga-08"
    Then the command should succeed
    And I wait for the saga to complete with timeout 60000
    And the saga status should be "completed"
    And the saga should have a completedAt timestamp
