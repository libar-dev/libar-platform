Feature: Lifecycle FSM

  Pure agent lifecycle state machine with states, events, transitions,
  classification helpers, and command-to-event mapping.

  Rule: Lifecycle state constants are well-defined
    **Invariant:** AGENT_LIFECYCLE_STATES contains exactly 4 states
    **Verified by:** Scenario checking array contents and length

    @acceptance-criteria @happy-path
    Scenario: AGENT_LIFECYCLE_STATES contains all four states
      Then AGENT_LIFECYCLE_STATES equals:
        | state          |
        | stopped        |
        | active         |
        | paused         |
        | error_recovery |
      And AGENT_LIFECYCLE_STATES has length 4

  Rule: Lifecycle event constants are well-defined
    **Invariant:** AGENT_LIFECYCLE_EVENTS contains exactly 7 events
    **Verified by:** Scenario checking array contents and length

    Scenario: AGENT_LIFECYCLE_EVENTS contains all seven events
      Then AGENT_LIFECYCLE_EVENTS equals:
        | event                |
        | START                |
        | PAUSE                |
        | RESUME               |
        | STOP                 |
        | RECONFIGURE          |
        | ENTER_ERROR_RECOVERY |
        | RECOVER              |
      And AGENT_LIFECYCLE_EVENTS has length 7

  Rule: All 10 valid transitions produce the correct target state
    **Invariant:** transitionAgentState returns the documented target for each valid (from, event) pair
    **Verified by:** Scenario with DataTable of all 10 transitions

    Scenario: transitionAgentState returns correct target for every valid transition
      Then transitionAgentState returns the correct target for all valid transitions:
        | from           | event                | to             |
        | stopped        | START                | active         |
        | active         | PAUSE                | paused         |
        | active         | STOP                 | stopped        |
        | active         | ENTER_ERROR_RECOVERY | error_recovery |
        | active         | RECONFIGURE          | active         |
        | paused         | RESUME               | active         |
        | paused         | STOP                 | stopped        |
        | paused         | RECONFIGURE          | active         |
        | error_recovery | RECOVER              | active         |
        | error_recovery | STOP                 | stopped        |

  Rule: isValidAgentTransition returns true for all valid pairs
    **Invariant:** Each of the 10 valid (from, event) pairs returns true
    **Verified by:** Scenario with DataTable of all 10 valid pairs

    Scenario: isValidAgentTransition returns true for every valid pair
      Then isValidAgentTransition returns true for all valid pairs:
        | from           | event                |
        | stopped        | START                |
        | active         | PAUSE                |
        | active         | STOP                 |
        | active         | ENTER_ERROR_RECOVERY |
        | active         | RECONFIGURE          |
        | paused         | RESUME               |
        | paused         | STOP                 |
        | paused         | RECONFIGURE          |
        | error_recovery | RECOVER              |
        | error_recovery | STOP                 |

  Rule: transitionAgentState returns null for invalid transitions
    **Invariant:** Invalid (from, event) pairs return null
    **Verified by:** Scenario with DataTable of representative invalid pairs

    Scenario: transitionAgentState returns null for representative invalid pairs
      Then transitionAgentState returns null for these invalid pairs:
        | from           | event       | reason                               |
        | stopped        | PAUSE       | cannot pause what is not running     |
        | stopped        | RESUME      | cannot resume what is not running    |
        | paused         | PAUSE       | cannot double-pause                  |
        | error_recovery | PAUSE       | cannot pause during recovery         |
        | active         | START       | cannot start already running         |
        | active         | RECOVER     | RECOVER only from error_recovery     |
        | stopped        | STOP        | cannot stop already stopped          |
        | stopped        | RECONFIGURE | cannot reconfigure stopped agent     |
        | error_recovery | RESUME      | must RECOVER not RESUME              |
        | paused         | START       | already initialized use RESUME       |

  Rule: Exhaustive invalid pair coverage via isValidAgentTransition
    **Invariant:** There are exactly 18 invalid (state, event) pairs and all return false
    **Verified by:** Scenario computing all pairs minus valid ones

    Scenario: Exactly 18 invalid pairs exist and all return false
      Then there are exactly 18 invalid state-event pairs
      And isValidAgentTransition returns false for every invalid pair

  Rule: Exhaustive invalid pair coverage via transitionAgentState
    **Invariant:** There are exactly 18 invalid (state, event) pairs and all return null
    **Verified by:** Scenario computing all pairs minus valid ones

    Scenario: Exactly 18 invalid pairs return null from transitionAgentState
      Then there are exactly 18 invalid state-event pairs for transitionAgentState
      And transitionAgentState returns null for every invalid pair

  Rule: assertValidAgentTransition returns next state or throws
    **Invariant:** Valid transitions return the target state; invalid ones throw with details
    **Verified by:** Scenarios for valid returns and error message contents

    Scenario: assertValidAgentTransition returns next state for valid transitions
      Then assertValidAgentTransition returns the correct state for valid inputs:
        | from    | event       | agentId    | expected |
        | stopped | START       | test-agent | active   |
        | paused  | RESUME      | test-agent | active   |
        | active  | RECONFIGURE | test-agent | active   |

    Scenario: assertValidAgentTransition throws for invalid transition
      Then assertValidAgentTransition throws for from "stopped" event "PAUSE" agentId "test-agent"

    Scenario: assertValidAgentTransition error message includes details
      Then assertValidAgentTransition error for from "stopped" event "PAUSE" agentId "my-agent" contains:
        | pattern                          |
        | Invalid agent lifecycle transition |
        | agent="my-agent"                 |
        | from="stopped"                   |
        | event="PAUSE"                    |
        | START                            |

  Rule: getValidAgentEventsFrom returns correct events per state
    **Invariant:** Each state maps to its documented set of valid events
    **Verified by:** Scenario with DataTable of state-to-events mappings

    Scenario: getValidAgentEventsFrom returns correct events for stopped
      Given the state is "stopped"
      Then getValidAgentEventsFrom returns:
        | event |
        | START |

    Scenario: getValidAgentEventsFrom returns correct events for active
      Given the state is "active"
      Then getValidAgentEventsFrom returns:
        | event                |
        | PAUSE                |
        | STOP                 |
        | ENTER_ERROR_RECOVERY |
        | RECONFIGURE          |

    Scenario: getValidAgentEventsFrom returns correct events for paused
      Given the state is "paused"
      Then getValidAgentEventsFrom returns:
        | event       |
        | RESUME      |
        | STOP        |
        | RECONFIGURE |

    Scenario: getValidAgentEventsFrom returns correct events for error_recovery
      Given the state is "error_recovery"
      Then getValidAgentEventsFrom returns:
        | event   |
        | RECOVER |
        | STOP    |

  Rule: getAllAgentTransitions returns the complete transition table
    **Invariant:** Returns a frozen array of exactly 10 transitions with from/event/to
    **Verified by:** Scenarios checking count, structure, specific entries, and reference identity

    Scenario: getAllAgentTransitions returns exactly 10 transitions
      Then getAllAgentTransitions returns exactly 10 transitions

    Scenario: Each transition has from event and to fields
      Then every transition from getAllAgentTransitions has from event and to fields

    Scenario: getAllAgentTransitions contains specific transitions
      Then getAllAgentTransitions contains these transitions:
        | from           | event | to      |
        | stopped        | START | active  |
        | error_recovery | STOP  | stopped |

    Scenario: getAllAgentTransitions returns same reference each call
      Then getAllAgentTransitions returns the same reference on repeated calls

  Rule: isAgentErrorState classifies states correctly
    **Invariant:** Only error_recovery is an error state
    **Verified by:** Scenario with DataTable of all states

    Scenario: isAgentErrorState returns correct classification for all states
      Then isAgentErrorState returns the correct value for each state:
        | state          | expected |
        | error_recovery | true     |
        | active         | false    |
        | stopped        | false    |
        | paused         | false    |

  Rule: isAgentProcessingState classifies states correctly
    **Invariant:** Only active is a processing state
    **Verified by:** Scenario with DataTable of all states

    Scenario: isAgentProcessingState returns correct classification for all states
      Then isAgentProcessingState returns the correct value for each state:
        | state          | expected |
        | active         | true     |
        | stopped        | false    |
        | paused         | false    |
        | error_recovery | false    |

  Rule: commandToEvent maps command types to lifecycle events
    **Invariant:** Known command types map to their events; unknown types return null
    **Verified by:** Scenario with DataTable of all mappings plus null cases

    Scenario: commandToEvent maps known commands and returns null for unknown
      Then commandToEvent returns the correct mapping:
        | command          | expected    |
        | StartAgent       | START       |
        | PauseAgent       | PAUSE       |
        | ResumeAgent      | RESUME      |
        | StopAgent        | STOP        |
        | ReconfigureAgent | RECONFIGURE |
        | UnknownCommand   | null        |
        |                  | null        |
        | startagent       | null        |
