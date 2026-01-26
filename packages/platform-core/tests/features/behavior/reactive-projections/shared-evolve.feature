@libar-docs-pattern:ReactiveProjectionSharedEvolve
@libar-docs-status:completed
@libar-docs-phase:17
@libar-docs-product-area:Platform
@acceptance-criteria
Feature: Shared Evolve Logic - Client/Server Consistency

  As a platform developer
  I want evolve logic shared between client and server
  So that state transformations are always consistent

  Background: Evolve function setup
    # Implementation placeholder - stub setup
    Given an evolve function is defined for the projection
    And the evolve function handles OrderSubmitted and OrderConfirmed events

  # ============================================================================
  # Consistent Transformation
  # ============================================================================

  @happy-path
  Scenario: Evolve produces identical results on client and server
    # Implementation placeholder - stub scenario
    Given an OrderSubmitted event
    When evolve is applied on client (optimistic)
    And evolve is applied on server (durable)
    Then both should produce identical state

  # ============================================================================
  # Unknown Event Handling
  # ============================================================================

  @validation
  Scenario: Evolve handles unknown event types gracefully
    # Implementation placeholder - stub scenario
    Given an evolve function for known event types
    When an unknown event type is applied
    Then state should remain unchanged
    And no error should be thrown

  # ============================================================================
  # Sequential Event Processing
  # ============================================================================

  @happy-path
  Scenario: Multiple events evolve in sequence
    # Implementation placeholder - stub scenario
    Given a base projection state
    When OrderSubmitted then OrderConfirmed events are applied
    Then final state reflects all event transformations in order
    And intermediate states are consistent

  # ============================================================================
  # Error Handling
  # ============================================================================

  @validation
  Scenario: Evolve error includes event context
    # Tests mergeProjectionWithEvents() provides context when evolve throws
    Given a base projection state
    And an evolve function that throws on "CorruptEvent"
    When a "CorruptEvent" at position 5 is merged
    Then error message should contain "position=5"
    And error message should contain "CorruptEvent"
