@libar-docs
Feature: Logging Testing Utilities

  As a platform developer
  I want mock loggers for testing
  So that I can assert on log output without real console side effects

  # ============================================================================
  # createMockLogger - Basic Functionality
  # ============================================================================

  Rule: createMockLogger captures all log method calls with metadata

    **Invariant:** Every log method call is recorded with level, message, data, and timestamp.
    **Verified by:** Calling all 6 log methods and inspecting captured calls.

    @acceptance-criteria @happy-path
    Scenario: All six log method calls are captured
      Given a fresh mock logger
      When I log one message at each level
      Then the logger should have captured 6 calls

    @acceptance-criteria @validation
    Scenario: Each call records the correct log level
      Given a fresh mock logger
      When I log one message at each level
      Then each call has the correct level:
        | index | level  |
        | 0     | DEBUG  |
        | 1     | TRACE  |
        | 2     | INFO   |
        | 3     | REPORT |
        | 4     | WARN   |
        | 5     | ERROR  |

    Scenario: Message text is captured correctly
      Given a fresh mock logger
      When I log an info message "Test message"
      Then the first call message should be "Test message"

    Scenario: Structured data is captured correctly
      Given a fresh mock logger
      When I log an info message with data key "value" and count 42
      Then the first call data should contain key "value" and count 42

    Scenario: Data is undefined when not provided
      Given a fresh mock logger
      When I log an info message "No data"
      Then the first call data should be undefined

    Scenario: Timestamp is captured within bounds
      Given a fresh mock logger
      When I log an info message with timestamp tracking
      Then the first call timestamp should be within the tracked bounds

  # ============================================================================
  # createMockLogger - clear()
  # ============================================================================

  Rule: clear() resets the captured calls array

    **Invariant:** After clear(), the calls array is empty regardless of prior state.
    **Verified by:** Logging messages, clearing, and checking length is 0.

    @acceptance-criteria @happy-path
    Scenario: Clearing resets calls to empty
      Given a fresh mock logger
      When I log 2 info messages and then clear
      Then the logger should have captured 0 calls

  # ============================================================================
  # createMockLogger - getCallsAtLevel()
  # ============================================================================

  Rule: getCallsAtLevel filters captured calls by log level

    **Invariant:** Only calls matching the requested level are returned.
    **Verified by:** Logging at mixed levels and filtering by each.

    @acceptance-criteria @happy-path
    Scenario: Calls are filtered by level correctly
      Given a fresh mock logger
      When I log "Debug 1" at DEBUG, "Info 1" at INFO, "Debug 2" at DEBUG, and "Error 1" at ERROR
      Then getCallsAtLevel returns the correct counts:
        | level | count |
        | DEBUG | 2     |
        | INFO  | 1     |
        | ERROR | 1     |
        | WARN  | 0     |

  # ============================================================================
  # createMockLogger - hasLoggedMessage()
  # ============================================================================

  Rule: hasLoggedMessage finds messages by partial text match

    **Invariant:** Returns true if any captured message contains the search string.
    **Verified by:** Partial match, exact match, and non-match assertions.

    @acceptance-criteria @happy-path
    Scenario: Partial and exact message matching
      Given a fresh mock logger
      When I log "Command executed successfully" at INFO and "Command failed with error" at WARN
      Then hasLoggedMessage returns the expected results:
        | search     | expected |
        | executed   | true     |
        | failed     | true     |
        | not logged | false    |

    Scenario: Exact message match works
      Given a fresh mock logger
      When I log an info message "Exact message"
      Then hasLoggedMessage for "Exact message" returns true

  # ============================================================================
  # createMockLogger - hasLoggedAt()
  # ============================================================================

  Rule: hasLoggedAt checks both level and message text together

    **Invariant:** Returns true only when both the level and partial message match.
    **Verified by:** Cross-checking level/message combinations.

    @acceptance-criteria @happy-path
    Scenario: Level and message must both match
      Given a fresh mock logger
      When I log "Info message" at INFO and "Error message" at ERROR
      Then hasLoggedAt returns the expected results:
        | level | search | expected |
        | INFO  | Info   | true     |
        | ERROR | Info   | false    |
        | INFO  | Error  | false    |
        | ERROR | Error  | true     |

  # ============================================================================
  # createMockLogger - getLastCallAt()
  # ============================================================================

  Rule: getLastCallAt returns the most recent call at a specific level

    **Invariant:** Returns the last captured call at the given level, or undefined if none.
    **Verified by:** Multiple calls at same level and missing level checks.

    @acceptance-criteria @happy-path
    Scenario: Returns the last call at a given level
      Given a fresh mock logger
      When I log "First info", "Second info", and "Third info" at INFO
      Then getLastCallAt INFO should have message "Third info"

    @acceptance-criteria @validation
    Scenario: Returns undefined when no calls at level
      Given a fresh mock logger
      When I log an info message "Info message"
      Then getLastCallAt ERROR should be undefined

  # ============================================================================
  # createMockLogger - calls readonly array
  # ============================================================================

  Rule: calls property returns consistent array references

    **Invariant:** Multiple accesses to calls return equal content.
    **Verified by:** Comparing two accesses to the calls property.

    @acceptance-criteria @happy-path
    Scenario: Multiple accesses return equal arrays
      Given a fresh mock logger
      When I log an info message "Test"
      Then two accesses to the calls property should be equal

  # ============================================================================
  # createFilteredMockLogger - Level Filtering
  # ============================================================================

  Rule: createFilteredMockLogger only captures logs at or above minimum level

    **Invariant:** Calls below the configured minimum level are silently discarded.
    **Verified by:** Logging at all levels with various minimum configurations.

    @acceptance-criteria @happy-path
    Scenario: INFO minimum captures INFO, REPORT, WARN, ERROR only
      Given a filtered mock logger with minimum level "INFO"
      When I log one message at each level on the filtered logger
      Then the filtered logger should have captured 4 calls
      And the filtered logger getCallsAtLevel returns:
        | level  | count |
        | DEBUG  | 0     |
        | TRACE  | 0     |
        | INFO   | 1     |
        | REPORT | 1     |
        | WARN   | 1     |
        | ERROR  | 1     |

    Scenario: DEBUG minimum captures all 6 levels
      Given a filtered mock logger with minimum level "DEBUG"
      When I log one message at each level on the filtered logger
      Then the filtered logger should have captured 6 calls

    Scenario: ERROR minimum captures only ERROR
      Given a filtered mock logger with minimum level "ERROR"
      When I log one message at each level on the filtered logger
      Then the filtered logger should have captured 1 calls
      And the filtered logger first call level should be "ERROR"

    Scenario: WARN minimum captures WARN and ERROR
      Given a filtered mock logger with minimum level "WARN"
      When I log one message at each level on the filtered logger
      Then the filtered logger should have captured 2 calls
      And the filtered logger getCallsAtLevel returns:
        | level | count |
        | WARN  | 1     |
        | ERROR | 1     |

  # ============================================================================
  # createFilteredMockLogger - Helper Methods
  # ============================================================================

  Rule: Filtered logger helper methods respect the minimum level filter

    **Invariant:** clear, hasLoggedMessage, and other helpers operate on filtered calls only.
    **Verified by:** Exercising helpers after logging above and below minimum.

    @acceptance-criteria @happy-path
    Scenario: Clear resets filtered calls
      Given a filtered mock logger with minimum level "INFO"
      When I log an info and a debug message on the filtered logger and then clear
      Then the filtered logger should have captured 0 calls

    @acceptance-criteria @validation
    Scenario: hasLoggedMessage only searches filtered calls
      Given a filtered mock logger with minimum level "WARN"
      When I log "Info message" at INFO and "Warning message" at WARN on the filtered logger
      Then filtered hasLoggedMessage returns:
        | search  | expected |
        | Info    | false    |
        | Warning | true     |
