@libar-docs-pattern:CommandBusIdempotency
@acceptance-criteria
@libar-docs-pattern:CommandBusIdempotency
@libar-docs-status:completed
@libar-docs-phase:59
@libar-docs-quarter:Q1-2026
@libar-docs-effort:4h
@libar-docs-effort-actual:4h
@libar-docs-completed:2026-01-08
@libar-docs-product-area:PlatformBus
@libar-docs-business-value:prevent-duplicate-command-processing
@libar-docs-priority:critical
Feature: Command Bus Idempotency

  Command idempotency ensures that duplicate command submissions (same commandId)
  are detected and handled gracefully, preventing double-processing.

  This is a core infrastructure guarantee that enables reliable command dispatch
  in distributed systems where retries may occur.

  # NOTE: This is a reference implementation for PDR-003 behavior feature files.
  # - No Release column in DataTables (per PDR-003)
  # - Uses @acceptance-criteria tag for scenarios
  # - Links to pattern via @libar-docs-pattern tag

  Background:
    Given the command bus component is available
    And the test uses isolated command IDs

  @happy-path
  Scenario: First command submission is recorded
    Given a new command with unique id
    And command type "CreateOrder"
    And target context "orders"
    When the command is submitted to the command bus
    Then the response status should be "new"
    And the command should be queryable by its id

  @happy-path
  Scenario: Duplicate command returns existing status when completed
    Given a command was previously submitted and executed
    When a duplicate command with the same id is submitted
    Then the response status should be "duplicate"
    And the response should include command status "executed"

  @business-failure
  Scenario: Duplicate command during processing returns pending status
    Given a command is currently pending
    When a duplicate command with the same id is submitted
    Then the response status should be "duplicate"
    And the response should include command status "pending"

  @technical-constraint
  Scenario: Concurrent duplicate detection via post-insert verification
    Given two concurrent submissions with identical command id
    When both requests are processed
    Then exactly one command record should exist
    And the submissions should have one "new" and one "duplicate" response
    # Implementation note: Uses post-insert verification to handle race conditions
    # The "loser" of the race has their record deleted and receives duplicate response
