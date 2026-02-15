@unit @domain @orders
Feature: Order Domain Functions

  As a developer working with the Order aggregate
  I want pure domain functions for order calculations, initialization, and upcasting
  So that order state is computed correctly without side effects

  # ============================================================================
  # Total Amount Calculation
  # ============================================================================

  Rule: calculateTotalAmount computes the sum of quantity * unitPrice for all items

    Invariant: Total amount equals the sum of (quantity * unitPrice) for each item.
    Rationale: Accurate totals are critical for order pricing and downstream billing.
    Verified by: Scenarios covering empty, single, multiple items, zeros, and decimals.

    @acceptance-criteria @happy-path
    Scenario: Empty items array returns zero
      Given an empty items array
      When I calculate the total amount
      Then the total amount is 0

    Scenario: Single item total
      Given an items array with:
        | productId | productName | quantity | unitPrice |
        | prod_1    | Widget      | 2        | 10.5      |
      When I calculate the total amount
      Then the total amount is 21

    Scenario: Multiple items total
      Given an items array with:
        | productId | productName | quantity | unitPrice |
        | prod_1    | Widget      | 2        | 10        |
        | prod_2    | Gadget      | 3        | 15        |
        | prod_3    | Sprocket    | 1        | 5         |
      When I calculate the total amount
      Then the total amount is 70

    @acceptance-criteria @validation
    Scenario: Zero quantity results in zero contribution
      Given an items array with:
        | productId | productName | quantity | unitPrice |
        | prod_1    | Widget      | 0        | 10        |
      When I calculate the total amount
      Then the total amount is 0

    Scenario: Zero price results in zero contribution
      Given an items array with:
        | productId | productName | quantity | unitPrice |
        | prod_1    | Free Sample | 5        | 0         |
      When I calculate the total amount
      Then the total amount is 0

    Scenario: Decimal prices are handled correctly
      Given an items array with:
        | productId | productName | quantity | unitPrice |
        | prod_1    | Widget      | 3        | 9.99      |
      When I calculate the total amount
      Then the total amount is approximately 29.97

  # ============================================================================
  # Initial Order CMS Creation
  # ============================================================================

  Rule: createInitialOrderCMS produces a draft order with correct defaults

    Invariant: New orders start as draft with zero totals and empty items.
    Rationale: A consistent initial state prevents invalid order processing.
    Verified by: Scenarios checking each field of the newly created CMS.

    @acceptance-criteria @happy-path
    Scenario: CMS is created with the provided orderId and customerId
      Given I create an initial order CMS with orderId "ord_123" and customerId "cust_456"
      Then the CMS has the following field values:
        | field      | value    |
        | orderId    | ord_123  |
        | customerId | cust_456 |

    Scenario: CMS initializes with draft status
      Given I create an initial order CMS with orderId "ord_123" and customerId "cust_456"
      Then the CMS status is "draft"

    Scenario: CMS initializes with empty items array
      Given I create an initial order CMS with orderId "ord_123" and customerId "cust_456"
      Then the CMS items array is empty

    Scenario: CMS initializes with zero totalAmount
      Given I create an initial order CMS with orderId "ord_123" and customerId "cust_456"
      Then the CMS totalAmount is 0

    Scenario: CMS initializes with version 0
      Given I create an initial order CMS with orderId "ord_123" and customerId "cust_456"
      Then the CMS version is 0

    Scenario: CMS initializes with current state version
      Given I create an initial order CMS with orderId "ord_123" and customerId "cust_456"
      Then the CMS stateVersion equals CURRENT_ORDER_CMS_VERSION

    @acceptance-criteria @validation
    Scenario: CMS sets createdAt and updatedAt to current timestamp
      Given a timestamp is captured before creation
      And I create an initial order CMS with orderId "ord_123" and customerId "cust_456"
      Then the CMS createdAt is between the before and after timestamps
      And the CMS updatedAt equals createdAt

  # ============================================================================
  # Order CMS Upcasting
  # ============================================================================

  Rule: upcastOrderCMS migrates older CMS versions to current version

    Invariant: Upcasting always produces a CMS at CURRENT_ORDER_CMS_VERSION.
    Rationale: Schema evolution must be transparent to consuming code.
    Verified by: Scenarios for current version, missing version, version 0, and field preservation.

    @acceptance-criteria @happy-path
    Scenario: CMS already at current version is returned unchanged
      Given an OrderCMS at the current stateVersion with:
        | field       | value     |
        | orderId     | ord_123   |
        | customerId  | cust_456  |
        | status      | draft     |
        | totalAmount | 0         |
        | version     | 1         |
        | createdAt   | 1000      |
        | updatedAt   | 1000      |
      When I upcast the OrderCMS
      Then the result equals the original CMS
      And the result stateVersion equals CURRENT_ORDER_CMS_VERSION

    @acceptance-criteria @validation
    Scenario: CMS with missing stateVersion is upgraded
      Given an OrderCMS without stateVersion and with:
        | field      | value    |
        | orderId    | ord_123  |
        | customerId | cust_456 |
      When I upcast the OrderCMS
      Then the result stateVersion equals CURRENT_ORDER_CMS_VERSION
      And the result preserves the original field values

    Scenario: CMS with stateVersion 0 is upgraded
      Given an OrderCMS at stateVersion 0 with:
        | field       | value     |
        | orderId     | ord_123   |
        | customerId  | cust_456  |
        | status      | submitted |
        | totalAmount | 10        |
        | version     | 3         |
        | createdAt   | 1000      |
        | updatedAt   | 2000      |
      And the CMS has 1 item
      When I upcast the OrderCMS
      Then the result stateVersion equals CURRENT_ORDER_CMS_VERSION
      And the result status is "submitted"
      And the result has 1 item
      And the result totalAmount is 10

    Scenario: All fields are preserved during upcast
      Given an OrderCMS at stateVersion 0 with:
        | field       | value     |
        | orderId     | ord_abc   |
        | customerId  | cust_xyz  |
        | status      | confirmed |
        | totalAmount | 55        |
        | version     | 5         |
        | createdAt   | 5000      |
        | updatedAt   | 6000      |
      And the CMS has items:
        | productId | productName | quantity | unitPrice |
        | p1        | Widget      | 2        | 15        |
        | p2        | Gadget      | 1        | 25        |
      When I upcast the OrderCMS
      Then the upcast result preserves all fields:
        | field       | value     |
        | orderId     | ord_abc   |
        | customerId  | cust_xyz  |
        | status      | confirmed |
        | totalAmount | 55        |
        | version     | 5         |
        | createdAt   | 5000      |
        | updatedAt   | 6000      |
      And the result items match the original items
