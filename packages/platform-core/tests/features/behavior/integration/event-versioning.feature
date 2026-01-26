@libar-docs
@libar-docs-status:roadmap
@libar-docs-implements:IntegrationPatterns21b
@libar-docs-phase:21
@libar-docs-product-area:PlatformCore
@integration
Feature: Integration Event Versioning

  As a platform developer
  I want integration events to support schema evolution
  So that old consumers continue working when schemas change

  This feature validates upcasting, downcasting, and
  version migration for integration events.

  Background: Integration Module
    Given the integration module is imported from platform-core
    And the versioning utilities are available

  # ============================================================================
  # Upcasting (Old → New)
  # ============================================================================

  Rule: Upcasters migrate old schemas to new

    Historical events are upcasted when loaded by new consumers.

    @acceptance-criteria @happy-path
    Scenario: Upcast V1 event to V2
      Given OrderSubmittedV1 { orderId, customerId, items }
      And OrderSubmittedV2 adds required "currency" field
      When I register an upcaster V1 → V2
      Then upcasting V1 event adds currency: 'USD' default

    @acceptance-criteria @happy-path
    Scenario: Chain upcasters for multiple versions
      Given versions V1, V2, V3 with upcasters V1→V2 and V2→V3
      When I upcast a V1 event to V3
      Then both upcasters are applied in sequence
      And final result is valid V3

    @acceptance-criteria @happy-path
    Scenario: Upcast adds computed field
      Given V1 has { items } array
      And V2 adds computed { itemCount }
      When upcasting V1 to V2
      Then itemCount equals items.length

  # ============================================================================
  # Downcasting (New → Old)
  # ============================================================================

  Rule: Downcasters support old consumers

    New events can be downcast for consumers on older versions.

    @acceptance-criteria @happy-path
    Scenario: Downcast V2 event to V1
      Given OrderSubmittedV2 { orderId, customerId, items, currency }
      And consumer expects OrderSubmittedV1
      When I register a downcaster V2 → V1
      Then downcasting V2 event removes currency field

    @acceptance-criteria @edge-case
    Scenario: Downcast removes required-in-new field
      Given V2 has required "priority" field
      And V1 has no priority concept
      When downcasting V2 to V1
      Then priority field is removed
      And result is valid V1

  # ============================================================================
  # Migration Registration
  # ============================================================================

  Rule: Migrations are registered with schema versions

    Version migrations are part of schema registration.

    @acceptance-criteria @happy-path
    Scenario: Register schema with migration
      Given OrderSubmittedV2 schema
      When I register with backwardCompatible: ['1.0.0']
      And provide migrate function for V1
      Then V1 events can be automatically upcasted

    @acceptance-criteria @validation
    Scenario: Missing migration path
      Given V1 and V3 registered
      And no V2 or direct V1→V3 migration
      When attempting to upcast V1 to V3
      Then an error is thrown with code "NO_MIGRATION_PATH"

    @acceptance-criteria @validation
    Scenario: Breaking change without migration
      Given V2 removes required V1 field "orderId"
      When attempting to register V2 as backwardCompatible with V1
      Then an error is thrown with code "BREAKING_CHANGE"
      And error suggests registering migration function

  # ============================================================================
  # Version Detection
  # ============================================================================

  Rule: Event version is detected automatically

    Events include version metadata for proper handling.

    @acceptance-criteria @happy-path
    Scenario: Detect version from event metadata
      Given an event with metadata.schemaVersion: "2.0.0"
      When I call detectVersion(event)
      Then result equals "2.0.0"

    @acceptance-criteria @happy-path
    Scenario: Infer version from payload shape
      Given an event without schemaVersion metadata
      But payload matches OrderSubmittedV1 shape
      When I call detectVersion(event, 'OrderSubmitted')
      Then result equals "1.0.0"
