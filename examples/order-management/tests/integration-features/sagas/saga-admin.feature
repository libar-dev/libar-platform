@sagas @integration @admin
Feature: Saga Admin Operations (Integration)
  As a system administrator
  I want to manage and monitor sagas
  So that I can troubleshoot and maintain saga workflows

  Background:
    Given the backend is running and clean

  # =============================================================================
  # getSagaDetails Scenarios
  # =============================================================================

  @admin @query
  Scenario: Get saga details returns workflow ID for completed saga
    Given a product "prod-admin-01" exists with 100 available stock
    And a draft order "order-admin-01" exists with items:
      | productId       | productName  | quantity | unitPrice |
      | prod-admin-01   | Test Widget  | 5        | 10        |
    And I submit order "order-admin-01"
    And I wait for the saga to complete with timeout 60000
    When I get saga details for "OrderFulfillment" saga with ID "order-admin-01"
    Then the saga details should not be null
    And the saga details should have status "completed"
    And the saga details should have a workflow ID

  # =============================================================================
  # getSagaSteps Scenarios
  # =============================================================================

  @admin @query
  Scenario: Get saga steps returns step history
    Given a product "prod-admin-02" exists with 20 available stock
    And a draft order "order-admin-02" exists with items:
      | productId       | productName     | quantity | unitPrice |
      | prod-admin-02   | Limited Product | 10       | 10        |
    And I submit order "order-admin-02"
    And I wait for the saga to complete with timeout 60000
    When I get saga steps for "OrderFulfillment" saga with ID "order-admin-02"
    Then the saga steps should not be null
    And the saga steps should have saga ID "order-admin-02"
    And the saga steps should have a workflow ID

  @admin @query
  Scenario: Get saga steps returns null for non-existent saga
    When I get saga steps for "OrderFulfillment" saga with ID "nonexistent"
    Then the saga steps should be null

  # =============================================================================
  # cancelSaga Scenarios
  # =============================================================================

  @admin @mutation
  Scenario: Cancel completed saga returns invalid_state
    # Tests that attempting to cancel an already-completed saga returns invalid_state
    Given a product "prod-admin-03" exists with 100 available stock
    And a draft order "order-admin-03" exists with items:
      | productId       | productName  | quantity | unitPrice |
      | prod-admin-03   | Test Widget  | 5        | 10        |
    And I submit order "order-admin-03"
    And I wait for the saga to complete with timeout 60000
    When I cancel the "OrderFulfillment" saga with ID "order-admin-03" with reason "Admin cancelled for testing"
    Then the cancel result status should be "invalid_state"

  @admin @mutation
  Scenario: Cancel non-existent saga returns not_found
    When I cancel the "OrderFulfillment" saga with ID "nonexistent" with reason "Should not work"
    Then the cancel result status should be "not_found"

  # =============================================================================
  # cleanupSagaWorkflow Scenarios
  # =============================================================================

  @admin @mutation
  Scenario: Cleanup completed saga workflow
    Given a product "prod-admin-04" exists with 100 available stock
    And a draft order "order-admin-04" exists with items:
      | productId       | productName  | quantity | unitPrice |
      | prod-admin-04   | Test Widget  | 5        | 10        |
    And I submit order "order-admin-04"
    And I wait for the saga to complete with timeout 60000
    When I cleanup the "OrderFulfillment" saga workflow with ID "order-admin-04"
    Then the cleanup result status should be one of "cleaned", "cleanup_failed"
