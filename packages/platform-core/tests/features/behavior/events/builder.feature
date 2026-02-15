@acceptance-criteria
Feature: Event Data Builder Utilities

  As a platform developer
  I want builder functions to create event data structures
  So that events are correctly formatted for Event Store persistence

  Tests the 2 builder functions from builder.ts:
  - createEventData: Creates event data with auto-generated eventId
  - createEventDataWithId: Creates event data with pre-generated eventId

  # ============================================================================
  # createEventData
  # ============================================================================

  Rule: createEventData generates a complete NewEventData with auto-generated eventId

    **Invariant:** The eventId is generated using the bounded context prefix.
    **Verified by:** Checking eventId format and all output fields.

    @happy-path
    Scenario: Generates eventId with bounded context prefix
      Given a createEventData input with bounded context "orders"
      When createEventData is called
      Then the result eventId is "orders_event_mock-uuid-v7"

    Scenario: Copies all core fields correctly
      Given a createEventData input with:
        | field          | value          |
        | eventType      | OrderSubmitted |
        | streamType     | Product        |
        | streamId       | prod_456       |
        | boundedContext | inventory      |
      When createEventData is called
      Then the result has fields:
        | field          | expected       |
        | eventType      | OrderSubmitted |
        | streamType     | Product        |
        | streamId       | prod_456       |
        | boundedContext | inventory      |

    Scenario: Copies payload correctly
      Given a createEventData input with a complex payload
      When createEventData is called
      Then the result payload matches the input payload

    Scenario: Includes correlationId and causationId in metadata
      Given a createEventData input with correlationId "corr_unique_123" and causationId "cmd_unique_456"
      When createEventData is called
      Then the result metadata has:
        | field         | expected        |
        | correlationId | corr_unique_123 |
        | causationId   | cmd_unique_456  |

    Scenario: Generates different eventIds for different bounded contexts
      When createEventData is called with bounded context "orders"
      And createEventData is called with bounded context "inventory"
      Then generateEventId was called with "orders" and "inventory"

    Scenario: Returns complete NewEventData structure
      Given a createEventData input with bounded context "orders"
      When createEventData is called
      Then the result has all required properties:
        | property      |
        | eventId       |
        | eventType     |
        | streamType    |
        | streamId      |
        | boundedContext |
        | payload       |
        | metadata      |
      And the result metadata has all required properties:
        | property      |
        | correlationId |
        | causationId   |

  # ============================================================================
  # createEventDataWithId
  # ============================================================================

  Rule: createEventDataWithId uses a pre-generated eventId and infers boundedContext

    **Invariant:** The provided eventId is used as-is; boundedContext is extracted from eventId prefix when not explicitly provided.
    **Verified by:** Checking eventId passthrough and boundedContext extraction logic.

    @happy-path
    Scenario: Uses provided eventId without generating a new one
      Given a pre-generated eventId "orders_event_pre-generated-uuid"
      When createEventDataWithId is called
      Then the result eventId is "orders_event_pre-generated-uuid"

    Scenario: Extracts boundedContext from eventId when not provided
      Given a pre-generated eventId "inventory_event_some-uuid" without explicit boundedContext
      When createEventDataWithId is called
      Then the result boundedContext is "inventory"

    Scenario: Uses provided boundedContext when explicitly set
      Given a pre-generated eventId "orders_event_some-uuid" with explicit boundedContext "custom-context"
      When createEventDataWithId is called
      Then the result boundedContext is "custom-context"

    Scenario: Uses full eventId as boundedContext when no underscore present
      Given a pre-generated eventId "malformed-event-id" without explicit boundedContext
      When createEventDataWithId is called
      Then the result boundedContext is "malformed-event-id"

    Scenario: Copies all other fields correctly with pre-generated eventId
      Given a pre-generated eventId "orders_event_custom-uuid" with full input
      When createEventDataWithId is called
      Then the withId result has fields:
        | field         | expected         |
        | eventType     | OrderItemAdded   |
        | streamType    | Order            |
        | streamId      | order_123        |
        | correlationId | corr_add_item    |
        | causationId   | cmd_add_item     |

    Scenario: Handles eventId with multiple underscores correctly
      Given a pre-generated eventId "my_bounded_context_event_uuid-v7" without explicit boundedContext
      When createEventDataWithId is called
      Then the result boundedContext is "my"

    @validation
    Scenario: Returns complete NewEventData structure with pre-generated eventId
      Given a pre-generated eventId "orders_event_test-uuid"
      When createEventDataWithId is called
      Then the result has all required properties:
        | property      |
        | eventId       |
        | eventType     |
        | streamType    |
        | streamId      |
        | boundedContext |
        | payload       |
        | metadata      |
      And the result metadata has all required properties:
        | property      |
        | correlationId |
        | causationId   |
