@libar-docs
@libar-docs-implements:WorkpoolPartitioningStrategy
Feature: Workpool Partition Key Helpers

  As a platform developer
  I want standardized partition key helper functions
  So that I can ensure consistent partition key generation across projections

  # ============================================================================
  # GLOBAL_PARTITION_KEY Constant
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: GLOBAL_PARTITION_KEY has name 'global'
    When I access GLOBAL_PARTITION_KEY
    Then the partition key name should be "global"

  @acceptance-criteria @happy-path
  Scenario: GLOBAL_PARTITION_KEY has value 'global'
    When I access GLOBAL_PARTITION_KEY
    Then the partition key value should be "global"

  # ============================================================================
  # createEntityPartitionKey - streamId Field
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Entity partition key uses streamType:streamId format
    Given a createEntityPartitionKey helper for streamType "Order"
    When called with streamId "ord-123"
    Then the partition key should be name "streamId" and value "Order:ord-123"

  @acceptance-criteria @happy-path
  Scenario: Entity partition key prioritizes streamId over other ID fields
    Given a createEntityPartitionKey helper for streamType "Order"
    When called with streamId "stream-123", orderId "ord-456", productId "prod-789"
    Then the partition key should be name "streamId" and value "Order:stream-123"

  # ============================================================================
  # createEntityPartitionKey - Fallback Fields
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario Outline: Entity partition key falls back to alternate ID fields
    Given a createEntityPartitionKey helper for streamType "<streamType>"
    When called with <idField> "<idValue>"
    Then the partition key should be name "streamId" and value "<expectedValue>"

    Examples:
      | streamType  | idField       | idValue   | expectedValue         |
      | Order       | orderId       | ord-456   | Order:ord-456         |
      | Product     | productId     | prod-789  | Product:prod-789      |
      | Reservation | reservationId | res-101   | Reservation:res-101   |

  # ============================================================================
  # createEntityPartitionKey - Error Cases
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Entity partition key throws when no ID field provided
    Given a createEntityPartitionKey helper for streamType "Order"
    When called with empty args
    Then an error should be thrown with message containing "requires streamId, orderId, productId, or reservationId"

  @acceptance-criteria @edge-case
  Scenario: Entity partition key includes available keys in error message
    Given a createEntityPartitionKey helper for streamType "Order"
    When called with customerId "cust-123" and someField "value"
    Then an error should be thrown with message containing "Received args with keys:"

  # ============================================================================
  # createEntityPartitionKey - Different Stream Types
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario Outline: Entity partition key uses provided streamType in value
    Given a createEntityPartitionKey helper for streamType "<streamType>"
    When called with <idField> "<idValue>"
    Then the partition key value should be "<expectedValue>"

    Examples:
      | streamType | idField   | idValue | expectedValue    |
      | Order      | orderId   | ord-1   | Order:ord-1      |
      | Product    | productId | prod-1  | Product:prod-1   |
      | Inventory  | streamId  | inv-1   | Inventory:inv-1  |

  # ============================================================================
  # createCustomerPartitionKey - Valid Cases
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Customer partition key returns customerId
    Given a createCustomerPartitionKey helper
    When called with customerId "cust-123"
    Then the partition key should be name "customerId" and value "cust-123"

  @acceptance-criteria @happy-path
  Scenario: Customer partition key ignores additional fields
    Given a createCustomerPartitionKey helper
    When called with customerId "cust-456", orderId "ord-789", someOtherField "value"
    Then the partition key should be name "customerId" and value "cust-456"

  # ============================================================================
  # createCustomerPartitionKey - Error Cases
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Customer partition key throws when customerId is undefined
    Given a createCustomerPartitionKey helper
    When called with customerId undefined
    Then an error should be thrown with message containing "requires customerId field"

  @acceptance-criteria @edge-case
  Scenario: Customer partition key throws when customerId is missing
    Given a createCustomerPartitionKey helper
    When called with customerId missing entirely
    Then an error should be thrown with message containing "requires customerId field"

  @acceptance-criteria @edge-case
  Scenario: Customer partition key throws when customerId is empty string
    Given a createCustomerPartitionKey helper
    When called with customerId empty string
    Then an error should be thrown with message containing "requires customerId field"

  # ============================================================================
  # createSagaPartitionKey - Valid Cases
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Saga partition key returns correlationId
    Given a createSagaPartitionKey helper
    When called with correlationId "corr-123"
    Then the partition key should be name "correlationId" and value "corr-123"

  @acceptance-criteria @happy-path
  Scenario: Saga partition key ignores additional fields
    Given a createSagaPartitionKey helper
    When called with correlationId "corr-456", sagaId "saga-789", orderId "ord-101"
    Then the partition key should be name "correlationId" and value "corr-456"

  # ============================================================================
  # createSagaPartitionKey - Error Cases
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Saga partition key throws when correlationId is undefined
    Given a createSagaPartitionKey helper
    When called with correlationId undefined
    Then an error should be thrown with message containing "requires correlationId field"

  @acceptance-criteria @edge-case
  Scenario: Saga partition key throws when correlationId is missing
    Given a createSagaPartitionKey helper
    When called with correlationId missing entirely
    Then an error should be thrown with message containing "requires correlationId field"

  @acceptance-criteria @edge-case
  Scenario: Saga partition key throws when correlationId is empty string
    Given a createSagaPartitionKey helper
    When called with correlationId empty string
    Then an error should be thrown with message containing "requires correlationId field"

  # ============================================================================
  # createGlobalPartitionKey
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Global partition key returns GLOBAL_PARTITION_KEY
    Given a createGlobalPartitionKey helper
    When called with no arguments
    Then the result should equal GLOBAL_PARTITION_KEY

  @acceptance-criteria @happy-path
  Scenario: Global partition key ignores any arguments
    Given a createGlobalPartitionKey helper with type argument
    When called with orderId "ord-123"
    Then the result should equal GLOBAL_PARTITION_KEY

  @acceptance-criteria @happy-path
  Scenario: Global partition key returns same reference on multiple calls
    Given a createGlobalPartitionKey helper
    When called multiple times
    Then all results should be the same reference as GLOBAL_PARTITION_KEY

  # ============================================================================
  # createDCBPartitionKey
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: DCB partition key has name 'dcb'
    When I call createDCBPartitionKey with scope key "tenant:T:entity:Order:ord-123"
    Then the partition key name should be "dcb"

  @acceptance-criteria @happy-path
  Scenario: DCB partition key uses scope key as value
    When I call createDCBPartitionKey with scope key "tenant:T:reservation:res-456"
    Then the partition key value should be "tenant:T:reservation:res-456"

  @acceptance-criteria @happy-path
  Scenario Outline: DCB partition key handles various scope key formats
    When I call createDCBPartitionKey with scope key "<scopeKey>"
    Then the partition key should be name "dcb" and value "<scopeKey>"

    Examples:
      | scopeKey                      |
      | tenant:T:entity:Order:ord-1   |
      | tenant:T:customer:cust-2      |
      | simple-key                    |
