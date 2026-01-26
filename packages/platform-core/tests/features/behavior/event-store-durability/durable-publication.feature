@libar-docs
@libar-docs-implements:EventStoreDurability
@acceptance-criteria
Feature: Durable Cross-Context Event Publication

  Cross-context events use Workpool-backed publication with tracking,
  retry, and dead letter handling. Covers Rules 3 and 7 from EventStoreDurability spec.

  # ============================================================================
  # Partition Key Builder
  # ============================================================================

  @happy-path
  Scenario: Partition key format is eventId:targetContext
    Given an eventId "evt-123" and target context "inventory"
    When creating a publication partition key
    Then the partition key value should be "evt-123:inventory"
    And the partition key name should be "publication"

  @validation
  Scenario Outline: Different events get different partition keys
    Given an eventId "<eventId>" and target context "<targetContext>"
    When creating a publication partition key
    Then the partition key value should be "<expected>"

    Examples:
      | eventId | targetContext | expected |
      | evt-001 | inventory | evt-001:inventory |
      | evt-001 | notifications | evt-001:notifications |
      | evt-002 | inventory | evt-002:inventory |

  # ============================================================================
  # Publisher Factory and Publish Method
  # ============================================================================

  @happy-path
  Scenario: Publishing event creates tracking records for each target
    Given a durable event publisher configured with maxAttempts 5
    And an event "evt-123" to publish to contexts "inventory" and "notifications"
    When publishing the event
    Then 2 publication tracking records should be created
    And each record should have status "pending"
    And each record should have attemptCount 0

  @happy-path
  Scenario: Publishing event enqueues delivery actions via Workpool
    Given a durable event publisher configured with maxAttempts 5
    And an event "evt-123" to publish to contexts "inventory" and "notifications"
    When publishing the event
    Then 2 delivery actions should be enqueued
    And each action should have correct partition key
    And each action should have onComplete handler set

  @validation
  Scenario: Publish result contains publication IDs for each target
    Given a durable event publisher
    And an event "evt-123" to publish to contexts "inventory" and "notifications"
    When publishing the event
    Then the result should contain eventId "evt-123"
    And the result should have 2 publications
    And each publication should have a unique publicationId starting with "pub_"

  @validation
  Scenario: Correlation ID is passed through to tracking records
    Given a durable event publisher
    And an event "evt-123" with correlationId "corr-456"
    And target contexts "inventory"
    When publishing the event
    Then the tracking record should have correlationId "corr-456"

  # ============================================================================
  # Get Publication Status
  # ============================================================================

  @happy-path
  Scenario: Get publication status returns all target contexts
    Given publications exist for event "evt-123" to 3 targets
    When getting publication status for event "evt-123"
    Then the result should contain 3 publications
    And the result should show inventory as delivered
    And the result should show analytics as dead_letter

  @happy-path
  Scenario: Get publication status returns empty array for unknown event
    Given no publications exist for event "evt-unknown"
    When getting publication status for event "evt-unknown"
    Then the result should be an empty array

  # ============================================================================
  # Retry Publication (Rule 7: Dead Letter Management)
  # ============================================================================

  @happy-path
  Scenario: Retry publication re-enqueues delivery action
    Given a publication record "pub-123" with status "dead_letter"
    When retrying publication "pub-123"
    Then the result status should be "retried"
    And the record status should be updated to "retried"
    And attemptCount should be incremented
    And a new delivery action should be enqueued

  @validation
  Scenario: Retry publication returns not_found for unknown publication
    Given no publication record exists for "pub-unknown"
    When retrying publication "pub-unknown"
    Then the result status should be "not_found"

  @validation
  Scenario: Retry publication returns already_delivered for delivered publication
    Given a publication record "pub-123" with status "delivered"
    When retrying publication "pub-123"
    Then the result status should be "already_delivered"
    And no delivery action should be enqueued

  @validation
  Scenario: Retry increments attempt count correctly
    Given a publication record "pub-123" with status "dead_letter" and attemptCount 5
    When retrying publication "pub-123"
    Then the record attemptCount should be 6
    And lastAttemptAt should be updated

  # ============================================================================
  # Dead Letter Creation (via onComplete callback)
  # ============================================================================

  @validation
  Scenario: onComplete updates status to delivered on success
    Given a publication "pub-123" in pending state
    And delivery action succeeds
    When onComplete callback is invoked with success
    Then publication status should be "delivered"
    And deliveredAt timestamp should be set

  @validation
  Scenario: onComplete increments attemptCount on failure
    Given a publication "pub-123" with attemptCount 2
    And delivery action fails
    When onComplete callback is invoked with failure
    Then publication attemptCount should be 3
    And status should remain "pending" if under maxAttempts

  @validation
  Scenario: onComplete creates dead letter after max retries
    Given a publication "pub-123" with attemptCount at maxAttempts
    And delivery action fails
    When onComplete callback is invoked with failure
    Then publication status should be "dead_letter"
    And error details should be recorded
