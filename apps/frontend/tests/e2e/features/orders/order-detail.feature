@orders @detail
Feature: Order Detail

  @happy-path
  Scenario: View confirmed order
    Given a confirmed order exists
    When I navigate to that order
    Then I should see status "confirmed"
    And I should see "Stock Reserved" badge

  @cancelled-state
  Scenario: View cancelled order
    Given a cancelled order exists
    When I navigate to that order
    Then I should see status "cancelled"
    And I should see the cancellation reason

  @reactive-projection @eventual-consistency
  Scenario: Order detail shows instant status updates via reactive projection
    # ============================================
    # This scenario validates reactive projections provide instant UI updates.
    # The order detail page uses useReactiveOrderDetail hook which applies
    # events optimistically before the durable projection catches up.
    # ============================================

    # Setup: Create product with stock
    Given I am on the admin products page
    When I fill in product details:
      | name            | sku     | price |
      | Reactive Widget | RXV-001 | 45.00 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "Reactive Widget"
    And I enter quantity 50
    And I click "Add Stock"
    Then I should see a success message containing "Stock added"

    # ============================================
    # Create and submit order
    # ============================================
    When I navigate to the create order page
    And I add "Reactive Widget" to the cart with quantity 2
    And I submit the order

    # ============================================
    # Verify reactive updates during saga processing
    # The page should show "submitted" immediately, then transition to "confirmed"
    # Reactive projections enable this transition to appear instantly (10-50ms)
    # vs polling-based approach (100-500ms)
    # ============================================
    Then I should be redirected to the order detail page
    And the order status should be "submitted"
    # Saga processes the order and confirms reservation
    And eventually the order status should be "confirmed"
    And eventually the reservation status should be "Stock Reserved"

    # ============================================
    # Verify stock was reduced (confirms full flow works)
    # ============================================
    When I navigate to the products page
    Then eventually the product "Reactive Widget" should show "48" units in stock
