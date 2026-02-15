@acceptance-criteria
Feature: Event Schema Factories

  As a platform developer
  I want schema factory functions that produce typed Zod schemas
  So that events are validated at runtime with correct eventType, category, and payload

  The five schema factories (createEventSchema, createDomainEventSchema,
  createIntegrationEventSchema, createTriggerEventSchema, createFatEventSchema)
  produce Zod schemas that enforce literal eventType, category defaults,
  schemaVersion, and payload structure.

  # ============================================================================
  # EventMetadataSchema
  # ============================================================================

  Rule: EventMetadataSchema validates required event metadata fields

    **Invariant:** All required fields must be present and version must be a positive integer.
    **Verified by:** Parse success/failure and field equality assertions.

    @happy-path
    Scenario: Valid event metadata is accepted and fields are preserved
      Given valid event metadata
      When the metadata is parsed with EventMetadataSchema
      Then all metadata fields match the input

    @validation
    Scenario: Missing required fields are rejected
      When an empty object is parsed with EventMetadataSchema
      Then the parse throws a validation error

    Scenario: Partial metadata with only eventId is rejected
      When an object with only eventId is parsed with EventMetadataSchema
      Then the parse throws a validation error

    Scenario: Optional causationId is supported
      Given valid event metadata
      When the metadata is parsed without causationId
      Then causationId is undefined
      When the metadata is parsed with causationId "cause_123"
      Then causationId equals "cause_123"

    @validation
    Scenario: Invalid version values are rejected
      Given valid event metadata
      When the metadata is parsed with invalid version values:
        | version |
        | 0       |
        | -1      |
        | 1.5     |
      Then each parse throws a validation error

    Scenario: Zero globalPosition is accepted
      Given valid event metadata
      When the metadata is parsed with globalPosition 0
      Then globalPosition equals 0

  # ============================================================================
  # EnhancedEventMetadataSchema
  # ============================================================================

  Rule: EnhancedEventMetadataSchema extends metadata with category and schemaVersion

    **Invariant:** Category defaults to "domain" and schemaVersion defaults to 1.
    **Verified by:** Parse result field assertions with and without explicit values.

    @happy-path
    Scenario: Enhanced metadata includes category and schemaVersion
      Given valid enhanced event metadata
      When the enhanced metadata is parsed
      Then the parsed category is "domain"
      And the parsed schemaVersion is 1

    Scenario: Category defaults to domain when not provided
      Given valid event metadata
      When the metadata is parsed with EnhancedEventMetadataSchema
      Then the parsed category is "domain"

    Scenario: SchemaVersion defaults to 1 when not provided
      Given valid event metadata
      When the metadata is parsed with EnhancedEventMetadataSchema
      Then the parsed schemaVersion is 1

    @happy-path
    Scenario: All valid categories are accepted
      Given valid event metadata
      When the metadata is parsed with each category:
        | category    |
        | domain      |
        | integration |
        | trigger     |
        | fat         |
      Then each parse returns the matching category

    @validation
    Scenario: Invalid categories are rejected
      Given valid event metadata
      When the metadata is parsed with category "invalid"
      Then the parse throws a validation error

  # ============================================================================
  # createEventSchema
  # ============================================================================

  Rule: createEventSchema creates schemas with literal eventType and typed payload

    **Invariant:** The schema enforces a literal eventType string and validates the payload shape.
    **Verified by:** Parse success with correct eventType, rejection of wrong type, and payload validation.

    @happy-path
    Scenario: Schema accepts events with matching eventType and valid payload
      Given a createEventSchema for "OrderCreated" with orderId and customerId payload
      When an OrderCreated event with valid payload is parsed
      Then the parsed eventType is "OrderCreated"
      And the parsed payload orderId is "order_123"
      And the parsed payload customerId is "customer_456"

    @validation
    Scenario: Schema rejects events with wrong eventType
      Given a createEventSchema for "OrderCreated" with orderId payload
      When an event with eventType "WrongEvent" is parsed with the schema
      Then the parse throws a validation error

    @validation
    Scenario: Schema validates payload constraints
      Given a createEventSchema for "OrderCreated" with orderId and positive quantity payload
      When an event with negative quantity is parsed
      Then the parse throws a validation error

    Scenario: Optional metadata field is supported
      Given a createEventSchema for "Test" with id payload
      When an event without metadata is parsed
      Then the parsed metadata is undefined
      When an event with metadata source "api" and requestId "req_123" is parsed
      Then the parsed metadata has source "api" and requestId "req_123"

  # ============================================================================
  # createDomainEventSchema
  # ============================================================================

  Rule: createDomainEventSchema creates schemas with category domain

    **Invariant:** Category is always "domain", schemaVersion defaults to 1 or matches config.
    **Verified by:** Parse result assertions for category, schemaVersion, and payload.

    @happy-path
    Scenario: Domain event schema sets category to domain
      Given a domain event schema for "OrderSubmitted" with orderId and totalAmount
      When a domain event with valid payload is parsed
      Then the parsed eventType is "OrderSubmitted"
      And the parsed category is "domain"
      And the parsed payload orderId is "order_123"
      And the parsed payload totalAmount is 99.99

    Scenario: Category defaults to domain when not in input
      Given a domain event schema for "Test" with id payload
      When an event without explicit category is parsed via domain schema
      Then the parsed category is "domain"

    Scenario: SchemaVersion defaults to 1 when not in config
      Given a domain event schema for "Test" with id payload
      When an event without explicit schemaVersion is parsed via domain schema
      Then the parsed schemaVersion is 1

    Scenario: Custom schemaVersion in config is enforced
      Given a domain event schema for "Test" with id and newField payload and schemaVersion 2
      When a domain event with matching v2 payload is parsed
      Then the parsed schemaVersion is 2

    @validation
    Scenario: Wrong schemaVersion is rejected
      Given a domain event schema for "Test" with id payload and schemaVersion 2
      When an event with schemaVersion 3 is parsed via domain schema
      Then the parse throws a validation error

  # ============================================================================
  # createIntegrationEventSchema
  # ============================================================================

  Rule: createIntegrationEventSchema creates schemas with category integration

    **Invariant:** Category is always "integration", schemaVersion defaults to 1.
    **Verified by:** Parse result assertions for category and payload.

    @happy-path
    Scenario: Integration event schema sets category to integration
      Given an integration event schema for "OrderPlacedIntegration" with source "orders"
      When an integration event with valid payload is parsed
      Then the parsed eventType is "OrderPlacedIntegration"
      And the parsed category is "integration"
      And the parsed payload totalAmount is 199.99

    Scenario: Category defaults to integration when not in input
      Given an integration event schema for "TestIntegration" with source "test" and id payload
      When an event without explicit category is parsed via integration schema
      Then the parsed category is "integration"

    Scenario: SchemaVersion defaults to 1 for integration events
      Given an integration event schema for "TestIntegration" with source "test" and id payload
      When an event without explicit schemaVersion is parsed via integration schema
      Then the parsed schemaVersion is 1

  # ============================================================================
  # createTriggerEventSchema
  # ============================================================================

  Rule: createTriggerEventSchema creates schemas with category trigger and minimal payload

    **Invariant:** Category is "trigger", payload contains only the entityIdField.
    **Verified by:** Parse result assertions and missing-field rejection.

    @happy-path
    Scenario: Trigger event schema sets category to trigger with entity ID payload
      Given a trigger event schema for "OrderShipmentStarted" with entityIdField "orderId"
      When a trigger event with orderId "order_123" is parsed
      Then the parsed eventType is "OrderShipmentStarted"
      And the parsed category is "trigger"
      And the parsed payload orderId is "order_123"

    @validation
    Scenario: Trigger event rejects missing entity ID
      Given a trigger event schema for "ItemUpdated" with entityIdField "itemId"
      When a trigger event with itemId "item_123" is parsed
      Then the parsed payload itemId is "item_123"
      When a trigger event with empty payload is parsed
      Then the parse throws a validation error

    Scenario: Category defaults to trigger when not in input
      Given a trigger event schema for "Test" with entityIdField "testId"
      When a trigger event with testId "123" is parsed without explicit category
      Then the parsed category is "trigger"

    Scenario: Custom schemaVersion for trigger events
      Given a trigger event schema for "Test" with entityIdField "testId" and schemaVersion 3
      When a trigger event with testId "123" is parsed with custom schema version
      Then the parsed schemaVersion is 3

  # ============================================================================
  # createFatEventSchema
  # ============================================================================

  Rule: createFatEventSchema creates schemas with category fat and full payload

    **Invariant:** Category is "fat", payload supports complex nested structures.
    **Verified by:** Parse result assertions for category, payload fields, and nested validation.

    @happy-path
    Scenario: Fat event schema sets category to fat with full payload
      Given a fat event schema for "OrderSnapshot" with full order payload
      When a fat event with valid order snapshot is parsed
      Then the parsed eventType is "OrderSnapshot"
      And the parsed category is "fat"
      And the parsed payload orderId is "order_123"
      And the parsed payload items has length 1
      And the parsed payload status is "confirmed"

    Scenario: Category defaults to fat when not in input
      Given a fat event schema for "TestSnapshot" with record payload
      When an event without explicit category is parsed via fat schema
      Then the parsed category is "fat"

    Scenario: Complex nested payload with valid positive value
      Given a fat event schema for "ComplexSnapshot" with nested positive value payload
      When a fat event with nested value 42 is parsed
      Then the parsed nested value is 42

    @validation
    Scenario: Complex nested payload rejects negative value
      Given a fat event schema for "ComplexSnapshot" with nested positive value payload
      When a fat event with nested negative value is parsed
      Then the parse throws a validation error

    Scenario: Custom schemaVersion for fat events
      Given a fat event schema for "Test" with id payload and schemaVersion 5
      When a fat event with id payload is parsed
      Then the parsed schemaVersion is 5

  # ============================================================================
  # DomainEventSchema and EnhancedDomainEventSchema
  # ============================================================================

  Rule: DomainEventSchema and EnhancedDomainEventSchema accept any payload

    **Invariant:** DomainEventSchema accepts any payload; EnhancedDomainEventSchema adds category and schemaVersion defaults.
    **Verified by:** Parse result assertions for payload passthrough and default fields.

    @happy-path
    Scenario: DomainEventSchema accepts any payload shape
      Given valid event metadata
      When an event with arbitrary payload is parsed with DomainEventSchema
      Then the payload matches the arbitrary input

    @happy-path
    Scenario: EnhancedDomainEventSchema includes defaults
      Given valid event metadata
      When an event with simple payload is parsed with EnhancedDomainEventSchema
      Then the parsed category is "domain"
      And the parsed schemaVersion is 1
      And the payload matches the simple input

    Scenario: EnhancedDomainEventSchema allows optional metadata
      Given valid event metadata
      When an event with metadata is parsed with EnhancedDomainEventSchema
      Then the metadata matches the expected input
