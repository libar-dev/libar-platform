@libar-docs-pattern:ReactiveProjectionConflictDetection
@libar-docs-status:completed
@libar-docs-phase:17
@libar-docs-product-area:Platform
@acceptance-criteria
Feature: Conflict Detection and Rollback

  As a platform developer
  I want conflicts detected and resolved automatically
  So that data integrity is maintained despite optimistic updates

  Background: Conflict detection setup
    # Implementation placeholder - stub setup
    Given the conflict detection module is initialized
    And a reactive projection with optimistic state tracking

  # ============================================================================
  # Conflict Detection
  # ============================================================================

  @happy-path
  Scenario: Conflicting optimistic update is rolled back
    # Implementation placeholder - stub scenario
    Given optimistic state based on event A
    And durable state updated with event B (different branch)
    When conflict is detected
    Then optimistic state should be discarded
    And client should show durable state

  # ============================================================================
  # Network Partition Handling
  # ============================================================================

  @validation
  Scenario: Conflict detection handles network partition
    # Implementation placeholder - stub scenario
    Given optimistic updates accumulated during offline period
    When client reconnects and receives durable state
    Then all conflicting optimistic updates are rolled back
    And non-conflicting updates are preserved

  # ============================================================================
  # Non-Conflict Convergence
  # ============================================================================

  @happy-path
  Scenario: No conflict when optimistic is ahead of durable
    # Implementation placeholder - stub scenario
    Given optimistic state with events A, B
    And durable state with only event A
    When durable catches up with event B
    Then states converge without rollback
    And no user-visible disruption occurs

  # ============================================================================
  # UI Notification
  # ============================================================================

  @validation
  Scenario: Rollback triggers UI notification
    # Implementation placeholder - stub scenario
    Given optimistic state that will conflict
    When conflict is detected and rollback occurs
    Then client receives conflict notification
    And UI can display appropriate feedback

  # ============================================================================
  # Partial Event Clearing
  # ============================================================================

  @unit
  Scenario Outline: Partial clearing preserves unconfirmed events
    # Tests clearConfirmedEvents() correctly filters events
    Given optimistic state with events at positions <positions>
    When durable confirms position <confirmed>
    Then remaining event positions should be "<remaining>"

    Examples:
      | positions | confirmed | remaining |
      | 5,6,7     | 5         | 6,7       |
      | 5,6,7     | 6         | 7         |
      | 5,6,7     | 7         |           |
      | 5,6,7     | 4         | 5,6,7     |
      | 5,6,7     | 10        |           |
