@inventory @commands
Feature: Create Product
  As an inventory manager
  I want to create new products in the catalog
  So that they can be sold and tracked

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully create a new product
    Given no product exists with ID "prod_test_001"
    When I send a CreateProduct command with:
      | field       | value           |
      | productId   | prod_test_001   |
      | productName | Test Widget     |
      | sku         | SKU-TEST-001    |
      | unitPrice   | 29.99           |
    Then the command should succeed

  @validation
  Scenario: Cannot create product with existing ID
    Given a product "prod_test_002" already exists
    When I send a CreateProduct command with:
      | field       | value           |
      | productId   | prod_test_002   |
      | productName | Another Widget  |
      | sku         | SKU-TEST-002    |
      | unitPrice   | 19.99           |
    Then the command should be rejected with code "PRODUCT_ALREADY_EXISTS"

  @idempotency
  Scenario: CreateProduct is idempotent with same commandId
    Given no product exists with ID "prod_test_004"
    When I send a CreateProduct command twice with the same commandId for product "prod_test_004"
    Then the second command should return duplicate status
