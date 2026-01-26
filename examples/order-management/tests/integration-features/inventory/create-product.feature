@inventory @integration @commands
Feature: Create Product (Integration)
  As an inventory manager
  I want to create new products in the catalog
  So that they can be sold and tracked

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Successfully create a new product and verify projection
    When I create a product with:
      | productId   | productName | sku          | unitPrice |
      | prod-int-01 | Test Widget | SKU-INT-001  | 29.99     |
    Then the command should succeed
    And I wait for projections to process
    And the product "prod-int-01" should exist with name "Test Widget"
    And the product "prod-int-01" should have 0 available stock

  @validation
  Scenario: Reject duplicate product ID
    Given a product "prod-int-02" exists
    When I create a product with:
      | productId   | productName    | sku         | unitPrice |
      | prod-int-02 | Another Widget | SKU-INT-002 | 19.99     |
    Then the command should be rejected with code "PRODUCT_ALREADY_EXISTS"

  @validation
  Scenario: Reject duplicate SKU
    Given a product with SKU "SKU-DUP-001" exists
    When I create a product with:
      | productId   | productName | sku         | unitPrice |
      | prod-int-03 | New Widget  | SKU-DUP-001 | 39.99     |
    Then the command should be rejected with code "SKU_ALREADY_EXISTS"

  @idempotency
  Scenario: CreateProduct is idempotent with same commandId
    When I create a product with commandId "cmd-prod-idem-01":
      | productId   | productName  | sku         | unitPrice |
      | prod-int-04 | Test Product | SKU-INT-004 | 29.99     |
    And I create a product with commandId "cmd-prod-idem-01":
      | productId   | productName  | sku         | unitPrice |
      | prod-int-04 | Test Product | SKU-INT-004 | 29.99     |
    Then the second command should return duplicate status
