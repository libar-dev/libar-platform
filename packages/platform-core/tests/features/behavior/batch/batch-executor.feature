@acceptance-criteria
Feature: BatchExecutor

  As a platform developer
  I want to execute batch commands in atomic and partial modes
  So that multiple commands can be processed with appropriate failure semantics

  The BatchExecutor supports two modes: atomic (stop on first failure, single aggregate)
  and partial (continue on failure, cross-aggregate allowed). It tracks individual
  command results, durations, and summary statistics.

  # ============================================================================
  # Atomic Mode
  # ============================================================================

  Rule: Atomic mode executes commands sequentially and stops on first failure

    **Invariant:** In atomic mode, all commands target the same aggregate and execution halts on first rejection.
    **Verified by:** Sequential execution, stop-on-failure, cross-aggregate rejection, and correlationId propagation.

    @happy-path
    Scenario: Executes commands sequentially in atomic mode
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor and standard registry
      And a batch of 3 AddOrderItem commands for order "ord_1"
      When the batch is executed in "atomic" mode with aggregateId "ord_1"
      Then the batch result status is "success"
      And the batch summary shows:
        | field     | value |
        | total     | 3     |
        | succeeded | 3     |
        | failed    | 0     |
      And the executor was called 3 times

    Scenario: Stops on first failure and skips remaining in atomic mode
      Given a failing executor that fails after 1 successful command
      And a BatchExecutor with the failing executor and standard registry
      And a batch of 3 AddOrderItem commands for order "ord_1"
      When the batch is executed in "atomic" mode with aggregateId "ord_1"
      Then the batch result status is "failed"
      And the batch summary shows:
        | field    | value |
        | succeeded | 1    |
        | rejected  | 1    |
        | skipped   | 1    |
      And the executor was called 2 times

    @validation
    Scenario: Rejects batch for cross-aggregate commands in atomic mode
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor and standard registry
      And a batch of AddOrderItem commands targeting different orders:
        | orderId | productId |
        | ord_1   | prod_1    |
        | ord_2   | prod_2    |
      When the batch is executed in "atomic" mode with aggregateId "ord_1"
      Then the batch result status is "failed"
      And all batch results have status "rejected"
      And the executor was not called

    Scenario: Uses shared correlationId in atomic mode
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor and standard registry
      And a batch of 2 AddOrderItem commands for order "ord_1"
      When the batch is executed in "atomic" mode with aggregateId "ord_1" and correlationId "batch_corr_123"
      Then the batch correlationId is "batch_corr_123"
      And the executor received correlationId "batch_corr_123"

    Scenario: Allows command-level correlationId override in atomic mode
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor and standard registry
      And a batch with command-level correlationId override for order "ord_1"
      When the batch is executed in "atomic" mode with aggregateId "ord_1" and correlationId "batch_corr"
      Then the executor call 1 received correlationId "cmd_corr_1"
      And the executor call 2 received correlationId "batch_corr"

  # ============================================================================
  # Partial Mode
  # ============================================================================

  Rule: Partial mode executes all commands regardless of individual failures

    **Invariant:** In partial mode, every command is attempted even if earlier commands fail.
    **Verified by:** All commands execute despite failures, cross-aggregate is allowed, concurrency is respected.

    Scenario: Executes all commands even with failures in partial mode
      Given a failing executor that fails after 1 successful command
      And a BatchExecutor with the failing executor and standard registry
      And a batch of AddOrderItem commands targeting different orders:
        | orderId | productId |
        | ord_1   | prod_1    |
        | ord_2   | prod_2    |
        | ord_3   | prod_3    |
      When the batch is executed in "partial" mode
      Then the batch result status is "partial"
      And the batch summary shows:
        | field     | value |
        | succeeded | 1     |
        | rejected  | 2     |
      And the executor was called 3 times

    @happy-path
    Scenario: Returns success when all commands succeed in partial mode
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor only
      And a batch of CreateOrder commands:
        | orderId |
        | ord_1   |
        | ord_2   |
      When the batch is executed in "partial" mode
      Then the batch result status is "success"
      And the batch summary shows:
        | field     | value |
        | succeeded | 2     |

    Scenario: Allows cross-aggregate commands in partial mode
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor and standard registry
      And a batch of AddOrderItem commands targeting different orders:
        | orderId | productId |
        | ord_1   | prod_1    |
        | ord_2   | prod_2    |
      When the batch is executed in "partial" mode
      Then the batch result status is "success"
      And the executor was called 2 times

    Scenario: Respects maxConcurrency in partial mode
      Given a concurrency-tracking executor
      And a BatchExecutor with the tracking executor
      And a batch of 10 generic test commands
      When the batch is executed in "partial" mode with maxConcurrency 3
      Then the executor was called 10 times
      And the maximum observed concurrency was at most 3

    Scenario: Stops on failure when continueOnError is false in partial mode
      Given a failing executor that fails after 1 successful command
      And a BatchExecutor with the failing executor only
      And a batch of 3 generic test commands
      When the batch is executed in "partial" mode with maxConcurrency 1 and continueOnError false
      Then the batch result status is "partial"
      And the batch summary shows:
        | field     | value |
        | succeeded | 1     |
        | rejected  | 1     |
        | skipped   | 1     |

  # ============================================================================
  # Result Tracking
  # ============================================================================

  Rule: BatchExecutor tracks individual command results with type and index

    **Invariant:** Each command result includes its type, index, duration, and error details.
    **Verified by:** Result array length, commandType, index, durationMs, and error message assertions.

    @happy-path
    Scenario: Tracks individual command results
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor only
      And a batch of two different command types
      When the batch is executed in "partial" mode
      Then the batch has 2 results
      And result 0 has commandType "TestA" and index 0
      And result 1 has commandType "TestB" and index 1

    Scenario: Includes duration for each command
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor only
      And a single Test command
      When the batch is executed in "partial" mode
      Then result 0 has a numeric durationMs

    Scenario: Includes error message for failed commands
      Given an executor that always rejects with reason "Something went wrong"
      And a BatchExecutor with the rejecting executor
      And a single Test command
      When the batch is executed in "partial" mode
      Then result 0 has error "Something went wrong"

    Scenario: Calculates correct summary statistics
      Given a failing executor that fails after 2 successful commands
      And a BatchExecutor with the failing executor only
      And a batch of 5 generic test commands
      When the batch is executed in "partial" mode with maxConcurrency 1
      Then the batch summary shows:
        | field           | value |
        | total           | 5     |
        | succeeded       | 2     |
        | rejected        | 3     |
        | failed          | 0     |
        | skipped         | 0     |
      And the batch summary totalDurationMs is non-negative

  # ============================================================================
  # Error Handling
  # ============================================================================

  Rule: BatchExecutor handles executor exceptions gracefully

    **Invariant:** Thrown errors are caught and reported as failed results, not unhandled exceptions, and validation failures block execution before the executor runs.
    **Verified by:** Executor throws produce failed status with error message; empty batches and oversized batches are rejected before execution.

    Scenario: Handles executor throwing errors
      Given an executor that throws "Executor crashed"
      And a BatchExecutor with the throwing executor
      And a single Test command
      When the batch is executed in "partial" mode
      Then the batch result status is "failed"
      And result 0 has status "failed"
      And result 0 has error "Executor crashed"

    @validation
    Scenario: Handles empty batch gracefully
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor only
      When an empty batch is executed in "partial" mode
      Then the batch result status is "failed"
      And the executor was not called

    @validation
    Scenario: Rejects batch exceeding max command count before execution
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor only
      And a batch of 4 generic test commands
      When the batch is executed in "partial" mode with max batch size 3
      Then the batch result status is "failed"
      And all batch results have status "rejected"
      And the executor was not called

    @validation
    Scenario: Accepts batch exactly at max command count
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with the mock executor only
      And a batch of 3 generic test commands
      When the batch is executed in "partial" mode with max batch size 3
      Then the batch result status is "success"
      And the executor was called 3 times

  # ============================================================================
  # Default Bounded Context
  # ============================================================================

  Rule: Default bounded context filters commands to a single context

    **Invariant:** Commands from a different bounded context are rejected when a default is set.
    **Verified by:** Cross-context command in a batch with defaultBoundedContext fails validation.

    @validation
    Scenario: Rejects commands from wrong bounded context
      Given a mock executor that succeeds for all commands
      And a BatchExecutor with inventory registry and default bounded context "orders"
      And a batch with cross-context commands
      When the batch is executed in "partial" mode
      Then the batch result status is "failed"
      And result 1 error contains "validation failed"

  # ============================================================================
  # Factory Function
  # ============================================================================

  Rule: createBatchExecutor factory creates BatchExecutor instances

    **Invariant:** The factory function returns a valid BatchExecutor.
    **Verified by:** Returned instance is an instance of BatchExecutor.

    @happy-path
    Scenario: Creates a BatchExecutor instance via factory
      Given a mock executor that succeeds for all commands
      When createBatchExecutor is called with the mock executor
      Then the result is a BatchExecutor instance
