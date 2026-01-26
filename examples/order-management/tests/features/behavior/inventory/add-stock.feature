@inventory @commands
Feature: Add Stock
  As an inventory manager
  I want to add stock to existing products
  So that products are available for sale

  Background:
    Given the system is ready

  @happy-path
  Scenario: Successfully add stock to existing product
    Given a product "prod_stock_001" exists
    When I send an AddStock command with:
      | field     | value          |
      | productId | prod_stock_001 |
      | quantity  | 50             |
      | reason    | Initial stock  |
    Then the command should succeed

  @happy-path
  Scenario: Add stock to product with existing stock
    Given a product "prod_stock_002" exists with stock
    When I send an AddStock command with:
      | field     | value            |
      | productId | prod_stock_002   |
      | quantity  | 20               |
      | reason    | Restocking order |
    Then the command should succeed

  @validation
  Scenario: Cannot add stock to non-existent product
    Given no product exists with ID "prod_nonexistent"
    When I send an AddStock command with:
      | field     | value            |
      | productId | prod_nonexistent |
      | quantity  | 10               |
      | reason    | Stock addition   |
    Then the command should be rejected with code "PRODUCT_NOT_FOUND"

  @idempotency
  Scenario: AddStock is idempotent with same commandId
    Given a product "prod_stock_003" exists with stock
    When I send an AddStock command twice with the same commandId for product "prod_stock_003"
    Then the second command should return duplicate status
