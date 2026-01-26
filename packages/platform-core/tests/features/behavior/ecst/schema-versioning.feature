@libar-docs
@libar-docs-status:completed
@libar-docs-unlock-reason:Initial-implementation-complete
@libar-docs-implements:EcstFatEvents
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@ecst
Feature: Schema Versioning

  As a platform developer
  I want fat events to include schema version information
  So that consumers can upcast events from older versions

  This feature validates schema versioning support for fat events,
  including version tracking, validation, and migration.

  Background: Schema Registry
    Given the ECST schema registry is available
    And sample schemas for different versions exist

  # ============================================================================
  # Schema Version Tracking
  # ============================================================================

  Rule: Fat events must include schema version

    Every fat event carries its schema version for consumer compatibility.

    @acceptance-criteria @happy-path
    Scenario: Schema version is included automatically
      Given a fat event created without explicit schema
      When I inspect the event metadata
      Then schemaVersion field exists
      And it defaults to "1.0.0"

    @acceptance-criteria @happy-path
    Scenario: Custom schema version is used
      Given a schema with version "2.1.0"
      When I create a fat event with this schema
      Then event.metadata.schemaVersion equals "2.1.0"

  # ============================================================================
  # Schema Validation
  # ============================================================================

  Rule: Fat events are validated against their schema

    Schema validation ensures payload conforms to expected structure.

    @acceptance-criteria @happy-path
    Scenario: Valid payload passes validation
      Given an OrderSubmitted schema requiring orderId and items
      And a payload with orderId "ord_123" and items array
      When I call validateFatEvent(event, schema)
      Then validation succeeds with { valid: true }

    @acceptance-criteria @validation
    Scenario: Missing required field fails validation
      Given an OrderSubmitted schema requiring orderId and items
      And a payload missing orderId
      When I call validateFatEvent(event, schema)
      Then validation fails with { valid: false }
      And error contains "orderId is required"

    @acceptance-criteria @validation
    Scenario: Wrong field type fails validation
      Given an OrderSubmitted schema requiring items as array
      And a payload with items as a string
      When I call validateFatEvent(event, schema)
      Then validation fails with { valid: false }
      And error contains "items must be an array"

  # ============================================================================
  # Schema Migration
  # ============================================================================

  Rule: Older events can be migrated to newer schema versions

    Consumers can upcast events from previous versions.

    @acceptance-criteria @happy-path
    Scenario: Migrate v1 event to v2 format
      Given a v1 OrderSubmitted event without currency field
      And a v2 schema that adds currency with default "USD"
      And a migration function from v1 to v2
      When I call migrateEvent(event, targetSchema)
      Then the result has schemaVersion "2.0.0"
      And payload.currency equals "USD"

    @acceptance-criteria @happy-path
    Scenario: No migration needed for current version
      Given a v2 OrderSubmitted event
      And a v2 schema
      When I call migrateEvent(event, targetSchema)
      Then the event is returned unchanged

    @acceptance-criteria @validation
    Scenario: Unknown source version fails migration
      Given an event with schemaVersion "0.5.0"
      And a schema with no migration path from 0.5.0
      When I call migrateEvent(event, targetSchema)
      Then an error is thrown with message "No migration path from 0.5.0"

  # ============================================================================
  # Version Comparison Utility
  # ============================================================================

  Rule: Version comparison utility works correctly

    The compareVersions() function enables version ordering and comparison.

    @acceptance-criteria @happy-path
    Scenario: Compare older version to newer version
      Given version "1.0.0" and version "2.0.0"
      When comparing versions
      Then the result is -1

    @acceptance-criteria @happy-path
    Scenario: Compare newer version to older version
      Given version "2.0.0" and version "1.0.0"
      When comparing versions
      Then the result is 1

    @acceptance-criteria @happy-path
    Scenario: Compare equal versions
      Given version "1.0.0" and version "1.0.0"
      When comparing versions
      Then the result is 0

    @acceptance-criteria @edge-case
    Scenario: Compare versions with different minor
      Given version "1.2.0" and version "1.10.0"
      When comparing versions
      Then the result is -1

    @acceptance-criteria @validation
    Scenario: Invalid semver format is rejected
      Given an invalid version "1.x.0"
      When attempting to compare with "2.0.0"
      Then an error is thrown with message containing "Invalid semver format"

    @acceptance-criteria @validation
    Scenario: Negative major version is rejected
      Given an invalid version "-1.0.0"
      When attempting to compare with "1.0.0"
      Then an error is thrown with message containing "non-negative"

    @acceptance-criteria @validation
    Scenario: Negative minor version is rejected
      Given an invalid version "1.-5.0"
      When attempting to compare with "1.0.0"
      Then an error is thrown with message containing "non-negative"

  # ============================================================================
  # Migration Need Detection
  # ============================================================================

  Rule: needsMigration() detects when migration is required

    Utility function to check if an event needs upcasting.

    @acceptance-criteria @happy-path
    Scenario: Event needs migration to newer version
      Given an event with schemaVersion "1.0.0"
      And a target version "2.0.0"
      When checking if migration is needed
      Then the result is true

    @acceptance-criteria @happy-path
    Scenario: Event does not need migration for same version
      Given an event with schemaVersion "2.0.0"
      And a target version "2.0.0"
      When checking if migration is needed
      Then the result is false

    @acceptance-criteria @edge-case
    Scenario: Event does not need migration for older target
      Given an event with schemaVersion "3.0.0"
      And a target version "2.0.0"
      When checking if migration is needed
      Then the result is false
