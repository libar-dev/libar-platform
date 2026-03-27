@architect
Feature: Process Manager Lifecycle State Machine

  As a platform developer
  I want a process manager lifecycle state machine
  So that PM state transitions are validated and auditable

  # ============================================================================
  # isPMValidTransition
  # ============================================================================

  Rule: isPMValidTransition validates allowed transitions from idle state

    **Invariant:** From idle, only START is a valid event.
    **Verified by:** Positive check for START, negative checks for all other events.

    @acceptance-criteria @happy-path
    Scenario: Idle state allows START
      When I check if transition from "idle" with "START" is valid
      Then the transition is valid

    @acceptance-criteria @validation
    Scenario: Idle state rejects invalid events
      Then isPMValidTransition returns false for:
        | state | event   |
        | idle  | SUCCESS |
        | idle  | FAIL    |
        | idle  | RETRY   |
        | idle  | RESET   |

  Rule: isPMValidTransition validates allowed transitions from processing state

    **Invariant:** From processing, only SUCCESS and FAIL are valid events.
    **Verified by:** Positive checks for SUCCESS/FAIL, negative checks for others.

    @acceptance-criteria @happy-path
    Scenario: Processing state allows SUCCESS and FAIL
      Then isPMValidTransition returns true for:
        | state      | event   |
        | processing | SUCCESS |
        | processing | FAIL    |

    @acceptance-criteria @validation
    Scenario: Processing state rejects invalid events
      Then isPMValidTransition returns false for:
        | state      | event |
        | processing | START |
        | processing | RETRY |
        | processing | RESET |

  Rule: isPMValidTransition validates allowed transitions from completed state

    **Invariant:** From completed, only RESET is a valid event.
    **Verified by:** Positive check for RESET, negative checks for others.

    @acceptance-criteria @happy-path
    Scenario: Completed state allows RESET
      When I check if transition from "completed" with "RESET" is valid
      Then the transition is valid

    @acceptance-criteria @validation
    Scenario: Completed state rejects invalid events
      Then isPMValidTransition returns false for:
        | state     | event   |
        | completed | START   |
        | completed | SUCCESS |
        | completed | FAIL    |
        | completed | RETRY   |

  Rule: isPMValidTransition validates allowed transitions from failed state

    **Invariant:** From failed, RETRY and RESET are valid events.
    **Verified by:** Positive checks for RETRY/RESET, negative checks for others.

    @acceptance-criteria @happy-path
    Scenario: Failed state allows RETRY and RESET
      Then isPMValidTransition returns true for:
        | state  | event |
        | failed | RETRY |
        | failed | RESET |

    @acceptance-criteria @validation
    Scenario: Failed state rejects invalid events
      Then isPMValidTransition returns false for:
        | state  | event   |
        | failed | START   |
        | failed | SUCCESS |
        | failed | FAIL    |

  # ============================================================================
  # pmTransitionState
  # ============================================================================

  Rule: pmTransitionState returns the target state for valid transitions and null for invalid

    **Invariant:** Valid transitions produce a deterministic target state; invalid transitions return null.
    **Verified by:** Assertions on all 6 valid transitions and 4 representative invalid ones.

    @acceptance-criteria @happy-path
    Scenario: Valid transitions return correct target state
      Then pmTransitionState returns the expected state for:
        | from       | event   | to         |
        | idle       | START   | processing |
        | processing | SUCCESS | completed  |
        | processing | FAIL    | failed     |
        | completed  | RESET   | idle       |
        | failed     | RETRY   | processing |
        | failed     | RESET   | idle       |

    @acceptance-criteria @validation
    Scenario: Invalid transitions return null
      Then pmTransitionState returns null for:
        | from       | event   |
        | idle       | SUCCESS |
        | completed  | START   |
        | processing | RETRY   |
        | failed     | SUCCESS |

  # ============================================================================
  # getPMValidEventsFrom
  # ============================================================================

  Rule: getPMValidEventsFrom returns the set of valid events for each state

    **Invariant:** Each state has a fixed set of valid outgoing events.
    **Verified by:** Length and containment checks per state.

    @acceptance-criteria @happy-path
    Scenario: Idle state has exactly one valid event
      When I get valid events from "idle"
      Then the valid events contain "START"
      And the valid events count is 1

    @acceptance-criteria @happy-path
    Scenario: Processing state has exactly two valid events
      When I get valid events from "processing"
      Then the valid events contain all of:
        | event   |
        | SUCCESS |
        | FAIL    |
      And the valid events count is 2

    @acceptance-criteria @happy-path
    Scenario: Completed state has exactly one valid event
      When I get valid events from "completed"
      Then the valid events contain "RESET"
      And the valid events count is 1

    @acceptance-criteria @happy-path
    Scenario: Failed state has exactly two valid events
      When I get valid events from "failed"
      Then the valid events contain all of:
        | event |
        | RETRY |
        | RESET |
      And the valid events count is 2

  # ============================================================================
  # getAllPMTransitions
  # ============================================================================

  Rule: getAllPMTransitions returns all valid transitions in the state machine

    **Invariant:** The PM lifecycle has exactly 6 valid transitions, each with from/event/to properties.
    **Verified by:** Count, property, and content assertions.

    @acceptance-criteria @happy-path
    Scenario: Returns exactly 6 transitions with correct properties
      When I get all PM transitions
      Then there are 6 transitions
      And each transition has "from", "event", and "to" properties

    @acceptance-criteria @happy-path
    Scenario: All expected transitions are present
      When I get all PM transitions
      Then all expected transitions are present:
        | from       | event   | to         |
        | idle       | START   | processing |
        | processing | SUCCESS | completed  |
        | processing | FAIL    | failed     |
        | completed  | RESET   | idle       |
        | failed     | RETRY   | processing |
        | failed     | RESET   | idle       |

    @acceptance-criteria @happy-path
    Scenario: Returns same array reference on repeated calls
      When I get all PM transitions twice
      Then both references are identical

  # ============================================================================
  # assertPMValidTransition
  # ============================================================================

  Rule: assertPMValidTransition returns the target state or throws with PM context

    **Invariant:** Valid transitions return the target state; invalid transitions throw with PM name and instance ID.
    **Verified by:** Return value and error message assertions.

    @acceptance-criteria @happy-path
    Scenario: Valid transition returns new state
      When I assert PM transition from "idle" with "START" for "orderNotification" instance "inst-123"
      Then the result state is "processing"

    @acceptance-criteria @validation
    Scenario: Invalid transition throws with PM name and instance ID
      Then assertPMValidTransition throws for:
        | state     | event | pmName                | instanceId |
        | completed | START | orderNotification     | inst-123   |
        | processing | RETRY | reservationExpiration | inst-456   |

  # ============================================================================
  # isTerminalState
  # ============================================================================

  Rule: isTerminalState identifies completed as the only terminal state

    **Invariant:** Only the completed state is terminal; all other states have outgoing transitions.
    **Verified by:** Boolean return checks for all 4 states.

    @acceptance-criteria @happy-path
    Scenario: Completed is terminal
      Then isTerminalState returns true for "completed"

    @acceptance-criteria @validation
    Scenario: Non-terminal states return false
      Then isTerminalState returns false for:
        | state      |
        | idle       |
        | processing |
        | failed     |

  # ============================================================================
  # isErrorState
  # ============================================================================

  Rule: isErrorState identifies failed as the only error state

    **Invariant:** Only the failed state is an error state.
    **Verified by:** Boolean return checks for all 4 states.

    @acceptance-criteria @happy-path
    Scenario: Failed is an error state
      Then isErrorState returns true for "failed"

    @acceptance-criteria @validation
    Scenario: Non-error states return false
      Then isErrorState returns false for:
        | state      |
        | idle       |
        | processing |
        | completed  |

  # ============================================================================
  # State Machine Completeness
  # ============================================================================

  Rule: All non-terminal states can transition and critical paths are reachable

    **Invariant:** Every non-terminal state has at least one outgoing event, and key recovery/reset paths exist.
    **Verified by:** Event count checks and specific transition assertions.

    @acceptance-criteria @happy-path
    Scenario: All non-terminal states have at least one valid event
      Then every non-terminal state has at least one valid event

    @acceptance-criteria @happy-path
    Scenario: Critical reachability paths exist
      Then pmTransitionState returns the expected state for:
        | from      | event | to         |
        | idle      | START | processing |
        | failed    | RETRY | processing |
        | failed    | RESET | idle       |
        | completed | RESET | idle       |

  # ============================================================================
  # Typical Workflows
  # ============================================================================

  Rule: Typical PM workflows produce the expected state sequences

    **Invariant:** Multi-step workflows follow the defined FSM transitions deterministically.
    **Verified by:** Sequential transition chains with intermediate state assertions.

    @acceptance-criteria @happy-path
    Scenario: Happy path - idle to processing to completed
      Given PM state is "idle"
      When I apply events in sequence:
        | event   |
        | START   |
        | SUCCESS |
      Then the final PM state is "completed"

    @acceptance-criteria @validation
    Scenario: Failure path - idle to processing to failed
      Given PM state is "idle"
      When I apply events in sequence:
        | event |
        | START |
        | FAIL  |
      Then the final PM state is "failed"

    @acceptance-criteria @happy-path
    Scenario: Retry workflow - idle to processing to failed to processing to completed
      Given PM state is "idle"
      When I apply events in sequence:
        | event   |
        | START   |
        | FAIL    |
        | RETRY   |
        | SUCCESS |
      Then the final PM state is "completed"

    @acceptance-criteria @happy-path
    Scenario: Time-triggered PM workflow - idle to processing to completed to idle
      Given PM state is "idle"
      When I apply events in sequence:
        | event   |
        | START   |
        | SUCCESS |
        | RESET   |
      Then the final PM state is "idle"

    @acceptance-criteria @validation
    Scenario: Failed reset workflow - idle to processing to failed to idle
      Given PM state is "idle"
      When I apply events in sequence:
        | event |
        | START |
        | FAIL  |
        | RESET |
      Then the final PM state is "idle"
