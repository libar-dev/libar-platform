@e2e @critical @journey
Feature: Full Order Journey
  Complete end-to-end flow from product creation to order confirmation.
  This is the CRITICAL test that validates the entire DDD/ES/CQRS architecture
  including commands, events, projections, and sagas working together.

  @happy-path @eventual-consistency
  Scenario: Complete flow - Product creation to order confirmation
    # ============================================
    # Step 1: Admin creates a new product
    # ============================================
    Given I am on the admin products page
    When I fill in product details:
      | name           | sku     | price |
      | Journey Widget | JRN-001 | 99.99 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    # ============================================
    # Step 2: Admin adds stock to the product
    # ============================================
    When I switch to the "Add Stock" tab
    And I select the product "Journey Widget"
    And I enter quantity 100
    And I click "Add Stock"
    Then I should see a success message containing "Stock added successfully"

    # ============================================
    # Step 3: Customer views product in catalog
    # ============================================
    When I navigate to the products page
    Then eventually I should see "Journey Widget" in the product list
    And the product "Journey Widget" should show "100" units in stock

    # ============================================
    # Step 4: Customer creates an order
    # ============================================
    When I navigate to the create order page
    And I add "Journey Widget" to the cart with quantity 5
    Then the cart should show 5 items
    And the cart total should be "$499.95"

    # ============================================
    # Step 5: Customer submits the order
    # ============================================
    When I submit the order
    Then I should be redirected to the order detail page
    And the order status should be "submitted"

    # ============================================
    # Step 6: Saga processes order (reservation)
    # ============================================
    Then eventually the order status should be "confirmed"
    And eventually the reservation status should be "Stock Reserved"

    # ============================================
    # Step 7: Verify stock was reduced
    # ============================================
    When I navigate to the products page
    Then eventually the product "Journey Widget" should show "95" units in stock

  @compensation @eventual-consistency
  Scenario: Order fails due to insufficient stock - Saga compensation
    # ============================================
    # Setup: Create product with limited stock
    # ============================================
    Given I am on the admin products page
    When I fill in product details:
      | name         | sku     | price |
      | Limited Item | LTD-001 | 79.99 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "Limited Item"
    And I enter quantity 3
    And I click "Add Stock"
    Then I should see a success message containing "Stock added successfully"

    # ============================================
    # Customer attempts to order more than available
    # ============================================
    When I navigate to the create order page
    And I add "Limited Item" to the cart with quantity 10
    And I submit the order

    # ============================================
    # Saga compensation kicks in
    # ============================================
    Then I should be redirected to the order detail page
    And eventually the order status should be "cancelled"
    And eventually the reservation status should be "Reservation Failed"

    # ============================================
    # Verify stock was NOT reduced (compensation worked)
    # ============================================
    When I navigate to the products page
    Then the product "Limited Item" should show "3" units in stock

  @multi-item @eventual-consistency
  Scenario: Order with multiple items
    # ============================================
    # Setup: Create multiple products
    # ============================================
    Given I am on the admin products page

    # Create first product
    When I fill in product details:
      | name      | sku     | price |
      | Product A | PRD-A01 | 25.00 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "Product A"
    And I enter quantity 50
    And I click "Add Stock"
    Then I should see a success message containing "Stock added"

    # Create second product
    When I switch to the "Create Product" tab
    And I fill in product details:
      | name      | sku     | price |
      | Product B | PRD-B01 | 35.00 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "Product B"
    And I enter quantity 30
    And I click "Add Stock"
    Then I should see a success message containing "Stock added"
    # Wait for projection to process BEFORE navigating (follows integration test pattern)
    And eventually the product "Product B" should show "30" units in Current Inventory

    # ============================================
    # Customer creates multi-item order
    # ============================================
    When I navigate to the create order page
    And I add "Product A" to the cart with quantity 2
    And I add "Product B" to the cart with quantity 3
    Then the cart should show 5 items
    And the cart total should be "$155.00"

    When I submit the order
    Then I should be redirected to the order detail page
    And eventually the order status should be "confirmed"

    # ============================================
    # Verify stock was reduced for both products
    # ============================================
    When I navigate to the products page
    Then eventually the product "Product A" should show "48" units in stock
    And the product "Product B" should show "27" units in stock

  @dcb-atomic-rejection @eventual-consistency
  Scenario: Multi-product order rejected atomically when one product lacks stock (DCB)
    # ============================================
    # This scenario validates the DCB (Dynamic Consistency Boundary) pattern:
    # When ordering multiple products and ANY product lacks sufficient stock,
    # the ENTIRE order is rejected atomically - no partial reservations.
    # ============================================

    # ============================================
    # Setup: Create two products with different stock levels
    # ============================================
    Given I am on the admin products page

    # Create Product with plenty of stock
    When I fill in product details:
      | name             | sku     | price |
      | DCB Product High | DCB-H01 | 50.00 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "DCB Product High"
    And I enter quantity 100
    And I click "Add Stock"
    Then I should see a success message containing "Stock added"

    # Create Product with limited stock
    When I switch to the "Create Product" tab
    And I fill in product details:
      | name            | sku     | price |
      | DCB Product Low | DCB-L01 | 30.00 |
    And I click "Create Product"
    Then I should see a success message containing "created successfully"

    When I switch to the "Add Stock" tab
    And I select the product "DCB Product Low"
    And I enter quantity 5
    And I click "Add Stock"
    Then I should see a success message containing "Stock added"
    # Wait for projection to process BEFORE navigating
    And eventually the product "DCB Product Low" should show "5" units in Current Inventory

    # ============================================
    # Customer attempts multi-product order
    # DCB Product High: qty 10 (available: 100) ✓ Would succeed alone
    # DCB Product Low: qty 10 (available: 5) ✗ Insufficient
    # ============================================
    When I navigate to the create order page
    And I add "DCB Product High" to the cart with quantity 10
    And I add "DCB Product Low" to the cart with quantity 10
    And I submit the order

    # ============================================
    # DCB atomic rejection - entire order fails
    # Note: DCB rejects BEFORE any reservation is attempted,
    # so there's no reservation status (unlike saga compensation
    # which attempts reservation then rolls back)
    # ============================================
    Then I should be redirected to the order detail page
    And eventually the order status should be "cancelled"

    # ============================================
    # CRITICAL: Verify NO stock was reserved (atomic rollback)
    # DCB Product High should still have 100 (not 90) - proves atomic behavior
    # DCB Product Low should still have 5 (not 0 or -5)
    # ============================================
    When I navigate to the products page
    Then the product "DCB Product High" should show "100" units in stock
    And the product "DCB Product Low" should show "5" units in stock

  # NOTE: "Cancel a draft order" scenario was removed because:
  # 1. The UI doesn't support draft orders - "Create Order" button atomically
  #    creates + adds items + submits the order in one operation
  # 2. The cancel button only appears for status="draft", but orders go
  #    directly from non-existent → submitted → confirmed
  # 3. To test draft cancellation, a "Save as Draft" feature would need
  #    to be added to the UI first
  # See: ADR or git history for details
