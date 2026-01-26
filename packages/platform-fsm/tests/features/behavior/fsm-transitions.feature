@libar-docs
@libar-docs-pattern:FSMTransitions
@libar-docs-status:completed
@acceptance-criteria
@libar-docs-implements:DeciderPattern
@libar-docs-unlock-reason:metadata-alignment
Feature: FSM State Transitions

  The FSM (Finite State Machine) module provides type-safe state management
  with explicit transition rules. It prevents invalid state transitions at
  runtime while providing clear error messages.

  This is a core infrastructure pattern used by aggregates to enforce
  valid state progressions (e.g., Order: draft -> submitted -> confirmed).

  # NOTE: This is a reference implementation for PDR-003 behavior feature files.
  # - No Release column in DataTables (per PDR-003)
  # - Uses @acceptance-criteria tag for scenarios
  # - Links to pattern via @libar-docs-pattern tag

  Background:
    Given a test FSM with states: draft, submitted, confirmed, cancelled
    And initial state is "draft"
    And transitions are defined as:
      | from      | allowedTo                 |
      | draft     | submitted, cancelled      |
      | submitted | confirmed, cancelled      |
      | confirmed |                           |
      | cancelled |                           |

  # ==========================================================================
  # FSM Definition
  # ==========================================================================

  @happy-path
  Scenario: FSM is created with correct initial state
    When the FSM is defined
    Then the initial state should be "draft"
    And the FSM definition should be accessible

  # ==========================================================================
  # Valid Transitions
  # ==========================================================================

  @happy-path
  Scenario Outline: Valid transitions are allowed
    When checking if transition from "<from>" to "<to>" is valid
    Then canTransition should return true

    Examples:
      | from      | to        |
      | draft     | submitted |
      | draft     | cancelled |
      | submitted | confirmed |
      | submitted | cancelled |

  @happy-path
  Scenario Outline: assertTransition does not throw for valid transitions
    When asserting transition from "<from>" to "<to>"
    Then no error should be thrown

    Examples:
      | from      | to        |
      | draft     | submitted |
      | submitted | confirmed |

  # ==========================================================================
  # Invalid Transitions
  # ==========================================================================

  @validation
  Scenario Outline: Invalid transitions are detected
    When checking if transition from "<from>" to "<to>" is valid
    Then canTransition should return false

    Examples:
      | from      | to        |
      | draft     | confirmed |
      | submitted | draft     |
      | confirmed | draft     |
      | cancelled | draft     |

  @business-failure
  Scenario: assertTransition throws FSMTransitionError for invalid transitions
    When asserting transition from "draft" to "confirmed"
    Then an FSMTransitionError should be thrown
    And the error should have from state "draft"
    And the error should have to state "confirmed"
    And the error should have valid transitions "submitted, cancelled"
    And the error code should be "FSM_INVALID_TRANSITION"

  # ==========================================================================
  # Terminal States
  # ==========================================================================

  @happy-path
  Scenario Outline: Terminal states are correctly identified
    When checking if "<state>" is terminal
    Then isTerminal should return "<expected>"

    Examples:
      | state     | expected |
      | confirmed | true     |
      | cancelled | true     |
      | draft     | false    |
      | submitted | false    |

  @edge-case
  Scenario: Terminal state error message indicates no valid transitions
    Given the FSM is in state "confirmed"
    When asserting transition from "confirmed" to "draft"
    Then an FSMTransitionError should be thrown
    And the error message should contain "(none - terminal state)"

  # ==========================================================================
  # State Validation
  # ==========================================================================

  @validation
  Scenario Outline: State validity is correctly checked
    When checking if "<state>" is a valid state
    Then isValidState should return "<expected>"

    Examples:
      | state     | expected |
      | draft     | true     |
      | submitted | true     |
      | confirmed | true     |
      | cancelled | true     |
      | unknown   | false    |
      | ""        | false    |
      | DRAFT     | false    |

  # ==========================================================================
  # Valid Transitions Query
  # ==========================================================================

  @happy-path
  Scenario Outline: Valid transitions can be queried for any state
    When querying valid transitions from "<state>"
    Then the result should be "<expected>"

    Examples:
      | state     | expected            |
      | draft     | submitted,cancelled |
      | submitted | confirmed,cancelled |
      | confirmed | empty               |
      | cancelled | empty               |

  # ==========================================================================
  # Standalone Functions
  # ==========================================================================

  @technical-constraint
  Scenario Outline: Standalone functions work identically to FSM methods
    Given the standalone canTransition function
    When checking "<from>" to "<to>" with standalone function
    Then the result should be "<expected>"

    Examples:
      | from  | to        | expected |
      | draft | submitted | true     |
      | draft | confirmed | false    |

  @technical-constraint
  Scenario: Standalone assertTransition throws same errors
    Given the standalone assertTransition function
    When asserting "draft" to "confirmed" with standalone function
    Then an FSMTransitionError should be thrown
