@orders @commands @pattern:CommandOrchestrator
Feature: Create Order
  As a customer
  I want to create a new order
  So that I can add items and submit it later

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully create a new order
    Given no order exists with ID "ord_test_001"
    When I send a CreateOrder command with:
      | field      | value        |
      | orderId    | ord_test_001 |
      | customerId | cust_001     |
    Then the command should succeed

  @validation
  Scenario: Cannot create order with existing ID
    Given an order "ord_test_002" already exists
    When I send a CreateOrder command with:
      | field      | value        |
      | orderId    | ord_test_002 |
      | customerId | cust_001     |
    Then the command should be rejected with code "ORDER_ALREADY_EXISTS"

  @idempotency
  Scenario: CreateOrder is idempotent with same commandId
    Given no order exists with ID "ord_test_004"
    When I send a CreateOrder command twice with the same commandId for order "ord_test_004"
    Then the second command should return duplicate status
