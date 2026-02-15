@acceptance-criteria
Feature: Correlation Chain - Chain Creation, Derivation, and Relationship Checks

  As a platform developer
  I want correlation chain utilities that create, derive, and inspect chains
  So that I can trace causation through command-event flows

  The correlation chain module provides:
  - createCorrelationChain: Initialize a chain from a command
  - deriveCorrelationChain: Derive a chain from a parent event
  - toEventMetadata: Extract event metadata from chain
  - isCorrelated / isCausedBy: Relationship checks

  Background:
    Given the module is imported from platform-core

  # ============================================================================
  # createCorrelationChain
  # ============================================================================

  Rule: createCorrelationChain with only commandId sets defaults

    **Invariant:** A chain created with only a commandId uses that commandId as causationId,
    generates a correlationId, sets initiatedAt to current time, and leaves userId/context undefined.
    **Verified by:** Property assertions on the returned chain.

    @happy-path
    Scenario: Chain uses commandId as causationId and generates correlationId
      Given the system time is fixed at 1703001234567
      When a correlation chain is created with commandId "cmd_test_123"
      Then the chain has the following properties:
        | property      | value        |
        | commandId     | cmd_test_123 |
        | causationId   | cmd_test_123 |
        | initiatedAt   | 1703001234567 |
      And the chain correlationId starts with "corr_"
      And the chain userId is undefined
      And the chain context is undefined

  Rule: createCorrelationChain with options uses provided values

    **Invariant:** Provided options override defaults for correlationId, userId, context, and initiatedAt.
    **Verified by:** Property assertions on the returned chain.

    Scenario: Chain uses provided correlationId
      Given the system time is fixed at 1703001234567
      When a correlation chain is created with commandId "cmd_test_123" and correlationId "corr_custom_456"
      Then the chain correlationId is "corr_custom_456"

    Scenario: Chain uses provided userId
      Given the system time is fixed at 1703001234567
      When a correlation chain is created with commandId "cmd_test_123" and userId "user_abc"
      Then the chain userId is "user_abc"

    Scenario: Chain uses provided context
      Given the system time is fixed at 1703001234567
      When a correlation chain is created with commandId "cmd_test_123" and context source "api" version "v1"
      Then the chain context equals source "api" version "v1"

    Scenario: Chain uses provided initiatedAt
      When a correlation chain is created with commandId "cmd_test_123" and initiatedAt 1700000000000
      Then the chain initiatedAt is 1700000000000

    Scenario: Chain accepts all options together
      When a correlation chain is created with all options commandId "cmd_test_123" correlationId "corr_custom" userId "user_xyz" context key "value" and initiatedAt 1699999999999
      Then the chain equals the full expected object:
        | property      | value         |
        | commandId     | cmd_test_123  |
        | correlationId | corr_custom   |
        | causationId   | cmd_test_123  |
        | userId        | user_xyz      |
        | initiatedAt   | 1699999999999 |
      And the chain context equals key "value"

  # ============================================================================
  # deriveCorrelationChain
  # ============================================================================

  Rule: deriveCorrelationChain basic derivation preserves correlation and sets causation

    **Invariant:** A derived chain preserves the source correlationId, uses the eventId as causationId,
    generates a new commandId, inherits userId, and sets initiatedAt to current time.
    **Verified by:** Property assertions on the derived chain.

    @happy-path
    Scenario: Derived chain preserves correlationId and uses eventId as causationId
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" and correlationId "corr_original"
      When a correlation chain is derived from the source
      Then the derived chain has the following properties:
        | property      | value         |
        | correlationId | corr_original |
        | causationId   | evt_abc123    |
        | initiatedAt   | 1703001234567 |
      And the derived chain commandId starts with "cmd_"

    Scenario: Derived chain inherits userId from source
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and userId "user_inherited"
      When a correlation chain is derived from the source
      Then the derived chain userId is "user_inherited"

  Rule: deriveCorrelationChain merges context from source and options

    **Invariant:** Context from source and options are merged, with option context taking precedence.
    If neither has context, the result is undefined. If both have empty context, the result is empty.
    **Verified by:** Deep equality assertions on the derived context.

    Scenario: Derived chain inherits context from source
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and context parentKey "parentValue"
      When a correlation chain is derived from the source
      Then the derived chain context equals parentKey "parentValue"

    Scenario: Derived chain merges source and option contexts
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and context parentKey "parentValue"
      When a correlation chain is derived from the source with context childKey "childValue"
      Then the derived chain context equals parentKey "parentValue" and childKey "childValue"

    Scenario: Option context takes precedence over source context
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and context key "sourceValue"
      When a correlation chain is derived from the source with context key "optionValue"
      Then the derived chain context equals key "optionValue"

    Scenario: Source context preserved when options have no context
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and context key "value"
      When a correlation chain is derived from the source with empty options
      Then the derived chain context equals key "value"

    Scenario: Options context used when source has no context
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" and correlationId "corr_original"
      When a correlation chain is derived from the source with context key "value"
      Then the derived chain context equals key "value"

    Scenario: Context is undefined when neither source nor options have context
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" and correlationId "corr_original"
      When a correlation chain is derived from the source
      Then the derived chain context is undefined

    Scenario: Both empty contexts merge to empty object
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and empty context
      When a correlation chain is derived from the source with empty context
      Then the derived chain context is an empty object

    Scenario: Source context preserved when options context is empty
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and context key "value"
      When a correlation chain is derived from the source with empty context
      Then the derived chain context equals key "value"

    Scenario: Options context used when source context is empty
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" correlationId "corr_original" and empty context
      When a correlation chain is derived from the source with context key "value"
      Then the derived chain context equals key "value"

  Rule: deriveCorrelationChain with options uses provided overrides

    **Invariant:** Provided commandId and initiatedAt override defaults in derived chains.
    **Verified by:** Property assertions on the derived chain.

    Scenario: Derived chain uses provided commandId
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" and correlationId "corr_original"
      When a correlation chain is derived from the source with commandId "cmd_custom_999"
      Then the derived chain commandId is "cmd_custom_999"

    Scenario: Derived chain uses provided initiatedAt
      Given the system time is fixed at 1703001234567
      And a causation source with eventId "evt_abc123" and correlationId "corr_original"
      When a correlation chain is derived from the source with initiatedAt 1700000000000
      Then the derived chain initiatedAt is 1700000000000

  # ============================================================================
  # toEventMetadata
  # ============================================================================

  Rule: toEventMetadata extracts correlationId and causationId from chain

    **Invariant:** Event metadata contains only correlationId, causationId, and optionally userId.
    Context, initiatedAt, and commandId are excluded. Additional metadata is merged.
    **Verified by:** Property inclusion/exclusion assertions.

    @happy-path
    Scenario: Extracts correlationId and causationId
      Given a correlation chain with commandId "cmd_123" correlationId "corr_456" and causationId "evt_789"
      When toEventMetadata is called on the chain
      Then the metadata has correlationId "corr_456" and causationId "evt_789"

    Scenario: Includes userId when present
      Given a correlation chain with commandId "cmd_123" correlationId "corr_456" causationId "cmd_123" and userId "user_abc"
      When toEventMetadata is called on the chain
      Then the metadata userId is "user_abc"

    Scenario: Excludes userId when undefined
      Given a correlation chain with commandId "cmd_123" correlationId "corr_456" and causationId "cmd_123"
      When toEventMetadata is called on the chain
      Then the metadata does not contain userId

    Scenario: Merges additional metadata
      Given a correlation chain with commandId "cmd_123" correlationId "corr_456" and causationId "cmd_123"
      When toEventMetadata is called with additional metadata requestId "req_xyz" and customField 42
      Then the metadata has correlationId "corr_456" and causationId "cmd_123"
      And the metadata has requestId "req_xyz" and customField 42

    Scenario: Does not include context, initiatedAt, or commandId from chain
      Given a correlation chain with commandId "cmd_123" correlationId "corr_456" causationId "cmd_123" and context key "value"
      When toEventMetadata is called on the chain
      Then the metadata does not contain excluded fields:
        | field       |
        | context     |
        | initiatedAt |
        | commandId   |

  # ============================================================================
  # isCorrelated
  # ============================================================================

  Rule: isCorrelated compares correlationIds of two chains

    **Invariant:** Two chains are correlated if and only if they share the same correlationId.
    **Verified by:** Boolean return value assertions.

    @happy-path
    Scenario: Returns true for chains with same correlationId
      Given chain A with commandId "cmd_1" correlationId "corr_shared" and causationId "cmd_1"
      And chain B with commandId "cmd_2" correlationId "corr_shared" and causationId "evt_1"
      When isCorrelated is called with chain A and chain B
      Then the result is true

    @validation
    Scenario: Returns false for chains with different correlationIds
      Given chain A with commandId "cmd_1" correlationId "corr_first" and causationId "cmd_1"
      And chain B with commandId "cmd_2" correlationId "corr_second" and causationId "evt_1"
      When isCorrelated is called with chain A and chain B
      Then the result is false

  # ============================================================================
  # isCausedBy
  # ============================================================================

  Rule: isCausedBy checks if child causationId matches parent commandId

    **Invariant:** A child chain is caused by a parent if child.causationId === parent.commandId.
    **Verified by:** Boolean return value assertions.

    @happy-path
    Scenario: Returns true when child causationId matches parent commandId
      Given a parent chain with commandId "cmd_parent" correlationId "corr_shared" and causationId "cmd_parent"
      And a child chain with commandId "cmd_child" correlationId "corr_shared" and causationId "cmd_parent"
      When isCausedBy is called with parent and child
      Then the result is true

    @validation
    Scenario: Returns false when child causationId does not match
      Given a parent chain with commandId "cmd_parent" correlationId "corr_shared" and causationId "cmd_parent"
      And a child chain with commandId "cmd_child" correlationId "corr_shared" and causationId "evt_other"
      When isCausedBy is called with parent and child
      Then the result is false

    Scenario: Returns true for same chain where command is its own cause
      Given a self-referencing chain with commandId "cmd_1" correlationId "corr_1" and causationId "cmd_1"
      When isCausedBy is called with the same chain as both parent and child
      Then the result is true

  # ============================================================================
  # Correlation Flow Scenarios
  # ============================================================================

  Rule: Correlation chains trace full request flows across command-event boundaries

    **Invariant:** A chain of create -> derive preserves correlationId across all links,
    uses each event as the causationId for the next link, and inherits userId/context.
    **Verified by:** End-to-end flow assertions across multiple derivations.

    @happy-path
    Scenario: Full request flow tracing from user command through saga reaction
      Given the system time is fixed at 1703001234567
      When a correlation chain is created with commandId "cmd_submit_001" userId "user_123" and context source "web-ui"
      Then the chain commandId is "cmd_submit_001"
      And the chain causationId is "cmd_submit_001"
      When toEventMetadata is called on the submit chain
      Then the submit metadata correlationId matches the chain correlationId
      When a saga derives a chain from event "evt_order_submitted_001" using the submit chain
      Then the saga chain correlationId matches the submit chain correlationId
      And the saga chain causationId is "evt_order_submitted_001"
      And the saga chain userId is "user_123"
      And the saga chain context equals source "web-ui"
      And the submit chain and saga chain are correlated

    Scenario: Multi-step saga preserves correlationId across three links
      Given the system time is fixed at 1703001234567
      When an initial chain is created with commandId "cmd_1" and correlationId "corr_saga_flow"
      And chain2 is derived from event "evt_1" using the initial chain correlationId
      And chain3 is derived from event "evt_2" using chain2 correlationId
      Then all three chains share correlationId "corr_saga_flow"
      And chain2 causationId is "evt_1"
      And chain3 causationId is "evt_2"
      And all three chains are pairwise correlated
