Feature: Pattern Executor

  Pattern execution pipeline for agent bounded contexts including
  executePatterns (pattern matching, window filtering, minEvents gating),
  buildDecisionFromAnalysis (command extraction, approval logic), and
  buildDecisionFromTrigger (heuristic confidence, always requires approval).

  Background:
    Given the module is imported from platform-core

  Rule: executePatterns returns null for empty patterns
    **Invariant:** Empty patterns array yields null matchedPattern, null decision, rule-based method
    **Verified by:** Scenario confirming all three return fields

    @acceptance-criteria @happy-path
    Scenario: Returns null matchedPattern and null decision for empty patterns array
      Given an event list with 1 default event
      When executePatterns is called with no patterns
      Then the matchedPattern is null
      And the decision is null
      And the analysisMethod is "rule-based"

  Rule: executePatterns matches single pattern via trigger
    **Invariant:** A pattern whose trigger returns true is matched rule-based; a false trigger is skipped
    **Verified by:** Scenarios for trigger true (no analyze) and trigger false

    Scenario: Returns rule-based decision when trigger returns true and no analyze
      Given an event list with 1 default event
      And a pattern "churn-risk" with trigger returning true
      When executePatterns is called with those patterns
      Then the matchedPattern is "churn-risk"
      And the decision is not null
      And the analysisMethod is "rule-based"
      And the decision command is null
      And the decision requiresApproval is true

    Scenario: Skips pattern when trigger returns false
      Given an event list with 1 default event
      And a pattern "no-match" with trigger returning false
      When executePatterns is called with those patterns
      Then the matchedPattern is null
      And the decision is null

  Rule: executePatterns delegates to analyze when present
    **Invariant:** Analyze detected yields llm decision; not-detected falls through to next pattern
    **Verified by:** Scenarios for detected and not-detected analysis results

    Scenario: Returns llm decision when analyze returns detected
      Given an event list with 1 event with eventId "evt_1"
      And a pattern "churn-risk" with trigger true and analyze returning detected with confidence 0.92
      When executePatterns is called with those patterns
      Then the matchedPattern is "churn-risk"
      And the analysisMethod is "llm"
      And the decision is not null
      And the decision command is "SuggestOutreach"
      And the decision confidence is 0.92
      And the decision reason is "High churn risk detected"

    Scenario: Continues to next pattern when analyze returns not detected
      Given an event list with 1 default event
      And a pattern "first" with trigger true and analyze returning not-detected
      And a pattern "second" with trigger returning true
      When executePatterns is called with those patterns
      Then the matchedPattern is "second"
      And the analysisMethod is "rule-based"

  Rule: executePatterns propagates analyze errors
    **Invariant:** Errors from analyze propagate for Workpool retry
    **Verified by:** Scenario confirming thrown error is re-thrown

    Scenario: Propagates error when analyze throws
      Given an event list with 1 default event
      And a pattern "risky" with trigger true and analyze that throws "LLM API timeout"
      When executePatterns is called with those patterns it rejects with "LLM API timeout"

  Rule: executePatterns short-circuits on first match
    **Invariant:** After the first matching pattern, remaining patterns are never evaluated
    **Verified by:** Scenario verifying second trigger spy is not called

    Scenario: Stops after first matching pattern
      Given an event list with 1 default event
      And a pattern "first" with trigger returning true
      And a spy pattern "second" with trigger spy
      When executePatterns is called with those patterns
      Then the matchedPattern is "first"
      And the second trigger spy was not called

  Rule: executePatterns falls through non-matching patterns
    **Invariant:** Patterns with false triggers are skipped and the next pattern is evaluated
    **Verified by:** Scenario with first trigger false, second trigger true

    Scenario: Falls through to second pattern when first trigger is false
      Given an event list with 1 default event
      And a pattern "first" with trigger returning false
      And a pattern "second" with trigger returning true
      When executePatterns is called with those patterns
      Then the matchedPattern is "second"
      And the analysisMethod is "rule-based"

  Rule: executePatterns enforces minEvents
    **Invariant:** Patterns with minEvents greater than available events are skipped without calling trigger
    **Verified by:** Scenarios for insufficient and sufficient event counts

    Scenario: Skips pattern when minEvents is not met
      Given an event list with 1 default event
      And a pattern "needs-many" with minEvents 5 and a trigger spy
      When executePatterns is called with those patterns
      Then the matchedPattern is null
      And the decision is null
      And the minEvents trigger spy was not called

    Scenario: Processes pattern when minEvents is met
      Given an event list with 5 events
      And a pattern "needs-five" with minEvents 5 and trigger returning true
      When executePatterns is called with those patterns
      Then the matchedPattern is "needs-five"

  Rule: executePatterns applies window filtering
    **Invariant:** Events outside the pattern window duration are excluded before trigger evaluation
    **Verified by:** Scenarios for partial and total exclusion by window

    Scenario: Excludes events outside the pattern window
      Given an event from 1 hour ago with eventId "recent"
      And an event from 2 days ago with eventId "old"
      And a pattern "short-window" with 1-day window and a trigger spy
      When executePatterns is called with those patterns and both events
      Then the matchedPattern is "short-window"
      And the trigger spy was called once with 1 event having eventId "recent"

    Scenario: Returns no match when all events are outside the window
      Given an event from 2 days ago with eventId "old"
      And a pattern "short-window" with 1-day window and minEvents 1
      When executePatterns is called with those patterns and the old event
      Then the matchedPattern is null
      And the decision is null

  Rule: buildDecisionFromAnalysis extracts command and payload
    **Invariant:** Command type, payload, confidence, reason, and triggeringEvents are extracted from analysis result
    **Verified by:** Scenarios for command present, no command, command payload, and data fallback

    Scenario: Extracts command type from analysis result
      Given an analysis result with command "SuggestOutreach" and payload urgency "high" and confidence 0.95
      When buildDecisionFromAnalysis is called with pattern "churn-risk"
      Then the decision command is "SuggestOutreach"
      And the decision payload equals urgency "high"
      And the decision confidence is 0.95
      And the decision reason is "Pattern detected"
      And the decision triggeringEvents equals "evt_1"

    Scenario: Returns null command when no command present
      Given an analysis result with no command and confidence 0.7
      When buildDecisionFromAnalysis is called with pattern "no-command"
      Then the decision command is null

    Scenario: Uses command payload when command is present
      Given an analysis result with command "Cmd" and specific payload
      When buildDecisionFromAnalysis is called with pattern "payload-test"
      Then the decision payload equals specific "data"

    Scenario: Uses result data as payload when no command present
      Given an analysis result with no command but with data extra "info"
      When buildDecisionFromAnalysis is called with pattern "data-fallback"
      Then the decision payload equals extra "info"

  Rule: buildDecisionFromAnalysis determines requiresApproval from confidence threshold
    **Invariant:** Approval required when confidence is below threshold or no command present
    **Verified by:** Scenarios for below, above, at-threshold, and no-command cases

    Scenario: Requires approval when confidence is below threshold
      Given an analysis result with command "SomeAction" and confidence 0.5
      When buildDecisionFromAnalysis is called with confidence threshold 0.8
      Then the decision requiresApproval is true

    Scenario: Does not require approval when confidence meets threshold
      Given an analysis result with command "SafeAction" and confidence 0.9
      When buildDecisionFromAnalysis is called with confidence threshold 0.8
      Then the decision requiresApproval is false

    Scenario: Does not require approval when confidence equals threshold
      Given an analysis result with command "ExactAction" and confidence 0.8
      When buildDecisionFromAnalysis is called with confidence threshold 0.8
      Then the decision requiresApproval is false

    Scenario: Always requires approval when no command is present
      Given an analysis result with no command and confidence 0.99
      When buildDecisionFromAnalysis is called with pattern "no-cmd"
      Then the decision requiresApproval is true

  Rule: buildDecisionFromAnalysis respects humanInLoop overrides
    **Invariant:** requiresApproval list forces approval; autoApprove list skips it; requiresApproval takes precedence
    **Verified by:** Scenarios for forced approval, auto-approve, and conflict resolution

    Scenario: Forces approval when command is in requiresApproval list
      Given an analysis result with command "DangerousAction" and confidence 0.99
      When buildDecisionFromAnalysis is called with humanInLoop requiresApproval "DangerousAction"
      Then the decision requiresApproval is true

    Scenario: Skips approval when command is in autoApprove list
      Given an analysis result with command "SafeAction" and confidence 0.3
      When buildDecisionFromAnalysis is called with humanInLoop autoApprove "SafeAction"
      Then the decision requiresApproval is false

    Scenario: requiresApproval takes precedence over autoApprove for same command
      Given an analysis result with command "ConflictAction" and confidence 0.99
      When buildDecisionFromAnalysis is called with humanInLoop both lists for "ConflictAction"
      Then the decision requiresApproval is true

  Rule: buildDecisionFromTrigger returns basic trigger-only decision
    **Invariant:** Trigger-only decisions have null command, empty payload, always require approval, and include pattern name and event IDs
    **Verified by:** Scenarios for command, approval, reason content, and triggering events

    Scenario: Returns null command for trigger-only decision
      Given 1 default event for trigger decision
      And a trigger pattern named "basic"
      When buildDecisionFromTrigger is called
      Then the trigger decision command is null
      And the trigger decision payload is empty

    Scenario: Always requires approval for trigger-only decision
      Given 1 default event for trigger decision
      And a trigger pattern named "basic"
      When buildDecisionFromTrigger is called
      Then the trigger decision requiresApproval is true

    Scenario: Includes pattern name in trigger decision reason
      Given 1 default event for trigger decision
      And a trigger pattern named "churn-risk"
      When buildDecisionFromTrigger is called
      Then the trigger decision reason contains "churn-risk"

    Scenario: Includes event count in trigger decision reason
      Given 3 default events for trigger decision
      And a trigger pattern named "multi-event"
      When buildDecisionFromTrigger is called
      Then the trigger decision reason contains "3 events"

    Scenario: Includes all event IDs in triggeringEvents
      Given events with IDs "evt_a" and "evt_b" for trigger decision
      And a trigger pattern named "trigger-test"
      When buildDecisionFromTrigger is called
      Then the trigger decision triggeringEvents are "evt_a" and "evt_b"

  Rule: buildDecisionFromTrigger computes heuristic confidence
    **Invariant:** Confidence is min(0.85, 0.5 + eventCount * 0.1)
    **Verified by:** Scenarios for 0, 1, 2, 3, 4, and 10 events

    Scenario: Returns 0.6 confidence for 1 event
      Given 1 default event for trigger decision
      And a trigger pattern named "t"
      When buildDecisionFromTrigger is called
      Then the trigger decision confidence is approximately 0.6

    Scenario: Returns 0.7 confidence for 2 events
      Given 2 default events for trigger decision
      And a trigger pattern named "t"
      When buildDecisionFromTrigger is called
      Then the trigger decision confidence is approximately 0.7

    Scenario: Returns 0.8 confidence for 3 events
      Given 3 default events for trigger decision
      And a trigger pattern named "t"
      When buildDecisionFromTrigger is called
      Then the trigger decision confidence is approximately 0.8

    Scenario: Caps at 0.85 for 4 events
      Given 4 default events for trigger decision
      And a trigger pattern named "t"
      When buildDecisionFromTrigger is called
      Then the trigger decision confidence is approximately 0.85

    Scenario: Caps at 0.85 for 10 events
      Given 10 default events for trigger decision
      And a trigger pattern named "t"
      When buildDecisionFromTrigger is called
      Then the trigger decision confidence is approximately 0.85

    Scenario: Returns 0.5 for 0 events edge case
      Given 0 events for trigger decision
      And a trigger pattern named "t"
      When buildDecisionFromTrigger is called
      Then the trigger decision confidence is approximately 0.5
