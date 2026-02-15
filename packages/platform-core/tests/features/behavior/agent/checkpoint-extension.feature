Feature: Checkpoint Extension

  Lifecycle-related checkpoint extensions including error recovery detection,
  effective config resolution with overrides, checkpoint update application
  with config merges, and initial checkpoint creation.

  Rule: isAgentInErrorRecovery returns true only for error_recovery status
    **Invariant:** isAgentInErrorRecovery(checkpoint) === true iff checkpoint.status === "error_recovery"
    **Verified by:** Scenarios checking each status value

    @acceptance-criteria @happy-path
    Scenario: Returns true for error_recovery status
      Given a checkpoint with status "error_recovery"
      When I check if the agent is in error recovery
      Then the error recovery result is true

    Scenario: Returns false for active status
      Given a checkpoint with status "active"
      When I check if the agent is in error recovery
      Then the error recovery result is false

    Scenario: Returns false for paused status
      Given a checkpoint with status "paused"
      When I check if the agent is in error recovery
      Then the error recovery result is false

    Scenario: Returns false for stopped status
      Given a checkpoint with status "stopped"
      When I check if the agent is in error recovery
      Then the error recovery result is false

  Rule: resolveEffectiveConfig returns base config when no overrides provided
    **Invariant:** Without overrides, result reflects base config values unchanged
    **Verified by:** Scenarios verifying base values, rateLimits passthrough, and absent rateLimits

    Scenario: Returns base config values when overrides are undefined
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"
      When I resolve effective config without overrides
      Then the effective confidenceThreshold is 0.8
      And the effective patternWindowDuration is "30d"

    Scenario: Passes through base rateLimits when no overrides
      Given a base config with confidenceThreshold 0.75 and patternWindowDuration "7d" and rateLimits
      When I resolve effective config without overrides
      Then the effective rateLimits have the following values:
        | property                   | value |
        | maxRequestsPerMinute       | 60    |
        | maxConcurrent              | 5     |
        | costBudget.daily           | 100   |
        | costBudget.alertThreshold  | 0.8   |

    Scenario: Omits rateLimits when base has none and no overrides
      Given a base config with confidenceThreshold 0.5 and patternWindowDuration "1d"
      When I resolve effective config without overrides
      Then the effective rateLimits are undefined

  Rule: resolveEffectiveConfig applies partial overrides while preserving other values
    **Invariant:** Only overridden fields change; non-overridden fields retain base values
    **Verified by:** Scenarios with single-field overrides and nested rateLimits overrides

    Scenario: Overrides confidenceThreshold while preserving patternWindowDuration
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"
      When I resolve effective config with confidenceThreshold override 0.95
      Then the effective confidenceThreshold is 0.95
      And the effective patternWindowDuration is "30d"

    Scenario: Overrides patternWindowDuration while preserving confidenceThreshold
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"
      When I resolve effective config with patternWindowDuration override "7d"
      Then the effective confidenceThreshold is 0.8
      And the effective patternWindowDuration is "7d"

    Scenario: Overrides rateLimits.maxRequestsPerMinute while preserving base costBudget
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits
      When I resolve effective config with rateLimits maxRequestsPerMinute override 120
      Then the effective rateLimits have the following values:
        | property                   | value |
        | maxRequestsPerMinute       | 120   |
        | costBudget.daily           | 100   |
        | costBudget.alertThreshold  | 0.8   |

  Rule: resolveEffectiveConfig deep-merges rateLimits.costBudget
    **Invariant:** costBudget fields merge individually; non-overridden sub-fields are preserved
    **Verified by:** Scenarios overriding daily alone and alertThreshold alone

    Scenario: Deep-merges costBudget.daily while preserving costBudget.alertThreshold
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits
      When I resolve effective config with costBudget daily override 200
      Then the effective rateLimits have the following values:
        | property                   | value |
        | costBudget.daily           | 200   |
        | costBudget.alertThreshold  | 0.8   |

    Scenario: Deep-merges costBudget.alertThreshold while preserving costBudget.daily
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits
      When I resolve effective config with costBudget alertThreshold override 0.95
      Then the effective rateLimits have the following values:
        | property                   | value |
        | costBudget.daily           | 100   |
        | costBudget.alertThreshold  | 0.95  |

  Rule: resolveEffectiveConfig fully overrides all config values
    **Invariant:** When all fields are overridden, every result field reflects override values
    **Verified by:** Scenario verifying complete override

    Scenario: Fully overrides all config values
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and rateLimits
      When I resolve effective config with full overrides
      Then the resolved config has the following values:
        | property                   | value |
        | confidenceThreshold        | 0.99  |
        | patternWindowDuration      | 1d    |
        | maxRequestsPerMinute       | 10    |
        | maxConcurrent              | 2     |
        | queueDepth                 | 50    |
        | costBudget.daily           | 25    |
        | costBudget.alertThreshold  | 0.5   |

  Rule: resolveEffectiveConfig handles edge cases
    **Invariant:** Overrides can add rateLimits to a base without them; empty overrides preserve base
    **Verified by:** Scenarios for adding rateLimits and empty overrides

    Scenario: Adds rateLimits via overrides when base has none
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d"
      When I resolve effective config adding rateLimits via overrides
      Then the effective rateLimits have the following values:
        | property                   | value |
        | maxRequestsPerMinute       | 30    |
        | costBudget.daily           | 50    |

    Scenario: Empty overrides object returns base config values
      Given a base config with confidenceThreshold 0.8 and patternWindowDuration "30d" and base rateLimits only maxRequestsPerMinute 60
      When I resolve effective config with empty overrides
      Then the effective confidenceThreshold is 0.8
      And the effective patternWindowDuration is "30d"
      And the effective rateLimits maxRequestsPerMinute is 60

  Rule: applyCheckpointUpdate merges configOverrides correctly
    **Invariant:** configOverrides from update merge with existing; update takes precedence; absent fields preserved
    **Verified by:** Scenarios covering add, merge, precedence, preservation, deep-merge, and absence

    Scenario: Applies configOverrides to a checkpoint without existing overrides
      Given a checkpoint without configOverrides
      When I apply an update with configOverrides confidenceThreshold 0.95
      Then the result configOverrides confidenceThreshold is 0.95

    Scenario: Merges new configOverrides with existing overrides
      Given a checkpoint with configOverrides confidenceThreshold 0.8
      When I apply an update with configOverrides patternWindowDuration "7d"
      Then the result configOverrides has the following values:
        | property                | value |
        | confidenceThreshold     | 0.8   |
        | patternWindowDuration   | 7d    |

    Scenario: Update overrides take precedence over existing
      Given a checkpoint with configOverrides confidenceThreshold 0.8
      When I apply an update with configOverrides confidenceThreshold 0.99
      Then the result configOverrides confidenceThreshold is 0.99

    Scenario: Preserves existing configOverrides when update has no overrides
      Given a checkpoint with configOverrides confidenceThreshold 0.9 and rateLimits maxRequestsPerMinute 30
      When I apply an update with status "paused" only
      Then the result configOverrides has the following values:
        | property                          | value  |
        | confidenceThreshold               | 0.9    |
        | rateLimits.maxRequestsPerMinute   | 30     |
      And the result status is "paused"

    Scenario: Deep-merges rateLimits.costBudget in checkpoint overrides
      Given a checkpoint with configOverrides rateLimits maxRequestsPerMinute 60 and costBudget daily 100 alertThreshold 0.8
      When I apply an update with configOverrides costBudget daily 200
      Then the result configOverrides has the following values:
        | property                                  | value |
        | rateLimits.costBudget.daily               | 200   |
        | rateLimits.costBudget.alertThreshold      | 0.8   |

    Scenario: Updates updatedAt timestamp
      Given a checkpoint without configOverrides
      When I apply an update with lastProcessedPosition 20
      Then the result updatedAt equals the current time

    Scenario: Increments eventsProcessed count
      Given a checkpoint with eventsProcessed 10
      When I apply an update with incrementEventsProcessed 5
      Then the result eventsProcessed is 15

    Scenario: Preserves eventsProcessed when no increment provided
      Given a checkpoint with eventsProcessed 10
      When I apply an update with status "paused" only
      Then the result eventsProcessed is 10

    Scenario: Does not add configOverrides key when neither existing nor update have them
      Given a checkpoint without configOverrides
      When I apply an update with lastProcessedPosition 20
      Then the result configOverrides are undefined

  Rule: createInitialAgentCheckpoint produces correct defaults
    **Invariant:** Initial checkpoint has position -1, active status, zero events, empty lastEventId, current time, no configOverrides
    **Verified by:** Scenarios verifying each default field

    Scenario: Creates checkpoint with sentinel lastProcessedPosition of -1
      When I create an initial checkpoint for agent "agent-001" and subscription "sub-001"
      Then the initial checkpoint lastProcessedPosition is -1

    Scenario: Creates checkpoint with active status
      When I create an initial checkpoint for agent "agent-001" and subscription "sub-001"
      Then the initial checkpoint status is "active"

    Scenario: Creates checkpoint with zero events processed
      When I create an initial checkpoint for agent "agent-001" and subscription "sub-001"
      Then the initial checkpoint eventsProcessed is 0

    Scenario: Creates checkpoint with empty lastEventId
      When I create an initial checkpoint for agent "agent-001" and subscription "sub-001"
      Then the initial checkpoint lastEventId is ""

    Scenario: Sets updatedAt to current time
      When I create an initial checkpoint for agent "agent-001" and subscription "sub-001"
      Then the initial checkpoint updatedAt equals the current time

    Scenario: Preserves agentId and subscriptionId
      When I create an initial checkpoint for agent "my-agent" and subscription "my-sub"
      Then the initial checkpoint has the following identity values:
        | property       | value  |
        | agentId        | my-agent |
        | subscriptionId | my-sub   |

    Scenario: Does not include configOverrides
      When I create an initial checkpoint for agent "agent-001" and subscription "sub-001"
      Then the initial checkpoint configOverrides are undefined
