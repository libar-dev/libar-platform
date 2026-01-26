@batch @integration @orders
Feature: Order Batch Operations (Integration)
  As an order operator
  I want to add or remove multiple items from an order in a single batch
  So that I can efficiently manage order contents

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Add multiple items to order in batch
    Given a draft order "ord-batch-01" exists
    When I add multiple items to order "ord-batch-01" in batch:
      | productId | productName | quantity | unitPrice |
      | prod_a    | Widget A    | 2        | 10        |
      | prod_b    | Widget B    | 1        | 25        |
      | prod_c    | Widget C    | 3        | 15        |
    Then the batch should succeed with 3 items
    And the batch should have 0 failures
    And I wait for projections to process
    And the order "ord-batch-01" should have 3 items
    And the order "ord-batch-01" total should be 90

  @execution-order
  Scenario: Batch respects order of execution
    Given a draft order "ord-batch-02" exists with items:
      | productId | productName   | quantity | unitPrice |
      | prod_1    | Product 1     | 1        | 10        |
      | prod_2    | Product 2     | 1        | 10        |
      | prod_3    | Product 3     | 1        | 10        |
    When I remove multiple items from order "ord-batch-02" in batch:
      | productId |
      | prod_1    |
      | prod_2    |
    Then the batch should succeed with 2 items
    And I wait for projections to process
    And the order "ord-batch-02" should have 1 item
    And the order "ord-batch-02" total should be 10

  @atomic-failure
  Scenario: Batch stops on first failure in atomic mode
    Given a submitted order "ord-batch-03" exists with items:
      | productId | productName | quantity | unitPrice |
      | prod_exist| Existing    | 1        | 10        |
    When I add multiple items to order "ord-batch-03" in batch:
      | productId | productName | quantity | unitPrice |
      | prod_x    | Widget X    | 1        | 10        |
      | prod_y    | Widget Y    | 1        | 20        |
    Then the batch should have 1 rejection
    And the batch should have 1 skipped
    And the batch should have 0 successes
