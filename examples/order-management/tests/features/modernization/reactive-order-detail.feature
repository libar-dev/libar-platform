@libar-docs-phase:23
@libar-docs-product-area:ExampleApp
@libar-docs-pattern:ReactiveProjections
@libar-docs-status:completed
@acceptance-criteria
Feature: Reactive Order Detail View

  As a frontend developer
  I want to see useReactiveProjection demonstrated for order detail
  So that I understand how to build instant-updating UI components

  Background: Test environment setup
    Given the orders bounded context is initialized
    And the test run has a unique namespace

  # ============================================================================
  # Happy Path
  # ============================================================================

  Rule: Order detail view uses reactive projection for instant updates

    @happy-path
    Scenario: Order detail view shows instant updates
      Given an order exists with status "draft"
      And a client is subscribed to the order detail view
      When the order status changes to "submitted"
      Then the UI should receive the update within 50ms
      And no polling should have occurred

    @happy-path
    Scenario: Multiple rapid updates are applied correctly
      Given an order exists with 2 items
      And a client is subscribed to the order detail view
      When 5 items are added in rapid succession
      Then all items should appear in the view
      And the final item count should be 7

  # ============================================================================
  # Validation / Edge Cases
  # ============================================================================

    @validation
    Scenario: Optimistic update rolls back on conflict
      Given a client has an optimistic order total of $100
      And the server projection shows order total of $150
      When the conflict is detected
      Then the optimistic state should be rolled back to $150
      And a conflict event should be logged

    @validation
    Scenario: Stale event stream is handled gracefully
      Given a client subscribed with an outdated event cursor
      When the server has newer events
      Then the client should catch up to current state
      And no data loss should occur
