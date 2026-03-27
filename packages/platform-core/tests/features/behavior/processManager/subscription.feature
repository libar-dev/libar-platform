@architect
Feature: Process Manager EventBus Subscription

  As a platform developer
  I want PM subscription helpers for EventBus registration
  So that process managers can subscribe to domain events with correct instance routing

  # ============================================================================
  # computePMInstanceId
  # ============================================================================

  Rule: computePMInstanceId returns streamId when no correlation strategy

    **Invariant:** Without a correlation strategy, the event streamId is the instance ID.
    **Verified by:** Calling computePMInstanceId with undefined strategy.

    @acceptance-criteria @happy-path
    Scenario: No correlation strategy uses streamId
      Given an event with streamId "ord_custom_id"
      When I compute PM instance ID without a correlation strategy
      Then the instance ID is "ord_custom_id"

  Rule: computePMInstanceId extracts correlation property from payload

    **Invariant:** When a correlation strategy specifies a property, the matching payload value is used.
    **Verified by:** Providing a correlation strategy and verifying the extracted value.

    @acceptance-criteria @happy-path
    Scenario: Correlation property is extracted from payload
      Given an event with payload property "customerId" set to "cust_888"
      When I compute PM instance ID with correlation property "customerId"
      Then the instance ID is "cust_888"

  Rule: computePMInstanceId falls back to streamId for invalid correlation values

    **Invariant:** If the correlation property is missing, non-string, null, or undefined, streamId is used.
    **Verified by:** Testing each fallback case.

    @acceptance-criteria @validation
    Scenario: Falls back to streamId when correlation property not in payload
      Given an event with streamId "ord_fallback" and payload without "customerId"
      When I compute PM instance ID with correlation property "customerId"
      Then the instance ID is "ord_fallback"

    @acceptance-criteria @validation
    Scenario: Falls back to streamId when correlation property is not a string
      Given an event with streamId "ord_fallback" and numeric payload property "numericId"
      When I compute PM instance ID with correlation property "numericId"
      Then the instance ID is "ord_fallback"

    @acceptance-criteria @validation
    Scenario: Falls back to streamId when correlation property is null
      Given an event with streamId "ord_null_fallback" and null payload property "nullField"
      When I compute PM instance ID with correlation property "nullField"
      Then the instance ID is "ord_null_fallback"

    @acceptance-criteria @validation
    Scenario: Falls back to streamId when correlation property is undefined
      Given an event with streamId "ord_undefined_fallback" and undefined payload property "undefinedField"
      When I compute PM instance ID with correlation property "undefinedField"
      Then the instance ID is "ord_undefined_fallback"

  Rule: computePMInstanceId accepts edge-case string values

    **Invariant:** Empty strings and whitespace-only strings are valid string values and are used as-is.
    **Verified by:** Testing empty and whitespace values.

    @acceptance-criteria @validation
    Scenario: Empty string correlation property value is used as-is
      Given an event with streamId "ord_fallback" and payload property "orderId" set to ""
      When I compute PM instance ID with correlation property "orderId"
      Then the instance ID is ""

    @acceptance-criteria @validation
    Scenario: Whitespace-only correlation property value is used as-is
      Given an event with streamId "ord_fallback" and payload property "orderId" set to "   "
      When I compute PM instance ID with correlation property "orderId"
      Then the instance ID is "   "

    @acceptance-criteria @happy-path
    Scenario: orderId correlation strategy extracts correctly
      Given an event with streamId "stream_123" and payload property "orderId" set to "order_specific_id"
      When I compute PM instance ID with correlation property "orderId"
      Then the instance ID is "order_specific_id"

  # ============================================================================
  # createPMSubscription
  # ============================================================================

  Rule: createPMSubscription generates correct subscription names

    **Invariant:** Name format is "pm:{name}" without context, "pm:{context}:{name}" with context.
    **Verified by:** Creating subscriptions with and without context.

    @acceptance-criteria @happy-path
    Scenario: Subscription name without context
      Given a PM definition "orderNotification" without context
      When I create a PM subscription
      Then the subscription name is "pm:orderNotification"

    @acceptance-criteria @happy-path
    Scenario: Subscription name with context
      Given a PM definition "orderNotification" with context "orders"
      When I create a PM subscription
      Then the subscription name is "pm:orders:orderNotification"

  Rule: createPMSubscription configures priority correctly

    **Invariant:** Default priority is 200 (DEFAULT_PM_SUBSCRIPTION_PRIORITY); custom overrides it.
    **Verified by:** Checking default and custom priority values.

    @acceptance-criteria @happy-path
    Scenario: Default priority is 200
      Given a PM definition "orderNotification" without context
      When I create a PM subscription
      Then the subscription priority is 200
      And the subscription priority equals DEFAULT_PM_SUBSCRIPTION_PRIORITY

    @acceptance-criteria @validation
    Scenario: Custom priority overrides default
      Given a PM definition "orderNotification" without context
      When I create a PM subscription with priority 150
      Then the subscription priority is 150

  Rule: createPMSubscription filters by PM event types

    **Invariant:** The subscription filter contains a mutable copy of event subscriptions.
    **Verified by:** Checking filter contents and reference identity.

    @acceptance-criteria @happy-path
    Scenario: Filters by event types from PM definition
      Given a PM definition "orderNotification" subscribing to events:
        | eventType      |
        | OrderConfirmed |
        | OrderShipped   |
      When I create a PM subscription
      Then the subscription filters by event types:
        | eventType      |
        | OrderConfirmed |
        | OrderShipped   |

    @acceptance-criteria @validation
    Scenario: Creates mutable copy of event types
      Given a PM definition "orderNotification" subscribing to events:
        | eventType      |
        | OrderConfirmed |
        | OrderShipped   |
      When I create a PM subscription
      Then the filter event types are a copy not the original reference

  Rule: createPMSubscription transforms handler args with default transformer

    **Invariant:** Default transformer maps event fields plus computed instanceId.
    **Verified by:** Calling toHandlerArgs and checking all fields.

    @acceptance-criteria @happy-path
    Scenario: Default toHandlerArgs produces correct output
      Given a PM definition "orderNotification" without correlation strategy
      And a test event for handler args transformation
      And a correlation chain with correlationId "corr_001"
      When I create a PM subscription and call toHandlerArgs
      Then the handler args contain instanceId "ord_456"
      And the handler args contain eventId "evt_test"

  Rule: createPMSubscription computes instanceId from correlation strategy

    **Invariant:** When a correlation strategy is set, instanceId comes from the payload property.
    **Verified by:** Setting correlationProperty and verifying instanceId.

    @acceptance-criteria @happy-path
    Scenario: instanceId from correlation strategy
      Given a PM definition with correlation property "orderId"
      And an event in stream "stream_different" with payload property "orderId" set to "ord_from_payload"
      And a correlation chain with correlationId "corr_001"
      When I create a PM subscription and call toHandlerArgs
      Then the handler args contain instanceId "ord_from_payload"

  Rule: createPMSubscription supports custom toHandlerArgs transformer

    **Invariant:** A custom transformer replaces the default and receives (event, chain, instanceId).
    **Verified by:** Providing a custom transformer and verifying its invocation.

    @acceptance-criteria @happy-path
    Scenario: Custom toHandlerArgs transformer is used
      Given a PM definition "orderNotification" with a custom toHandlerArgs transformer
      And an event in stream "ord_123"
      And a correlation chain with correlationId "corr_001"
      When I create a PM subscription and call toHandlerArgs
      Then the custom transformer was called with the event and instanceId "ord_123"
      And the handler args contain customField "custom_value"

  Rule: createPMSubscription partitions by instanceId by default

    **Invariant:** Default partition key uses name "instanceId" with the computed instance ID value.
    **Verified by:** Calling getPartitionKey on a default subscription.

    @acceptance-criteria @happy-path
    Scenario: Default partition by instanceId
      Given a PM definition "orderNotification" without correlation strategy
      And an event with streamId "ord_partition_test"
      When I create a PM subscription and call getPartitionKey
      Then the partition key name is "instanceId"
      And the partition key value is "ord_partition_test"

  Rule: createPMSubscription uses correlation strategy for partition key

    **Invariant:** Correlation strategy affects partition key via instanceId computation.
    **Verified by:** Setting correlationProperty and verifying partition key.

    @acceptance-criteria @happy-path
    Scenario: Correlation strategy affects partition key
      Given a PM definition with correlation property "customerId"
      And an event with payload property "customerId" set to "cust_partition"
      When I create a PM subscription and call getPartitionKey
      Then the partition key name is "instanceId"
      And the partition key value is "cust_partition"

  Rule: createPMSubscription supports custom getPartitionKey

    **Invariant:** A custom getPartitionKey replaces the default and receives (event, instanceId).
    **Verified by:** Providing a custom getPartitionKey and verifying its invocation.

    @acceptance-criteria @happy-path
    Scenario: Custom getPartitionKey is used
      Given a PM definition "orderNotification" with a custom getPartitionKey
      And an event with streamId "ord_custom"
      When I create a PM subscription and call getPartitionKey
      Then the custom getPartitionKey was called with the event and instanceId "ord_custom"
      And the partition key name is "customPartition"
      And the partition key value is "custom:ord_custom"

  Rule: createPMSubscription passes handler reference through

    **Invariant:** The subscription handler reference is the same object passed in.
    **Verified by:** Checking reference identity.

    @acceptance-criteria @happy-path
    Scenario: Handler reference is passed through
      Given a PM definition "orderNotification" without context
      When I create a PM subscription
      Then the subscription handler is the same reference as the input handler

  # ============================================================================
  # createPMSubscriptions
  # ============================================================================

  Rule: createPMSubscriptions creates subscriptions for all definitions

    **Invariant:** One subscription per PM definition with correct naming.
    **Verified by:** Creating bulk subscriptions and checking names.

    @acceptance-criteria @happy-path
    Scenario: Bulk creation produces correct subscription names
      Given PM definitions:
        | name              | context   | events                      |
        | orderNotification | orders    | OrderConfirmed              |
        | orderAnalytics    | analytics | OrderConfirmed,OrderShipped |
      When I create PM subscriptions in bulk
      Then there are 2 subscriptions
      And the subscription names are:
        | name                         |
        | pm:orders:orderNotification  |
        | pm:analytics:orderAnalytics  |

  Rule: createPMSubscriptions throws on missing handler

    **Invariant:** If any PM definition lacks a handler in the map, an error is thrown.
    **Verified by:** Omitting a handler and expecting the error.

    @acceptance-criteria @validation
    Scenario: Missing handler throws error
      Given PM definitions:
        | name              | context   | events                      |
        | orderNotification | orders    | OrderConfirmed              |
        | orderAnalytics    | analytics | OrderConfirmed,OrderShipped |
      When I create PM subscriptions with only "orderNotification" handler
      Then it throws an error about missing handler for "orderAnalytics"

  Rule: createPMSubscriptions applies common options to all

    **Invariant:** Common options like priority are applied to every subscription.
    **Verified by:** Setting a shared priority and checking all subscriptions.

    @acceptance-criteria @happy-path
    Scenario: Common priority applies to all subscriptions
      Given PM definitions:
        | name              | context   | events                      |
        | orderNotification | orders    | OrderConfirmed              |
        | orderAnalytics    | analytics | OrderConfirmed,OrderShipped |
      When I create PM subscriptions in bulk with priority 250
      Then all subscriptions have priority 250

  Rule: createPMSubscriptions creates correct event filters

    **Invariant:** Each subscription filters by its own PM definition event types.
    **Verified by:** Checking filter contents per subscription.

    @acceptance-criteria @happy-path
    Scenario: Each subscription has correct event filter
      Given PM definitions:
        | name              | context   | events                      |
        | orderNotification | orders    | OrderConfirmed              |
        | orderAnalytics    | analytics | OrderConfirmed,OrderShipped |
      When I create PM subscriptions in bulk
      Then subscription 0 filters by events "OrderConfirmed"
      And subscription 1 filters by events "OrderConfirmed,OrderShipped"

  Rule: createPMSubscriptions handles empty definitions

    **Invariant:** An empty definitions array produces an empty subscriptions array.
    **Verified by:** Passing empty array.

    @acceptance-criteria @validation
    Scenario: Empty definitions produces empty subscriptions
      When I create PM subscriptions with no definitions
      Then there are 0 subscriptions

  Rule: createPMSubscriptions passes handlers correctly

    **Invariant:** Each subscription receives the correct handler from the handler map.
    **Verified by:** Checking handler reference identity per subscription.

    @acceptance-criteria @happy-path
    Scenario: Handlers match their definitions
      Given PM definitions:
        | name              | context   | events                      |
        | orderNotification | orders    | OrderConfirmed              |
        | orderAnalytics    | analytics | OrderConfirmed,OrderShipped |
      When I create PM subscriptions in bulk
      Then subscription 0 handler is the "orderNotification" mock handler
      And subscription 1 handler is the "orderAnalytics" mock handler

  # ============================================================================
  # DEFAULT_PM_SUBSCRIPTION_PRIORITY
  # ============================================================================

  Rule: DEFAULT_PM_SUBSCRIPTION_PRIORITY has value 200

    **Invariant:** The default PM subscription priority is 200.
    **Verified by:** Direct constant assertion.

    @acceptance-criteria @happy-path
    Scenario: Default priority constant is 200
      Then DEFAULT_PM_SUBSCRIPTION_PRIORITY is 200

  Rule: DEFAULT_PM_SUBSCRIPTION_PRIORITY is between projections and sagas

    **Invariant:** Priority ordering: projections (100) < PM (200) < sagas (300).
    **Verified by:** Numeric comparison assertions.

    @acceptance-criteria @happy-path
    Scenario: Priority is after projections and before sagas
      Then DEFAULT_PM_SUBSCRIPTION_PRIORITY is greater than projection priority 100
      And DEFAULT_PM_SUBSCRIPTION_PRIORITY is less than saga priority 300
