@admin @products
Feature: Create Product (Admin)
  As an admin user
  I want to create new products in the system
  So that customers can order them

  Background:
    Given I am on the admin products page

  @happy-path @eventual-consistency
  Scenario: Create product successfully
    When I fill in product details:
      | name        | sku     | price |
      | Test Widget | WDG-001 | 49.99 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"
    And eventually the product "Test Widget" should appear in the inventory list

  @validation
  Scenario: Validation errors on empty form
    When I click "Create Product" without filling the form
    Then I should see validation error "Product name is required"
    And I should see validation error "SKU is required"
    And I should see validation error "Unit price is required"

  @validation
  Scenario: Invalid SKU format
    When I fill in the product name "Invalid SKU Product"
    And I fill in the SKU "invalid sku!"
    And I fill in the price "29.99"
    And I click "Create Product"
    Then I should see validation error "SKU should contain only letters, numbers, and hyphens"

  @validation
  Scenario: Invalid price - zero value
    When I fill in the product name "Zero Price Product"
    And I fill in the SKU "ZPP-001"
    And I fill in the price "0"
    And I click "Create Product"
    Then I should see validation error "Unit price must be a positive number"

  @validation
  Scenario: Invalid price - exceeds maximum
    When I fill in the product name "Expensive Product"
    And I fill in the SKU "EXP-001"
    And I fill in the price "100000"
    And I click "Create Product"
    Then I should see validation error "Unit price cannot exceed $99,999.99"
