@deciders @orders @evolve @pattern:DeciderTypes
Feature: Order State Evolution
  Pure evolve functions that apply events to produce new state.

  These functions are the second half of the Decider pattern:
  - decide(state, command) -> event (tested in *.decider.feature)
  - evolve(state, event) -> new state (tested here)

  Evolve functions enable:
  - Projection rebuilding from events
  - Property-based testing
  - Event replay for debugging

  Background:
    Given the evolve functions are available

  # ==========================================================================
  # OrderCreated Evolve
  # ==========================================================================

  @evolve @create
  Scenario: OrderCreated evolves null to initial state
    Given no prior order state
    When OrderCreated event is applied:
      | field      | value    |
      | orderId    | ord_001  |
      | customerId | cust_001 |
    Then state should have orderId "ord_001"
    And state should have customerId "cust_001"
    And state should have status "draft"
    And state should have empty items
    And state should have totalAmount 0

  # ==========================================================================
  # OrderItemAdded Evolve
  # ==========================================================================

  @evolve @items
  Scenario: OrderItemAdded appends item to empty order
    Given an order state with:
      | field       | value   |
      | orderId     | ord_001 |
      | status      | draft   |
      | itemCount   | 0       |
      | totalAmount | 0       |
    When OrderItemAdded event is applied:
      | field          | value           |
      | productId      | prod_001        |
      | productName    | Widget Pro      |
      | quantity       | 2               |
      | unitPrice      | 25.00           |
      | newTotalAmount | 50.00           |
    Then state should have 1 items
    And state should have totalAmount "50.00"
    And state should have item with productId "prod_001"

  @evolve @items
  Scenario: OrderItemAdded accumulates with existing items
    Given an order state with:
      | field       | value   |
      | orderId     | ord_001 |
      | status      | draft   |
      | itemCount   | 1       |
      | totalAmount | 20.00   |
    When OrderItemAdded event is applied:
      | field          | value       |
      | productId      | prod_002    |
      | productName    | Gadget Plus |
      | quantity       | 1           |
      | unitPrice      | 30.00       |
      | newTotalAmount | 50.00       |
    Then state should have 2 items
    And state should have totalAmount "50.00"

  # ==========================================================================
  # OrderItemRemoved Evolve
  # ==========================================================================

  @evolve @items
  Scenario: OrderItemRemoved removes item and updates total
    Given an order state with item:
      | field       | value    |
      | productId   | prod_001 |
      | productName | Widget   |
      | quantity    | 2        |
      | unitPrice   | 25.00    |
    When OrderItemRemoved event is applied:
      | field          | value    |
      | productId      | prod_001 |
      | newTotalAmount | 0        |
    Then state should have 0 items
    And state should have totalAmount 0

  # ==========================================================================
  # OrderSubmitted Evolve
  # ==========================================================================

  @evolve @status
  Scenario: OrderSubmitted changes status to submitted
    Given an order state with:
      | field  | value |
      | status | draft |
    When OrderSubmitted event is applied
    Then state should have status "submitted"

  # ==========================================================================
  # OrderConfirmed Evolve
  # ==========================================================================

  @evolve @status
  Scenario: OrderConfirmed changes status to confirmed
    Given an order state with:
      | field  | value     |
      | status | submitted |
    When OrderConfirmed event is applied
    Then state should have status "confirmed"

  # ==========================================================================
  # OrderCancelled Evolve
  # ==========================================================================

  @evolve @status
  Scenario: OrderCancelled changes status from draft to cancelled
    Given an order state with:
      | field  | value |
      | status | draft |
    When OrderCancelled event is applied
    Then state should have status "cancelled"

  @evolve @status
  Scenario: OrderCancelled changes status from submitted to cancelled
    Given an order state with:
      | field  | value     |
      | status | submitted |
    When OrderCancelled event is applied
    Then state should have status "cancelled"

  @evolve @status
  Scenario: OrderCancelled changes status from confirmed to cancelled
    Given an order state with:
      | field  | value     |
      | status | confirmed |
    When OrderCancelled event is applied
    Then state should have status "cancelled"
