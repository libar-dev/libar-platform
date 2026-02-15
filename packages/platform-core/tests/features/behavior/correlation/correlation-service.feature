@acceptance-criteria
Feature: CorrelationService - Command-Event Correlation Tracking

  As a platform developer
  I want a correlation service that tracks command-to-event relationships
  So that I can trace which events resulted from which commands

  The CorrelationService records, queries, and inspects correlations
  between commands and events. It supports filtering by bounded context,
  merging event IDs for the same command, and convenience checks for
  existence and event counts.

  # ============================================================================
  # recordCorrelation
  # ============================================================================

  Rule: recordCorrelation persists a new command-event correlation

    **Invariant:** A recorded correlation is retrievable by command ID.
    **Verified by:** Return value and mock client call assertions.

    @happy-path
    Scenario: Record a new correlation
      When a correlation is recorded with commandId "cmd_123", eventIds "evt_456", commandType "CreateOrder", and boundedContext "orders"
      Then the record result is true
      And the client was called with the correct arguments

  Rule: recordCorrelation merges event IDs for duplicate command IDs

    **Invariant:** Recording the same commandId twice merges event IDs without duplicates.
    **Verified by:** Retrieving the correlation and checking both event IDs are present.

    @happy-path
    Scenario: Merge event IDs for existing correlation
      Given a correlation exists with commandId "cmd_123", eventId "evt_1", commandType "CreateOrder", and boundedContext "orders"
      When a second correlation is recorded with commandId "cmd_123", eventId "evt_2", commandType "CreateOrder", and boundedContext "orders"
      Then the correlation for "cmd_123" contains event IDs:
        | eventId |
        | evt_1   |
        | evt_2   |

  # ============================================================================
  # getEventsByCommand
  # ============================================================================

  Rule: getEventsByCommand returns null for non-existent commands

    **Invariant:** Querying an unknown command ID yields null.
    **Verified by:** Null assertion on return value.

    @validation
    Scenario: Return null for non-existent command
      When getEventsByCommand is called with "cmd_nonexistent"
      Then the result is null

  Rule: getEventsByCommand returns the full correlation for existing commands

    **Invariant:** A previously recorded correlation is returned with all properties intact.
    **Verified by:** Property equality assertions on the returned correlation.

    @happy-path
    Scenario: Return correlation for existing command
      Given a correlation exists with commandId "cmd_123", eventIds "evt_456,evt_789", commandType "CreateOrder", and boundedContext "orders"
      When getEventsByCommand is called with "cmd_123"
      Then the returned correlation has all properties:
        | property       | value        |
        | commandId      | cmd_123      |
        | commandType    | CreateOrder  |
        | boundedContext | orders       |
      And the returned correlation has eventIds "evt_456" and "evt_789"

  # ============================================================================
  # getCorrelationsByContext
  # ============================================================================

  Rule: getCorrelationsByContext filters correlations by bounded context

    **Invariant:** Only correlations matching the specified bounded context are returned.
    **Verified by:** Length and property assertions on the filtered result.

    @happy-path
    Scenario: Filter by bounded context
      Given seeded correlations exist across contexts
      When getCorrelationsByContext is called with boundedContext "orders"
      Then the result has 2 correlations all with boundedContext "orders"

  Rule: getCorrelationsByContext throws when boundedContext is missing

    **Invariant:** An empty query without boundedContext is rejected.
    **Verified by:** Exception assertion with expected message.

    @validation
    Scenario: Throw when boundedContext is missing
      When getCorrelationsByContext is called with an empty object
      Then it throws "boundedContext is required for getCorrelationsByContext"

  Rule: getCorrelationsByContext respects the limit parameter

    **Invariant:** The result set is bounded by the limit parameter.
    **Verified by:** Length assertion on the filtered result.

    @happy-path
    Scenario: Respect limit parameter
      Given seeded correlations exist across contexts
      When getCorrelationsByContext is called with boundedContext "orders" and limit 1
      Then the result has 1 correlation

  # ============================================================================
  # hasCorrelation
  # ============================================================================

  Rule: hasCorrelation returns true when a correlation exists for the command

    **Invariant:** A previously recorded command ID is recognized.
    **Verified by:** Boolean true assertion.

    @happy-path
    Scenario: Return true for command with events
      Given a correlation exists with commandId "cmd_123", eventId "evt_456", commandType "CreateOrder", and boundedContext "orders"
      When hasCorrelation is called with "cmd_123"
      Then the hasCorrelation result is true

  Rule: hasCorrelation returns false for non-existent commands

    **Invariant:** An unknown command ID is not recognized.
    **Verified by:** Boolean false assertion.

    @validation
    Scenario: Return false for non-existent command
      When hasCorrelation is called with "cmd_nonexistent"
      Then the hasCorrelation result is false

  # ============================================================================
  # getEventCount
  # ============================================================================

  Rule: getEventCount returns the number of events for an existing command

    **Invariant:** The count equals the number of event IDs in the correlation.
    **Verified by:** Numeric equality assertion.

    @happy-path
    Scenario: Return event count for existing command
      Given a correlation exists with commandId "cmd_123", eventIds "evt_1,evt_2,evt_3", commandType "CreateOrder", and boundedContext "orders"
      When getEventCount is called with "cmd_123"
      Then the event count is 3

  Rule: getEventCount returns 0 for non-existent commands

    **Invariant:** An unknown command ID has zero events.
    **Verified by:** Numeric zero assertion.

    @validation
    Scenario: Return 0 for non-existent command
      When getEventCount is called with "cmd_nonexistent"
      Then the event count is 0

  # ============================================================================
  # createCorrelationService Factory
  # ============================================================================

  Rule: createCorrelationService returns a CorrelationService instance

    **Invariant:** The factory function produces a proper instance.
    **Verified by:** instanceof assertion.

    @happy-path
    Scenario: Create a CorrelationService instance
      When createCorrelationService is called with a mock client
      Then the result is an instance of CorrelationService
