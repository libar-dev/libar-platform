@saga-admin
Feature: Saga Admin Operations

  As a system administrator
  I want to query and manage saga instances
  So that I can monitor and recover from saga failures

  Background: Fresh test context
    Given a fresh unit test context

  # ============================================================================
  # Query Functions - DB-only logic
  # ============================================================================

  Rule: getSagaStats returns status counts for a saga type

    Invariant: Counts are aggregated per status category
    Rationale: Operators need a quick health overview of saga processing
    Verified by: Unit tests with convex-test mock DB

    @acceptance-criteria @happy-path
    Scenario: Returns zero counts for empty database
      When I query getSagaStats for saga type "OrderFulfillment"
      Then the stats should have counts:
        | status       | count |
        | pending      | 0     |
        | running      | 0     |
        | completed    | 0     |
        | failed       | 0     |
        | compensating | 0     |

    Scenario: Counts sagas by status correctly
      Given the following sagas exist:
        | sagaType         | sagaId | status    |
        | OrderFulfillment | 1      | pending   |
        | OrderFulfillment | 2      | pending   |
        | OrderFulfillment | 3      | running   |
        | OrderFulfillment | 4      | completed |
        | OrderFulfillment | 5      | completed |
        | OrderFulfillment | 6      | completed |
        | OrderFulfillment | 7      | failed    |
      When I query getSagaStats for saga type "OrderFulfillment"
      Then the stats should have counts:
        | status       | count |
        | pending      | 2     |
        | running      | 1     |
        | completed    | 3     |
        | failed       | 1     |
        | compensating | 0     |

    @acceptance-criteria @validation
    Scenario: Filters by saga type
      Given the following sagas exist:
        | sagaType          | sagaId | status    |
        | OrderFulfillment  | 1      | completed |
        | OrderFulfillment  | 2      | completed |
        | PaymentProcessing | 3      | completed |
      When I query getSagaStats for saga type "OrderFulfillment"
      Then the stats should show completed count of 2
      When I query getSagaStats for saga type "PaymentProcessing"
      Then the stats should show completed count of 1

  Rule: getStuckSagas returns running sagas older than a threshold

    Invariant: Only running sagas exceeding the threshold are returned
    Rationale: Operators need to identify sagas that may be stuck in processing
    Verified by: Unit tests with time-based filtering

    @acceptance-criteria @happy-path
    Scenario: Returns empty array when no sagas exist
      When I query getStuckSagas for saga type "OrderFulfillment"
      Then the stuck sagas result is empty

    Scenario: Returns running sagas older than threshold
      Given a saga "old-running" of type "OrderFulfillment" with status "running" updated 2 hours ago
      And a saga "recent-running" of type "OrderFulfillment" with status "running" updated 30 minutes ago
      And a saga "completed" of type "OrderFulfillment" with status "completed" updated 2 hours ago
      When I query getStuckSagas for saga type "OrderFulfillment"
      Then the stuck sagas result has 1 entry
      And the stuck saga has sagaId "old-running"

    @acceptance-criteria @validation
    Scenario: Respects custom threshold
      Given a saga "ten-min-old" of type "OrderFulfillment" with status "running" updated 10 minutes ago
      When I query getStuckSagas for saga type "OrderFulfillment" with threshold 5 minutes
      Then the stuck sagas result has 1 entry
      And the stuck saga has sagaId "ten-min-old"

  Rule: getFailedSagas returns only failed sagas of a given type

    Invariant: Only sagas with status "failed" are returned
    Rationale: Operators need to see which sagas need attention or retry
    Verified by: Unit tests with mixed saga statuses

    @acceptance-criteria @happy-path
    Scenario: Returns empty array when no failed sagas
      Given a saga "1" of type "OrderFulfillment" with status "completed"
      When I query getFailedSagas for saga type "OrderFulfillment"
      Then the failed sagas result is empty

    Scenario: Returns only failed sagas
      Given the following sagas exist:
        | sagaType         | sagaId | status    | error   |
        | OrderFulfillment | 1      | failed    | Error 1 |
        | OrderFulfillment | 2      | failed    | Error 2 |
        | OrderFulfillment | 3      | completed |         |
        | OrderFulfillment | 4      | running   |         |
      When I query getFailedSagas for saga type "OrderFulfillment"
      Then the failed sagas result has 2 entries
      And the failed saga IDs include:
        | sagaId |
        | 1      |
        | 2      |

    @acceptance-criteria @validation
    Scenario: Respects limit parameter
      Given 5 failed sagas of type "OrderFulfillment"
      When I query getFailedSagas for saga type "OrderFulfillment" with limit 3
      Then the failed sagas result has 3 entries

  # ============================================================================
  # Mutation Validation - State Transition Tests
  # ============================================================================

  Rule: markSagaFailed validates state transitions before marking a saga as failed

    Invariant: Only pending, running, or compensating sagas can be marked failed
    Rationale: Completed and already-failed sagas should not change status
    Verified by: Unit tests covering all source statuses

    @acceptance-criteria @happy-path
    Scenario Outline: Allows marking valid-source-status saga as failed
      Given a saga "test" of type "OrderFulfillment" with status "<source_status>"
      When I call markSagaFailed for saga "test" of type "OrderFulfillment" with reason "<reason>"
      Then the mutation result status is "marked_failed"

      Examples:
        | source_status | reason              |
        | pending       | Admin intervention  |
        | running       | Stuck saga          |
        | compensating  | Compensation stuck  |

    @acceptance-criteria @validation
    Scenario Outline: Rejects marking invalid-source-status saga as failed
      Given a saga "test" of type "OrderFulfillment" with status "<source_status>"
      When I call markSagaFailed for saga "test" of type "OrderFulfillment" with reason "Should not work"
      Then the mutation result status is "invalid_transition"
      And the mutation result currentStatus is "<source_status>"

      Examples:
        | source_status |
        | completed     |
        | failed        |

    @acceptance-criteria @validation
    Scenario: Returns not_found for non-existent saga
      When I call markSagaFailed for saga "nonexistent" of type "OrderFulfillment" with reason "Should not work"
      Then the mutation result status is "not_found"

  Rule: markSagaCompensated validates state transitions before marking a saga as compensated

    Invariant: Only failed sagas can be marked as compensated
    Rationale: Compensation applies only after failure is confirmed
    Verified by: Unit tests covering valid and invalid source statuses

    @acceptance-criteria @happy-path
    Scenario: Allows marking failed saga as compensated
      Given a saga "test" of type "OrderFulfillment" with status "failed"
      When I call markSagaCompensated for saga "test" of type "OrderFulfillment"
      Then the mutation result status is "marked_compensated"

    @acceptance-criteria @validation
    Scenario: Rejects marking non-failed saga as compensated
      Given a saga "test" of type "OrderFulfillment" with status "running"
      When I call markSagaCompensated for saga "test" of type "OrderFulfillment"
      Then the mutation result status is "invalid_transition"
      And the mutation result currentStatus is "running"

  Rule: retrySaga validates state transitions before retrying a saga

    Invariant: Only failed sagas can be retried
    Rationale: Retrying a non-failed saga would create duplicate processing
    Verified by: Unit tests covering valid and invalid source statuses

    @acceptance-criteria @happy-path
    Scenario: Allows retrying failed saga
      Given a saga "test" of type "OrderFulfillment" with status "failed" and error "Previous error"
      When I call retrySaga for saga "test" of type "OrderFulfillment"
      Then the mutation result status is "reset_to_pending"

    @acceptance-criteria @validation
    Scenario Outline: Rejects retrying non-failed saga
      Given a saga "test" of type "OrderFulfillment" with status "<source_status>"
      When I call retrySaga for saga "test" of type "OrderFulfillment"
      Then the mutation result status is "invalid_state"
      And the mutation result currentStatus is "<source_status>"

      Examples:
        | source_status |
        | running       |
        | completed     |
