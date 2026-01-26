@libar-docs-pattern:FSMAssertions
@testing-infrastructure
Feature: FSM Testing Assertions

  As a developer testing finite state machines
  I want FSM-specific assertion helpers
  So that I can verify transition validity concisely

  The platform-fsm/testing module provides assertion helpers for testing
  FSM definitions. These helpers verify transition validity, terminal states,
  and provide utilities to enumerate valid transitions.

  Background:
    Given the platform-fsm testing module is imported
    And an OrderStatus FSM with the following transitions:
      | from      | to        |
      | draft     | submitted |
      | submitted | confirmed |
      | submitted | cancelled |
      | confirmed | cancelled |

  # ============================================================================
  # Transition Assertions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Assert valid transition
    When I call assertCanTransition(fsm, "draft", "submitted")
    Then the assertion passes

  @acceptance-criteria @validation
  Scenario: Assert invalid transition fails
    When I call assertCanTransition(fsm, "cancelled", "confirmed")
    Then the assertion fails
    And the error message indicates the transition is not allowed

  @acceptance-criteria @happy-path
  Scenario: Assert transition is not allowed
    When I call assertCannotTransition(fsm, "draft", "confirmed")
    Then the assertion passes
    # draft cannot directly transition to confirmed (must go through submitted)

  @acceptance-criteria @validation
  Scenario: Assert cannot transition fails for valid transition
    When I call assertCannotTransition(fsm, "draft", "submitted")
    Then the assertion fails
    And the error message indicates the transition IS allowed

  # ============================================================================
  # State Property Assertions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Assert terminal state
    When I call assertIsTerminalState(fsm, "cancelled")
    Then the assertion passes

  @acceptance-criteria @validation
  Scenario: Assert terminal state fails for non-terminal
    When I call assertIsTerminalState(fsm, "submitted")
    Then the assertion fails
    And the error message indicates "submitted" is not terminal

  @acceptance-criteria @happy-path
  Scenario: Assert non-terminal state
    When I call assertIsNotTerminalState(fsm, "draft")
    Then the assertion passes

  @acceptance-criteria @happy-path
  Scenario: Assert initial state
    When I call assertIsInitialState(fsm, "draft")
    Then the assertion passes

  @acceptance-criteria @happy-path
  Scenario: Assert valid state
    When I call assertIsValidState(fsm, "submitted")
    Then the assertion passes

  @acceptance-criteria @validation
  Scenario: Assert invalid state fails
    When I call assertIsValidState(fsm, "nonexistent")
    Then the assertion fails

  # ============================================================================
  # Utility Functions
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Get all valid transitions
    When I call getAllValidTransitions(fsm)
    Then I receive a list of [from, to] state pairs
    And the list includes ["draft", "submitted"]
    And the list includes ["submitted", "confirmed"]
    And the list includes ["submitted", "cancelled"]
    And the list includes ["confirmed", "cancelled"]

  @acceptance-criteria @happy-path
  Scenario: Get all states
    When I call getAllStates(fsm)
    Then I receive a list containing "draft", "submitted", "confirmed", "cancelled"

  @acceptance-criteria @happy-path
  Scenario: Get terminal states
    When I call getTerminalStates(fsm)
    Then I receive a list containing only "cancelled"

  @acceptance-criteria @happy-path
  Scenario: Get non-terminal states
    When I call getNonTerminalStates(fsm)
    Then I receive a list containing "draft", "submitted", "confirmed"
    And the list does not contain "cancelled"

  @acceptance-criteria @happy-path
  Scenario: Assert valid transitions from a state
    When I call assertValidTransitionsFrom(fsm, "submitted", ["confirmed", "cancelled"])
    Then the assertion passes
