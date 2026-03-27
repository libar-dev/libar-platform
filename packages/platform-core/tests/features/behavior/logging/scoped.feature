@architect
Feature: Scoped Logger

  As a platform developer
  I want scoped loggers that prefix messages and filter by level
  So that I can organize and control logging output per component

  # ============================================================================
  # createScopedLogger - Message Formatting
  # ============================================================================

  Rule: createScopedLogger prefixes messages with the scope name

    **Invariant:** All log output includes the scope name in square brackets.
    **Verified by:** Console mock assertions on formatted output strings.

    @acceptance-criteria @happy-path
    Scenario: Messages are prefixed with scope
      Given a scoped logger "TestScope" at level "DEBUG"
      When I log an info message "Test message"
      Then console.info was called with "[TestScope] Test message"

    @acceptance-criteria @happy-path
    Scenario: Data object is appended as JSON
      Given a scoped logger "TestScope" at level "DEBUG"
      When I log an info message "Test message" with data '{"key":"value"}'
      Then console.info was called with '[TestScope] Test message {"key":"value"}'

    @acceptance-criteria @validation
    Scenario: Empty data object is omitted from output
      Given a scoped logger "TestScope" at level "DEBUG"
      When I log an info message "Test message" with empty data
      Then console.info was called with "[TestScope] Test message"

  # ============================================================================
  # createScopedLogger - Level Filtering
  # ============================================================================

  Rule: createScopedLogger filters messages below the configured log level

    **Invariant:** Only messages at or above the configured level reach the console.
    **Verified by:** Console mock called/not-called assertions per level.

    @acceptance-criteria @happy-path
    Scenario: DEBUG level allows debug messages
      Given a scoped logger "Test" at level "DEBUG"
      When I log a debug message "Debug message"
      Then console.debug was called

    @acceptance-criteria @validation
    Scenario: INFO level suppresses debug messages
      Given a scoped logger "Test" at level "INFO"
      When I log a debug message "Debug message"
      Then console.debug was not called

    @acceptance-criteria @happy-path
    Scenario: INFO level allows info messages
      Given a scoped logger "Test" at level "INFO"
      When I log an info message "Info message"
      Then console.info was called

    @acceptance-criteria @happy-path
    Scenario: INFO level allows warn messages
      Given a scoped logger "Test" at level "INFO"
      When I log a warn message "Warn message"
      Then console.warn was called

    @acceptance-criteria @happy-path
    Scenario: ERROR level allows error messages
      Given a scoped logger "Test" at level "ERROR"
      When I log an error message "Error message"
      Then console.error was called

    @acceptance-criteria @happy-path
    Scenario: Default level is INFO when not specified
      Given a scoped logger "Test" with no explicit level
      When I log a debug message "Debug message" and an info message "Info message"
      Then console.debug was not called
      And console.info was called

  # ============================================================================
  # createScopedLogger - Console Method Mapping
  # ============================================================================

  Rule: createScopedLogger maps each log level to the correct console method

    **Invariant:** Each log level dispatches to its corresponding console method.
    **Verified by:** Per-method console mock assertions.

    @acceptance-criteria @happy-path
    Scenario: Each log level uses its corresponding console method
      Given a scoped logger "Test" at level "DEBUG"
      Then logging at each level calls the correct console method:
        | logLevel | consoleMethod |
        | debug    | debug         |
        | info     | info          |
        | warn     | warn          |
        | error    | error         |

    @acceptance-criteria @happy-path
    Scenario: Report level outputs structured JSON via console.log
      Given a scoped logger "Test" at level "DEBUG"
      When I log a report "Metrics" with data '{"count":10}'
      Then console.log was called with structured JSON containing:
        | field     | value   |
        | scope     | Test    |
        | message   | Metrics |
        | count     | 10      |
        | timestamp | defined |

  # ============================================================================
  # createScopedLogger - Trace Level with Timing
  # ============================================================================

  Rule: Trace level supports console timing via the timing data field

    **Invariant:** Trace with timing "start" calls console.time; "end" calls console.timeEnd; otherwise falls back to console.debug.
    **Verified by:** Console.time/timeEnd mock assertions.

    @acceptance-criteria @happy-path
    Scenario: Timing start uses console.time
      Given a scoped logger "Test" at level "DEBUG"
      When I log a trace "Operation" with timing "start"
      Then console.time was called with "[Test] Operation"

    @acceptance-criteria @happy-path
    Scenario: Timing end uses console.timeEnd
      Given a scoped logger "Test" at level "DEBUG"
      When I log a trace "Operation" with timing "end"
      Then console.timeEnd was called with "[Test] Operation"

    @acceptance-criteria @validation
    Scenario: Regular trace without timing uses console.debug
      Given a scoped logger "Test" at level "DEBUG"
      When I log a trace "Trace message" with data '{"data":"value"}'
      Then console.debug was called
      And console.time was not called
      And console.timeEnd was not called

  # ============================================================================
  # createPlatformNoOpLogger
  # ============================================================================

  Rule: createPlatformNoOpLogger produces a logger that discards all output

    **Invariant:** No console method is ever called by a no-op logger.
    **Verified by:** All console mocks assert not-called after invoking every level.

    @acceptance-criteria @happy-path
    Scenario: No-op logger does not call any console methods
      Given a no-op logger
      When I invoke all log levels on the no-op logger
      Then no console methods were called:
        | method |
        | debug  |
        | info   |
        | warn   |
        | error  |
        | log    |

    @acceptance-criteria @validation
    Scenario: No-op logger implements the full Logger interface
      Given a no-op logger
      Then the no-op logger has all required methods:
        | method |
        | debug  |
        | trace  |
        | info   |
        | report |
        | warn   |
        | error  |

  # ============================================================================
  # createChildLogger
  # ============================================================================

  Rule: createChildLogger combines parent and child scopes with colon separator

    **Invariant:** Child logger scope is "Parent:Child" and respects the configured level.
    **Verified by:** Console mock assertions on formatted scope prefix.

    @acceptance-criteria @happy-path
    Scenario: Child logger prefixes with combined scope
      Given a child logger with parent "Parent" and child "Child" at level "DEBUG"
      When I log an info message "Test" on the child logger
      Then console.info was called with "[Parent:Child] Test"

    @acceptance-criteria @validation
    Scenario: Child logger respects provided log level
      Given a child logger with parent "Parent" and child "Child" at level "WARN"
      When I log an info message "Info" on the child logger
      And I log a warn message "Warn" on the child logger
      Then console.info was not called
      And console.warn was called

    @acceptance-criteria @happy-path
    Scenario: Child logger defaults to INFO level
      Given a child logger with parent "Parent" and child "Child" with no explicit level
      When I log a debug message "Debug" on the child logger
      And I log an info message "Info" on the child logger
      Then console.debug was not called
      And console.info was called
