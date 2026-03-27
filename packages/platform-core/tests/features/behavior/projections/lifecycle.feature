@architect
Feature: Projection Lifecycle State Machine

  As a platform developer
  I want a projection lifecycle state machine
  So that projection state transitions are validated and auditable

  # ============================================================================
  # isValidTransition
  # ============================================================================

  Rule: isValidTransition returns true for allowed transitions and false for disallowed

    **Invariant:** Each lifecycle state has a fixed set of allowed events; all others are rejected.
    **Verified by:** Exhaustive allowed/rejected checks for every state.

    @acceptance-criteria @happy-path
    Scenario: Allowed transitions from active state
      When I check valid transitions from "active"
      Then the following transitions are allowed:
        | event         |
        | START_REBUILD |
        | PAUSE         |
        | FAIL          |

    Scenario: Rejected transitions from active state
      When I check valid transitions from "active"
      Then the following transitions are rejected:
        | event           |
        | COMPLETE_REBUILD |
        | RESUME           |
        | RECOVER          |

    Scenario: Allowed transitions from rebuilding state
      When I check valid transitions from "rebuilding"
      Then the following transitions are allowed:
        | event            |
        | COMPLETE_REBUILD |
        | FAIL             |

    Scenario: Rejected transitions from rebuilding state
      When I check valid transitions from "rebuilding"
      Then the following transitions are rejected:
        | event         |
        | START_REBUILD |
        | PAUSE         |
        | RESUME        |
        | RECOVER       |

    Scenario: Allowed transitions from paused state
      When I check valid transitions from "paused"
      Then the following transitions are allowed:
        | event         |
        | RESUME        |
        | START_REBUILD |
        | FAIL          |

    Scenario: Rejected transitions from paused state
      When I check valid transitions from "paused"
      Then the following transitions are rejected:
        | event            |
        | COMPLETE_REBUILD |
        | PAUSE            |
        | RECOVER          |

    Scenario: Allowed transitions from error state
      When I check valid transitions from "error"
      Then the following transitions are allowed:
        | event         |
        | RECOVER       |
        | START_REBUILD |

    Scenario: Rejected transitions from error state
      When I check valid transitions from "error"
      Then the following transitions are rejected:
        | event            |
        | COMPLETE_REBUILD |
        | FAIL             |
        | PAUSE            |
        | RESUME           |

  # ============================================================================
  # transitionState
  # ============================================================================

  Rule: transitionState returns the target state for valid transitions and null for invalid

    **Invariant:** Valid transitions produce the correct target state; invalid transitions return null.
    **Verified by:** Exhaustive transition result checks.

    @acceptance-criteria @happy-path
    Scenario: Valid transitions produce correct target states
      Then transitionState returns correct targets for:
        | from       | event            | expected   |
        | active     | START_REBUILD    | rebuilding |
        | active     | PAUSE            | paused     |
        | active     | FAIL             | error      |
        | rebuilding | COMPLETE_REBUILD | active     |
        | rebuilding | FAIL             | error      |
        | paused     | RESUME           | active     |
        | paused     | START_REBUILD    | rebuilding |
        | paused     | FAIL             | error      |
        | error      | RECOVER          | active     |
        | error      | START_REBUILD    | rebuilding |

    Scenario: Invalid transitions return null
      Then transitionState returns null for:
        | from       | event            |
        | active     | COMPLETE_REBUILD |
        | paused     | COMPLETE_REBUILD |
        | rebuilding | PAUSE            |
        | error      | PAUSE            |

  # ============================================================================
  # getValidEventsFrom
  # ============================================================================

  Rule: getValidEventsFrom returns the set of allowed events for each state

    **Invariant:** Each state exposes exactly the events that have outgoing transitions.
    **Verified by:** Event list and count assertions per state.

    @acceptance-criteria @happy-path
    Scenario: Valid events from active state
      When I get valid events from "active"
      Then the valid events are:
        | event         |
        | START_REBUILD |
        | PAUSE         |
        | FAIL          |
      And the event count is 3

    Scenario: Valid events from rebuilding state
      When I get valid events from "rebuilding"
      Then the valid events are:
        | event            |
        | COMPLETE_REBUILD |
        | FAIL             |
      And the event count is 2

    Scenario: Valid events from paused state
      When I get valid events from "paused"
      Then the valid events are:
        | event         |
        | RESUME        |
        | START_REBUILD |
        | FAIL          |
      And the event count is 3

    Scenario: Valid events from error state
      When I get valid events from "error"
      Then the valid events are:
        | event         |
        | RECOVER       |
        | START_REBUILD |
      And the event count is 2

  # ============================================================================
  # getAllTransitions
  # ============================================================================

  Rule: getAllTransitions returns all valid transitions in the state machine

    **Invariant:** The full transition list contains exactly 10 transitions, each with from/event/to properties.
    **Verified by:** Count, property, and content assertions.

    @acceptance-criteria @happy-path
    Scenario: Returns all 10 valid transitions with correct structure
      When I get all transitions
      Then the transition count is 10
      And each transition has "from", "event", and "to" properties

    Scenario: All expected transitions are included
      When I get all transitions
      Then the transition list includes:
        | from       | event            | to         |
        | active     | START_REBUILD    | rebuilding |
        | active     | PAUSE            | paused     |
        | active     | FAIL             | error      |
        | rebuilding | COMPLETE_REBUILD | active     |
        | rebuilding | FAIL             | error      |
        | paused     | RESUME           | active     |
        | paused     | START_REBUILD    | rebuilding |
        | paused     | FAIL             | error      |
        | error      | RECOVER          | active     |
        | error      | START_REBUILD    | rebuilding |

    Scenario: Returns same array reference (memoized)
      When I get all transitions twice
      Then both references are the same object

  # ============================================================================
  # assertValidTransition
  # ============================================================================

  Rule: assertValidTransition returns new state or throws with projection name

    **Invariant:** Valid transitions return the target state; invalid transitions throw with projection context.
    **Verified by:** Return value and error message assertions.

    @acceptance-criteria @happy-path
    Scenario: Returns new state for valid transition
      When I assert valid transition from "active" with "START_REBUILD" for "orderSummary"
      Then the result state is "rebuilding"

    @acceptance-criteria @validation
    Scenario: Throws for invalid transition with projection name
      Then assertValidTransition throws for:
        | from   | event            | projection     | message                                                             |
        | paused | COMPLETE_REBUILD | orderSummary   | Invalid transition for projection "orderSummary": paused -> COMPLETE_REBUILD |
        | active | RESUME           | productCatalog | Invalid transition for projection "productCatalog": active -> RESUME        |

  # ============================================================================
  # State Machine Completeness
  # ============================================================================

  Rule: The state machine is complete — all states are reachable and can transition out

    **Invariant:** Every state is both reachable from another state and has at least one outgoing transition.
    **Verified by:** Reachability and outgoing-transition checks.

    @acceptance-criteria @happy-path
    Scenario: All states are reachable from at least one other state
      When I get all transitions
      Then every state is a target of at least one transition:
        | state      |
        | active     |
        | rebuilding |
        | paused     |
        | error      |

    Scenario: All states have at least one outgoing transition
      Then every state has at least one valid event:
        | state      |
        | active     |
        | rebuilding |
        | paused     |
        | error      |

    Scenario: Recovery path exists from error to active
      When I transition from "error" with "RECOVER"
      Then the result state is "active"

    Scenario: Error path exists from active
      When I transition from "active" with "FAIL"
      Then the result state is "error"

    Scenario: Rebuild retry path exists from error
      When I transition from "error" with "START_REBUILD"
      Then the result state is "rebuilding"

  # ============================================================================
  # Typical Workflows
  # ============================================================================

  Rule: Typical multi-step workflows complete successfully

    **Invariant:** Common operational workflows traverse the state machine correctly end-to-end.
    **Verified by:** Multi-step transition sequences with intermediate state assertions.

    @acceptance-criteria @happy-path
    Scenario: Normal processing — active state allows FAIL event
      Given the projection is in "active" state
      Then the valid events include "FAIL"

    Scenario: Rebuild workflow — active to rebuilding to active
      Given the projection is in "active" state
      When I apply event "START_REBUILD"
      Then the current state is "rebuilding"
      When I apply event "COMPLETE_REBUILD"
      Then the current state is "active"

    Scenario: Error recovery workflow — active to error to active
      Given the projection is in "active" state
      When I apply event "FAIL"
      Then the current state is "error"
      When I apply event "RECOVER"
      Then the current state is "active"

    Scenario: Error rebuild workflow — active to error to rebuilding to active
      Given the projection is in "active" state
      When I apply event "FAIL"
      Then the current state is "error"
      When I apply event "START_REBUILD"
      Then the current state is "rebuilding"
      When I apply event "COMPLETE_REBUILD"
      Then the current state is "active"

    Scenario: Pause and resume workflow — active to paused to active
      Given the projection is in "active" state
      When I apply event "PAUSE"
      Then the current state is "paused"
      When I apply event "RESUME"
      Then the current state is "active"

    Scenario: Rebuild failure workflow — active to rebuilding to error to active
      Given the projection is in "active" state
      When I apply event "START_REBUILD"
      Then the current state is "rebuilding"
      When I apply event "FAIL"
      Then the current state is "error"
      When I apply event "RECOVER"
      Then the current state is "active"

    Scenario: Paused rebuild workflow — active to paused to rebuilding to active
      Given the projection is in "active" state
      When I apply event "PAUSE"
      Then the current state is "paused"
      When I apply event "START_REBUILD"
      Then the current state is "rebuilding"
      When I apply event "COMPLETE_REBUILD"
      Then the current state is "active"

    Scenario: Paused error workflow — active to paused to error to active
      Given the projection is in "active" state
      When I apply event "PAUSE"
      Then the current state is "paused"
      When I apply event "FAIL"
      Then the current state is "error"
      When I apply event "RECOVER"
      Then the current state is "active"
