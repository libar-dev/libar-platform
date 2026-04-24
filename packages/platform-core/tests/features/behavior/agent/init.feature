Feature: Agent Initialization

  Pure functions for agent initialization and configuration:
  validateAgentBCConfig (field validation, error codes),
  toAgentHandlerArgs (event + correlation chain transformation),
  generateSubscriptionId (deterministic ID generation),
  initializeAgentBC (bootstrap, checkpoint creation, error handling).

  Rule: validateAgentBCConfig rejects invalid agent ID
    **Invariant:** Config with empty, undefined, or whitespace-only id returns AGENT_ID_REQUIRED
    **Verified by:** Scenarios covering empty string, undefined, and whitespace-only id

    @acceptance-criteria @happy-path
    Scenario: Rejects empty string id
      Given a valid agent config with id overridden to ""
      When I validate the agent config
      Then the validation result is invalid with code "AGENT_ID_REQUIRED"

    Scenario: Rejects undefined id
      Given a valid agent config with id deleted
      When I validate the agent config
      Then the validation result is invalid with code "AGENT_ID_REQUIRED"

    Scenario: Rejects whitespace-only id
      Given a valid agent config with id overridden to "   "
      When I validate the agent config
      Then the validation result is invalid with code "AGENT_ID_REQUIRED"

  Rule: validateAgentBCConfig rejects missing subscriptions
    **Invariant:** Config with empty or undefined subscriptions returns NO_SUBSCRIPTIONS
    **Verified by:** Scenarios covering empty array and undefined subscriptions

    Scenario: Rejects empty subscriptions array
      Given a valid agent config with subscriptions overridden to empty array
      When I validate the agent config
      Then the validation result is invalid with code "NO_SUBSCRIPTIONS"

    Scenario: Rejects undefined subscriptions
      Given a valid agent config with subscriptions deleted
      When I validate the agent config
      Then the validation result is invalid with code "NO_SUBSCRIPTIONS"

  Rule: validateAgentBCConfig rejects invalid confidence threshold
    **Invariant:** Config with threshold outside [0,1] returns INVALID_CONFIDENCE_THRESHOLD
    **Verified by:** Scenarios covering negative and greater-than-1 thresholds

    Scenario: Rejects negative threshold
      Given a valid agent config with confidenceThreshold overridden to -0.1
      When I validate the agent config
      Then the validation result is invalid with code "INVALID_CONFIDENCE_THRESHOLD"

    Scenario: Rejects threshold greater than 1
      Given a valid agent config with confidenceThreshold overridden to 1.5
      When I validate the agent config
      Then the validation result is invalid with code "INVALID_CONFIDENCE_THRESHOLD"

  Rule: validateAgentBCConfig rejects invalid pattern window
    **Invariant:** Config with empty or whitespace-only pattern window duration returns INVALID_PATTERN_WINDOW
    **Verified by:** Scenarios covering empty and whitespace-only duration

    Scenario: Rejects empty pattern window duration
      Given a valid agent config with patternWindow duration overridden to ""
      When I validate the agent config
      Then the validation result is invalid with code "INVALID_PATTERN_WINDOW"

    Scenario: Rejects whitespace-only pattern window duration
      Given a valid agent config with patternWindow duration overridden to "   "
      When I validate the agent config
      Then the validation result is invalid with code "INVALID_PATTERN_WINDOW"

  Rule: validateAgentBCConfig rejects conflicting approval rules
    **Invariant:** Config with an action in both requiresApproval and autoApprove returns CONFLICTING_APPROVAL_RULES
    **Verified by:** Scenario covering overlapping approval lists

    Scenario: Rejects action in both requiresApproval and autoApprove
      Given a valid agent config with conflicting approval rules for "DeleteCustomer"
      When I validate the agent config
      Then the validation result is invalid with code "CONFLICTING_APPROVAL_RULES"
      And the validation error message contains "DeleteCustomer"

  Rule: validateAgentBCConfig rejects missing patterns
    **Invariant:** Config with no patterns or empty patterns array returns NO_PATTERNS
    **Verified by:** Scenarios covering undefined and empty patterns

    Scenario: Rejects config with no patterns array
      Given a valid agent config with patterns deleted
      When I validate the agent config
      Then the validation result is invalid with code "NO_PATTERNS"

    Scenario: Rejects config with empty patterns array
      Given a valid agent config with patterns overridden to empty array
      When I validate the agent config
      Then the validation result is invalid with code "NO_PATTERNS"

  Rule: validateAgentBCConfig accepts valid configurations
    **Invariant:** Well-formed config with all required fields returns valid
    **Verified by:** Scenarios covering full config and optional field omission

    Scenario: Accepts valid config with patterns
      Given a valid agent config with default values
      When I validate the agent config
      Then the validation result is valid

    Scenario: Accepts config without confidenceThreshold
      Given a valid agent config with confidenceThreshold deleted
      When I validate the agent config
      Then the validation result is valid

  Rule: toAgentHandlerArgs transforms event and correlation chain
    **Invariant:** Transforms PublishedEvent + CorrelationChain into AgentEventHandlerArgs, using chain correlationId
    **Verified by:** Scenarios covering standard transform, payload wrapping, and correlation precedence

    Scenario: Transforms a standard event correctly
      Given a standard published event and correlation chain
      When I transform to agent handler args with agentId "my-agent"
      Then the handler args contain the expected fields:
        | field            | value             |
        | eventId          | evt_001           |
        | eventType        | OrderCancelled    |
        | globalPosition   | 100               |
        | correlationId    | corr_chain_001    |
        | streamType       | Order             |
        | streamId         | order-001         |
        | timestamp        | 1705320000000     |
        | category         | domain            |
        | boundedContext    | orders            |
        | agentId          | my-agent          |
      And the handler args payload matches the event payload

    Scenario: Wraps array payload in _raw wrapper
      Given a published event with array payload
      When I transform to agent handler args with agentId "agent-1"
      Then the handler args payload equals raw-wrapped array

    Scenario: Wraps null payload in _raw wrapper
      Given a published event with null payload
      When I transform to agent handler args with agentId "agent-1"
      Then the handler args payload equals raw-wrapped null

    Scenario: Passes through object payloads without wrapping
      Given a published event with nested object payload
      When I transform to agent handler args with agentId "agent-1"
      Then the handler args payload matches the event payload

    Scenario: Uses correlationId from the chain not from the event
      Given a published event with its own correlationId "event_corr"
      When I transform to agent handler args with agentId "agent-1"
      Then the handler args correlationId is "corr_chain_001"

  Rule: generateSubscriptionId produces deterministic agent-scoped IDs
    **Invariant:** IDs start with sub_ prefix, contain agentId, contain a UUIDv7 suffix, and differ when regenerated
    **Verified by:** Scenarios covering prefix, agentId inclusion, UUIDv7 suffix, and uniqueness

    Scenario: Subscription ID starts with sub_ prefix
      Given the system time is fixed at "2024-01-15T12:00:00Z"
      When I generate a subscription ID for "my-agent"
      Then the subscription ID starts with "sub_"

    Scenario: Subscription ID contains the agentId
      Given the system time is fixed at "2024-01-15T12:00:00Z"
      When I generate a subscription ID for "churn-risk-agent"
      Then the subscription ID contains "churn-risk-agent"

    Scenario: Subscription ID contains a UUID segment
      Given the system time is fixed at "2024-01-15T12:00:00Z"
      When I generate a subscription ID for "my-agent"
      Then the subscription ID contains a UUIDv7 suffix

    Scenario: Produces different IDs when timestamp differs
      Given the system time is fixed at "2024-01-15T12:00:00Z"
      When I generate two subscription IDs for "my-agent" with 1ms between them
      Then the two subscription IDs are different

  Rule: initializeAgentBC returns success handle for valid config
    **Invariant:** Valid config produces success result with agentId, config, subscription, and checkpoint
    **Verified by:** Scenario covering successful initialization

    Scenario: Returns success with handle for a valid config
      Given a valid agent BC config with id "test-agent"
      And mock eventBus and handler dependencies
      When I initialize the agent BC
      Then the initialization is successful
      And the handle has the expected properties:
        | property                       | value              |
        | agentId                        | test-agent         |
        | subscription.agentId           | test-agent         |
        | subscription.subscriptionName  | agent:test-agent   |
        | checkpoint.status              | active             |

  Rule: initializeAgentBC returns error for invalid config
    **Invariant:** Invalid config produces failure result with INVALID_CONFIG code
    **Verified by:** Scenario covering empty id config

    Scenario: Returns error with INVALID_CONFIG code for invalid config
      Given a valid agent BC config with id ""
      And mock eventBus and handler dependencies
      When I initialize the agent BC
      Then the initialization failed with code "INVALID_CONFIG"

  Rule: initializeAgentBC uses existing checkpoint when provided
    **Invariant:** When existingCheckpoint is passed, the handle uses it instead of creating a new one
    **Verified by:** Scenario covering checkpoint passthrough

    Scenario: Uses existing checkpoint when provided
      Given a valid agent BC config with id "test-agent"
      And mock eventBus and handler dependencies
      And an existing checkpoint with lastProcessedPosition 200
      When I initialize the agent BC with the existing checkpoint
      Then the initialization is successful
      And the handle checkpoint has lastProcessedPosition 200
      And the handle checkpoint has status "active"

  Rule: initializeAgentBC creates new checkpoint when none provided
    **Invariant:** Without existing checkpoint, creates a fresh one at position -1 with 0 events processed
    **Verified by:** Scenario covering fresh initialization

    Scenario: Creates a new checkpoint when no existing checkpoint provided
      Given a valid agent BC config with id "fresh-agent"
      And mock eventBus and handler dependencies
      When I initialize the agent BC
      Then the initialization is successful
      And the handle checkpoint has agentId "fresh-agent"
      And the handle checkpoint has lastProcessedPosition -1
      And the handle checkpoint has eventsProcessed 0
      And the handle checkpoint has status "active"
