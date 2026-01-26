@deciders @inventory
Feature: Create Product Decider
  Pure domain logic for creating a new product.

  The CreateProduct decider validates that:
  - No product with the same ID already exists
  - Product name is not empty
  - SKU is not empty
  - Unit price is positive

  On success, it emits ProductCreated with initial stock levels of zero.

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to create a new product when none exists
    Given no existing inventory state
    When I decide to create product with:
      | field       | value             |
      | productId   | prod_new_001      |
      | productName | Test Widget       |
      | sku         | SKU-001           |
      | unitPrice   | 29.99             |
    Then the decision should be "success"
    And the event type should be "ProductCreated"
    And the data should contain productId "prod_new_001"

  @validation
  Scenario: Reject create when product already exists
    Given an existing inventory state with productId "prod_existing"
    When I decide to create product with:
      | field       | value             |
      | productId   | prod_existing     |
      | productName | Duplicate Widget  |
      | sku         | SKU-DUP           |
      | unitPrice   | 19.99             |
    Then the decision should be "rejected"
    And the rejection code should be "PRODUCT_ALREADY_EXISTS"

  @validation
  Scenario: Reject create with empty product name
    Given no existing inventory state
    When I decide to create product with:
      | field       | value             |
      | productId   | prod_bad_001      |
      | productName |                   |
      | sku         | SKU-BAD           |
      | unitPrice   | 29.99             |
    Then the decision should be "rejected"
    And the rejection code should be "INVALID_PRODUCT_NAME"

  @validation
  Scenario: Reject create with empty SKU
    Given no existing inventory state
    When I decide to create product with:
      | field       | value             |
      | productId   | prod_bad_002      |
      | productName | Good Name         |
      | sku         |                   |
      | unitPrice   | 29.99             |
    Then the decision should be "rejected"
    And the rejection code should be "INVALID_SKU"

  @validation
  Scenario: Reject create with zero price
    Given no existing inventory state
    When I decide to create product with:
      | field       | value             |
      | productId   | prod_bad_003      |
      | productName | Zero Price Widget |
      | sku         | SKU-ZERO          |
      | unitPrice   | 0                 |
    Then the decision should be "rejected"
    And the rejection code should be "INVALID_UNIT_PRICE"

  @validation
  Scenario: Reject create with negative price
    Given no existing inventory state
    When I decide to create product with:
      | field       | value             |
      | productId   | prod_bad_004      |
      | productName | Negative Widget   |
      | sku         | SKU-NEG           |
      | unitPrice   | -10.00            |
    Then the decision should be "rejected"
    And the rejection code should be "INVALID_UNIT_PRICE"
