@orders @critical
Feature: Create Order

  Background:
    Given products exist with stock

  @happy-path @eventual-consistency
  Scenario: Create and submit order successfully
    When I navigate to the create order page
    And I add "Test Product" to cart with quantity 2
    Then the cart total should be correct
    When I click "Create Order"
    Then I should be redirected to order detail
    And the order status should be "submitted"
    And eventually the order status should be "confirmed"

  @validation
  Scenario: Cannot submit empty cart
    When I navigate to the create order page
    Then the Create Order button should be disabled

  @cart-management
  Scenario: Update quantity in cart
    When I add a product to cart
    And I change the quantity to 3
    Then the cart total should update

  @cart-management
  Scenario: Remove item from cart
    When I add two products to cart
    And I remove one product
    Then only one product should remain
