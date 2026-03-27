@architect
Feature: Logging Types

  As a platform developer
  I want well-defined log level priorities and filtering
  So that I can control logging verbosity consistently

  # ============================================================================
  # LOG_LEVEL_PRIORITY
  # ============================================================================

  Rule: LOG_LEVEL_PRIORITY defines numeric ordering for all log levels

    **Invariant:** Lower numeric priority means more verbose logging.
    **Rationale:** Enables simple numeric comparison for log filtering.
    **Verified by:** Priority ordering and level completeness checks.

    @acceptance-criteria @happy-path
    Scenario: Priority values increase from DEBUG to ERROR
      When I inspect the LOG_LEVEL_PRIORITY map
      Then the priority order from lowest to highest is:
        | level  |
        | DEBUG  |
        | TRACE  |
        | INFO   |
        | REPORT |
        | WARN   |
        | ERROR  |

    @acceptance-criteria @validation
    Scenario: All 6 log levels are defined as numbers
      When I inspect the LOG_LEVEL_PRIORITY map
      Then all log levels are defined as numbers:
        | level  |
        | DEBUG  |
        | TRACE  |
        | INFO   |
        | REPORT |
        | WARN   |
        | ERROR  |

  # ============================================================================
  # DEFAULT_LOG_LEVEL
  # ============================================================================

  Rule: DEFAULT_LOG_LEVEL is INFO

    **Invariant:** The default log level is always INFO.
    **Verified by:** Direct constant assertion.

    @acceptance-criteria @happy-path
    Scenario: Default log level is INFO
      When I check the DEFAULT_LOG_LEVEL constant
      Then it should be "INFO"

  # ============================================================================
  # shouldLog
  # ============================================================================

  Rule: shouldLog returns true when message level >= configured level

    **Invariant:** A message logs only when its priority is >= the configured level priority.
    **Rationale:** Enables hierarchical log filtering without complex branching.
    **Verified by:** Boundary checks at each configured level.

    @acceptance-criteria @happy-path
    Scenario: Messages at or above INFO level pass the filter
      Given the configured log level is "INFO"
      Then shouldLog returns true for levels:
        | messageLevel |
        | INFO         |
        | REPORT       |
        | WARN         |
        | ERROR        |

    @acceptance-criteria @validation
    Scenario: Messages below INFO level are filtered out
      Given the configured log level is "INFO"
      Then shouldLog returns false for levels:
        | messageLevel |
        | DEBUG        |
        | TRACE        |

    @acceptance-criteria @happy-path
    Scenario: DEBUG configured level allows all messages
      Given the configured log level is "DEBUG"
      Then shouldLog returns true for levels:
        | messageLevel |
        | DEBUG        |
        | TRACE        |
        | INFO         |
        | REPORT       |
        | WARN         |
        | ERROR        |

    @acceptance-criteria @validation
    Scenario: ERROR configured level only allows ERROR
      Given the configured log level is "ERROR"
      Then shouldLog returns false for levels:
        | messageLevel |
        | DEBUG        |
        | TRACE        |
        | INFO         |
        | REPORT       |
        | WARN         |
      And shouldLog returns true for level "ERROR"

    @acceptance-criteria @validation
    Scenario: WARN configured level allows WARN and ERROR only
      Given the configured log level is "WARN"
      Then shouldLog returns false for levels:
        | messageLevel |
        | DEBUG        |
        | TRACE        |
        | INFO         |
        | REPORT       |
      And shouldLog returns true for levels at WARN and above:
        | messageLevel |
        | WARN         |
        | ERROR        |
