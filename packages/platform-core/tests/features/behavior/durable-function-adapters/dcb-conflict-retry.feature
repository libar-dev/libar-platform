@libar-docs-implements:DurableFunctionAdapters
@libar-docs-status:active
@libar-docs-phase:18a
@libar-docs-product-area:Platform
@acceptance-criteria
Feature: DCB Conflict Retry

  As a platform developer
  I want DCB OCC conflicts to be automatically retried
  So that I don't need to implement manual retry logic everywhere

  Background: DCB retry helper configured
    Given DCB retry helper is configured

  # ============================================================================
  # Success Path
  # ============================================================================

  Rule: DCB operations succeed without retry when no conflict

    @happy-path
    Scenario: DCB succeeds on first attempt
        Given a DCB operation with expectedVersion 5
      And currentVersion is 5 - no conflict
      When withDCBRetry is called
      Then executeWithDCB should be called once
      And the success result should be returned unchanged
      And no retry should be scheduled

    @happy-path
    Scenario: Rejected result passes through unchanged
        Given a DCB operation that will be rejected by decider
      When withDCBRetry is called
      Then the rejected result should be returned unchanged
      And no retry should be scheduled

  # ============================================================================
  # Retry Behavior
  # ============================================================================

  Rule: OCC conflicts trigger automatic retry via Workpool

    @happy-path
    Scenario: Conflict triggers retry with updated version
        Given a DCB operation with expectedVersion 5
      And currentVersion is 6 - conflict detected
      When withDCBRetry is called with attempt 0
      Then a retry mutation should be enqueued to Workpool
      And the retry should use expectedVersion 6
      And the result should have status "deferred"

    @validation
    Scenario: Max retries exceeded returns rejected
        Given a DCB operation that conflicts
      And attempt is 5 - equal to maxAttempts
      When withDCBRetry is called
      Then the result should have status "rejected"
      And the code should be "DCB_MAX_RETRIES_EXCEEDED"

    @edge-case
    Scenario: Partition key ensures scope serialization
        Given scope key "tenant:t1:reservation:r1"
      When conflict triggers retry
      Then partition key should be "dcb:tenant:t1:reservation:r1"

    @happy-path
    Scenario: Successful retry calls onComplete with result
        Given a DCB operation with onComplete callback configured
      And the operation conflicts then succeeds on retry
      When the retry mutation completes successfully
      Then onComplete should be called with success result
      And the context object should be passed through

    @edge-case
    Scenario: Version advances during retry delay
        Given call A schedules retry with expectedVersion 6 at t=0
      And call B advances version to 7 at t=100ms
      When call A's retry executes at t=250ms with expectedVersion 6
      Then it should detect conflict with currentVersion 7
      And it should schedule another retry with expectedVersion 7
      And attempt counter should be 2

  # ============================================================================
  # Backoff Calculation
  # ============================================================================

  Rule: Backoff uses exponential increase with jitter

    @edge-case
    Scenario Outline: Backoff increases exponentially
      # Tests exponential backoff formula: initialMs * base^attempt
      Given backoff config with initialMs 100 and base 2
      When calculating backoff for attempt <attempt>
      Then base delay should be <delay>ms

      Examples:
        | attempt | delay |
        | 0       | 100   |
        | 1       | 200   |
        | 3       | 800   |

    @edge-case
    Scenario: Backoff is capped at maximum
        Given backoff config with maxMs 30000
      When calculating backoff for attempt 10
      Then total delay should not exceed 30000ms

    @edge-case
    Scenario: Jitter adds randomness to prevent thundering herd
        Given backoff config with initialMs 100
      When calculating backoff for attempt 0 multiple times
      Then results should vary within 50-150% multiplicative jitter range

    @edge-case
    Scenario: Jitter function is injectable for deterministic tests
        Given a backoff calculator with custom jitter function returning 1.0
      When calculating backoff for attempt 0 with initialMs 100
      Then result should be exactly 100ms - no random variation
