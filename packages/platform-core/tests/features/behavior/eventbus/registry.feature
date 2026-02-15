@acceptance-criteria
Feature: EventBus Registry

  As a platform developer
  I want a subscription registry with builder API and event matching
  So that event handlers are configured declaratively and matched correctly

  The EventBus registry provides:
  - SubscriptionBuilder fluent API for configuring subscriptions
  - SubscriptionRegistry for collecting and deduplicating subscriptions
  - defineSubscriptions helper for declarative setup
  - matchesEvent filter logic for event routing

  # ============================================================================
  # SubscriptionBuilder - Basic Construction
  # ============================================================================

  Rule: SubscriptionBuilder creates subscriptions with sensible defaults

    **Invariant:** A newly built subscription has the given name/handler, empty filter, priority 100, and streamId partition key.
    **Verified by:** Equality assertions on builder output fields.

    @happy-path
    Scenario: Builder creates subscription with name and handler
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When the subscription is built
      Then the subscription has name "test.handler" and the mock handler

    Scenario: Builder defaults to empty filter
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When the subscription is built
      Then the subscription filter is empty

    Scenario: Builder defaults to priority 100
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When the subscription is built
      Then the subscription priority is 100

    Scenario: Builder defaults partition key to streamId
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When the subscription is built
      Then the partition key for a test event uses streamId with value "order_456"

  # ============================================================================
  # SubscriptionBuilder - Filter Configuration
  # ============================================================================

  Rule: SubscriptionBuilder fluent API configures event filters

    **Invariant:** Each filter method sets the corresponding filter field; chaining composes all filters.
    **Verified by:** Deep equality on the filter object after build.

    @happy-path
    Scenario: forEventTypes sets event type filter
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When forEventTypes is called with "OrderSubmitted" and "OrderCancelled"
      And the subscription is built
      Then the subscription filter eventTypes are:
        | eventType      |
        | OrderSubmitted |
        | OrderCancelled |

    Scenario: forCategories sets category filter
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When forCategories is called with "domain" and "integration"
      And the subscription is built
      Then the subscription filter categories are:
        | category    |
        | domain      |
        | integration |

    Scenario: forBoundedContexts sets bounded context filter
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When forBoundedContexts is called with "orders" and "inventory"
      And the subscription is built
      Then the subscription filter boundedContexts are:
        | boundedContext |
        | orders         |
        | inventory      |

    Scenario: forStreamTypes sets stream type filter
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When forStreamTypes is called with "Order" and "Product"
      And the subscription is built
      Then the subscription filter streamTypes are:
        | streamType |
        | Order      |
        | Product    |

    Scenario: Chaining multiple filters composes them
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When forEventTypes is called with "OrderSubmitted"
      And forCategories is called with "domain"
      And forBoundedContexts is called with "orders"
      And the subscription is built
      Then the subscription filter has all three filter types set

  # ============================================================================
  # SubscriptionBuilder - Handler Configuration
  # ============================================================================

  Rule: SubscriptionBuilder configures handler options

    **Invariant:** Optional handler configuration (onComplete, priority, transform, partitionKey) is applied to the built subscription.
    **Verified by:** Field equality and transform invocation assertions.

    @happy-path
    Scenario: withOnComplete sets the onComplete handler
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When withOnComplete is called with the mock onComplete handler
      And the subscription is built
      Then the subscription onComplete is the mock onComplete handler

    Scenario: withPriority sets priority
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When withPriority is called with 50
      And the subscription is built
      Then the subscription priority is 50

    Scenario: withTransform sets custom transformer
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When withTransform is called with a custom transformer
      And the subscription is built
      Then toHandlerArgs returns the transformed output

    Scenario: withPartitionKey sets custom partition key extractor
      Given a SubscriptionBuilder with name "test.handler" and a mock handler
      When withPartitionKey is called with a customerId extractor
      And the subscription is built
      Then the partition key for an event with customerId "cust_123" returns name "customerId" and value "cust_123"

  # ============================================================================
  # SubscriptionRegistry
  # ============================================================================

  Rule: SubscriptionRegistry collects subscriptions and rejects duplicates

    **Invariant:** Each subscription name must be unique within a registry; add() supports chaining.
    **Verified by:** Length assertions and duplicate-name error assertions.

    @happy-path
    Scenario: add() adds a subscription to the registry
      Given an empty SubscriptionRegistry
      When a subscription "test.handler" is added
      Then the registry has 1 subscription with name "test.handler"

    Scenario: add() supports chaining
      Given an empty SubscriptionRegistry
      When subscriptions "handler1" and "handler2" are added via chaining
      Then the registry has 2 subscriptions

    @validation
    Scenario: add() throws on duplicate subscription name
      Given an empty SubscriptionRegistry
      When a subscription "duplicate.name" is added
      Then adding another subscription "duplicate.name" throws a duplicate error

    @happy-path
    Scenario: subscribe() returns builder that adds to registry on build
      Given an empty SubscriptionRegistry
      When subscribe is called with "test.handler" and built with forEventTypes "OrderSubmitted"
      Then the registry has 1 subscription with name "test.handler"

  # ============================================================================
  # defineSubscriptions
  # ============================================================================

  Rule: defineSubscriptions helper creates subscription arrays from a configuration callback

    **Invariant:** The callback receives a registry; the return value is an array of all built subscriptions. Duplicates throw.
    **Verified by:** Array length/name assertions and error assertions.

    @happy-path
    Scenario: defineSubscriptions returns configured subscriptions
      When defineSubscriptions is called with two subscriptions "handler1" and "handler2"
      Then the result has 2 subscriptions named "handler1" and "handler2"

    @validation
    Scenario: defineSubscriptions throws on duplicate names via subscribe().build()
      Then calling defineSubscriptions with duplicate "duplicate.handler" via subscribe throws

    @validation
    Scenario: defineSubscriptions throws on duplicate names via add()
      Then calling defineSubscriptions with duplicate "duplicate.name" via add throws

  # ============================================================================
  # createSubscription
  # ============================================================================

  Rule: createSubscription creates a standalone builder

    **Invariant:** createSubscription returns a builder not bound to any registry.
    **Verified by:** Name and filter assertions on the built subscription.

    @happy-path
    Scenario: createSubscription creates standalone builder
      When createSubscription is called with "standalone" and forEventTypes "TestEvent"
      Then the built subscription has name "standalone" and eventTypes filter "TestEvent"

  # ============================================================================
  # matchesEvent - Empty Filter
  # ============================================================================

  Rule: An empty filter matches any event

    **Invariant:** A subscription with no filter criteria matches all events.
    **Verified by:** matchesEvent returns true for different event types.

    @happy-path
    Scenario: Empty filter matches any event
      Given a subscription "wildcard" with an empty filter
      Then matchesEvent returns true for event type "OrderSubmitted"
      And matchesEvent returns true for event type "DifferentEvent"

  # ============================================================================
  # matchesEvent - Single Filters
  # ============================================================================

  Rule: matchesEvent filters by eventTypes using OR within the list

    **Invariant:** An event matches if its eventType is in the subscription's eventTypes list.
    **Verified by:** True for listed types, false for unlisted types.

    @happy-path
    Scenario: Matches when event type is in the list
      Given a subscription "test" with eventTypes filter "OrderSubmitted" and "OrderCancelled"
      Then matchesEvent returns true for event type "OrderSubmitted"
      And matchesEvent returns true for event type "OrderCancelled"

    @validation
    Scenario: Does not match when event type is not in the list
      Given a subscription "test" with eventTypes filter "OrderSubmitted"
      Then matchesEvent returns false for event type "DifferentEvent"

  Rule: matchesEvent filters by categories using OR within the list

    **Invariant:** An event matches if its category is in the subscription's categories list.
    **Verified by:** True for listed categories, false for unlisted categories.

    @happy-path
    Scenario: Matches when category is in the list
      Given a subscription "test" with categories filter "domain" and "integration"
      Then matchesEvent returns true for category "domain"
      And matchesEvent returns true for category "integration"

    @validation
    Scenario: Does not match when category is not in the list
      Given a subscription "test" with categories filter "domain"
      Then matchesEvent returns false for category "trigger"

  Rule: matchesEvent filters by boundedContexts using OR within the list

    **Invariant:** An event matches if its boundedContext is in the subscription's boundedContexts list.
    **Verified by:** True for listed contexts, false for unlisted contexts.

    @happy-path
    Scenario: Matches when bounded context is in the list
      Given a subscription "test" with boundedContexts filter "orders" and "inventory"
      Then matchesEvent returns true for boundedContext "orders"

    @validation
    Scenario: Does not match when bounded context is not in the list
      Given a subscription "test" with boundedContexts filter "payments"
      Then matchesEvent returns false for boundedContext "orders"

  Rule: matchesEvent filters by streamTypes using OR within the list

    **Invariant:** An event matches if its streamType is in the subscription's streamTypes list.
    **Verified by:** True for listed types, false for unlisted types.

    @happy-path
    Scenario: Matches when stream type is in the list
      Given a subscription "test" with streamTypes filter "Order" and "Product"
      Then matchesEvent returns true for streamType "Order"

    @validation
    Scenario: Does not match when stream type is not in the list
      Given a subscription "test" with streamTypes filter "Customer"
      Then matchesEvent returns false for streamType "Order"

  # ============================================================================
  # matchesEvent - Combined Filters
  # ============================================================================

  Rule: Combined filters use AND logic between filter types

    **Invariant:** All filter criteria must match simultaneously; failing any single filter rejects the event.
    **Verified by:** True when all match, false when any single filter fails.

    @happy-path
    Scenario: All filters matching returns true
      Given a subscription "test" with combined filters eventTypes "OrderSubmitted", categories "domain", and boundedContexts "orders"
      Then matchesEvent returns true for an event matching all filters

    @validation
    Scenario: Non-matching event type returns false with combined filters
      Given a subscription "test" with combined filters eventTypes "OrderSubmitted", categories "domain", and boundedContexts "orders"
      Then matchesEvent returns false for an event with wrong eventType "OrderCancelled"

    @validation
    Scenario: Non-matching category returns false with combined filters
      Given a subscription "test" with combined filters eventTypes "OrderSubmitted", categories "domain", and boundedContexts "orders"
      Then matchesEvent returns false for an event with wrong category "trigger"
