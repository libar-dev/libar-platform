@inventory @domain @unit
Feature: Inventory Domain Functions

  As a developer working with the Inventory bounded context
  I want pure domain functions to behave correctly
  So that inventory state is calculated, initialized, and upcasted reliably

  Background: Inventory domain module is available
    Given the inventory domain module is imported

  # ============================================================================
  # Total Quantity Calculation
  # ============================================================================

  Rule: calculateTotalQuantity returns the sum of available and reserved quantities

    **Invariant:** Total quantity always equals availableQuantity + reservedQuantity
    **Rationale:** Consumers need a single number representing all stock (both available and reserved)
    **Verified by:** Sum of available and reserved, Only available when reserved is zero, Only reserved when available is zero, Both quantities are zero

    @acceptance-criteria @happy-path
    Scenario: Sum of available and reserved
      Given an inventory CMS with availableQuantity 100 and reservedQuantity 25
      When I calculate the total quantity
      Then the total quantity is 125

    @acceptance-criteria @validation
    Scenario: Only available when reserved is zero
      Given an inventory CMS with availableQuantity 50 and reservedQuantity 0
      When I calculate the total quantity
      Then the total quantity is 50

    Scenario: Only reserved when available is zero
      Given an inventory CMS with availableQuantity 0 and reservedQuantity 30
      When I calculate the total quantity
      Then the total quantity is 30

    Scenario: Both quantities are zero
      Given an inventory CMS with availableQuantity 0 and reservedQuantity 0
      When I calculate the total quantity
      Then the total quantity is 0

  # ============================================================================
  # Initial CMS Creation
  # ============================================================================

  Rule: createInitialInventoryCMS produces a correctly initialized CMS record

    **Invariant:** New inventory CMS has zero stock, version 0, current stateVersion, and matching timestamps
    **Rationale:** Initial state must be deterministic and consistent for the dual-write pattern
    **Verified by:** CMS fields match input parameters, Initial quantities and version are zero, Timestamps are set to current time

    @acceptance-criteria @happy-path
    Scenario: CMS fields match input parameters
      When I create an initial inventory CMS with productId "prod_123", productName "Test Widget", sku "SKU-TEST-001", and unitPrice 29.99
      Then the CMS has the following field values:
        | field       | value        |
        | productId   | prod_123     |
        | productName | Test Widget  |
        | sku         | SKU-TEST-001 |
        | unitPrice   | 29.99        |

    @acceptance-criteria @validation
    Scenario: Initial quantities and version are zero
      When I create an initial inventory CMS with productId "prod_123", productName "Test", sku "SKU-001", and unitPrice 10.00
      Then the CMS has the following numeric field values:
        | field             | value |
        | availableQuantity | 0     |
        | reservedQuantity  | 0     |
        | version           | 0     |
      And the CMS stateVersion equals the current inventory CMS version

    Scenario: Timestamps are set to current time
      Given I record the current time
      When I create an initial inventory CMS with productId "prod_123", productName "Test", sku "SKU-001", and unitPrice 10.00
      Then the CMS createdAt is between the recorded time and now
      And the CMS updatedAt equals createdAt

  # ============================================================================
  # CMS Upcasting
  # ============================================================================

  Rule: upcastInventoryCMS migrates older CMS versions to the current version

    **Invariant:** Upcasting always produces a CMS at CURRENT_INVENTORY_CMS_VERSION without data loss
    **Rationale:** Schema evolution must be transparent - old data is silently migrated on read
    **Verified by:** Current version CMS is unchanged, Missing stateVersion is upgraded, Version 0 is upgraded, All fields are preserved during upcast

    @acceptance-criteria @happy-path
    Scenario: Current version CMS is unchanged
      Given an inventory CMS at the current stateVersion with productId "prod_123" and availableQuantity 100
      When I upcast the inventory CMS
      Then the upcasted CMS equals the original CMS
      And the upcasted CMS stateVersion equals the current inventory CMS version

    @acceptance-criteria @validation
    Scenario: Missing stateVersion is upgraded
      Given an inventory CMS without a stateVersion field and with productId "prod_123" and availableQuantity 50
      When I upcast the inventory CMS
      Then the upcasted CMS stateVersion equals the current inventory CMS version
      And the upcasted CMS productId is "prod_123"
      And the upcasted CMS availableQuantity is 50

    Scenario: Version 0 is upgraded
      Given an inventory CMS with stateVersion 0, productId "prod_123", availableQuantity 75, and reservedQuantity 15
      When I upcast the inventory CMS
      Then the upcasted CMS stateVersion equals the current inventory CMS version
      And the upcasted CMS has the following preserved fields:
        | field             | value    |
        | productId         | prod_123 |
        | availableQuantity | 75       |
        | reservedQuantity  | 15       |

    Scenario: All fields are preserved during upcast
      Given an inventory CMS with stateVersion 0 and the following fields:
        | field             | value           |
        | productId         | prod_abc        |
        | productName       | Widget Deluxe   |
        | sku               | SKU-DELUXE-001  |
        | availableQuantity | 200             |
        | reservedQuantity  | 50              |
        | version           | 10              |
        | createdAt         | 5000            |
        | updatedAt         | 6000            |
      When I upcast the inventory CMS
      Then the upcasted CMS has the following preserved fields:
        | field             | value          |
        | productId         | prod_abc       |
        | productName       | Widget Deluxe  |
        | sku               | SKU-DELUXE-001 |
        | availableQuantity | 200            |
        | reservedQuantity  | 50             |
        | version           | 10             |
        | createdAt         | 5000           |
        | updatedAt         | 6000           |

  Rule: upcastInventoryCMS rejects future CMS versions

    **Invariant:** CMS versions newer than the code understands must cause an error
    **Rationale:** Prevents silent data corruption from running old code against new data
    **Verified by:** Future version throws error

    @acceptance-criteria @validation
    Scenario: Future version throws error
      Given an inventory CMS with a stateVersion 10 higher than the current version
      When I attempt to upcast the inventory CMS
      Then an error is thrown mentioning "newer than supported version"
