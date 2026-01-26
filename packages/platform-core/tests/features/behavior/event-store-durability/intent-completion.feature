@libar-docs
@libar-docs-implements:EventStoreDurability
@acceptance-criteria
Feature: Intent and Completion Bracketing

  Records intent before long-running operations and completion after success/failure.
  Enables timeout detection, reconciliation, and audit trail for multi-step processes.

  # ============================================================================
  # Intent Key Builder
  # ============================================================================

  @happy-path
  Scenario: buildIntentKey generates correct format
    When building intent key for operation "OrderSubmission", stream "Order:ord-123", timestamp 1704067200000
    Then the intent key should be "OrderSubmission:Order:ord-123:1704067200000"

  @happy-path
  Scenario Outline: Intent key handles various operation types
    When building intent key for operation "<opType>", stream "<streamType>:<streamId>", timestamp <timestamp>
    Then the intent key should be "<expected>"

    Examples:
      | opType            | streamType | streamId | timestamp     | expected                                     |
      | PaymentProcessing | Order      | ord-1    | 1704067200000 | PaymentProcessing:Order:ord-1:1704067200000  |
      | StockReservation  | Inventory  | inv-2    | 1704153600000 | StockReservation:Inventory:inv-2:1704153600000 |

  # ============================================================================
  # Record Intent
  # ============================================================================

  @happy-path
  Scenario: recordIntent creates intent event with correct type
    Given a mock context for intent recording
    When recording intent for operation "OrderSubmission" with timeout 300000ms
    Then an event of type "OrderSubmissionStarted" should be created
    And the event data should include the intent key and timeout

  @happy-path
  Scenario: recordIntent schedules timeout check
    Given a mock context for intent recording
    When recording intent with timeout 60000ms
    Then scheduler.runAfter should be called with 60000ms delay

  @happy-path
  Scenario: recordIntent returns intentKey and eventId
    Given a mock context for intent recording
    When recording any intent
    Then the result should contain intentKey and intentEventId

  # ============================================================================
  # Record Completion
  # ============================================================================

  @happy-path
  Scenario: recordCompletion creates success event
    Given a mock context for completion recording
    When recording completion with status "success" for intent "OrderSubmission:Order:ord-123:1704067200000"
    Then an event of type "OrderSubmissionCompleted" should be created

  @happy-path
  Scenario: recordCompletion creates failure event with error
    Given a mock context for completion recording
    When recording completion with status "failure" and error "Validation failed"
    Then an event of type "OrderSubmissionFailed" should be created
    And the event data should include error "Validation failed"

  @happy-path
  Scenario: recordCompletion creates abandonment event
    Given a mock context for completion recording
    When recording completion with status "abandoned" for intent "OrderSubmission:Order:ord-123:1704067200000"
    Then an event of type "OrderSubmissionAbandoned" should be created

  # ============================================================================
  # Timeout Check
  # ============================================================================

  @happy-path
  Scenario: checkIntentTimeout returns already_resolved when completion exists
    Given a mock context where completion exists for the intent
    When calling checkIntentTimeout
    Then the result status should be "already_resolved"
    And no new event should be created

  @happy-path
  Scenario: checkIntentTimeout creates abandonment when no completion
    Given a mock context where no completion exists
    When calling checkIntentTimeout
    Then the result status should be "abandoned"
    And an abandonment event should be created

  @validation
  Scenario: checkIntentTimeout is idempotent
    Given a mock context where abandonment completion already exists
    When calling checkIntentTimeout again
    Then the result status should be "already_resolved"

  # ============================================================================
  # Query Orphaned Intents
  # ============================================================================

  @happy-path
  Scenario: queryOrphanedIntents returns intents without completion
    Given 3 intent events where 1 has no completion
    When querying orphaned intents older than 300000ms
    Then the result should contain 1 orphaned intent
    And each orphan should include timeSinceIntent

  @validation
  Scenario: queryOrphanedIntents filters by operation type
    Given orphaned intents for multiple operation types
    When querying with operationType filter "OrderSubmission"
    Then the query should filter by operation type
