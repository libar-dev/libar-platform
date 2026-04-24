Feature: Agent Audit Trail

  Pure functions for agent audit trail functionality: decision ID generation,
  audit event factory functions, type guards, and Zod schema validation.

  Background:
    Given the module is imported from platform-core

  Rule: AGENT_AUDIT_EVENT_TYPES contains all canonical event types
    **Invariant:** The constant array contains all DS-1, DS-4, DS-5, and DS-6 event types
    **Verified by:** Scenarios checking base types, command routing, lifecycle, failure, and total count

    @acceptance-criteria @happy-path
    Scenario: Contains all DS-1 base event types
      Then AGENT_AUDIT_EVENT_TYPES contains the following entries:
        | value               |
        | PatternDetected     |
        | CommandEmitted      |
        | ApprovalRequested   |
        | ApprovalGranted     |
        | ApprovalRejected    |
        | ApprovalExpired     |
        | DeadLetterRecorded  |
        | CheckpointUpdated   |

    Scenario: Contains all DS-4 command routing event types
      Then AGENT_AUDIT_EVENT_TYPES contains the following entries:
        | value                        |
        | AgentCommandRouted           |
        | AgentCommandRoutingFailed    |

    Scenario: Contains all DS-5 lifecycle event types
      Then AGENT_AUDIT_EVENT_TYPES contains the following entries:
        | value                        |
        | AgentStarted                 |
        | AgentPaused                  |
        | AgentResumed                 |
        | AgentStopped                 |
        | AgentReconfigured            |
        | AgentErrorRecoveryStarted    |

    Scenario: Contains DS-6 failure tracking event type
      Then AGENT_AUDIT_EVENT_TYPES contains the following entries:
        | value                |
        | AgentAnalysisFailed  |

    Scenario: Has exactly 17 event types
      Then AGENT_AUDIT_EVENT_TYPES has length 17

  Rule: isAgentAuditEventType validates event type strings
    **Invariant:** Returns true for all canonical event type strings, false for anything else
    **Verified by:** Scenarios covering valid types, legacy names, invalid strings, wrong case, and non-string values

    Scenario: Returns true for all valid event type strings
      Then isAgentAuditEventType returns true for:
        | value                        |
        | PatternDetected              |
        | CommandEmitted               |
        | ApprovalRequested            |
        | ApprovalGranted              |
        | ApprovalRejected             |
        | ApprovalExpired              |
        | DeadLetterRecorded           |
        | CheckpointUpdated            |
        | AgentCommandRouted           |
        | AgentCommandRoutingFailed    |
        | AgentStarted                 |
        | AgentPaused                  |
        | AgentResumed                 |
        | AgentStopped                 |
        | AgentReconfigured            |
        | AgentErrorRecoveryStarted    |

    Scenario: Returns false for invalid values
      Then isAgentAuditEventType returns false for:
        | value              |
        | AgentDecisionMade  |
        | InvalidType        |
        | patternDetected    |
        |                    |

    Scenario: Returns false for non-string values
      Then isAgentAuditEventType returns false for non-string values

  Rule: AgentAuditEventTypeSchema validates via Zod
    **Invariant:** Accepts all canonical event types, rejects everything else
    **Verified by:** Scenarios covering valid and invalid parse inputs

    Scenario: Accepts all valid event types
      Then AgentAuditEventTypeSchema accepts all AGENT_AUDIT_EVENT_TYPES entries

    Scenario: Rejects invalid event types
      Then AgentAuditEventTypeSchema rejects the following values:
        | value             |
        | Invalid           |
        | agentDecisionMade |
        |                   |

    Scenario: Rejects non-string values via Zod
      Then AgentAuditEventTypeSchema rejects numeric 123 and null

  Rule: AuditLLMContextSchema validates LLM context objects
    **Invariant:** Accepts valid model/tokens/duration, rejects negative or non-integer values
    **Verified by:** Scenarios covering valid context, negative tokens, negative duration, non-integer tokens, and zero values

    Scenario: Accepts valid LLM context
      Given an LLM context with model "gpt-4" and tokens 1500 and duration 2500
      Then the LLM context passes AuditLLMContextSchema validation

    Scenario: Rejects negative tokens
      Given an LLM context with model "gpt-4" and tokens -100 and duration 2500
      Then the LLM context fails AuditLLMContextSchema validation

    Scenario: Rejects negative duration
      Given an LLM context with model "gpt-4" and tokens 1500 and duration -100
      Then the LLM context fails AuditLLMContextSchema validation

    Scenario: Rejects non-integer tokens
      Given an LLM context with model "gpt-4" and tokens 1500.5 and duration 2500
      Then the LLM context fails AuditLLMContextSchema validation

    Scenario: Accepts zero values
      Given an LLM context with model "test" and tokens 0 and duration 0
      Then the LLM context passes AuditLLMContextSchema validation

  Rule: AuditActionSchema validates action objects
    **Invariant:** Accepts valid type + executionMode, rejects empty type, invalid mode, or extra fields
    **Verified by:** Scenarios covering flag-for-review, auto-execute, empty type, invalid mode, and extra fields

    Scenario: Accepts valid action with flag-for-review
      Given an audit action with type "SuggestOutreach" and executionMode "flag-for-review"
      Then the audit action passes AuditActionSchema validation

    Scenario: Accepts valid action with auto-execute
      Given an audit action with type "LogEvent" and executionMode "auto-execute"
      Then the audit action passes AuditActionSchema validation

    Scenario: Rejects action with empty type
      Given an audit action with type "" and executionMode "flag-for-review"
      Then the audit action fails AuditActionSchema validation

    Scenario: Rejects action with invalid executionMode
      Given an audit action with type "SuggestOutreach" and executionMode "invalid"
      Then the audit action fails AuditActionSchema validation

    Scenario: Rejects action with extra fields in strict mode
      Given an audit action with type "Test" and executionMode "auto-execute" and extra field
      Then the audit action fails AuditActionSchema validation

  Rule: PatternDetectedPayloadSchema validates pattern payloads
    **Invariant:** Accepts valid payloads with optional nulls for pattern/action, rejects out-of-range confidence
    **Verified by:** Scenarios covering valid payload, null fields, LLM context, and confidence boundaries

    Scenario: Accepts valid payload with action
      Given a valid pattern detected payload
      Then the payload passes PatternDetectedPayloadSchema validation

    Scenario: Accepts payload with null patternDetected
      Given a pattern detected payload with null patternDetected
      Then the payload passes PatternDetectedPayloadSchema validation

    Scenario: Accepts payload with null action
      Given a pattern detected payload with null action
      Then the payload passes PatternDetectedPayloadSchema validation

    Scenario: Accepts payload with LLM context
      Given a pattern detected payload with LLM context
      Then the payload passes PatternDetectedPayloadSchema validation

    Scenario: Rejects payload with confidence below 0
      Given a pattern detected payload with confidence -0.1
      Then the payload fails PatternDetectedPayloadSchema validation

    Scenario: Rejects payload with confidence above 1
      Given a pattern detected payload with confidence 1.5
      Then the payload fails PatternDetectedPayloadSchema validation

  Rule: ApprovalGrantedPayloadSchema validates approval payloads
    **Invariant:** Accepts valid actionId/reviewerId/reviewedAt with optional reviewNote, rejects empty actionId
    **Verified by:** Scenarios covering valid payload, with reviewNote, and empty actionId

    Scenario: Accepts valid approval granted payload
      Given a valid approval granted payload
      Then the approval granted payload passes validation

    Scenario: Accepts payload with reviewNote
      Given an approval granted payload with reviewNote "Looks good!"
      Then the approval granted payload passes validation

    Scenario: Rejects payload with empty actionId
      Given an approval granted payload with empty actionId
      Then the approval granted payload fails validation

  Rule: ApprovalRejectedPayloadSchema validates rejection payloads
    **Invariant:** Accepts valid actionId/reviewerId/rejectionReason
    **Verified by:** Scenarios covering valid payload and empty rejectionReason behavior

    Scenario: Accepts valid approval rejected payload
      Given a valid approval rejected payload
      Then the approval rejected payload passes validation

    Scenario: Allows empty rejectionReason string
      Given an approval rejected payload with empty rejectionReason
      Then the approval rejected payload passes validation

  Rule: ApprovalExpiredPayloadSchema validates expiration payloads
    **Invariant:** Accepts valid actionId/requestedAt/expiredAt, rejects empty actionId
    **Verified by:** Scenarios covering valid payload and empty actionId

    Scenario: Accepts valid approval expired payload
      Given a valid approval expired payload
      Then the approval expired payload passes validation

    Scenario: Rejects payload with empty actionId
      Given an approval expired payload with empty actionId
      Then the approval expired payload fails validation

  Rule: AgentAuditEventSchema validates full audit event objects
    **Invariant:** Accepts valid event with all required fields, rejects empty agentId or decisionId
    **Verified by:** Scenarios covering valid event, empty agentId, and empty decisionId

    Scenario: Accepts valid audit event
      Given a valid full audit event
      Then the full audit event passes AgentAuditEventSchema validation

    Scenario: Rejects event with empty agentId
      Given a full audit event with empty agentId
      Then the full audit event fails AgentAuditEventSchema validation

    Scenario: Rejects event with empty decisionId
      Given a full audit event with empty decisionId
      Then the full audit event fails AgentAuditEventSchema validation

  Rule: generateDecisionId produces well-formed unique IDs
    **Invariant:** IDs have dec_ prefix, include a full UUIDv7 payload, and are unique across calls
    **Verified by:** Scenarios covering prefix, format, uniqueness, and UUIDv7 shape

    Scenario: Generates IDs with dec_ prefix
      When I generate a decision ID
      Then the decision ID starts with "dec_"

    Scenario: Generates IDs with expected format
      When I generate a decision ID
      Then the decision ID has two underscore-separated parts
      And the first part is "dec"
      And the second part is a UUIDv7 string

    Scenario: Generates unique IDs over multiple calls
      When I generate 3 decision IDs with small delays
      Then all 3 IDs are unique

    Scenario: Uses a UUIDv7 payload in the ID
      When I generate a decision ID at fixed time "2024-01-15T12:00:00Z"
      Then the UUID payload matches UUIDv7 format

  Rule: createPatternDetectedAudit factory produces correct events
    **Invariant:** Factory returns event with PatternDetected type, generated decisionId, and all payload fields
    **Verified by:** Scenarios covering event type, required fields, LLM context inclusion/exclusion, and null fields

    Scenario: Creates event with PatternDetected type
      When I create a pattern detected audit for agent "test-agent"
      Then the event type is "PatternDetected"

    Scenario: Includes all required fields
      When I create a pattern detected audit for agent "test-agent" with full payload
      Then the event has the following properties:
        | property | value      |
        | agentId  | test-agent |
      And the decisionId matches the dec_ format
      And the timestamp equals current time
      And the payload has patternDetected "churn-risk"
      And the payload has confidence 0.85
      And the payload has reasoning "Customer at risk"
      And the payload has the expected action
      And the payload has triggering events "evt-1" and "evt-2"

    Scenario: Includes LLM context when provided
      When I create a pattern detected audit with LLM context
      Then the payload LLM context is defined
      And the LLM context has model "gpt-4"
      And the LLM context has tokens 1500
      And the LLM context has duration 2500

    Scenario: Does not include LLM context when not provided
      When I create a pattern detected audit without LLM context
      Then the payload LLM context is undefined

    Scenario: Handles null patternDetected
      When I create a pattern detected audit with null patternDetected
      Then the payload patternDetected is null

    Scenario: Handles null action
      When I create a pattern detected audit with null action
      Then the payload action is null

  Rule: createApprovalGrantedAudit factory produces correct events
    **Invariant:** Factory returns event with ApprovalGranted type, actionId, reviewerId, reviewedAt, optional reviewNote
    **Verified by:** Scenarios covering event type, required fields, and reviewNote inclusion/exclusion

    Scenario: Creates event with ApprovalGranted type
      When I create an approval granted audit for agent "agent" action "action-123" reviewer "user-456"
      Then the event type is "ApprovalGranted"

    Scenario: Includes all required fields for approval granted
      When I create an approval granted audit for agent "test-agent" action "action-123" reviewer "user-456"
      Then the event has the following properties:
        | property | value      |
        | agentId  | test-agent |
      And the decisionId matches the dec_ format
      And the timestamp equals current time
      And the payload actionId is "action-123"
      And the payload reviewerId is "user-456"
      And the payload reviewedAt equals current time

    Scenario: Includes reviewNote when provided
      When I create an approval granted audit with reviewNote "Verified customer is at risk"
      Then the payload reviewNote is "Verified customer is at risk"

    Scenario: Does not include reviewNote when not provided
      When I create an approval granted audit without reviewNote
      Then the payload reviewNote is undefined

  Rule: createApprovalRejectedAudit factory produces correct events
    **Invariant:** Factory returns event with ApprovalRejected type, actionId, reviewerId, rejectionReason
    **Verified by:** Scenarios covering event type and required fields

    Scenario: Creates event with ApprovalRejected type
      When I create an approval rejected audit for agent "agent"
      Then the event type is "ApprovalRejected"

    Scenario: Includes all required fields for approval rejected
      When I create an approval rejected audit for agent "test-agent" with reason "Not appropriate"
      Then the event has the following properties:
        | property | value      |
        | agentId  | test-agent |
      And the decisionId matches the dec_ format
      And the timestamp equals current time
      And the payload actionId is "action-123"
      And the payload reviewerId is "user-456"
      And the payload rejectionReason is "Not appropriate"

  Rule: createApprovalExpiredAudit factory produces correct events
    **Invariant:** Factory returns event with ApprovalExpired type, actionId, requestedAt, expiredAt
    **Verified by:** Scenarios covering event type and required fields

    Scenario: Creates event with ApprovalExpired type
      When I create an approval expired audit for agent "agent"
      Then the event type is "ApprovalExpired"

    Scenario: Includes all required fields for approval expired
      When I create an approval expired audit for agent "test-agent"
      Then the event has the following properties:
        | property | value      |
        | agentId  | test-agent |
      And the decisionId matches the dec_ format
      And the timestamp equals current time
      And the payload actionId is "action-123"
      And the payload requestedAt is the stored requested time
      And the payload expiredAt equals current time

  Rule: createGenericAuditEvent factory produces correct events
    **Invariant:** Factory returns event with specified type, generated decisionId, and given or empty payload
    **Verified by:** Scenarios covering custom type, required fields, empty payload default, and DS-4/DS-5 types

    Scenario: Creates event with specified type
      When I create a generic audit event with type "CommandEmitted"
      Then the event type is "CommandEmitted"

    Scenario: Includes all required fields for generic event
      When I create a generic audit event for agent "test-agent" with type "AgentStarted"
      Then the event has the following properties:
        | property | value      |
        | agentId  | test-agent |
      And the decisionId matches the dec_ format
      And the timestamp equals current time

    Scenario: Defaults payload to empty object when not provided
      When I create a generic audit event with type "CheckpointUpdated" and no payload
      Then the payload equals empty object

    Scenario: Works with DS-4 command routing types
      When I create a generic audit event with type "AgentCommandRouted"
      Then the event type is "AgentCommandRouted"

    Scenario: Works with DS-5 lifecycle types
      When I create a generic audit event with type "AgentErrorRecoveryStarted"
      Then the event type is "AgentErrorRecoveryStarted"

  Rule: isPatternDetectedEvent type guard identifies PatternDetected events
    **Invariant:** Returns true only for events with eventType PatternDetected
    **Verified by:** Scenarios covering PatternDetected, ApprovalGranted, and ApprovalRejected events

    Scenario: Returns true for PatternDetected event
      When I create a pattern detected event for type guard test
      Then isPatternDetectedEvent returns true

    Scenario: Returns false for ApprovalGranted event via isPatternDetected
      When I create an approval granted event for type guard test
      Then isPatternDetectedEvent returns false

    Scenario: Returns false for ApprovalRejected event via isPatternDetected
      When I create an approval rejected event for type guard test
      Then isPatternDetectedEvent returns false

  Rule: isApprovalGrantedEvent type guard identifies ApprovalGranted events
    **Invariant:** Returns true only for events with eventType ApprovalGranted
    **Verified by:** Scenarios covering ApprovalGranted, PatternDetected, and ApprovalRejected events

    Scenario: Returns true for ApprovalGranted event
      When I create an approval granted event for type guard test
      Then isApprovalGrantedEvent returns true

    Scenario: Returns false for PatternDetected event via isApprovalGranted
      When I create a pattern detected event for type guard test
      Then isApprovalGrantedEvent returns false

    Scenario: Returns false for ApprovalRejected event via isApprovalGranted
      When I create an approval rejected event for type guard test
      Then isApprovalGrantedEvent returns false

  Rule: isApprovalRejectedEvent type guard identifies ApprovalRejected events
    **Invariant:** Returns true only for events with eventType ApprovalRejected
    **Verified by:** Scenarios covering ApprovalRejected, ApprovalGranted, and PatternDetected events

    Scenario: Returns true for ApprovalRejected event
      When I create an approval rejected event for type guard test
      Then isApprovalRejectedEvent returns true

    Scenario: Returns false for ApprovalGranted event via isApprovalRejected
      When I create an approval granted event for type guard test
      Then isApprovalRejectedEvent returns false

    Scenario: Returns false for PatternDetected event via isApprovalRejected
      When I create a pattern detected event for type guard test
      Then isApprovalRejectedEvent returns false

  Rule: validateAgentAuditEvent validates full event objects
    **Invariant:** Returns true for factory-created events, false for null/undefined/empty/invalid objects
    **Verified by:** Scenarios covering all factory types and various invalid inputs

    Scenario: Returns true for valid pattern detected audit event
      When I create a pattern detected event for validation
      Then validateAgentAuditEvent returns true

    Scenario: Returns true for valid approval granted audit event
      When I create an approval granted event for validation
      Then validateAgentAuditEvent returns true

    Scenario: Returns true for valid approval rejected audit event
      When I create an approval rejected event for validation
      Then validateAgentAuditEvent returns true

    Scenario: Returns true for valid approval expired audit event
      When I create an approval expired event for validation
      Then validateAgentAuditEvent returns true

    Scenario: Returns false for null
      Then validateAgentAuditEvent returns false for null

    Scenario: Returns false for undefined
      Then validateAgentAuditEvent returns false for undefined

    Scenario: Returns false for empty object
      Then validateAgentAuditEvent returns false for empty object

    Scenario: Returns false for invalid event type
      Then validateAgentAuditEvent returns false for invalid event type

    Scenario: Returns false for missing required fields
      Then validateAgentAuditEvent returns false for missing required fields

  Rule: Audit trail flows create consistent event sequences
    **Invariant:** Factory-created events form valid audit trails with proper timestamps and type guards
    **Verified by:** Scenarios covering approved, rejected, and expired action flows

    Scenario: Creates complete audit trail for approved action
      When I create a detection then approval flow for agent "churn-risk-agent"
      Then the detection passes isPatternDetectedEvent
      And the detection passes validateAgentAuditEvent
      And the approval passes isApprovalGrantedEvent
      And the approval passes validateAgentAuditEvent
      And the approval timestamp is greater than the detection timestamp

    Scenario: Creates complete audit trail for rejected action
      When I create a detection then rejection flow for agent "inventory-agent"
      Then the rejection passes isApprovalRejectedEvent
      And the rejection passes validateAgentAuditEvent
      And the rejection reason is "Order already placed by manager"

    Scenario: Creates audit trail for expired action
      When I create a detection then expiration flow for agent "notification-agent"
      Then the expiration event type is "ApprovalExpired"
      And the expiration requestedAt is less than expiredAt
      And the expiration passes validateAgentAuditEvent
