@libar-docs
@libar-docs-status:completed
@libar-docs-implements:EcstFatEvents
@libar-docs-phase:20
@libar-docs-product-area:PlatformCore
@ecst @gdpr
Feature: Privacy Markers (Crypto-Shredding)

  As a platform developer
  I want to mark PII fields in fat events for crypto-shredding
  So that GDPR right-to-erasure requests can be properly handled

  This feature validates crypto-shredding markers that identify
  personal data fields for deletion during GDPR erasure requests.

  Background: Privacy Configuration
    Given the ECST module with privacy support is imported
    And sample entities with PII fields exist

  # ============================================================================
  # PII Field Marking
  # ============================================================================

  Rule: PII fields can be marked for crypto-shredding

    Personal data embedded in fat events must be identifiable for deletion.

    @acceptance-criteria @happy-path
    Scenario: Mark single field for shredding
      Given a customer entity with email "alice@example.com"
      When I call embedEntity(customer, ['id', 'name', 'email'], { shred: ['email'] })
      Then the result includes email field
      And email is marked with __shred: true metadata

    @acceptance-criteria @happy-path
    Scenario: Mark multiple fields for shredding
      Given a customer entity with email, phone, address
      When I call embedEntity(customer, ['id', 'email', 'phone', 'address'], { shred: ['email', 'phone', 'address'] })
      Then email, phone, and address are all marked with __shred: true

    @acceptance-criteria @happy-path
    Scenario: Non-PII fields are not marked
      Given a customer entity with id, name, email
      When I call embedEntity(customer, ['id', 'name', 'email'], { shred: ['email'] })
      Then id and name are NOT marked with __shred

  # ============================================================================
  # Shred Marker Detection
  # ============================================================================

  Rule: Shred markers can be detected in fat events

    Systems processing erasure requests need to find marked fields.

    @acceptance-criteria @happy-path
    Scenario: Find all shreddable fields in event
      Given a fat event with marked email and phone fields
      When I call findShreddableFields(event)
      Then result includes "payload.customer.email"
      And result includes "payload.customer.phone"

    @acceptance-criteria @happy-path
    Scenario: No shreddable fields returns empty
      Given a fat event with no marked fields
      When I call findShreddableFields(event)
      Then result is an empty array

  # ============================================================================
  # Collection Privacy
  # ============================================================================

  Rule: Collections can have per-item privacy markers

    For embedded collections, each item can have its own PII fields.

    @acceptance-criteria @happy-path
    Scenario: Mark fields in collection items
      Given 2 shipping addresses with street, city, postalCode
      When I call embedCollection(addresses, ['street', 'city', 'postalCode'], { shred: ['street', 'postalCode'] })
      Then each item has street and postalCode marked with __shred: true
      And city is not marked in any item

  # ============================================================================
  # Shredding Execution
  # ============================================================================

  Rule: Marked fields can be shredded (replaced with RedactedValue)

    During erasure, PII fields are replaced with structured RedactedValue objects.

    @acceptance-criteria @happy-path
    Scenario: Shred all marked fields
      Given a fat event with marked email "alice@example.com"
      When I call shredEvent(event)
      Then email field is a RedactedValue object
      And RedactedValue has __redacted set to true
      And RedactedValue has originalType "string"
      And RedactedValue has redactedAt timestamp

    @acceptance-criteria @happy-path
    Scenario: Non-marked fields are preserved
      Given a fat event with marked email and non-marked name
      When I call shredEvent(event)
      Then name field value is unchanged
      And email field is a RedactedValue object

    @acceptance-criteria @happy-path
    Scenario: Shred event returns audit trail
      Given a fat event with marked email "alice@example.com"
      When I call shredEvent(event) with correlationId "erasure-req-123"
      Then the result includes an audit object
      And audit.correlationId equals "erasure-req-123"
      And audit.fieldsShredded includes the shredded field paths
      And audit.shreddedAt is a timestamp

  # ============================================================================
  # Utility Functions
  # ============================================================================

  Rule: Utility functions for shreddable field detection

    Helper functions optimize common operations on shreddable fields.

    @acceptance-criteria @happy-path
    Scenario: Check if event has any shreddable fields
      Given a fat event with marked PII fields
      When I call hasShreddableFields(event)
      Then the result is true

    @acceptance-criteria @happy-path
    Scenario: Check event without shreddable fields
      Given a fat event with no marked fields
      When I call hasShreddableFields(event)
      Then the result is false

    @acceptance-criteria @happy-path
    Scenario: Count shreddable fields
      Given a fat event with 2 marked PII fields
      When I call countShreddableFields(event)
      Then the result is 2

  # ============================================================================
  # Required Field Protection
  # ============================================================================

  Rule: Required fields cannot be marked for shredding

    Business-critical fields must be protected from accidental shredding.

    @acceptance-criteria @validation
    Scenario: Cannot shred required fields
      Given an entity with fields id, name, email
      When I call embedEntity with shred ["email"] and required ["email"]
      Then an error is thrown with message containing "marked as required"

    @acceptance-criteria @happy-path
    Scenario: Non-overlapping shred and required fields work
      Given an entity with fields id, name, email
      When I call embedEntity with shred ["email"] and required ["id"]
      Then the result includes email marked with __shred
      And the result includes id without __shred marker
