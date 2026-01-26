@libar-docs
@libar-docs-status:completed
@libar-docs-unlock-reason:Initial-implementation-complete
@libar-docs-implements:EcstFatEvents
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@ecst
Feature: Fat Event Builder

  As a platform developer
  I want to create fat events with embedded context
  So that downstream consumers have all data needed without back-queries

  This feature validates the createFatEvent() builder and embed helpers
  that enable Event-Carried State Transfer (ECST).

  Background: ECST Module
    Given the ECST module is imported from platform-core
    And a sample customer entity exists
    And sample order items exist

  # ============================================================================
  # createFatEvent()
  # ============================================================================

  Rule: createFatEvent() creates properly structured fat events

    The builder ensures consistent structure with type, payload, and metadata.

    @acceptance-criteria @happy-path
    Scenario: Create basic fat event
      Given event type "OrderSubmitted"
      And payload with orderId and totalAmount
      When I call createFatEvent(type, payload)
      Then I receive a FatEvent object
      And event.type equals "OrderSubmitted"
      And event.payload contains the provided data
      And event.metadata.timestamp is set
      And event.metadata.schemaVersion is set

    @acceptance-criteria @happy-path
    Scenario: Create fat event with schema definition
      Given event type "OrderSubmitted"
      And a schema with version "2.0.0"
      When I call createFatEvent(type, payload, { schema })
      Then event.metadata.schemaVersion equals "2.0.0"

    @acceptance-criteria @validation
    Scenario: Schema validation failure
      Given event type "OrderSubmitted"
      And an invalid payload missing required fields
      And a schema with validation rules
      When I call createFatEvent(type, payload, { schema })
      Then an error is thrown with message "Schema validation failed"

    @acceptance-criteria @happy-path
    Scenario: Create fat event with correlation ID
      Given event type "OrderSubmitted"
      And payload with orderId and totalAmount
      And a correlationId "corr_abc123"
      When I call createFatEvent(type, payload, { correlationId })
      Then event.metadata.correlationId equals "corr_abc123"

  # ============================================================================
  # embedEntity()
  # ============================================================================

  Rule: embedEntity() snapshots entity fields into event

    Selectively embed only the fields needed by consumers.

    @acceptance-criteria @happy-path
    Scenario: Embed selected entity fields
      Given a customer entity with id, name, email, internalNotes
      When I call embedEntity(customer, ['id', 'name', 'email'])
      Then the result contains id, name, email
      And the result does NOT contain internalNotes

    @acceptance-criteria @happy-path
    Scenario: Embed all fields
      Given a customer entity with id, name, email
      When I call embedEntity(customer) without field list
      Then the result contains all entity fields

    @acceptance-criteria @validation
    Scenario: Embed non-existent field
      Given a customer entity without address field
      When I call embedEntity(customer, ['id', 'address'])
      Then an error is thrown with message "Field 'address' not found"

  # ============================================================================
  # embedCollection()
  # ============================================================================

  Rule: embedCollection() snapshots related collections

    Embed arrays of related entities for consumers.

    @acceptance-criteria @happy-path
    Scenario: Embed collection of items
      Given 3 order items with productId, name, quantity
      When I call embedCollection(items)
      Then the result is an array of 3 items
      And each item contains productId, name, quantity

    @acceptance-criteria @happy-path
    Scenario: Embed collection with field selection
      Given 3 order items with productId, name, quantity, internalSku
      When I call embedCollection(items, ['productId', 'name', 'quantity'])
      Then each item contains productId, name, quantity
      And no item contains internalSku

    @acceptance-criteria @edge-case
    Scenario: Embed empty collection
      Given an empty array of items
      When I call embedCollection(items)
      Then the result is an empty array
