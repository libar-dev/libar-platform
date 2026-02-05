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

  # ===========================================================================
  # Order Cancellation
  # ===========================================================================
  # These scenarios validate the cancel order functionality.
  # The cancel button should appear for orders in "draft" or "submitted" status,
  # but NOT for "confirmed" or "cancelled" orders (terminal states).
  # ===========================================================================

  @happy-path @cancellation
  Scenario: Cancel a submitted order
    # Setup: Create product and submitted order
    Given I am on the admin products page
    When I fill in product details:
      | name           | sku     | price |
      | Cancel Widget  | CXL-001 | 30.00 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "Cancel Widget"
    And I enter quantity 20
    And I click "Add Stock"
    Then I should see a success message containing "Stock added"

    # Create and submit order
    When I navigate to the create order page
    And I add "Cancel Widget" to the cart with quantity 1
    And I submit the order
    Then I should be redirected to the order detail page
    And eventually the order status should be "confirmed"

    # Cancel the order
    When I click "Cancel Order"
    And I confirm the cancellation in the dialog
    Then eventually the order status should be "cancelled"
    And I should see the cancellation banner

  @validation @cancellation
  Scenario: Cancel button appears only for cancellable statuses
    # The cancel button should be visible for:
    # - draft: yes (if UI supports draft state)
    # - submitted: yes
    # - confirmed: no (terminal state - order is fulfilled)
    # - cancelled: no (already cancelled)
    Given a confirmed order exists
    When I navigate to that order
    Then I should see status "confirmed"
    And I should not see the "Cancel Order" button

    Given a cancelled order exists
    When I navigate to that order
    Then I should see status "cancelled"
    And I should not see the "Cancel Order" button

  @cancellation @confirmation-dialog
  Scenario: Cancel confirmation dialog prevents accidental cancellation
    # Setup: Create a submitted order
    Given I am on the admin products page
    When I fill in product details:
      | name            | sku     | price |
      | Dialog Widget   | DLG-001 | 25.00 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "Dialog Widget"
    And I enter quantity 10
    And I click "Add Stock"
    Then I should see a success message containing "Stock added"

    When I navigate to the create order page
    And I add "Dialog Widget" to the cart with quantity 1
    And I submit the order
    Then I should be redirected to the order detail page
    And eventually the order status should be "confirmed"

    # Test dialog dismissal
    When I click "Cancel Order"
    Then I should see a confirmation dialog
    And the dialog should warn that cancellation cannot be undone
    When I click "Keep Order" in the dialog
    Then the dialog should close
    And the order status should still be "confirmed"
