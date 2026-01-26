@libar-docs
@libar-docs-status:roadmap
@libar-docs-implements:IntegrationPatterns21a
@libar-docs-phase:21
@libar-docs-product-area:PlatformCore
@integration
Feature: Published Language Registry

  As a platform developer
  I want a registry of versioned integration event schemas
  So that cross-BC communication has stable contracts

  This feature validates the Published Language registry
  and toPublishedLanguage() converter functionality.

  Background: Integration Module
    Given the integration module is imported from platform-core
    And the Published Language registry is available

  # ============================================================================
  # Schema Registration
  # ============================================================================

  Rule: Schemas are registered with versions

    Integration event schemas must be versioned for evolution.

    @acceptance-criteria @happy-path
    Scenario: Register integration event schema
      Given event type "OrderSubmitted"
      And schema version "1.0.0"
      When I call registerIntegrationSchema({ eventType, version, schema })
      Then the schema is available in the registry
      And getSchema('OrderSubmitted', '1.0.0') returns the schema

    @acceptance-criteria @happy-path
    Scenario: Register multiple versions
      Given "OrderSubmitted" version "1.0.0" is registered
      When I register "OrderSubmitted" version "2.0.0"
      Then both versions are available
      And getLatestVersion('OrderSubmitted') returns "2.0.0"

    @acceptance-criteria @validation
    Scenario: Duplicate version is rejected
      Given "OrderSubmitted" version "1.0.0" is registered
      When I attempt to register "OrderSubmitted" version "1.0.0" again
      Then an error is thrown with code "VERSION_EXISTS"

  # ============================================================================
  # toPublishedLanguage() Conversion
  # ============================================================================

  Rule: toPublishedLanguage() converts domain events

    Domain events are converted to integration events with proper metadata.

    @acceptance-criteria @happy-path
    Scenario: Convert domain event to integration event
      Given a registered schema for "OrderSubmitted" v1.0.0
      And a domain OrderSubmitted event with orderId and customerId
      When I call toPublishedLanguage('OrderSubmitted', payload)
      Then result.type equals "OrderSubmitted"
      And result.payload contains orderId and customerId
      And result.metadata.schemaVersion equals "1.0.0"
      And result.metadata.timestamp is set

    @acceptance-criteria @happy-path
    Scenario: Convert with explicit version
      Given "OrderSubmitted" versions "1.0.0" and "2.0.0" are registered
      When I call toPublishedLanguage('OrderSubmitted', payload, { version: '1.0.0' })
      Then result.metadata.schemaVersion equals "1.0.0"

    @acceptance-criteria @validation
    Scenario: Unregistered event type fails
      Given no schema registered for "UnknownEvent"
      When I call toPublishedLanguage('UnknownEvent', payload)
      Then an error is thrown with code "SCHEMA_NOT_FOUND"

    @acceptance-criteria @validation
    Scenario: Invalid payload fails schema validation
      Given a registered schema requiring "orderId" field
      When I call toPublishedLanguage('OrderSubmitted', {})
      Then an error is thrown with code "SCHEMA_VALIDATION_FAILED"
      And error details mention missing "orderId"

    # Research gap: Event tagging for routing and DCB

    @acceptance-criteria @happy-path
    Scenario: Event tagging for routing and DCB
      Given a registered schema for "OrderSubmitted" v1.0.0
      And a domain event with customerId "cust_456"
      When I call toPublishedLanguage('OrderSubmitted', payload, { tags: { customerId: 'cust_456' } })
      Then result.metadata.tags contains customerId
      And tags can be used for DCB consistency queries

    @acceptance-criteria @happy-path
    Scenario: Multiple tags for routing
      Given a registered schema for "OrderSubmitted" v1.0.0
      When I call toPublishedLanguage with tags { customerId: 'cust_456', region: 'US' }
      Then result.metadata.tags contains both customerId and region

    # Research gap: Schema compatibility modes

    @acceptance-criteria @happy-path
    Scenario: Register schema with compatibility mode
      Given a new integration event type "InventoryReserved"
      When I register with version "1.0.0" and compatibility "backward"
      Then the schema is available in the registry
      And compatibility mode is stored with the schema

    @acceptance-criteria @happy-path
    Scenario: Query schema compatibility mode
      Given "OrderSubmitted" v2.0.0 registered with compatibility "full"
      When I call getSchema('OrderSubmitted', '2.0.0')
      Then result.compatibility equals "full"

  # ============================================================================
  # Schema Queries
  # ============================================================================

  Rule: Registry supports schema queries

    Query available schemas for documentation and tooling.

    @acceptance-criteria @happy-path
    Scenario: List all event types
      Given schemas registered for "OrderSubmitted", "OrderConfirmed", "PaymentReceived"
      When I call listEventTypes()
      Then I receive ["OrderSubmitted", "OrderConfirmed", "PaymentReceived"]

    @acceptance-criteria @happy-path
    Scenario: List versions for event type
      Given "OrderSubmitted" has versions "1.0.0", "1.1.0", "2.0.0"
      When I call listVersions('OrderSubmitted')
      Then I receive ["1.0.0", "1.1.0", "2.0.0"]
