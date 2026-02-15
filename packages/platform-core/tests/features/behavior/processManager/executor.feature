@libar-docs
Feature: Process Manager Executor

  As a platform developer
  I want a process manager executor that routes events to handlers
  So that process managers react to domain events and emit commands

  # ============================================================================
  # createProcessManagerExecutor — factory creation
  # ============================================================================

  Rule: Factory creates executor with correct identity and subscription filtering

    **Invariant:** An executor exposes its name, subscriptions, and a handles() filter.
    **Verified by:** Property checks and handles() true/false for subscribed/unsubscribed types.

    @acceptance-criteria @happy-path
    Scenario: Executor exposes pmName and eventSubscriptions
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed,OrderShipped"
      Then the executor pmName is "orderNotification"
      And the executor eventSubscriptions are "OrderConfirmed,OrderShipped"

    @acceptance-criteria @validation
    Scenario: handles() returns true for subscribed and false for unsubscribed events
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed,OrderShipped"
      Then handles returns expected results for event types:
        | eventType      | expected |
        | OrderConfirmed | true     |
        | OrderShipped   | true     |
        | OrderCancelled | false    |

  # ============================================================================
  # createProcessManagerExecutor — event processing
  # ============================================================================

  Rule: Executor processes subscribed events and emits commands

    **Invariant:** A subscribed event is forwarded to the handler; emitted commands are delegated to the emitter.
    **Verified by:** Handler invocation, emitted command check, and result status.

    @acceptance-criteria @happy-path
    Scenario: Processes event and emits commands
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed"
      And the handler returns a "SendNotification" command
      When the executor processes an "OrderConfirmed" event
      Then the process result status is "processed"
      And the handler was called with the event
      And 1 command was emitted with commandType "SendNotification"

  Rule: Executor skips events it is not subscribed to

    **Invariant:** An unsubscribed event yields skipped status with not_subscribed reason; handler is never called.
    **Verified by:** Result status/reason check and handler not-called assertion.

    @acceptance-criteria @validation
    Scenario: Skips unsubscribed event with not_subscribed reason
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed"
      When the executor processes an "OrderCancelled" event
      Then the process result status is "skipped"
      And the skip reason is "not_subscribed"
      And the handler was not called

  Rule: Executor passes custom state from storage to handler

    **Invariant:** When PM state includes customState, it is forwarded as the third handler argument.
    **Verified by:** Pre-seeded state store check and handler argument inspection.

    @acceptance-criteria @happy-path
    Scenario: Passes custom state to handler
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed"
      And the PM state store has custom state for "orderNotification:ord_123"
      When the executor processes an "OrderConfirmed" event
      Then the handler received the custom state

  # ============================================================================
  # createProcessManagerExecutor — instance ID resolution
  # ============================================================================

  Rule: Default instance ID resolver uses streamId

    **Invariant:** Without a custom resolver, the executor uses event.streamId as the instance ID.
    **Verified by:** Storage getPMState call argument inspection.

    @acceptance-criteria @happy-path
    Scenario: Uses streamId as default instance ID
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed" with no custom resolver
      When the executor processes an "OrderConfirmed" event with streamId "ord_custom_id"
      Then storage getPMState was called with instanceId "ord_custom_id"

  Rule: Custom instance ID resolver overrides default

    **Invariant:** A custom resolver function determines the instance ID from event payload.
    **Verified by:** Storage getPMState call with the custom-resolved ID.

    @acceptance-criteria @happy-path
    Scenario: Uses custom instance ID resolver
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed" with a customer-based resolver
      When the executor processes an "OrderConfirmed" event with customerId "cust_789"
      Then storage getPMState was called with instanceId "customer:cust_789"

  # ============================================================================
  # createProcessManagerExecutor — error handling
  # ============================================================================

  Rule: Handler errors produce failed status and dead letters

    **Invariant:** A throwing handler yields failed status and records a dead letter.
    **Verified by:** Result status, error message content, and dead letter count.

    @acceptance-criteria @validation
    Scenario: Returns failed status when handler throws
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed" with a throwing handler
      When the executor processes an "OrderConfirmed" event
      Then the process result status is "failed"
      And the result error contains "Handler failed"
      And 1 dead letter was recorded

  Rule: Command emitter errors produce failed status and dead letters

    **Invariant:** A throwing command emitter yields failed status and records a dead letter.
    **Verified by:** Result status and dead letter count.

    @acceptance-criteria @validation
    Scenario: Returns failed status when command emitter throws
      Given a PM executor "orderNotification" subscribing to "OrderConfirmed" with a throwing emitter
      When the executor processes an "OrderConfirmed" event
      Then the process result status is "failed"
      And 1 dead letter was recorded

  # ============================================================================
  # createMultiPMExecutor — executor routing
  # ============================================================================

  Rule: Multi-executor exposes all PM names and finds executors by event type

    **Invariant:** pmNames lists all registered executors; findExecutors filters by event subscription.
    **Verified by:** pmNames array check and findExecutors length/name checks.

    @acceptance-criteria @happy-path
    Scenario: Returns all PM names
      Given a multi-executor with "orderNotification" and "orderAnalytics"
      Then the multi-executor pmNames are "orderNotification,orderAnalytics"

    @acceptance-criteria @validation
    Scenario: Finds executors by event type
      Given a multi-executor with "orderNotification" and "orderAnalytics"
      Then findExecutors returns expected counts:
        | eventType      | count | firstPmName    |
        | OrderConfirmed | 2     |                |
        | OrderShipped   | 1     | orderAnalytics |
        | OrderCancelled | 0     |                |

  # ============================================================================
  # createMultiPMExecutor — processAll
  # ============================================================================

  Rule: processAll routes events through all matching executors

    **Invariant:** processAll invokes every executor that subscribes to the event type.
    **Verified by:** Result array length, pmName order, status values, and emitted command count.

    @acceptance-criteria @happy-path
    Scenario: Processes event through all matching executors
      Given a multi-executor with "orderNotification" and "orderAnalytics"
      When processAll is called with an "OrderConfirmed" event
      Then processAll returns 2 results
      And processAll result 0 has pmName "orderNotification" and status "processed"
      And processAll result 1 has pmName "orderAnalytics" and status "processed"
      And 2 commands were emitted total

  Rule: processAll returns empty for unsubscribed events

    **Invariant:** An event no executor subscribes to yields an empty results array.
    **Verified by:** Empty result and zero emitted commands.

    @acceptance-criteria @validation
    Scenario: Returns empty array for unsubscribed event
      Given a multi-executor with "orderNotification" and "orderAnalytics"
      When processAll is called with an "OrderCancelled" event
      Then processAll returns 0 results
      And 0 commands were emitted total

  Rule: processAll routes to single matching executor

    **Invariant:** When only one executor subscribes, only it appears in results.
    **Verified by:** Single result with correct pmName and commandType.

    @acceptance-criteria @happy-path
    Scenario: Processes single matching executor
      Given a multi-executor with "orderNotification" and "orderAnalytics"
      When processAll is called with an "OrderShipped" event
      Then processAll returns 1 results
      And processAll result 0 has pmName "orderAnalytics" and status "processed"
      And 1 command was emitted with commandType "TrackEvent"

  Rule: processAll isolates exceptions across executors

    **Invariant:** One executor throwing does not prevent others from running.
    **Verified by:** All three results present: one failed, two processed, two commands emitted.

    @acceptance-criteria @validation
    Scenario: Isolates exceptions so other executors still run
      Given a multi-executor with a throwing executor and "orderNotification" and "orderAnalytics"
      When processAll is called with an "OrderConfirmed" event
      Then processAll returns 3 results
      And processAll result 0 has pmName "throwingPM" and status "failed"
      And processAll result 0 error contains "Unexpected executor error"
      And processAll result 1 has pmName "orderNotification" and status "processed"
      And processAll result 2 has pmName "orderAnalytics" and status "processed"
      And 2 commands were emitted total

  Rule: processAll handles empty executors array gracefully

    **Invariant:** An empty multi-executor yields empty pmNames, empty findExecutors, and empty processAll results.
    **Verified by:** All three checks on the empty multi-executor.

    @acceptance-criteria @validation
    Scenario: Handles empty executors array
      Given an empty multi-executor
      Then the multi-executor pmNames are empty
      And findExecutors for "OrderConfirmed" returns 0 executors
      When processAll is called with an "OrderConfirmed" event
      Then processAll returns 0 results
