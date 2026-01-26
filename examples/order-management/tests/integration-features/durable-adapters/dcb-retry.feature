@integration @durable-adapters @dcb-retry
Feature: DCB Retry Adapter (App Integration)
  As a developer using the order-management app
  I want DCB operations to automatically retry on OCC conflicts
  So that concurrent modifications are handled gracefully without manual retry logic

  The DCB retry adapter demonstrates the Layered Infrastructure Pattern:
  - App-level (this layer): Retry infrastructure via Workpool
  - CommandOrchestrator: Application services (dual-write, idempotency)
  - BC Components: Pure business logic (deciders, CMS)

  Background:
    Given the backend is running and clean

  Rule: DCB operations succeed without retry when no conflict

    @happy-path
    Scenario: DCB operation succeeds on first attempt
      Given a product "dcb-prod-01" exists with 100 available stock
      When I reserve stock via DCB for order "dcb-ord-01" with:
        | productId   | quantity |
        | dcb-prod-01 | 10       |
      Then the DCB result status should be "success"
      And no retry should be scheduled
      And I wait for projections to process
      And the product "dcb-prod-01" should have 90 available and 10 reserved stock

    @happy-path
    Scenario: DCB rejected result passes through unchanged
      Given a product "dcb-prod-02" exists with 5 available stock
      When I reserve stock via DCB for order "dcb-ord-02" with:
        | productId   | quantity |
        | dcb-prod-02 | 100      |
      Then the DCB result status should be "failed"
      And the result should include failure reason
      And no retry should be scheduled

  Rule: OCC conflicts trigger automatic retry scheduling

    @conflict-retry
    Scenario: DCB conflict triggers retry with updated version
      Given a DCB test scope "conflict-scope-01" is initialized
      And the scope version is advanced to cause conflict
      When I execute a DCB operation with expected version 0
      Then the DCB result status should be "deferred"
      And a retry should be scheduled via dcbRetryPool
      And the retry should use the updated expected version

    @conflict-retry
    Scenario: Max retries exceeded returns rejected
      Given a DCB test scope "max-retry-scope" is initialized
      When I execute a DCB operation at max attempt count
      Then the DCB result status should be "rejected"
      And the result code should be "DCB_MAX_RETRIES_EXCEEDED"

  Rule: Backoff uses exponential increase with jitter

    @backoff
    Scenario: Backoff increases exponentially
      Given backoff config with initialMs 100 and base 2
      When calculating backoff for attempts 0, 1, 2, 3
      Then the base delays should be 100, 200, 400, 800 respectively

    @backoff
    Scenario: Backoff is capped at maximum
      Given backoff config with maxMs 30000
      When calculating backoff for attempt 10
      Then total delay should not exceed 30000ms

  Rule: Partition key ensures scope serialization

    @partition
    Scenario: Retries use consistent partition key
      Given a DCB test scope with key "tenant:t1:reservation:r1"
      When conflict triggers retry
      Then the partition key should be "dcb:tenant:t1:reservation:r1"
      And retries for the same scope execute in FIFO order
