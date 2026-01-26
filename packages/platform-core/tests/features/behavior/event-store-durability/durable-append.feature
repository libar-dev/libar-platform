@libar-docs
@libar-docs-implements:EventStoreDurability
@acceptance-criteria
Feature: Durable Event Append

  Wraps event append in Workpool for automatic retry with exponential backoff.
  Failed appends from async contexts are recovered via Workpool actions.

  # ============================================================================
  # Partition Key Generation
  # ============================================================================

  @happy-path
  Scenario: createAppendPartitionKey generates correct format
    When calling createAppendPartitionKey with stream type "Order" and ID "ord-456"
    Then the partition key name should be "append"
    And the partition key value should be "Order:ord-456"

  @happy-path
  Scenario Outline: Partition key handles various stream types
    When calling createAppendPartitionKey with stream type "<streamType>" and ID "<streamId>"
    Then the partition key value should be "<expected>"

    Examples:
      | streamType | streamId   | expected           |
      | Order      | ord-001    | Order:ord-001      |
      | Inventory  | inv-002    | Inventory:inv-002  |
      | Customer   | cust-003   | Customer:cust-003  |

  # ============================================================================
  # Durable Append Enqueue
  # ============================================================================

  @happy-path
  Scenario: durableAppendEvent enqueues action to Workpool
    Given a mock Workpool for durable append
    When calling durableAppendEvent for stream "Order:ord-123"
    Then Workpool enqueueAction should be called
    And the workpool partition key should be "Order:ord-123"
    And the result status should be "enqueued"

  @happy-path
  Scenario: durableAppendEvent returns work ID from Workpool
    Given a mock Workpool that returns work ID "work-789"
    When calling durableAppendEvent for any event
    Then the result workId should be "work-789"

  @happy-path
  Scenario: durableAppendEvent passes onComplete to Workpool
    Given a mock Workpool for durable append
    When calling durableAppendEvent with onComplete handler
    Then Workpool should receive the onComplete reference

  @validation
  Scenario: durableAppendEvent includes idempotencyKey in context
    Given a mock Workpool for durable append
    When calling durableAppendEvent with idempotencyKey "test:ord-123"
    Then Workpool context should include the idempotencyKey

  # ============================================================================
  # Action Handler Factory
  # ============================================================================

  @happy-path
  Scenario: createDurableAppendActionHandler returns a function
    When calling createDurableAppendActionHandler
    Then the result should be a callable function

  @happy-path
  Scenario: Action handler invokes idempotentAppendEvent
    Given a durable append action handler
    When invoking the handler with event args
    Then idempotentAppendEvent should be called
