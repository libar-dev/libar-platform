@acceptance-criteria
Feature: ConvexEventBus

  As a platform developer
  I want a ConvexEventBus that routes published events to matching subscription handlers via workpool
  So that event-driven communication is decoupled and reliable

  The ConvexEventBus provides:
  - Constructor that accepts workpool client and sorted subscriptions
  - publish() method that matches events to subscriptions and enqueues via workpool
  - hasSubscribersFor() to check if any subscription handles an event type
  - getAllSubscriptions() to retrieve all registered subscriptions
  - getMatchingSubscriptions() to filter subscriptions by criteria
  - Priority-ordered publishing
  - Error propagation from workpool failures

  Background:
    Given the module is imported from platform-core

  # ============================================================================
  # Constructor
  # ============================================================================

  Rule: Constructor creates bus with subscriptions sorted by priority

    **Invariant:** A new ConvexEventBus has subscriptions sorted by priority (lowest number first).
    **Verified by:** Checking subscription order and count after construction.

    @happy-path
    Scenario: Creates bus with empty subscriptions
      Given a ConvexEventBus with no subscriptions
      Then getAllSubscriptions returns 0 subscriptions

    Scenario: Creates bus with subscriptions sorted by priority
      Given a ConvexEventBus with subscriptions at priorities:
        | name             | priority |
        | low.priority     | 200      |
        | high.priority    | 50       |
        | default.priority | 100      |
      Then getAllSubscriptions returns 3 subscriptions in order:
        | name             |
        | high.priority    |
        | default.priority |
        | low.priority     |

  # ============================================================================
  # Publish - Subscription Matching
  # ============================================================================

  Rule: publish() matches events to subscriptions and enqueues via workpool

    **Invariant:** publish() returns matched count, triggered names, and success flag; only matching subscriptions are enqueued.
    **Verified by:** Asserting publish result fields and workpool call count.

    @happy-path
    Scenario: Returns empty result when no subscriptions match
      Given a ConvexEventBus with a subscription "order.handler" for event type "OrderCancelled"
      When an "OrderSubmitted" event is published
      Then the publish result has 0 matched subscriptions
      And the triggered subscriptions list is empty
      And the publish result is successful
      And the workpool received 0 enqueue calls

    Scenario: Enqueues matching subscriptions via workpool
      Given a ConvexEventBus with a subscription "order.handler" for event type "OrderSubmitted"
      When an "OrderSubmitted" event is published
      Then the publish result has 1 matched subscription
      And the triggered subscriptions include "order.handler"
      And the publish result is successful
      And the workpool received 1 enqueue call

    Scenario: Enqueues multiple matching subscriptions
      Given a ConvexEventBus with subscriptions for event type "OrderSubmitted":
        | name               | priority |
        | projection.handler | 100      |
        | saga.handler       | 200      |
      When an "OrderSubmitted" event is published
      Then the publish result has 2 matched subscriptions
      And the triggered subscriptions are in order:
        | name               |
        | projection.handler |
        | saga.handler       |
      And the workpool received 2 enqueue calls

  # ============================================================================
  # Publish - Transform and Partition
  # ============================================================================

  Rule: publish() passes transformed args and partition context to workpool

    **Invariant:** Transformed args are forwarded to workpool; partition key, globalPosition, subscriptionName, eventId, and eventType appear in workpool context.
    **Verified by:** Inspecting workpool call arguments and options.

    @happy-path
    Scenario: Passes transformed args to workpool
      Given a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" with a custom transform
      When an "OrderSubmitted" event is published
      Then the workpool received args with orderId "order_456" and eventType "OrderSubmitted"

    Scenario: Includes partition key in workpool context
      Given a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" with a custom partition key
      When an "OrderSubmitted" event is published
      Then the workpool context has partition name "orderId" and value "order_456"
      And the workpool context has globalPosition 1000
      And the workpool context has subscriptionName "order.handler"
      And the workpool context has eventId "evt_test_123"
      And the workpool context has eventType "OrderSubmitted"

  # ============================================================================
  # Publish - OnComplete Handling
  # ============================================================================

  Rule: publish() resolves onComplete from subscription or config default

    **Invariant:** Subscription-level onComplete takes precedence; config default is used as fallback; absent if neither provides it.
    **Verified by:** Checking workpool options.onComplete for each scenario.

    @happy-path
    Scenario: Uses subscription-level onComplete when provided
      Given a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" with subscription-level onComplete
      When an "OrderSubmitted" event is published
      Then the workpool options onComplete is the subscription onComplete handler

    Scenario: Uses default onComplete from config when subscription has none
      Given a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" and a default onComplete config
      When an "OrderSubmitted" event is published
      Then the workpool options onComplete is the default onComplete handler

    Scenario: Does not include onComplete if neither subscription nor config provides it
      Given a ConvexEventBus with a subscription "order.handler" for "OrderSubmitted" without any onComplete
      When an "OrderSubmitted" event is published
      Then the workpool options onComplete is undefined

  # ============================================================================
  # hasSubscribersFor
  # ============================================================================

  Rule: hasSubscribersFor() checks event type and wildcard subscriptions

    **Invariant:** Returns true if any indexed or wildcard subscription can handle the event type; false otherwise.
    **Verified by:** Boolean return value assertions.

    @happy-path
    Scenario: Returns true for indexed event type and false for unsubscribed type
      Given a ConvexEventBus with a subscription "order.handler" for event type "OrderSubmitted"
      Then hasSubscribersFor "OrderSubmitted" returns true
      And hasSubscribersFor "OrderCancelled" returns false

    Scenario: Returns true for any event type when wildcard subscription exists
      Given a ConvexEventBus with a wildcard subscription "wildcard.handler"
      Then hasSubscribersFor "AnyEventType" returns true
      And hasSubscribersFor "AnotherType" returns true

    Scenario: Returns false when no subscriptions exist
      Given a ConvexEventBus with no subscriptions
      Then hasSubscribersFor "SomeEvent" returns false

  # ============================================================================
  # getAllSubscriptions
  # ============================================================================

  Rule: getAllSubscriptions() returns all registered subscriptions

    **Invariant:** Returns a copy of all subscriptions; empty array when none registered.
    **Verified by:** Length and name assertions on returned array.

    @happy-path
    Scenario: Returns all subscriptions
      Given a ConvexEventBus with subscriptions "handler1" and "handler2"
      Then getAllSubscriptions returns 2 subscriptions
      And getAllSubscriptions contains "handler1" and "handler2"

    Scenario: Returns empty array when no subscriptions
      Given a ConvexEventBus with no subscriptions
      Then getAllSubscriptions returns an empty array

  # ============================================================================
  # getMatchingSubscriptions
  # ============================================================================

  Rule: getMatchingSubscriptions() filters subscriptions by criteria

    **Invariant:** Filters return only subscriptions whose filter matches the given criteria.
    **Verified by:** Length and name assertions on filtered results.

    @happy-path
    Scenario: Returns subscriptions matching event type filter
      Given a ConvexEventBus with event-type subscriptions:
        | name              | eventType        |
        | order.handler     | OrderSubmitted   |
        | inventory.handler | InventoryReserved |
      When getMatchingSubscriptions is called with eventTypes "OrderSubmitted"
      Then the matching result has 1 subscription named "order.handler"

    Scenario: Returns subscriptions matching category filter
      Given a ConvexEventBus with category subscriptions:
        | name                | category    |
        | domain.handler      | domain      |
        | integration.handler | integration |
      When getMatchingSubscriptions is called with categories "integration"
      Then the matching result has 1 subscription named "integration.handler"

  # ============================================================================
  # Priority Ordering
  # ============================================================================

  Rule: publish() triggers subscriptions in priority order

    **Invariant:** Subscriptions are triggered in ascending priority order (lowest number = highest priority).
    **Verified by:** Asserting triggered subscription order in publish result.

    @happy-path
    Scenario: Publishes to subscriptions in priority order
      Given a ConvexEventBus with subscriptions for event type "TestEvent":
        | name   | priority |
        | low    | 300      |
        | high   | 50       |
        | medium | 150      |
      When a "TestEvent" event is published
      Then the triggered subscriptions are in order:
        | name   |
        | high   |
        | medium |
        | low    |

  # ============================================================================
  # Error Handling
  # ============================================================================

  Rule: publish() propagates workpool errors

    **Invariant:** When workpool enqueue fails, the error propagates; subsequent enqueues are not attempted.
    **Verified by:** Expecting rejection and checking call count.

    @happy-path
    Scenario: Propagates workpool errors when enqueue fails
      Given a ConvexEventBus with a failing workpool and subscription "order.handler" for "OrderSubmitted"
      When an "OrderSubmitted" event is published
      Then the publish rejects with error "Workpool unavailable"

    Scenario: Does not enqueue subsequent subscriptions if earlier enqueue fails
      Given a ConvexEventBus with a workpool that fails on second enqueue and 3 subscriptions for "OrderSubmitted"
      When an "OrderSubmitted" event is published
      Then the publish rejects with error "Second enqueue failed"
      And the workpool enqueue was called 2 times

  # ============================================================================
  # Wildcard Subscriptions
  # ============================================================================

  Rule: Wildcard subscriptions match events regardless of type

    **Invariant:** A subscription without event type filter matches any event; bounded context filters still apply.
    **Verified by:** Publishing multiple event types and checking matched counts.

    @happy-path
    Scenario: Wildcard subscriptions match any event type
      Given a ConvexEventBus with a wildcard subscription "wildcard"
      When events of different types are published:
        | eventType |
        | Event1    |
        | Event2    |
      Then every publish result includes "wildcard" in triggered subscriptions

    Scenario: Wildcard with bounded context filter only matches that context
      Given a ConvexEventBus with a subscription "orders.audit" filtered to bounded context "orders"
      When events from different bounded contexts are published:
        | boundedContext | expectedMatches |
        | orders         | 1               |
        | inventory      | 0               |
      Then each publish result matches the expected subscription count

  # ============================================================================
  # createEventBus Factory
  # ============================================================================

  Rule: createEventBus factory creates ConvexEventBus instances

    **Invariant:** createEventBus returns a ConvexEventBus instance with the given configuration.
    **Verified by:** instanceof check and subscription count.

    @happy-path
    Scenario: Creates EventBus instance with empty subscriptions
      When createEventBus is called with empty subscriptions
      Then the result is a ConvexEventBus instance
      And getAllSubscriptions returns 0 subscriptions

    Scenario: Creates EventBus with config
      When createEventBus is called with a subscription and default onComplete config
      Then the result is a ConvexEventBus instance
