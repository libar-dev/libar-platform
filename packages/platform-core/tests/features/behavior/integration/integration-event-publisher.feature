@acceptance-criteria
Feature: IntegrationEventPublisher - Cross-Context Event Translation and Routing

  As a platform developer
  I want an integration event publisher that translates domain events into integration events
  So that bounded contexts can communicate through well-defined published language contracts

  The IntegrationEventPublisher accepts domain events, matches them to configured
  routes, translates payloads via route-specific translator functions, and enqueues
  integration events to target handlers via a workpool. It enforces unique source
  event type routes, generates integration event IDs, and propagates correlation metadata.

  Background:
    Given the module is imported from platform-core

  # ============================================================================
  # Constructor
  # ============================================================================

  Rule: Constructor accepts an empty or populated route list

    **Invariant:** A publisher can be created with zero or more routes.
    **Verified by:** Checking getRoutes() length after construction.

    @happy-path
    Scenario: Create publisher with empty routes
      Given a mock workpool client
      When a publisher is created with no routes
      Then getRoutes returns 0 routes

    Scenario: Create publisher with one route
      Given a mock workpool client
      And a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 1
      When a publisher is created with that route
      Then getRoutes returns 1 route

  Rule: Constructor rejects duplicate source event type routes

    **Invariant:** Each sourceEventType may appear in at most one route.
    **Verified by:** Asserting IntegrationRouteError is thrown with correct message.

    @validation
    Scenario: Reject duplicate sourceEventType routes
      Given a mock workpool client
      And two routes both mapping from "OrderSubmitted"
      When a publisher is created with both routes
      Then an IntegrationRouteError is thrown
      And the error message contains "Duplicate route for source event type"

  # ============================================================================
  # hasRouteFor
  # ============================================================================

  Rule: hasRouteFor returns true for registered and false for unregistered event types

    **Invariant:** hasRouteFor reflects exactly the set of registered source event types.
    **Verified by:** Boolean return value assertions for known and unknown types.

    @happy-path
    Scenario: Check route existence for registered and unregistered types
      Given a mock workpool client
      And a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 1
      And a publisher is created with that route
      Then hasRouteFor "OrderSubmitted" returns true
      And hasRouteFor returns false for unregistered types:
        | eventType         |
        | OrderCancelled    |
        | InventoryReserved |

  # ============================================================================
  # getRoutes
  # ============================================================================

  Rule: getRoutes returns all registered routes

    **Invariant:** getRoutes returns the full set of registered routes.
    **Verified by:** Length and content assertions on the returned array.

    @happy-path
    Scenario: Retrieve all registered routes
      Given a mock workpool client
      And routes are configured for source event types:
        | sourceEventType | targetEventType            |
        | OrderSubmitted  | OrderPlacedIntegration     |
        | OrderCancelled  | OrderCancelledIntegration  |
      When a publisher is created with those routes
      Then getRoutes returns 2 routes
      And the returned routes include source event types:
        | sourceEventType |
        | OrderSubmitted  |
        | OrderCancelled  |

  # ============================================================================
  # publish
  # ============================================================================

  Rule: Publish returns null for unmatched source event types

    **Invariant:** Publishing an event with no matching route yields null and enqueues nothing.
    **Verified by:** Null return value and zero workpool calls.

    @validation
    Scenario: Return null when no route matches
      Given a mock workpool client
      And a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 1
      And a publisher is created with that route
      When publish is called with source event type "DifferentEvent"
      Then the publish result is null
      And the workpool received 0 calls

  Rule: Publish translates domain events to integration events

    **Invariant:** A matching route applies its translator and returns a successful result.
    **Verified by:** Non-null result with success flag, handler count, and ID format.

    @happy-path
    Scenario: Translate and publish a domain event
      Given a mock workpool client
      And a translating route from "OrderSubmitted" to "OrderPlacedIntegration"
      And a publisher is created with that route
      When publish is called with a standard source event
      Then the publish result is not null
      And the publish result indicates success with 1 handler invoked
      And the integration event ID starts with "int_"

  Rule: Publish enqueues all handlers for a matched route

    **Invariant:** Every handler in a matched route receives the integration event.
    **Verified by:** Workpool call count matching handler count.

    @happy-path
    Scenario: Enqueue multiple handlers
      Given a mock workpool client
      And a route from "OrderSubmitted" to "OrderPlacedIntegration" with 2 handlers
      And a publisher is created with that route
      When publish is called with a standard source event
      Then the publish result indicates success with 2 handlers invoked
      And the workpool received 2 calls

  Rule: Integration event includes correct metadata from source event and correlation chain

    **Invariant:** The enqueued integration event carries translated payload, source traceability, and correlation metadata.
    **Verified by:** Asserting each metadata field on the workpool call arguments.

    @happy-path
    Scenario: Verify integration event metadata fields
      Given a mock workpool client
      And a route from "OrderSubmitted" to "OrderPlacedIntegration" with schema version 2 and orderId translator
      And a publisher is created with that route
      When publish is called with a standard source event
      Then the enqueued integration event has metadata:
        | field                 | expected                 |
        | eventType             | OrderPlacedIntegration   |
        | schemaVersion         | 2                        |
        | sourceEventId         | evt_123                  |
        | sourceEventType       | OrderSubmitted           |
        | sourceBoundedContext   | orders                   |
        | correlationId         | corr_abc                 |
        | causationId           | evt_123                  |
        | sourceGlobalPosition  | 1000                     |
      And the enqueued integration event payload equals orderId "order_456"

  Rule: Publish propagates userId from the correlation chain when present

    **Invariant:** If the correlation chain includes a userId, the integration event includes it; otherwise it is undefined.
    **Verified by:** Checking userId presence and absence on the enqueued event.

    @happy-path
    Scenario: Include userId when present in chain
      Given a mock workpool client
      And a simple route from "OrderSubmitted" to "OrderPlacedIntegration"
      And a publisher is created with that route
      When publish is called with userId "user_abc"
      Then the enqueued integration event userId is "user_abc"

    Scenario: Omit userId when absent from chain
      Given a mock workpool client
      And a simple route from "OrderSubmitted" to "OrderPlacedIntegration"
      And a publisher is created with that route
      When publish is called without userId
      Then the enqueued integration event userId is undefined

  Rule: Publish includes onComplete callback in workpool options when configured

    **Invariant:** If the publisher is constructed with an onComplete handler, workpool options include it.
    **Verified by:** Asserting the onComplete reference on the workpool call options.

    @happy-path
    Scenario: Pass onComplete handler to workpool
      Given a mock workpool client
      And a simple route from "OrderSubmitted" to "OrderPlacedIntegration"
      And an onComplete handler reference
      And a publisher is created with that route and onComplete
      When publish is called with a standard source event
      Then the workpool options include the onComplete handler

  Rule: Publish propagates translator errors to the caller

    **Invariant:** If the translator throws, the error propagates and no handlers are enqueued.
    **Verified by:** Rejected promise assertion and zero workpool calls.

    @validation
    Scenario: Propagate translator error
      Given a mock workpool client
      And a route with a failing translator
      And a publisher is created with that route
      When publish is called with a standard source event
      Then the publish call rejects with "Translation failed: invalid payload structure"
      And the workpool received 0 calls

  Rule: Publish includes integration context in workpool options

    **Invariant:** Workpool options carry context with integrationEventType, sourceEventId, sourceEventType, and correlationId.
    **Verified by:** Asserting each context field on the workpool call options.

    @happy-path
    Scenario: Verify workpool context fields
      Given a mock workpool client
      And a simple route from "OrderSubmitted" to "OrderPlacedIntegration"
      And a publisher is created with that route
      When publish is called with a standard source event
      Then the workpool context includes:
        | field                 | expected               |
        | integrationEventType  | OrderPlacedIntegration |
        | sourceEventId         | evt_123                |
        | sourceEventType       | OrderSubmitted         |
        | correlationId         | corr_abc               |

  # ============================================================================
  # IntegrationRouteBuilder fluent API
  # ============================================================================

  Rule: IntegrationRouteBuilder builds routes with all required fields via fluent API

    **Invariant:** A fully configured builder produces a route with correct sourceEventType, targetEventType, default schemaVersion, and handlers.
    **Verified by:** Property assertions on the built route.

    @happy-path
    Scenario: Build a route with all required fields
      When a route is built with from "OrderSubmitted", to "OrderPlacedIntegration", a translator, and one handler
      Then the built route sourceEventType is "OrderSubmitted"
      And the built route targetEventType is "OrderPlacedIntegration"
      And the built route schemaVersion defaults to 1
      And the built route has 1 handler

  Rule: IntegrationRouteBuilder version method sets schema version

    **Invariant:** Calling version() overrides the default schema version.
    **Verified by:** Asserting schemaVersion on the built route.

    Scenario: Set schema version via version method
      When a route is built with version 3
      Then the built route schemaVersion is 3

  Rule: IntegrationRouteBuilder notify accepts multiple handlers

    **Invariant:** Multiple handlers passed to notify() are all included in the route.
    **Verified by:** Handler array length on the built route.

    Scenario: Pass multiple handlers to notify
      When a route is built with 2 handlers via notify
      Then the built route has 2 handlers

  Rule: IntegrationRouteBuilder translate sets the translator function

    **Invariant:** The translator function transforms source event info into the integration payload.
    **Verified by:** Invoking the translator and asserting the output.

    Scenario: Translator function transforms source event
      When a route is built with a translator that extracts eventId and eventType
      Then invoking the translator with eventId "evt_1" and eventType "OrderSubmitted" returns the expected payload

  # ============================================================================
  # IntegrationRouteBuilder build validation
  # ============================================================================

  Rule: IntegrationRouteBuilder build rejects incomplete configurations

    **Invariant:** build() throws IntegrationRouteError with a specific code when a required field is missing.
    **Verified by:** Error type, code, and thrown assertion for each missing field.

    @validation
    Scenario: Reject missing source event type
      When build is called without from
      Then an IntegrationRouteError is thrown with code "MISSING_SOURCE_EVENT_TYPE"

    Scenario: Reject missing target event type
      When build is called without to
      Then an IntegrationRouteError is thrown with code "MISSING_TARGET_EVENT_TYPE"

    Scenario: Reject missing translator
      When build is called without translate
      Then an IntegrationRouteError is thrown with code "MISSING_TRANSLATOR"

    Scenario: Reject missing handlers
      When build is called without notify
      Then an IntegrationRouteError is thrown with code "MISSING_HANDLERS"

  # ============================================================================
  # defineIntegrationRoute factory
  # ============================================================================

  Rule: defineIntegrationRoute returns a builder for fluent route construction

    **Invariant:** The factory function produces a builder that builds valid routes.
    **Verified by:** Property assertions on the route built via the factory.

    @happy-path
    Scenario: Build route via defineIntegrationRoute factory
      When a route is built using defineIntegrationRoute
      Then the built route sourceEventType is "OrderSubmitted"
      And the built route targetEventType is "OrderPlacedIntegration"

  # ============================================================================
  # createIntegrationPublisher factory
  # ============================================================================

  Rule: createIntegrationPublisher creates a functional publisher instance

    **Invariant:** The factory function produces a publisher that recognizes configured routes.
    **Verified by:** hasRouteFor and getRoutes assertions on the created publisher.

    @happy-path
    Scenario: Create publisher via factory function
      Given a mock workpool client
      When a publisher is created using createIntegrationPublisher with one route
      Then hasRouteFor "OrderSubmitted" returns true on the factory publisher
      And getRoutes returns 1 route on the factory publisher

  # ============================================================================
  # IntegrationRouteError
  # ============================================================================

  Rule: IntegrationRouteError has correct name, code, context, and is instanceof Error

    **Invariant:** IntegrationRouteError carries structured error metadata and extends Error.
    **Verified by:** name, code, context, and instanceof assertions.

    @happy-path
    Scenario: Verify IntegrationRouteError properties
      When an IntegrationRouteError is created with code "MISSING_TRANSLATOR" and message "Test message"
      Then the error name is "IntegrationRouteError"
      And the error code is "MISSING_TRANSLATOR"

    Scenario: Verify IntegrationRouteError with context
      When an IntegrationRouteError is created with code "DUPLICATE_SOURCE_EVENT_TYPE", message "Test", and context sourceEventType "OrderSubmitted"
      Then the error context equals sourceEventType "OrderSubmitted"

    Scenario: Verify IntegrationRouteError instanceof chain
      When an IntegrationRouteError is created with code "MISSING_HANDLERS" and message "Test"
      Then the error is an instance of Error
      And the error is an instance of IntegrationRouteError
