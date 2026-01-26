@libar-docs-phase:23
@libar-docs-product-area:ExampleApp
@libar-docs-pattern:EcstFatEvents
@libar-docs-status:completed
@acceptance-criteria
Feature: Fat Events - Enriched OrderSubmitted

  As an event consumer
  I want OrderSubmitted events to include customer snapshots
  So that I can process orders without additional customer queries

  Background: Test environment setup
    Given the orders bounded context is initialized
    And the test run has a unique namespace

  # ============================================================================
  # Happy Path
  # ============================================================================

  Rule: OrderSubmitted event includes customer snapshot

    @happy-path
    Scenario: OrderSubmitted includes customer snapshot
        Given a customer exists:
        | customerId | name     | email             |
        | cust-001   | John Doe | john@example.com  |
      And the customer has a draft order
      When the customer submits the order
      Then the OrderSubmitted event should include:
        | field          | value            |
        | customer.id    | cust-001         |
        | customer.name  | John Doe         |
        | customer.email | john@example.com |
      And the event schema version should be 2

    @happy-path
    Scenario: Event enrichment does not block order submission
        Given a customer with complete profile
      And a draft order ready for submission
      When the order is submitted
      Then the command should complete within acceptable latency
      And the event should be enriched with customer data

  # ============================================================================
  # Validation / Edge Cases
  # ============================================================================

    @validation
    Scenario: Customer snapshot is immutable in event
        Given an OrderSubmitted event exists with customer name "John Doe"
      When the customer updates their name to "John Smith"
      Then querying the original event should still show "John Doe"
      And new OrderSubmitted events should show "John Smith"

    @validation
    Scenario: Missing customer data handled gracefully
        Given a customer with incomplete profile (missing email)
      When the customer submits an order
      Then the OrderSubmitted event should include available data
      And missing fields should have null or default values
      And the order submission should not fail

  # ============================================================================
  # Upcasting / Schema Evolution
  # ============================================================================

    @upcasting
    Scenario: V1 events are upcasted to V2 with null customer
      # Demonstrates backward compatibility via event upcasting.
      # V1 events (created before Fat Events) are automatically migrated
      # to V2 format with customer: null to indicate legacy origin.
      Given a legacy V1 OrderSubmitted event without customer data
      When the event is read through the upcaster
      Then the event should have schema version 2
      And the customer field should be null indicating a legacy event

    @upcasting
    Scenario: V2 events are not modified by upcaster
      # V2 events already have the customer snapshot and should pass through unchanged.
      Given a V2 OrderSubmitted event with customer data
      When the event is read through the upcaster
      Then the event should have schema version 2
      And wasUpcasted should be false
      And the customer snapshot should be preserved
