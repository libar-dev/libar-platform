@acceptance-criteria
Feature: Branded ID Types

  As a platform developer
  I want branded ID types that provide compile-time safety
  So that different ID kinds cannot be accidentally interchanged

  Branded types make IDs nominally distinct at the type level
  while remaining plain strings at runtime with zero overhead.

  # ============================================================================
  # Factory Functions
  # ============================================================================

  Rule: Factory functions create branded IDs from raw strings

    **Invariant:** Each factory function returns a branded type that equals the input string.
    **Verified by:** Type-level assertions and runtime equality checks.

    @happy-path
    Scenario: Factory functions produce branded IDs preserving the input value
      Given the following raw ID strings:
        | factory           | input              |
        | toCommandId       | cmd_test123        |
        | toCorrelationId   | corr_test456       |
        | toCausationId     | cmd_test789        |
        | toEventId         | orders_event_abc   |
        | toStreamId        | Order-123          |
      When each factory function is called with its input
      Then each result equals its input string
      And each result is assignable to its branded type

  # ============================================================================
  # String Compatibility
  # ============================================================================

  Rule: Branded IDs remain fully compatible with string operations

    **Invariant:** Branded types are assignable to string and support all string methods.
    **Verified by:** String assignment and method invocations on branded values.

    @happy-path
    Scenario: Branded IDs are assignable to plain string variables
      Given branded IDs created from the following inputs:
        | factory           | input         |
        | toCommandId       | cmd_test      |
        | toCorrelationId   | corr_test     |
        | toCausationId     | cause_test    |
        | toEventId         | evt_test      |
        | toStreamId        | stream_test   |
      When each branded ID is assigned to a string variable
      Then each string variable equals its original input

    @happy-path
    Scenario: Branded IDs support standard string methods
      Given a CommandId created from "cmd_TEST_123"
      When string methods are called on the branded ID
      Then toLowerCase returns "cmd_test_123"
      And startsWith "cmd_" returns true
      And length equals 12

  # ============================================================================
  # Generator Integration
  # ============================================================================

  Rule: ID generators produce correctly branded and prefixed IDs

    **Invariant:** Each generator returns a branded ID with the expected prefix and UUID v7 format.
    **Verified by:** Regex matching on prefix and UUID structure.

    @happy-path
    Scenario: Generators produce correctly prefixed branded IDs
      When the following generators are called:
        | generator                    | expectedPrefix  |
        | generateCommandId            | cmd_            |
        | generateCorrelationId        | corr_           |
        | generateEventId:orders       | orders_event_   |
        | generateIntegrationEventId   | int_evt_        |
      Then each result starts with its expected prefix

    @happy-path
    Scenario: Command and correlation generators produce valid UUID v7 after prefix
      When generateCommandId is called
      Then the result after removing "cmd_" matches UUID v7 format
      When generateCorrelationId is called
      Then the result after removing "corr_" matches UUID v7 format

  # ============================================================================
  # isValidIdString Type Guard
  # ============================================================================

  Rule: isValidIdString validates and narrows unknown values to strings

    **Invariant:** Returns true only for non-empty strings, false for everything else.
    **Verified by:** Positive and negative cases including edge types.

    @happy-path
    Scenario: isValidIdString returns true for non-empty strings
      Then isValidIdString returns true for all of:
        | value            |
        | cmd_123          |
        | a                |
        | any-string-value |

    @validation
    Scenario: isValidIdString returns false for empty string
      Then isValidIdString returns false for ""

    @validation
    Scenario: isValidIdString returns false for non-string values
      Then isValidIdString returns false for all non-string values:
        | description |
        | null        |
        | undefined   |
        | number 123  |
        | object      |
        | array       |

    @happy-path
    Scenario: isValidIdString narrows type for TypeScript
      Given an unknown value "test_id"
      When isValidIdString returns true
      Then the value is usable as a string with length greater than 0

  # ============================================================================
  # Uniqueness
  # ============================================================================

  Rule: ID generators produce unique values across repeated calls

    **Invariant:** 100 consecutive generated IDs must all be distinct.
    **Verified by:** Set cardinality check after batch generation.

    @happy-path
    Scenario: 100 generated CommandIds are all unique
      When 100 CommandIds are generated
      Then all 100 are distinct

    @happy-path
    Scenario: 100 generated CorrelationIds are all unique
      When 100 CorrelationIds are generated
      Then all 100 are distinct
