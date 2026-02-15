@unit @agent
Feature: Pattern Registry

  validatePatternDefinitions() validates an array of PatternDefinition objects,
  checking for missing names, missing triggers, duplicate names, and unknown
  error codes. PATTERN_REGISTRY_ERROR_CODES provides the canonical error code constants.

  Rule: Error code constants are complete and correct

    **Invariant:** PATTERN_REGISTRY_ERROR_CODES must contain exactly 4 known error codes with values matching their keys.
    **Verified by:** Asserting each code value and total count.

    @acceptance-criteria @happy-path
    Scenario: Error codes object contains all expected codes
      Then PATTERN_REGISTRY_ERROR_CODES contains all expected codes:
        | code                  | value                 |
        | DUPLICATE_PATTERN     | DUPLICATE_PATTERN     |
        | INVALID_PATTERN       | INVALID_PATTERN       |
        | PATTERN_NAME_REQUIRED | PATTERN_NAME_REQUIRED |
        | TRIGGER_REQUIRED      | TRIGGER_REQUIRED      |
      And PATTERN_REGISTRY_ERROR_CODES has exactly 4 keys

  Rule: Valid patterns pass validation

    **Invariant:** Any array of well-formed patterns with unique names must return { valid: true }.
    **Verified by:** Asserting valid result for single, multiple, windowed, and analyzer patterns.

    Scenario: Single valid pattern passes
      Given a valid pattern named "churn-risk"
      When I validate the pattern definitions
      Then the result is valid

    Scenario: Multiple patterns with unique names pass
      Given valid patterns named:
        | name                |
        | churn-risk          |
        | high-value-customer |
        | fraud-detection     |
      When I validate the pattern definitions
      Then the result is valid

    Scenario: Patterns with different window configurations pass
      Given a pattern "short-window" with window duration "1h"
      And a pattern "long-window" with window duration "30d" and minEvents 5 and eventLimit 200
      When I validate the pattern definitions
      Then the result is valid

    Scenario: Pattern with analyze function passes
      Given a pattern "with-analyzer" that has an analyze function
      When I validate the pattern definitions
      Then the result is valid

  Rule: Empty array passes validation

    **Invariant:** An empty array has nothing to validate and must return { valid: true }.
    **Verified by:** Asserting valid result for empty input.

    Scenario: Empty array returns valid
      Given an empty pattern array
      When I validate the pattern definitions
      Then the result is valid

  Rule: Duplicate names are rejected

    **Invariant:** If two or more patterns share the same name, validation must fail with DUPLICATE_PATTERN and mention the offending name.
    **Verified by:** Asserting error code and message content for duplicate scenarios.

    @acceptance-criteria @validation
    Scenario: Two patterns with same name fail
      Given valid patterns named:
        | name       |
        | churn-risk |
        | churn-risk |
      When I validate the pattern definitions
      Then the result is invalid with code "DUPLICATE_PATTERN"
      And the error message contains "churn-risk"

    Scenario: Duplicate detected in middle of array
      Given valid patterns named:
        | name  |
        | alpha |
        | beta  |
        | alpha |
      When I validate the pattern definitions
      Then the result is invalid with code "DUPLICATE_PATTERN"
      And the error message contains "alpha"

    Scenario: Short-circuits on first duplicate found
      Given valid patterns named:
        | name  |
        | alpha |
        | beta  |
        | alpha |
        | beta  |
      When I validate the pattern definitions
      Then the result is invalid with code "DUPLICATE_PATTERN"
      And the error message contains "alpha"

  Rule: Missing name is rejected

    **Invariant:** A pattern with an empty or whitespace-only name must fail with PATTERN_NAME_REQUIRED.
    **Verified by:** Asserting error code for empty and whitespace-only name inputs.

    Scenario: Empty name fails with PATTERN_NAME_REQUIRED
      Given a valid pattern named ""
      When I validate the pattern definitions
      Then the result is invalid with code "PATTERN_NAME_REQUIRED"

    Scenario: Whitespace-only name fails with PATTERN_NAME_REQUIRED
      Given a valid pattern named "   "
      When I validate the pattern definitions
      Then the result is invalid with code "PATTERN_NAME_REQUIRED"

    Scenario: Invalid pattern short-circuits before duplicate check
      Given a pattern with empty name followed by a pattern named "churn-risk"
      When I validate the pattern definitions
      Then the result is invalid with code "PATTERN_NAME_REQUIRED"

  Rule: Missing trigger is rejected

    **Invariant:** A pattern without a trigger function (or with a non-function trigger) must fail with TRIGGER_REQUIRED.
    **Verified by:** Asserting error code for missing and non-function trigger inputs.

    Scenario: Pattern without trigger function fails
      Given a pattern "no-trigger" without a trigger function
      When I validate the pattern definitions
      Then the result is invalid with code "TRIGGER_REQUIRED"

    Scenario: Pattern with non-function trigger fails
      Given a pattern "bad-trigger" with a non-function trigger
      When I validate the pattern definitions
      Then the result is invalid with code "TRIGGER_REQUIRED"

  Rule: Error codes are mapped correctly at registry level

    **Invariant:** Pattern-level error codes must map to their registry-level equivalents; unknown codes map to INVALID_PATTERN.
    **Verified by:** Asserting registry-level error codes for each pattern-level error type.

    Scenario: PATTERN_NAME_REQUIRED maps to registry PATTERN_NAME_REQUIRED
      Given a valid pattern named ""
      When I validate the pattern definitions
      Then the result is invalid with code "PATTERN_NAME_REQUIRED"

    Scenario: TRIGGER_REQUIRED maps to registry TRIGGER_REQUIRED
      Given a pattern "no-trigger" without a trigger function
      When I validate the pattern definitions
      Then the result is invalid with code "TRIGGER_REQUIRED"

    Scenario: Unknown pattern error codes map to INVALID_PATTERN
      Given a pattern "bad-window" with invalid window duration "invalid"
      When I validate the pattern definitions
      Then the result is invalid with code "INVALID_PATTERN"

  Rule: Type safety is preserved

    **Invariant:** The function must accept readonly arrays and the error result must conform to the discriminated union shape.
    **Verified by:** Asserting readonly input acceptance and discriminated union narrowing.

    Scenario: Accepts readonly array input
      Given a frozen readonly pattern array with pattern "frozen-pattern"
      When I validate the pattern definitions
      Then the result is valid

    Scenario: Error result has correct discriminated union shape
      Given valid patterns named:
        | name |
        | a    |
        | a    |
      When I validate the pattern definitions
      Then the result is invalid with code "DUPLICATE_PATTERN"
      And the error message is a string
