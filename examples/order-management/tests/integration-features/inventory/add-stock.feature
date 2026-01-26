@inventory @integration @commands
Feature: Add Stock (Integration)
  As an inventory manager
  I want to add stock to existing products
  So that products are available for sale

  Background:
    Given the backend is running and clean

  @happy-path
  Scenario: Successfully add stock to existing product
    Given a product "prod-stock-01" exists with 0 stock
    When I add stock to product "prod-stock-01":
      | quantity | reason        |
      | 50       | Initial stock |
    Then the command should succeed
    And I wait for projections to process
    And the product "prod-stock-01" should have 50 available stock

  @validation
  Scenario: Reject adding stock to non-existent product
    When I add stock to product "prod-nonexistent":
      | quantity | reason         |
      | 10       | Stock addition |
    Then the command should be rejected with code "PRODUCT_NOT_FOUND"

  @idempotency
  Scenario: AddStock is idempotent with same commandId
    Given a product "prod-stock-02" exists with 10 stock
    When I add stock with commandId "cmd-stock-idem-01" to product "prod-stock-02":
      | quantity | reason     |
      | 20       | Test stock |
    And I add stock with commandId "cmd-stock-idem-01" to product "prod-stock-02":
      | quantity | reason     |
      | 20       | Test stock |
    Then the second command should return duplicate status
