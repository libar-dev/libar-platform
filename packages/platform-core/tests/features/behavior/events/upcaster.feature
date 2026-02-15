@acceptance-criteria
Feature: Event Upcaster Utilities

  As a platform developer
  I want event schema evolution utilities with chain-based migration
  So that events can be transparently upgraded to the latest schema version

  Event upcasters provide chain-based migration for schema evolution:
  createEventUpcaster builds a migration chain, createUpcasterRegistry
  manages upcasters by event type, and helper migrations (addFieldMigration,
  renameFieldMigration) provide common field transformations.

  # ============================================================================
  # createEventUpcaster
  # ============================================================================

  Rule: createEventUpcaster returns events at current version without migration

    **Invariant:** Events already at the current schema version are returned unchanged.
    **Verified by:** wasUpcasted is false and payload is identical.

    @happy-path
    Scenario: Event at current version is returned as-is
      Given an upcaster from version 1 to version 2
      And a v2 event with orderId "order_1" and customerId "cust_1" and createdAt 1234567890
      When the upcaster is applied
      Then the result was not upcasted
      And the original schema version is 2
      And the current schema version is 2
      And the event payload matches the input payload

  Rule: createEventUpcaster applies a single migration step

    **Invariant:** Events one version behind are migrated exactly once.
    **Verified by:** wasUpcasted is true and new fields are present.

    @happy-path
    Scenario: Event is migrated from v1 to v2
      Given an upcaster from version 1 to version 2
      And a v1 event with orderId "order_1" and customerId "cust_1"
      When the upcaster is applied
      Then the result was upcasted
      And the original schema version is 1
      And the current schema version is 2
      And the event payload has a defined createdAt field

  Rule: createEventUpcaster applies multiple migration steps in order

    **Invariant:** Events multiple versions behind are migrated through each step sequentially.
    **Verified by:** wasUpcasted is true and all intermediate fields are present.

    @happy-path
    Scenario: Event is migrated from v1 to v3
      Given an upcaster from version 1 to version 3
      And a v1 event with orderId "order_1" and customerId "cust_1"
      When the upcaster is applied
      Then the result was upcasted
      And the original schema version is 1
      And the current schema version is 3
      And the event payload has a defined createdAt field
      And the event payload priority is "medium"

  Rule: createEventUpcaster rejects invalid configurations and future versions

    **Invariant:** Incomplete migration chains fail at creation; future versions fail at runtime.
    **Verified by:** Error type and message assertions.

    @validation
    Scenario: Incomplete migration chain throws at creation time
      When an upcaster is created with current version 3 but only a v1 migration
      Then it throws an error containing "Missing migration for version 2"

    @validation
    Scenario: Future schema version throws FUTURE_VERSION error
      Given an upcaster from version 1 to version 2
      And a v5 event with orderId "order_1" and customerId "cust_1"
      When the upcaster is applied expecting an error
      Then it throws an EventUpcasterError
      And the error message contains "is newer than current version"

  Rule: createEventUpcaster supports post-migration validation

    **Invariant:** A validate function can accept or reject the migrated event.
    **Verified by:** Successful validation passes; failing validation throws EventUpcasterError.

    @happy-path
    Scenario: Validation passes after migration
      Given an upcaster from version 1 to version 2 with a validator that checks createdAt is a number
      And a v1 event with orderId "order_1" and customerId "cust_1"
      When the upcaster is applied
      Then the result was upcasted
      And the event payload has a defined createdAt field

    @validation
    Scenario: Validation fails after migration
      Given an upcaster from version 1 to version 2 with a validator that checks createdAt is positive
      And a v1 event with orderId "order_1" and customerId "cust_1"
      When the upcaster is applied expecting an error
      Then it throws an EventUpcasterError
      And the error message contains "failed validation"

  # ============================================================================
  # createUpcasterRegistry
  # ============================================================================

  Rule: createUpcasterRegistry tracks upcasters by event type

    **Invariant:** Registered event types are discoverable via has() and getRegisteredTypes().
    **Verified by:** Boolean and array assertions.

    @happy-path
    Scenario: Registry reports registered and unregistered event types
      Given an upcaster registry with "OrderCreated" registered
      Then the registry has "OrderCreated"
      And the registry does not have "UnregisteredEvent"

    @happy-path
    Scenario: Registry returns all registered event types
      Given an upcaster registry with types:
        | eventType      |
        | OrderCreated   |
        | OrderSubmitted |
      Then getRegisteredTypes contains all of:
        | type           |
        | OrderCreated   |
        | OrderSubmitted |
      And getRegisteredTypes has length 2

  Rule: createUpcasterRegistry overwrites previously registered upcasters

    **Invariant:** Re-registering the same event type replaces the previous upcaster.
    **Verified by:** The second upcaster's behavior is observed on upcast().

    @happy-path
    Scenario: Second registration overrides the first
      Given an upcaster registry where "OrderCreated" is registered twice
      And the first upcaster migrates to v2 with createdAt 1000
      And the second upcaster migrates to v3 with createdAt 2000 and priority "high"
      When a v1 OrderCreated event is upcasted via the registry
      Then the current schema version is 3
      And the upcasted createdAt is 2000
      And the upcasted priority is "high"

  Rule: createUpcasterRegistry upcasts events using the correct registered upcaster

    **Invariant:** Events with a registered type are upcasted; events without are returned as-is.
    **Verified by:** wasUpcasted flag and schema version assertions.

    @happy-path
    Scenario: Registered event type is upcasted
      Given an upcaster registry with "OrderCreated" registered for v1 to v2
      And a v1 OrderCreated event
      When the event is upcasted via the registry
      Then the result was upcasted
      And the current schema version is 2

    @happy-path
    Scenario: Unregistered event type is returned as-is
      Given an empty upcaster registry
      And an unregistered event with eventType "UnregisteredEvent"
      When the event is upcasted via the registry
      Then the result was not upcasted
      And the event category is "domain"
      And the event schema version is 1

  # ============================================================================
  # addFieldMigration
  # ============================================================================

  Rule: addFieldMigration adds a field with a static or computed default

    **Invariant:** The new field is present in the payload and schemaVersion is bumped.
    **Verified by:** Payload field and schemaVersion assertions.

    @happy-path
    Scenario: Static default value is added
      Given an addFieldMigration for "priority" with default "medium" to version 2
      And an event with payload orderId "order_1"
      When the migration is applied
      Then the payload field "priority" is "medium"
      And the schema version is 2

    @happy-path
    Scenario: Computed default value is added from event timestamp
      Given an addFieldMigration for "createdAt" computed from timestamp to version 2
      And an event with payload orderId "order_1" and timestamp 1234567890
      When the migration is applied
      Then the payload field "createdAt" is 1234567890
      And the schema version is 2

  # ============================================================================
  # renameFieldMigration
  # ============================================================================

  Rule: renameFieldMigration renames a field in the payload

    **Invariant:** The old field is removed and the new field has the original value.
    **Verified by:** Presence/absence and value assertions.

    @happy-path
    Scenario: Field is renamed in the payload
      Given a renameFieldMigration from "userId" to "customerId" at version 2
      And an event with payload userId "user_123"
      When the rename migration is applied
      Then the payload field "customerId" is "user_123"
      And the payload field "userId" is undefined
      And the schema version is 2

  # ============================================================================
  # EventUpcasterError
  # ============================================================================

  Rule: EventUpcasterError captures error metadata

    **Invariant:** Error instances have name, code, message, and optional context.
    **Verified by:** Property assertions on constructed error instances.

    @happy-path
    Scenario: Error has correct name, code, and message
      Given an EventUpcasterError with code "UNKNOWN_EVENT_TYPE" and message "Test error"
      Then the error name is "EventUpcasterError"
      And the error code is "UNKNOWN_EVENT_TYPE"

    @happy-path
    Scenario: Error stores context when provided
      Given an EventUpcasterError with code "INVALID_EVENT" and message "Error" and context:
        | key           | value        |
        | eventType     | OrderCreated |
        | schemaVersion | 5            |
      Then the error context matches:
        | key           | value        |
        | eventType     | OrderCreated |
        | schemaVersion | 5            |

    @happy-path
    Scenario: Error has undefined context when not provided
      Given an EventUpcasterError with code "UNKNOWN_EVENT_TYPE" and message "Error"
      Then the error context is undefined

    @happy-path
    Scenario: Error is instanceof Error
      Given an EventUpcasterError with code "UNKNOWN_EVENT_TYPE" and message "Error"
      Then the error is an instance of Error

    @validation
    Scenario: Error preserves specific code values
      Given an EventUpcasterError with code "MISSING_MIGRATION" and message "Test error"
      Then the error code is "MISSING_MIGRATION"

    @validation
    Scenario: Error preserves custom message
      Given an EventUpcasterError with code "INVALID_EVENT" and message "Custom message"
      Then the error message is "Custom message"
