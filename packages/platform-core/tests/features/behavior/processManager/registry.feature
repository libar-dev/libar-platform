@architect
Feature: Process Manager Registry

  As a platform developer
  I want a process manager registry with CRUD and lookup capabilities
  So that process managers can be registered, retrieved, and queried by various criteria

  # ============================================================================
  # register
  # ============================================================================

  Rule: register adds a process manager definition to the registry

    **Invariant:** A registered PM is findable by name and increases the registry size.
    **Verified by:** Registering one PM, then checking has() and size.

    @acceptance-criteria @happy-path
    Scenario: Register a single process manager
      Given an empty registry
      When I register the "orderNotification" process manager
      Then the registry has "orderNotification"
      And the registry size is 1

    @acceptance-criteria @happy-path
    Scenario: Register multiple process managers
      Given an empty registry
      When I register all three process managers
      Then the registry size is 3

    @acceptance-criteria @validation
    Scenario: Duplicate registration throws an error
      Given an empty registry
      When I register the "orderNotification" process manager
      Then registering "orderNotification" again throws "is already registered"

  # ============================================================================
  # get
  # ============================================================================

  Rule: get retrieves a process manager by name

    **Invariant:** get returns the PM definition if registered, undefined otherwise.
    **Verified by:** Retrieving a known PM and an unknown PM.

    @acceptance-criteria @happy-path
    Scenario: Get returns PM by name
      Given a registry with orderNotification and reservationExpiration
      When I get the process manager "orderNotification"
      Then the returned PM name is "orderNotification"
      And the returned PM trigger type is "event"

    @acceptance-criteria @validation
    Scenario: Get returns undefined for unknown PM
      Given a registry with orderNotification and reservationExpiration
      When I get the process manager "unknownPM"
      Then the returned PM is undefined

  # ============================================================================
  # has
  # ============================================================================

  Rule: has checks whether a process manager is registered

    **Invariant:** has returns true for registered PMs, false otherwise.
    **Verified by:** Checking a registered and an unregistered name.

    @acceptance-criteria @happy-path
    Scenario: Has returns true for registered PM
      Given an empty registry
      When I register the "orderNotification" process manager
      Then the registry has "orderNotification"

    @acceptance-criteria @validation
    Scenario: Has returns false for unregistered PM
      Given an empty registry
      Then the registry does not have "unknownPM"

  # ============================================================================
  # list
  # ============================================================================

  Rule: list returns all registered process managers

    **Invariant:** list returns an array of all registered PMs, empty for an empty registry.
    **Verified by:** Listing from empty and populated registries.

    @acceptance-criteria @happy-path
    Scenario: List returns empty array for empty registry
      Given an empty registry
      Then the list is empty

    @acceptance-criteria @happy-path
    Scenario: List returns all registered PMs
      Given a registry with orderNotification and reservationExpiration
      Then the list contains these PM names:
        | name                  |
        | orderNotification     |
        | reservationExpiration |

  # ============================================================================
  # size
  # ============================================================================

  Rule: size returns the count of registered process managers

    **Invariant:** size reflects the number of registered PMs.
    **Verified by:** Checking size for empty and populated registries.

    @acceptance-criteria @happy-path
    Scenario: Size is 0 for empty registry
      Given an empty registry
      Then the registry size is 0

    @acceptance-criteria @happy-path
    Scenario: Size reflects registration count
      Given a registry with orderNotification and reservationExpiration
      Then the registry size is 2

  # ============================================================================
  # getByTriggerEvent
  # ============================================================================

  Rule: getByTriggerEvent finds PMs subscribed to a given event type

    **Invariant:** Only PMs whose eventSubscriptions include the event are returned.
    **Verified by:** Querying for known events, shared events, unknown events, and events from time-triggered PMs.

    @acceptance-criteria @happy-path
    Scenario: Returns PM subscribed to a specific event
      Given a fully populated registry
      When I query PMs by trigger event "OrderConfirmed"
      Then the trigger event result contains 1 PM
      And the trigger event result includes "orderNotification"

    @acceptance-criteria @happy-path
    Scenario: Returns PM for shared event across hybrid PM
      Given a fully populated registry
      When I query PMs by trigger event "OrderPaid"
      Then the trigger event result contains 1 PM
      And the trigger event result includes "orderFulfillment"

    @acceptance-criteria @validation
    Scenario: Returns empty for unknown event type
      Given a fully populated registry
      When I query PMs by trigger event "UnknownEvent"
      Then the trigger event result is empty

    @acceptance-criteria @validation
    Scenario: Returns empty for event matching no subscriptions
      Given a fully populated registry
      When I query PMs by trigger event "ReleaseReservation"
      Then the trigger event result is empty

  # ============================================================================
  # getAllTriggerEvents
  # ============================================================================

  Rule: getAllTriggerEvents returns unique sorted event types from all PMs

    **Invariant:** The result is sorted, unique, and includes all subscribed events.
    **Verified by:** Checking empty registry and populated registry output.

    @acceptance-criteria @happy-path
    Scenario: Returns empty array for empty registry
      Given an empty registry
      Then getAllTriggerEvents returns an empty array

    @acceptance-criteria @happy-path
    Scenario: Returns unique sorted event types
      Given an empty registry
      When I register the "orderNotification" process manager
      And I also register the "orderFulfillment" process manager
      Then getAllTriggerEvents result is sorted and unique
      And getAllTriggerEvents contains all of:
        | event         |
        | OrderConfirmed |
        | OrderShipped   |
        | OrderPaid      |
        | ShipmentReady  |

  # ============================================================================
  # getAllEmittedCommands
  # ============================================================================

  Rule: getAllEmittedCommands returns unique sorted command types from all PMs

    **Invariant:** The result is sorted, unique, and includes all emitted commands.
    **Verified by:** Checking empty registry and fully populated registry.

    @acceptance-criteria @happy-path
    Scenario: Returns empty array for empty registry for commands
      Given an empty registry
      Then getAllEmittedCommands returns an empty array

    @acceptance-criteria @happy-path
    Scenario: Returns unique sorted command types
      Given a fully populated registry
      Then getAllEmittedCommands result is sorted and unique
      And getAllEmittedCommands contains all of:
        | command            |
        | SendNotification   |
        | LogActivity        |
        | ReleaseReservation |
        | CreateShipment     |
        | NotifyWarehouse    |

  # ============================================================================
  # getByContext
  # ============================================================================

  Rule: getByContext filters process managers by bounded context

    **Invariant:** Only PMs matching the given context are returned.
    **Verified by:** Filtering by orders, inventory, and unknown context.

    @acceptance-criteria @happy-path
    Scenario: Filters by orders context
      Given a fully populated registry
      When I query PMs by context "orders"
      Then the context result contains 2 PMs
      And the context result includes these PM names:
        | name               |
        | orderNotification  |
        | orderFulfillment   |

    @acceptance-criteria @happy-path
    Scenario: Filters by inventory context
      Given a fully populated registry
      When I query PMs by context "inventory"
      Then the context result contains 1 PM
      And the context result first PM is "reservationExpiration"

    @acceptance-criteria @validation
    Scenario: Returns empty for unknown context
      Given a fully populated registry
      When I query PMs by context "unknown"
      Then the context result is empty

  # ============================================================================
  # getByTriggerType
  # ============================================================================

  Rule: getByTriggerType filters process managers by trigger type

    **Invariant:** Only PMs matching the given trigger type are returned.
    **Verified by:** Filtering by event, time, and hybrid trigger types.

    @acceptance-criteria @happy-path
    Scenario: Filters by event trigger type
      Given a fully populated registry
      When I query PMs by trigger type "event"
      Then the trigger type result contains 1 PM
      And the trigger type result first PM is "orderNotification"

    @acceptance-criteria @happy-path
    Scenario: Filters by time trigger type
      Given a fully populated registry
      When I query PMs by trigger type "time"
      Then the trigger type result contains 1 PM
      And the trigger type result first PM is "reservationExpiration"

    @acceptance-criteria @happy-path
    Scenario: Filters by hybrid trigger type
      Given a fully populated registry
      When I query PMs by trigger type "hybrid"
      Then the trigger type result contains 1 PM
      And the trigger type result first PM is "orderFulfillment"

  # ============================================================================
  # getTimeTriggeredPMs
  # ============================================================================

  Rule: getTimeTriggeredPMs returns time and hybrid triggered PMs

    **Invariant:** Only PMs with triggerType time or hybrid are returned, all with cronConfig.
    **Verified by:** Checking returned PMs include time+hybrid and exclude event-only.

    @acceptance-criteria @happy-path
    Scenario: Returns time and hybrid triggered PMs
      Given a fully populated registry
      Then getTimeTriggeredPMs returns 2 PMs
      And getTimeTriggeredPMs includes these PM names:
        | name                  |
        | reservationExpiration |
        | orderFulfillment      |

    @acceptance-criteria @validation
    Scenario: Excludes event-only triggered PMs
      Given a fully populated registry
      Then getTimeTriggeredPMs does not include "orderNotification"

    @acceptance-criteria @happy-path
    Scenario: All time-triggered PMs have cronConfig
      Given a fully populated registry
      Then all getTimeTriggeredPMs results have cronConfig with scheduleDescription

  # ============================================================================
  # Use Cases
  # ============================================================================

  Rule: Event routing use case finds all handlers for an event

    **Invariant:** getByTriggerEvent returns all PMs that should handle an event.
    **Verified by:** Simulating routing of OrderShipped event.

    @acceptance-criteria @happy-path
    Scenario: Find all handlers for OrderShipped event
      Given an empty registry
      When I register the "orderNotification" process manager
      And I also register the "orderFulfillment" process manager
      And I query PMs by trigger event "OrderShipped"
      Then the trigger event result contains 1 PM
      And the trigger event result includes "orderNotification"

  Rule: Cron setup use case retrieves all time-triggered PMs for scheduling

    **Invariant:** getTimeTriggeredPMs returns PMs with valid cron intervals.
    **Verified by:** Checking all returned PMs have positive interval values.

    @acceptance-criteria @happy-path
    Scenario: Get all time-triggered PMs for cron scheduling
      Given a fully populated registry
      Then getTimeTriggeredPMs returns 2 PMs
      And all getTimeTriggeredPMs results have positive interval values

  # ============================================================================
  # Edge Cases
  # ============================================================================

  Rule: Registry handles PMs with empty event subscriptions and commands

    **Invariant:** PMs with empty arrays are registered but do not contribute to aggregated lists.
    **Verified by:** Registering a no-op PM and checking all aggregation methods.

    @acceptance-criteria @validation
    Scenario: PM with empty subscriptions and commands is handled correctly
      Given an empty registry
      When I register a no-op time-triggered process manager
      Then the registry has "noopPM"
      And the registry size is 1
      And getAllTriggerEvents returns an empty array
      And getAllEmittedCommands returns an empty array
      And getByTriggerType "time" returns 1 PM named "noopPM"
      And getTimeTriggeredPMs returns 1 PM
      And querying by trigger event "SomeEvent" returns empty

    @acceptance-criteria @validation
    Scenario: Mixed PMs where some have empty arrays
      Given an empty registry
      When I register the "orderNotification" process manager
      And I register a no-op time-triggered process manager
      Then getAllTriggerEvents contains exactly these events:
        | event          |
        | OrderConfirmed |
        | OrderShipped   |
      And getAllEmittedCommands contains exactly these commands:
        | command          |
        | LogActivity      |
        | SendNotification |
