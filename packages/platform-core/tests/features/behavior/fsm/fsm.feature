@architect
Feature: FSM Core

  As a platform developer
  I want a finite state machine with transition validation
  So that domain state changes are always safe and auditable

  # ============================================================================
  # defineFSM
  # ============================================================================

  Rule: defineFSM creates an FSM with correct initial state and definition

    **Invariant:** The FSM preserves the initial state and full transition map from its definition.
    **Verified by:** Direct property assertions on the created FSM.

    @acceptance-criteria @happy-path
    Scenario: FSM is created with correct initial state
      Given a test FSM with initial state "draft"
      Then the FSM initial state is "draft"

    @acceptance-criteria @happy-path
    Scenario: FSM preserves the definition
      Given a test FSM with initial state "draft"
      Then the FSM definition initial state is "draft"
      And the FSM definition transitions for "draft" are:
        | target    |
        | submitted |
        | cancelled |

  # ============================================================================
  # canTransition
  # ============================================================================

  Rule: canTransition returns true only for transitions defined in the FSM

    **Invariant:** A transition is valid if and only if it appears in the FSM transition map for the source state.
    **Rationale:** Prevents illegal state changes before they occur.
    **Verified by:** Positive and negative transition checks.

    @acceptance-criteria @happy-path
    Scenario: Valid transitions return true
      Given a test FSM with initial state "draft"
      Then canTransition returns true for:
        | from      | to        |
        | draft     | submitted |
        | draft     | cancelled |
        | submitted | confirmed |
        | submitted | cancelled |

    @acceptance-criteria @validation
    Scenario: Invalid transitions return false
      Given a test FSM with initial state "draft"
      Then canTransition returns false for:
        | from      | to        |
        | draft     | confirmed |
        | submitted | draft     |
        | confirmed | draft     |
        | cancelled | draft     |

    @acceptance-criteria @happy-path
    Scenario: Standalone canTransition function works
      Given a test FSM with initial state "draft"
      Then standalone canTransition returns true for "draft" to "submitted"
      And standalone canTransition returns false for "draft" to "confirmed"

  # ============================================================================
  # assertTransition
  # ============================================================================

  Rule: assertTransition throws FSMTransitionError for invalid transitions

    **Invariant:** Valid transitions do not throw; invalid transitions throw FSMTransitionError with full details.
    **Rationale:** Provides fail-fast enforcement with diagnostic context.
    **Verified by:** Throw/no-throw checks and error property assertions.

    @acceptance-criteria @happy-path
    Scenario: Valid transitions do not throw
      Given a test FSM with initial state "draft"
      Then assertTransition does not throw for:
        | from      | to        |
        | draft     | submitted |
        | submitted | confirmed |

    @acceptance-criteria @validation
    Scenario: Invalid transition throws FSMTransitionError
      Given a test FSM with initial state "draft"
      When I attempt transition from "draft" to "confirmed"
      Then an FSMTransitionError is thrown

    @acceptance-criteria @validation
    Scenario: FSMTransitionError includes transition details
      Given a test FSM with initial state "draft"
      When I attempt transition from "draft" to "confirmed"
      Then the error has from "draft" and to "confirmed"
      And the error has valid transitions:
        | target    |
        | submitted |
        | cancelled |
      And the error has code "FSM_INVALID_TRANSITION"

    @acceptance-criteria @happy-path
    Scenario: Standalone assertTransition function works
      Given a test FSM with initial state "draft"
      Then standalone assertTransition does not throw for "draft" to "submitted"
      And standalone assertTransition throws FSMTransitionError for "draft" to "confirmed"

  # ============================================================================
  # validTransitions
  # ============================================================================

  Rule: validTransitions returns the list of allowed target states

    **Invariant:** Returns exactly the transitions defined in the FSM for that state.
    **Verified by:** Equality checks against the definition.

    @acceptance-criteria @happy-path
    Scenario: Returns valid transitions for each state
      Given a test FSM with initial state "draft"
      Then validTransitions returns for each state:
        | state     | targets              |
        | draft     | submitted, cancelled |
        | submitted | confirmed, cancelled |
        | confirmed |                      |
        | cancelled |                      |

    @acceptance-criteria @happy-path
    Scenario: Standalone validTransitions function works
      Given a test FSM with initial state "draft"
      Then standalone validTransitions for "draft" returns:
        | target    |
        | submitted |
        | cancelled |

  # ============================================================================
  # isTerminal
  # ============================================================================

  Rule: isTerminal identifies states with no outgoing transitions

    **Invariant:** A state is terminal if and only if its transition list is empty.
    **Verified by:** Checks on terminal and non-terminal states.

    @acceptance-criteria @happy-path
    Scenario: Terminal states are identified
      Given a test FSM with initial state "draft"
      Then isTerminal returns true for:
        | state     |
        | confirmed |
        | cancelled |

    @acceptance-criteria @validation
    Scenario: Non-terminal states are identified
      Given a test FSM with initial state "draft"
      Then isTerminal returns false for:
        | state     |
        | draft     |
        | submitted |

    @acceptance-criteria @happy-path
    Scenario: Standalone isTerminal function works
      Given a test FSM with initial state "draft"
      Then standalone isTerminal returns true for "confirmed"
      And standalone isTerminal returns false for "draft"

  # ============================================================================
  # isValidState
  # ============================================================================

  Rule: isValidState returns true only for states defined in the FSM

    **Invariant:** A state is valid if and only if it exists as a key in the transition map.
    **Verified by:** Positive checks for defined states, negative checks for undefined strings.

    @acceptance-criteria @happy-path
    Scenario: Valid states return true
      Given a test FSM with initial state "draft"
      Then isValidState returns true for:
        | state     |
        | draft     |
        | submitted |
        | confirmed |
        | cancelled |

    @acceptance-criteria @validation
    Scenario: Invalid states return false
      Given a test FSM with initial state "draft"
      Then isValidState returns false for:
        | state   |
        | unknown |
        |         |
        | DRAFT   |

    @acceptance-criteria @happy-path
    Scenario: Standalone isValidState function works
      Given a test FSM with initial state "draft"
      Then standalone isValidState returns true for "draft"
      And standalone isValidState returns false for "unknown"

  # ============================================================================
  # FSMTransitionError
  # ============================================================================

  Rule: FSMTransitionError has correct error properties

    **Invariant:** The error includes name, code, from, to, validTransitions, and a descriptive message.
    **Verified by:** Direct property assertions on constructed errors.

    @acceptance-criteria @happy-path
    Scenario: Error has correct properties
      When I create an FSMTransitionError from "draft" to "confirmed" with valid transitions:
        | target    |
        | submitted |
        | cancelled |
      Then the error name is "FSMTransitionError"
      And the error code is "FSM_INVALID_TRANSITION"
      And the error has from "draft" and to "confirmed"
      And the error message contains "Invalid transition"
      And the error message contains "draft"
      And the error message contains "confirmed"

    @acceptance-criteria @validation
    Scenario: Error handles terminal states in message
      When I create an FSMTransitionError from "confirmed" to "draft" with no valid transitions
      Then the error message contains "(none - terminal state)"
