@admin @stock
Feature: Add Stock (Admin)
  As an admin user
  I want to add stock to existing products
  So that products are available for customers to order

  Background:
    Given a product "Stock Test Widget" with SKU "STW-001" exists

  @happy-path @eventual-consistency
  Scenario: Add stock successfully
    Given I am on the admin products page
    When I switch to the "Add Stock" tab
    And I select the product "Stock Test Widget"
    And I enter quantity 50
    And I click "Add Stock"
    Then I should see a success message containing "Stock added successfully"
    And eventually the product "Stock Test Widget" should show 50 units in stock

  @happy-path
  Scenario: Add stock with reason
    Given I am on the admin products page
    When I switch to the "Add Stock" tab
    And I select the product "Stock Test Widget"
    And I enter quantity 25
    And I enter reason "Restocking from supplier shipment"
    And I click "Add Stock"
    Then I should see a success message containing "Stock added successfully"

  @validation
  Scenario: Cannot add stock without selecting product
    Given I am on the admin products page
    When I switch to the "Add Stock" tab
    And I enter quantity 50
    And I click "Add Stock"
    Then I should see validation error "Please select a product"

  @validation
  Scenario: Cannot add zero quantity
    Given I am on the admin products page
    When I switch to the "Add Stock" tab
    And I select the product "Stock Test Widget"
    And I enter quantity 0
    And I click "Add Stock"
    Then I should see validation error "Quantity must be at least 1"

  @validation
  Scenario: Cannot add stock without quantity
    Given I am on the admin products page
    When I switch to the "Add Stock" tab
    And I select the product "Stock Test Widget"
    And I click "Add Stock"
    Then I should see validation error "Quantity is required"
