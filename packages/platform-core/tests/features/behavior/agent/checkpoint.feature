Feature: Agent Checkpoint

  Pure functions for agent checkpoint management: creation, position tracking,
  idempotency guards, status helpers, and schema validation.

  Background:
    Given the module is imported from platform-core

  Rule: AGENT_CHECKPOINT_STATUSES is a readonly tuple of four statuses
    **Invariant:** The statuses tuple contains exactly ["active", "paused", "stopped", "error_recovery"]
    **Verified by:** Scenarios checking contents and length

    @acceptance-criteria @happy-path
    Scenario: Contains all four statuses
      Then AGENT_CHECKPOINT_STATUSES equals ["active", "paused", "stopped", "error_recovery"]

    Scenario: Is a readonly tuple with 4 elements
      Then AGENT_CHECKPOINT_STATUSES is an array
      And AGENT_CHECKPOINT_STATUSES has length 4

  Rule: AgentCheckpointStatusSchema accepts only valid status strings
    **Invariant:** Only the four defined status strings pass Zod validation
    **Verified by:** Scenarios for valid and invalid status values

    Scenario: Accepts all valid statuses
      Then AgentCheckpointStatusSchema accepts all of:
        | status         |
        | active         |
        | paused         |
        | stopped        |
        | error_recovery |

    Scenario: Rejects invalid statuses
      Then AgentCheckpointStatusSchema rejects all of:
        | value     |
        | running   |
        | ACTIVE    |
        | Paused    |
        |           |
        | 123       |
        | null      |
        | undefined |

  Rule: AgentCheckpointSchema validates complete checkpoint objects
    **Invariant:** A checkpoint must have non-empty agentId, non-empty subscriptionId, position >= -1, eventsProcessed >= 0, and a valid status
    **Verified by:** Scenarios for valid objects, sentinel position, and various invalid fields

    Scenario: Accepts a valid checkpoint object
      Given a test checkpoint with defaults
      Then the checkpoint passes AgentCheckpointSchema validation

    Scenario: Accepts checkpoint with sentinel position -1
      Given a test checkpoint with lastProcessedPosition -1
      Then the checkpoint passes AgentCheckpointSchema validation

    Scenario: Rejects checkpoint with position below -1
      Given a test checkpoint with lastProcessedPosition -2
      Then the checkpoint fails AgentCheckpointSchema validation

    Scenario: Rejects checkpoint with negative eventsProcessed
      Given a test checkpoint with eventsProcessed -1
      Then the checkpoint fails AgentCheckpointSchema validation

    Scenario: Rejects checkpoint with empty agentId
      Given a test checkpoint with agentId ""
      Then the checkpoint fails AgentCheckpointSchema validation

    Scenario: Rejects checkpoint with empty subscriptionId
      Given a test checkpoint with subscriptionId ""
      Then the checkpoint fails AgentCheckpointSchema validation

    Scenario: Rejects checkpoint with missing required fields
      Given an object with only agentId "test"
      Then the checkpoint fails AgentCheckpointSchema validation

  Rule: createInitialAgentCheckpoint produces a valid default checkpoint
    **Invariant:** A new checkpoint has position -1, empty lastEventId, status "active", eventsProcessed 0, and current timestamp
    **Verified by:** Scenarios checking each default field and schema validation

    Scenario: Creates checkpoint with correct agentId and subscriptionId
      When I create an initial checkpoint for agent "my-agent" with subscription "sub-001"
      Then the checkpoint has the following properties:
        | property       | value    |
        | agentId        | my-agent |
        | subscriptionId | sub-001  |

    Scenario: Initializes position and event tracking defaults
      When I create an initial checkpoint for agent "my-agent" with subscription "sub-001"
      Then the checkpoint has the following numeric properties:
        | property              | value |
        | lastProcessedPosition | -1    |
        | eventsProcessed       | 0     |
      And the checkpoint lastEventId is ""

    Scenario: Initializes status to active
      When I create an initial checkpoint for agent "my-agent" with subscription "sub-001"
      Then the checkpoint status is "active"

    Scenario: Sets updatedAt to current time
      When I create an initial checkpoint for agent "my-agent" with subscription "sub-001"
      Then the checkpoint updatedAt equals the current time

    Scenario: Creates a checkpoint that passes schema validation
      When I create an initial checkpoint for agent "my-agent" with subscription "sub-001"
      Then the checkpoint passes AgentCheckpointSchema validation

  Rule: applyCheckpointUpdate merges partial updates into an existing checkpoint
    **Invariant:** Only specified fields change; incrementEventsProcessed adds to the count; updatedAt always refreshes
    **Verified by:** Scenarios for each field, increment, preservation, multiple updates, and empty update

    Scenario: Updates lastProcessedPosition
      Given a test checkpoint with lastProcessedPosition 100
      When I apply an update with lastProcessedPosition 150
      Then the checkpoint lastProcessedPosition is 150

    Scenario: Updates lastEventId
      Given a test checkpoint with lastEventId "evt_old"
      When I apply an update with lastEventId "evt_new"
      Then the checkpoint lastEventId is "evt_new"

    Scenario: Updates status
      Given a test checkpoint with status "active"
      When I apply an update with status "paused"
      Then the checkpoint status is "paused"

    Scenario: Increments eventsProcessed by specified amount
      Given a test checkpoint with eventsProcessed 50
      When I apply an update with incrementEventsProcessed 5
      Then the checkpoint eventsProcessed is 55

    Scenario: Increments eventsProcessed by 1 for single event
      Given a test checkpoint with eventsProcessed 100
      When I apply an update with incrementEventsProcessed 1
      Then the checkpoint eventsProcessed is 101

    Scenario: Does not increment eventsProcessed when not specified
      Given a test checkpoint with eventsProcessed 50
      When I apply an update with lastProcessedPosition 101
      Then the checkpoint eventsProcessed is 50

    Scenario: Preserves unchanged fields
      Given a fully specified test checkpoint
      When I apply an update with lastProcessedPosition 101
      Then the unchanged fields are preserved

    Scenario: Updates updatedAt to current time
      Given a test checkpoint with updatedAt 10000ms ago
      When I apply an update with lastProcessedPosition 101
      Then the checkpoint updatedAt equals the current time
      And the checkpoint updatedAt differs from the old time

    Scenario: Applies multiple updates at once
      Given a test checkpoint with lastProcessedPosition 100 and lastEventId "evt_old" and status "active" and eventsProcessed 50
      When I apply an update with lastProcessedPosition 101 and lastEventId "evt_new" and status "paused" and incrementEventsProcessed 1
      Then the checkpoint has the following properties:
        | property              | value   |
        | lastProcessedPosition | 101     |
        | lastEventId           | evt_new |
        | status                | paused  |
      And the checkpoint eventsProcessed is 51

    Scenario: Handles empty update by only updating timestamp
      Given a test checkpoint with defaults
      When I apply an empty update
      Then the checkpoint fields match the original except updatedAt

  Rule: shouldProcessAgentEvent guards against duplicate and out-of-order events
    **Invariant:** Returns true only when eventPosition > checkpointPosition
    **Verified by:** Scenarios for basic comparison, sentinel handling, edge cases, and usage patterns

    Scenario: Returns true when event position is greater than checkpoint
      Then shouldProcessAgentEvent with position 101 and checkpoint 100 returns true

    Scenario: Returns false for duplicate event at same position
      Then shouldProcessAgentEvent with position 100 and checkpoint 100 returns false

    Scenario: Returns false for already-processed event
      Then shouldProcessAgentEvent with position 50 and checkpoint 100 returns false

    Scenario: Returns true for position 0 against sentinel -1 for a new agent
      Then shouldProcessAgentEvent with position 0 and checkpoint -1 returns true

    Scenario: Returns true for position 1 against sentinel -1
      Then shouldProcessAgentEvent with position 1 and checkpoint -1 returns true

    Scenario: Returns true for any positive position against sentinel -1
      Then shouldProcessAgentEvent returns true for all positions against sentinel:
        | eventPosition |
        | 100           |
        | 1000000       |

    Scenario: Returns true for position 1 against checkpoint 0
      Then shouldProcessAgentEvent with position 1 and checkpoint 0 returns true

    Scenario: Returns false for position 0 against checkpoint 0
      Then shouldProcessAgentEvent with position 0 and checkpoint 0 returns false

    Scenario: Handles large position values
      Then shouldProcessAgentEvent with position 1000001 and checkpoint 1000000 returns true
      And shouldProcessAgentEvent with position 1000000 and checkpoint 1000000 returns false

    Scenario: Processes sequential events correctly
      When processing sequential events starting from sentinel -1
      Then each event is accepted and duplicates are rejected

    Scenario: Handles gaps in event positions
      Then shouldProcessAgentEvent with position 150 and checkpoint 100 returns true
      And shouldProcessAgentEvent with position 200 and checkpoint 150 returns true

  Rule: Status helper functions reflect checkpoint status accurately
    **Invariant:** isAgentActive/isPaused/isStopped return true only for their respective status
    **Verified by:** Scenarios for each helper against each relevant status

    Scenario: isAgentActive returns true only for active status
      Then isAgentActive returns the following for each status:
        | status  | expected |
        | active  | true     |
        | paused  | false    |
        | stopped | false    |

    Scenario: isAgentPaused returns true only for paused status
      Then isAgentPaused returns the following for each status:
        | status  | expected |
        | paused  | true     |
        | active  | false    |
        | stopped | false    |

    Scenario: isAgentStopped returns true only for stopped status
      Then isAgentStopped returns the following for each status:
        | status  | expected |
        | stopped | true     |
        | active  | false    |
        | paused  | false    |

  Rule: isValidAgentCheckpoint validates arbitrary input against the schema
    **Invariant:** Returns true only for objects that fully satisfy AgentCheckpointSchema
    **Verified by:** Scenarios for valid objects, null, undefined, empty, non-objects, and invalid fields

    Scenario: Returns true for a valid checkpoint
      Given a test checkpoint with defaults
      Then isValidAgentCheckpoint returns true

    Scenario: Returns true for checkpoint with sentinel position
      Given a test checkpoint with lastProcessedPosition -1
      Then isValidAgentCheckpoint returns true

    Scenario: Returns false for null, undefined, and empty object
      Then isValidAgentCheckpoint returns false for:
        | input     |
        | null      |
        | undefined |
        | empty     |

    Scenario: Returns false for non-object values
      Then isValidAgentCheckpoint returns false for non-objects:
        | input           |
        | not an object   |
        | 123             |
        | true            |

    Scenario: Returns false for checkpoint with invalid status
      Given a test checkpoint with status "invalid"
      Then isValidAgentCheckpoint returns false

    Scenario: Returns false for checkpoint with position below -1
      Given a test checkpoint with lastProcessedPosition -2
      Then isValidAgentCheckpoint returns false

    Scenario: Returns false for checkpoint with negative eventsProcessed
      Given a test checkpoint with eventsProcessed -1
      Then isValidAgentCheckpoint returns false

  Rule: Checkpoint lifecycle supports create-process-pause-resume-recover workflows
    **Invariant:** Checkpoints correctly track state through realistic agent workflows including first events, pause/resume, restart recovery, and idempotent delivery
    **Verified by:** Scenarios simulating typical agent lifecycles

    Scenario: New agent processes first events
      When I create an initial checkpoint for agent "new-agent" with subscription "sub-001"
      Then the checkpoint lastProcessedPosition is -1
      And the checkpoint eventsProcessed is 0
      And isAgentActive returns true for the checkpoint
      When I process event at position 0 with id "evt_0"
      Then the checkpoint lastProcessedPosition is 0
      And the checkpoint eventsProcessed is 1
      When I process event at position 1 with id "evt_1"
      Then the checkpoint lastProcessedPosition is 1
      And the checkpoint eventsProcessed is 2

    Scenario: Agent pause and resume preserves position
      Given a test checkpoint with status "active" and lastProcessedPosition 100 and eventsProcessed 100
      When I apply an update with status "paused"
      Then isAgentPaused returns true for the checkpoint
      And isAgentActive returns false for the checkpoint
      And the checkpoint lastProcessedPosition is 100
      And the checkpoint eventsProcessed is 100
      When I apply an update with status "active"
      Then isAgentActive returns true for the checkpoint

    Scenario: Agent restart recovery skips already-processed events
      Given a test checkpoint with lastProcessedPosition 500 and lastEventId "evt_500" and eventsProcessed 500
      Then shouldProcessAgentEvent with position 500 and checkpoint 500 returns false
      And shouldProcessAgentEvent with position 499 and checkpoint 500 returns false
      And shouldProcessAgentEvent with position 501 and checkpoint 500 returns true

    Scenario: Duplicate event delivery is idempotent
      Given a test checkpoint with lastProcessedPosition 100 and eventsProcessed 100
      When I process event at position 101 with id "evt_101"
      Then shouldProcessAgentEvent with position 101 and checkpoint 101 returns false
      And the checkpoint eventsProcessed is 101
      Then shouldProcessAgentEvent with position 102 and checkpoint 101 returns true
