Feature: CommandOrchestrator partition key structure

  Verifies that the partition context passed to Workpool's enqueueMutation
  uses the structured { name, value } format across all projection paths.

  Rule: Primary projection receives structured partition key
    **Invariant:** The workpool context for a primary projection must contain
    a `partition` field with `{ name, value }` structure.
    **Verified by:** Executing a command with a primary projection and inspecting
    the workpool enqueue options.

    Scenario: Wraps partition key in structured field for primary projection
      Given an orchestrator with mock dependencies
      And a successful command handler result
      And a command config with primary projection "orderSummary" partitioned by "orderId"
      When I execute the command with orderId "ord_123"
      Then the workpool was called at least 1 time
      And the workpool call 0 context contains:
        | field          | value        |
        | projectionName | orderSummary |
        | eventId        | evt_test_1   |
      And the workpool call 0 partition is name "orderId" value "ord_123"

  Rule: Secondary projections receive structured partition key
    **Invariant:** Each secondary projection's workpool context must contain
    a `partition` field with `{ name, value }` structure.
    **Verified by:** Executing a command with a secondary projection and inspecting
    the second workpool enqueue call.

    Scenario: Wraps partition key in structured field for secondary projections
      Given an orchestrator with mock dependencies
      And a successful command handler result
      And a command config with primary projection "orderSummary" partitioned by "orderId"
      And a secondary projection "orderWithInventory" partitioned by "orderId"
      When I execute the command with orderId "ord_456"
      Then the workpool was called at least 2 times
      And the workpool call 1 context contains:
        | field          | value              |
        | projectionName | orderWithInventory |
      And the workpool call 1 partition is name "orderId" value "ord_456"

  Rule: Failed projection receives structured partition key
    **Invariant:** The workpool context for a failed projection must contain
    a `partition` field with `{ name, value }` structure.
    **Verified by:** Executing a command that produces a failed result with a
    failed projection and inspecting the workpool enqueue options.

    Scenario: Wraps partition key in structured field for failed projection
      Given an orchestrator with mock dependencies
      And a failed command handler result
      And a command config with failed projection "reservationFailure" partitioned by "orderId"
      When I execute the command with orderId "ord_789"
      Then the workpool was called at least 1 time
      And the workpool call 0 context contains:
        | field          | value              |
        | projectionName | reservationFailure |
        | eventId        | evt_fail_1         |
      And the workpool call 0 partition is name "orderId" value "ord_789"
