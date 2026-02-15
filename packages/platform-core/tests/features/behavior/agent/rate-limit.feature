Feature: Rate Limit Module

  Pure functions and schemas for LLM rate limiting: error codes,
  Zod schema validation, config validation, factory functions,
  type guards, exponential backoff calculation, and budget helpers.

  Background:
    Given the module is imported from platform-core

  Rule: Error codes enumerate all rate-limit failure modes
    **Invariant:** RATE_LIMIT_ERROR_CODES contains exactly 8 named error codes with self-referencing string values
    **Verified by:** Scenarios checking each code value and the total count

    @acceptance-criteria @happy-path
    Scenario: All expected error codes are present with correct values
      Then RATE_LIMIT_ERROR_CODES contains all of:
        | code                     | value                    |
        | LLM_RATE_LIMITED         | LLM_RATE_LIMITED         |
        | LLM_UNAVAILABLE          | LLM_UNAVAILABLE          |
        | LLM_TIMEOUT              | LLM_TIMEOUT              |
        | LLM_INVALID_RESPONSE     | LLM_INVALID_RESPONSE     |
        | LLM_AUTH_FAILED          | LLM_AUTH_FAILED          |
        | QUEUE_OVERFLOW           | QUEUE_OVERFLOW           |
        | BUDGET_EXCEEDED          | BUDGET_EXCEEDED          |
        | INVALID_RATE_LIMIT_CONFIG | INVALID_RATE_LIMIT_CONFIG |

    Scenario: Error codes object has exactly 8 entries
      Then RATE_LIMIT_ERROR_CODES has 8 entries

  Rule: CostBudgetSchema validates budget configuration
    **Invariant:** CostBudgetSchema requires daily > 0 and alertThreshold in [0, 1]
    **Verified by:** Scenarios for valid budgets, invalid daily, and invalid alertThreshold

    Scenario: Accepts valid cost budget
      When I parse a cost budget with daily 10 and alertThreshold 0.8
      Then the schema parse succeeds

    Scenario: Rejects budget with zero daily
      When I parse a cost budget with daily 0 and alertThreshold 0.8
      Then the schema parse fails

    Scenario: Rejects budget with negative daily
      When I parse a cost budget with daily -10 and alertThreshold 0.8
      Then the schema parse fails

    Scenario: Rejects budget with alertThreshold above 1
      When I parse a cost budget with daily 10 and alertThreshold 1.5
      Then the schema parse fails

    Scenario: Rejects budget with negative alertThreshold
      When I parse a cost budget with daily 10 and alertThreshold -0.1
      Then the schema parse fails

    Scenario: Accepts alertThreshold at boundary 0
      When I parse a cost budget with daily 10 and alertThreshold 0
      Then the schema parse succeeds

    Scenario: Accepts alertThreshold at boundary 1
      When I parse a cost budget with daily 10 and alertThreshold 1
      Then the schema parse succeeds

  Rule: AgentRateLimitConfigSchema validates rate limit configuration
    **Invariant:** maxRequestsPerMinute is required positive integer; maxConcurrent, queueDepth are optional positive integers
    **Verified by:** Scenarios for valid minimal config, full config, and invalid field values

    Scenario: Accepts valid config with required fields only
      When I parse a rate limit config with maxRequestsPerMinute 60
      Then the schema parse succeeds

    Scenario: Accepts config with all optional fields
      When I parse a full rate limit config with maxRequestsPerMinute 60 and maxConcurrent 5 and queueDepth 100 and budget
      Then the schema parse succeeds

    Scenario: Rejects config with zero maxRequestsPerMinute
      When I parse a rate limit config with maxRequestsPerMinute 0
      Then the schema parse fails

    Scenario: Rejects config with negative maxRequestsPerMinute
      When I parse a rate limit config with maxRequestsPerMinute -10
      Then the schema parse fails

    Scenario: Rejects config with non-integer maxRequestsPerMinute
      When I parse a rate limit config with maxRequestsPerMinute 60.5
      Then the schema parse fails

    Scenario: Rejects config with zero maxConcurrent
      When I parse a rate limit config with maxRequestsPerMinute 60 and maxConcurrent 0
      Then the schema parse fails

    Scenario: Rejects config with zero queueDepth
      When I parse a rate limit config with maxRequestsPerMinute 60 and queueDepth 0
      Then the schema parse fails

  Rule: validateRateLimitConfig catches invalid configurations
    **Invariant:** Returns valid=false with error code INVALID_RATE_LIMIT_CONFIG for any field violating constraints
    **Verified by:** Scenarios covering each field validation path

    Scenario: Returns invalid when maxRequestsPerMinute is undefined
      When I validate a rate limit config with no maxRequestsPerMinute
      Then the validation result is invalid
      And the validation error code is "INVALID_RATE_LIMIT_CONFIG"
      And the validation error message contains "maxRequestsPerMinute"

    Scenario: Returns invalid when maxRequestsPerMinute is zero
      When I validate a rate limit config with maxRequestsPerMinute 0
      Then the validation result is invalid

    Scenario: Returns invalid when maxRequestsPerMinute is negative
      When I validate a rate limit config with maxRequestsPerMinute -10
      Then the validation result is invalid

    Scenario: Returns invalid when maxRequestsPerMinute is not an integer
      When I validate a rate limit config with maxRequestsPerMinute 60.5
      Then the validation result is invalid

    Scenario: Returns valid for positive integer maxRequestsPerMinute
      When I validate a rate limit config with maxRequestsPerMinute 60
      Then the validation result is valid

    Scenario: Returns invalid when maxConcurrent is zero
      When I validate a rate limit config with maxRequestsPerMinute 60 and maxConcurrent 0
      Then the validation result is invalid
      And the validation error message contains "maxConcurrent"

    Scenario: Returns invalid when maxConcurrent is negative
      When I validate a rate limit config with maxRequestsPerMinute 60 and maxConcurrent -5
      Then the validation result is invalid

    Scenario: Returns invalid when maxConcurrent is not an integer
      When I validate a rate limit config with maxRequestsPerMinute 60 and maxConcurrent 5.5
      Then the validation result is invalid

    Scenario: Returns valid when maxConcurrent is undefined
      When I validate a rate limit config with maxRequestsPerMinute 60
      Then the validation result is valid

    Scenario: Returns invalid when queueDepth is zero
      When I validate a rate limit config with maxRequestsPerMinute 60 and queueDepth 0
      Then the validation result is invalid
      And the validation error message contains "queueDepth"

    Scenario: Returns invalid when queueDepth is negative
      When I validate a rate limit config with maxRequestsPerMinute 60 and queueDepth -100
      Then the validation result is invalid

    Scenario: Returns invalid when queueDepth is not an integer
      When I validate a rate limit config with maxRequestsPerMinute 60 and queueDepth 100.5
      Then the validation result is invalid

    Scenario: Returns invalid when costBudget daily is zero
      When I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 0 alertThreshold 0.8
      Then the validation result is invalid
      And the validation error message contains "daily"

    Scenario: Returns invalid when costBudget daily is negative
      When I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily -10 alertThreshold 0.8
      Then the validation result is invalid

    Scenario: Returns invalid when costBudget alertThreshold is below 0
      When I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 10 alertThreshold -0.1
      Then the validation result is invalid
      And the validation error message contains "alertThreshold"

    Scenario: Returns invalid when costBudget alertThreshold is above 1
      When I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 10 alertThreshold 1.5
      Then the validation result is invalid

    Scenario: Returns valid when costBudget is valid
      When I validate a rate limit config with maxRequestsPerMinute 60 and costBudget daily 10 alertThreshold 0.8
      Then the validation result is valid

    Scenario: Returns valid for complete valid config
      When I validate a complete rate limit config
      Then the validation result is valid

  Rule: createDefaultRateLimitConfig produces valid defaults
    **Invariant:** Factory returns config matching DEFAULT_RATE_LIMIT_VALUES with no costBudget and passing validation
    **Verified by:** Scenarios checking each default field, absence of costBudget, and validation pass

    Scenario: Default config has correct field values
      When I create a default rate limit config
      Then the config maxRequestsPerMinute matches the default
      And the config maxConcurrent matches the default
      And the config queueDepth matches the default
      And the config has no costBudget

    Scenario: Default config passes validation
      When I create a default rate limit config
      And I validate the created config
      Then the validation result is valid

  Rule: createRateLimitConfigWithBudget produces config with cost budget
    **Invariant:** Factory merges dailyBudget, optional alertThreshold (default 0.8), and optional rate fields
    **Verified by:** Scenarios covering dailyBudget, alertThreshold, and optional rate fields

    Scenario: Creates config with specified dailyBudget
      When I create a rate limit config with dailyBudget 25
      Then the config costBudget daily is 25

    Scenario: Uses default alertThreshold when not specified
      When I create a rate limit config with dailyBudget 10
      Then the config costBudget alertThreshold is 0.8

    Scenario: Uses specified alertThreshold
      When I create a rate limit config with dailyBudget 10 and alertThreshold 0.5
      Then the config costBudget alertThreshold is 0.5

    Scenario: Uses specified maxRequestsPerMinute
      When I create a rate limit config with dailyBudget 10 and maxRequestsPerMinute 30
      Then the config maxRequestsPerMinute is 30

    Scenario: Uses default maxRequestsPerMinute when not specified
      When I create a rate limit config with dailyBudget 10
      Then the config maxRequestsPerMinute matches the default

    Scenario: Includes all optional fields
      When I create a rate limit config with dailyBudget 10 and maxRequestsPerMinute 30 and maxConcurrent 3 and queueDepth 50 and alertThreshold 0.7
      Then the config has the following values:
        | field                      | value |
        | maxRequestsPerMinute       | 30    |
        | maxConcurrent              | 3     |
        | queueDepth                 | 50    |
        | costBudget.daily           | 10    |
        | costBudget.alertThreshold  | 0.7   |

  Rule: createRateLimitError builds structured error objects
    **Invariant:** Factory returns object with code, message, and optional retryAfterMs/context
    **Verified by:** Scenarios covering required fields, optional fields, and combined options

    Scenario: Creates error with code and message
      When I create a rate limit error with code "LLM_RATE_LIMITED" and message "Rate limit exceeded"
      Then the error code is "LLM_RATE_LIMITED"
      And the error message is "Rate limit exceeded"

    Scenario: Creates error without optional fields when not provided
      When I create a rate limit error with code "LLM_UNAVAILABLE" and message "Service unavailable"
      Then the error retryAfterMs is undefined
      And the error context is undefined

    Scenario: Creates error with retryAfterMs when provided
      When I create a rate limit error with code "LLM_RATE_LIMITED" and message "Rate limited" and retryAfterMs 5000
      Then the error retryAfterMs is 5000

    Scenario: Creates error with context when provided
      When I create a rate limit error with code "QUEUE_OVERFLOW" and message "Queue full" and context queueSize 100 maxSize 100
      Then the error context equals queueSize 100 and maxSize 100

    Scenario: Creates error with both retryAfterMs and context
      When I create a rate limit error with code "LLM_TIMEOUT" and message "Timeout" and retryAfterMs 10000 and context attempt 3
      Then the error retryAfterMs is 10000
      And the error context equals attempt 3

  Rule: isRateLimitError identifies valid rate limit error objects
    **Invariant:** Returns true only for objects with a known code string and a message string
    **Verified by:** Scenarios covering valid errors, all codes, and various invalid inputs

    Scenario: Returns true for valid rate limit error
      When I check isRateLimitError for a valid LLM_RATE_LIMITED error
      Then the type guard result is true

    Scenario: Returns true for all known error codes
      Then isRateLimitError returns true for all known error codes

    Scenario: Returns false for non-error values
      Then isRateLimitError returns false for all of:
        | input                      |
        | null                       |
        | undefined                  |
        | string:error               |
        | number:123                 |
        | boolean:true               |
        | object:message-only        |
        | object:code-only           |
        | object:non-string-code     |
        | object:unknown-code        |
        | Error:regular              |

  Rule: isRetryableError identifies transient errors eligible for retry
    **Invariant:** Only LLM_RATE_LIMITED, LLM_UNAVAILABLE, and LLM_TIMEOUT are retryable
    **Verified by:** Scenarios covering each code and non-error inputs

    Scenario: Retryable error codes
      Then isRetryableError returns the expected result for each code:
        | code                 | expected |
        | LLM_RATE_LIMITED     | true     |
        | LLM_UNAVAILABLE      | true     |
        | LLM_TIMEOUT          | true     |
        | LLM_AUTH_FAILED      | false    |
        | BUDGET_EXCEEDED      | false    |
        | LLM_INVALID_RESPONSE | false    |
        | QUEUE_OVERFLOW       | false    |

    Scenario: Returns false for non-rate-limit errors
      Then isRetryableError returns false for non-error values

  Rule: isPermanentError identifies non-retryable errors
    **Invariant:** Only LLM_AUTH_FAILED and BUDGET_EXCEEDED are permanent
    **Verified by:** Scenarios covering each code and non-error inputs

    Scenario: Permanent error codes
      Then isPermanentError returns the expected result for each code:
        | code             | expected |
        | LLM_AUTH_FAILED  | true     |
        | BUDGET_EXCEEDED  | true     |
        | LLM_RATE_LIMITED | false    |
        | LLM_UNAVAILABLE  | false    |
        | LLM_TIMEOUT      | false    |

    Scenario: Returns false for non-rate-limit errors
      Then isPermanentError returns false for non-error values

  Rule: calculateBackoffDelay computes exponential backoff with jitter
    **Invariant:** delay = min(2^attempt * baseDelay + jitter, maxDelay) where jitter is up to 25% of pre-cap delay
    **Verified by:** Scenarios covering exponential growth, cap, jitter, defaults, and integer output

    Scenario: Exponential 2^n growth pattern with Math.random mocked to 0
      When Math.random is mocked to return 0
      Then calculateBackoffDelay returns the expected delays:
        | attempt | baseDelay | expected |
        | 0       | 1000      | 1000     |
        | 1       | 1000      | 2000     |
        | 2       | 1000      | 4000     |
        | 3       | 1000      | 8000     |
        | 4       | 1000      | 16000    |

    Scenario: Caps at default maxDelay of 60000ms
      When Math.random is mocked to return 0
      Then calculateBackoffDelay for attempt 10 with baseDelay 1000 returns 60000

    Scenario: Caps at custom maxDelay
      When Math.random is mocked to return 0
      Then calculateBackoffDelay for attempt 5 with baseDelay 1000 and maxDelay 10000 returns 10000

    Scenario: Does not cap when delay is below max
      When Math.random is mocked to return 0
      Then calculateBackoffDelay for attempt 2 with baseDelay 1000 and maxDelay 10000 returns 4000

    Scenario: Adds jitter up to 25% of delay
      When Math.random is mocked to return 0.5
      Then calculateBackoffDelay for attempt 0 with baseDelay 1000 returns 1125

    Scenario: Adds max jitter of 25% when random is 1
      When Math.random is mocked to return 1
      Then calculateBackoffDelay for attempt 0 with baseDelay 1000 returns 1250

    Scenario: Uses default base delay of 1000ms
      When Math.random is mocked to return 0
      Then calculateBackoffDelay for attempt 0 with default params returns 1000

    Scenario: Uses default max delay of 60000ms
      When Math.random is mocked to return 0
      Then calculateBackoffDelay for attempt 10 with default params returns 60000

    Scenario: Returns floored integer
      When Math.random is mocked to return 0.333
      Then calculateBackoffDelay for attempt 0 with baseDelay 1000 returns an integer

  Rule: wouldExceedBudget checks if estimated cost would exceed daily budget
    **Invariant:** Returns true when currentSpend + estimatedCost > daily budget
    **Verified by:** Scenarios covering over, under, exact, already exceeded, zero spend, and small decimals

    Scenario: Returns true when total exceeds budget
      Then wouldExceedBudget for currentSpend 9 estimatedCost 2 and daily 10 returns true

    Scenario: Returns false when total is under budget
      Then wouldExceedBudget for currentSpend 5 estimatedCost 3 and daily 10 returns false

    Scenario: Returns false when total equals budget exactly
      Then wouldExceedBudget for currentSpend 7 estimatedCost 3 and daily 10 returns false

    Scenario: Returns true when current spend already exceeds budget
      Then wouldExceedBudget for currentSpend 11 estimatedCost 0 and daily 10 returns true

    Scenario: Handles zero current spend under budget
      Then wouldExceedBudget for currentSpend 0 estimatedCost 5 and daily 10 returns false

    Scenario: Handles zero current spend over budget
      Then wouldExceedBudget for currentSpend 0 estimatedCost 15 and daily 10 returns true

    Scenario: Handles small decimal values under budget
      Then wouldExceedBudget for currentSpend 0.05 estimatedCost 0.04 and daily 0.1 returns false

    Scenario: Handles small decimal values over budget
      Then wouldExceedBudget for currentSpend 0.05 estimatedCost 0.06 and daily 0.1 returns true

  Rule: isAtAlertThreshold checks if spend ratio meets or exceeds alert threshold
    **Invariant:** Returns true when currentSpend >= daily * alertThreshold
    **Verified by:** Scenarios covering at threshold, above, below, threshold 0, and threshold 1

    Scenario: Returns true when spend reaches threshold percentage
      Then isAtAlertThreshold for currentSpend 8 with daily 10 and alertThreshold 0.8 returns true

    Scenario: Returns true when spend exceeds threshold
      Then isAtAlertThreshold for currentSpend 9 with daily 10 and alertThreshold 0.8 returns true

    Scenario: Returns false when spend is below threshold
      Then isAtAlertThreshold for currentSpend 7 with daily 10 and alertThreshold 0.8 returns false

    Scenario: Handles threshold of 0 - always alert
      Then isAtAlertThreshold for currentSpend 0 with daily 10 and alertThreshold 0 returns true

    Scenario: Handles threshold of 1 - below full budget
      Then isAtAlertThreshold for currentSpend 9.99 with daily 10 and alertThreshold 1 returns false

    Scenario: Handles threshold of 1 - at full budget
      Then isAtAlertThreshold for currentSpend 10 with daily 10 and alertThreshold 1 returns true

  Rule: getEffectiveRateLimitConfig merges provided config with defaults
    **Invariant:** Missing fields fall back to DEFAULT_RATE_LIMIT_VALUES; costBudget is preserved or absent
    **Verified by:** Scenarios covering no config, partial config, full config, and costBudget handling

    Scenario: Returns defaults when no config provided
      When I get the effective rate limit config with no input
      Then the effective config matches all defaults

    Scenario: Returns defaults when undefined config provided
      When I get the effective rate limit config with undefined input
      Then the effective config maxRequestsPerMinute matches the default

    Scenario: Uses provided maxRequestsPerMinute
      When I get the effective rate limit config with maxRequestsPerMinute 30
      Then the effective config maxRequestsPerMinute is 30

    Scenario: Uses default maxConcurrent when not provided
      When I get the effective rate limit config with maxRequestsPerMinute 30
      Then the effective config maxConcurrent matches the default

    Scenario: Uses provided maxConcurrent
      When I get the effective rate limit config with maxRequestsPerMinute 30 and maxConcurrent 3
      Then the effective config maxConcurrent is 3

    Scenario: Uses default queueDepth when not provided
      When I get the effective rate limit config with maxRequestsPerMinute 30
      Then the effective config queueDepth matches the default

    Scenario: Uses provided queueDepth
      When I get the effective rate limit config with maxRequestsPerMinute 30 and queueDepth 50
      Then the effective config queueDepth is 50

    Scenario: Preserves costBudget when provided
      When I get the effective rate limit config with maxRequestsPerMinute 30 and costBudget daily 10 alertThreshold 0.8
      Then the effective config costBudget equals daily 10 and alertThreshold 0.8

    Scenario: Does not include costBudget when not provided
      When I get the effective rate limit config with maxRequestsPerMinute 30
      Then the effective config costBudget is undefined
