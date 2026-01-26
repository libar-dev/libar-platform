@libar-docs
@libar-docs-phase:19
@libar-docs-product-area:PlatformStore
@testing-infrastructure
Feature: Event Store Type Contracts

  The platform-store package exports type definitions for event store operations.
  These types define the contract between the EventStore client and consuming applications.

  Type contracts ensure:
  - EventInput captures all data needed to append an event
  - StoredEvent includes all fields returned from storage
  - AppendResult discriminates between success and conflict outcomes
  - EventCategory supports the Phase 9 event taxonomy

  # NOTE: These are unit-level BDD tests for TYPE CONTRACTS only.
  # Actual EventStore operations require Convex runtime (integration tests).

  Background:
    Given the event store type definitions are available

  # ==========================================================================
  # EventCategory Type (Phase 9 Event Taxonomy)
  # ==========================================================================

  @type-contract
  Scenario: EventCategory supports all taxonomy values
    When validating EventCategory type values
    Then all Phase 9 taxonomy values should be valid:
      | category    |
      | domain      |
      | integration |
      | trigger     |
      | fat         |

  # ==========================================================================
  # EventInput Interface
  # ==========================================================================

  @type-contract
  Scenario: EventInput requires core event fields
    Given an EventInput with required fields:
      | field     | value          |
      | eventId   | evt-123        |
      | eventType | OrderCreated   |
      | payload   | {"orderId": 1} |
    When the EventInput structure is validated
    Then the EventInput should have eventId "evt-123"
    And the EventInput should have eventType "OrderCreated"
    And the EventInput should have a payload object

  @type-contract
  Scenario: EventInput supports optional category and schemaVersion
    Given an EventInput with optional Phase 9 fields:
      | field         | value  |
      | eventId       | evt-456|
      | eventType     | ItemAdded |
      | payload       | {}     |
      | category      | domain |
      | schemaVersion | 2      |
    When the EventInput structure is validated
    Then the EventInput should have category "domain"
    And the EventInput should have schemaVersion 2

  @type-contract
  Scenario: EventInput supports metadata with correlation tracking
    Given an EventInput with metadata:
      | field         | value     |
      | eventId       | evt-789   |
      | eventType     | OrderShipped |
      | correlationId | corr-abc  |
      | causationId   | cmd-def   |
      | userId        | user-123  |
    When the EventInput structure is validated
    Then the EventInput metadata should have correlationId "corr-abc"
    And the EventInput metadata should have causationId "cmd-def"
    And the EventInput metadata should have userId "user-123"

  # ==========================================================================
  # StoredEvent Interface
  # ==========================================================================

  @type-contract
  Scenario: StoredEvent includes all required storage fields
    Given a StoredEvent with all required fields
    When the StoredEvent structure is validated
    Then the StoredEvent should have stream identity fields:
      | field          |
      | streamType     |
      | streamId       |
      | boundedContext |
    And the StoredEvent should have version tracking fields:
      | field          |
      | version        |
      | globalPosition |
    And the StoredEvent should have Phase 9 taxonomy fields:
      | field         |
      | category      |
      | schemaVersion |
    And the StoredEvent should have correlation tracking:
      | field         |
      | correlationId |
      | timestamp     |

  # ==========================================================================
  # AppendResult Discriminated Union
  # ==========================================================================

  @type-contract
  Scenario: AppendResult success includes event positions
    Given an AppendResult with status "success"
    When the AppendResult structure is validated
    Then the result should have eventIds array
    And the result should have globalPositions array
    And the result should have newVersion number

  @type-contract
  Scenario: AppendResult conflict includes current version
    Given an AppendResult with status "conflict"
    When the AppendResult structure is validated
    Then the result should have currentVersion number
    And the result should not have eventIds
