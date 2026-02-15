Feature: Pattern Detection Framework

  Pure functions for pattern detection including duration parsing,
  schema validation, pattern definition validation, window boundary
  calculations, event filtering, minimum event checks, and
  composable pattern trigger factories.

  Background:
    Given the module is imported from platform-core

  Rule: Error codes are defined as a complete enumeration
    **Invariant:** PATTERN_ERROR_CODES contains exactly 6 named error codes
    **Verified by:** Scenario checking all error code values and total count

    @acceptance-criteria @happy-path
    Scenario: Error codes contain all expected values
      Then the error codes contain the following entries:
        | code                    | value                   |
        | TRIGGER_REQUIRED        | TRIGGER_REQUIRED        |
        | PATTERN_NAME_REQUIRED   | PATTERN_NAME_REQUIRED   |
        | INVALID_MIN_EVENTS      | INVALID_MIN_EVENTS      |
        | INVALID_DURATION_FORMAT | INVALID_DURATION_FORMAT |
        | INVALID_EVENT_LIMIT     | INVALID_EVENT_LIMIT     |
        | INVALID_LOAD_BATCH_SIZE | INVALID_LOAD_BATCH_SIZE |
      And the error codes object has exactly 6 keys

  Rule: PatternWindowSchema validates window configuration via Zod
    **Invariant:** PatternWindowSchema accepts valid windows and rejects invalid ones
    **Verified by:** Scenarios covering valid minimal, valid full, and several rejection cases

    Scenario: Accepts valid window with duration only
      When I parse a window with duration "7d"
      Then the schema parse succeeds

    Scenario: Accepts window with all optional fields
      When I parse a window with duration "7d" eventLimit 100 minEvents 5 loadBatchSize 50
      Then the schema parse succeeds

    Scenario: Rejects window with empty duration
      When I parse a window with duration ""
      Then the schema parse fails

    Scenario: Rejects window with missing duration
      When I parse a window with no duration
      Then the schema parse fails

    Scenario: Rejects window with non-positive eventLimit
      When I parse a window with duration "7d" and eventLimit 0
      Then the schema parse fails

    Scenario: Rejects window with negative eventLimit
      When I parse a window with duration "7d" and eventLimit -10
      Then the schema parse fails

    Scenario: Rejects window with non-positive minEvents
      When I parse a window with duration "7d" and minEvents 0
      Then the schema parse fails

    Scenario: Rejects window with non-positive loadBatchSize
      When I parse a window with duration "7d" and loadBatchSize 0
      Then the schema parse fails

    Scenario: Rejects window with non-integer eventLimit
      When I parse a window with duration "7d" and eventLimit 50.5
      Then the schema parse fails

  Rule: Duration parsing converts duration strings to milliseconds
    **Invariant:** parseDuration returns correct milliseconds for valid formats and null for invalid
    **Verified by:** Scenarios covering days, hours, minutes, case insensitivity, invalid formats, and whitespace

    Scenario: Parses days format correctly
      Then parseDuration returns expected milliseconds for:
        | input | expectedMs |
        | 7d    | 604800000  |
        | 1d    | 86400000   |
        | 30d   | 2592000000 |
        | 365d  | 31536000000 |

    Scenario: Parses hours format correctly
      Then parseDuration returns expected milliseconds for:
        | input | expectedMs |
        | 24h   | 86400000   |
        | 1h    | 3600000    |
        | 12h   | 43200000   |
        | 48h   | 172800000  |

    Scenario: Parses minutes format correctly
      Then parseDuration returns expected milliseconds for:
        | input | expectedMs |
        | 30m   | 1800000    |
        | 1m    | 60000      |
        | 60m   | 3600000    |
        | 120m  | 7200000    |

    Scenario: Handles uppercase units
      Then parseDuration returns expected milliseconds for:
        | input | expectedMs |
        | 7D    | 604800000  |
        | 24H   | 86400000   |
        | 30M   | 1800000    |

    Scenario: Returns null for invalid formats
      Then parseDuration returns null for:
        | input   |
        |         |
        | 24      |
        | d       |
        | h       |
        | m       |
        | 60s     |
        | 1w      |
        | 1y      |
        | invalid |
        | abc     |
        | h24     |
        | 0d      |
        | 0h      |
        | 0m      |
        | -7d     |
        | -24h    |
        | 7.5d    |
        | 24.5h   |

    Scenario: Trims leading and trailing whitespace
      Then parseDuration returns expected milliseconds for:
        | input  | expectedMs |
        |  7d    | 604800000  |
        |   24h  | 86400000   |

  Rule: isValidDuration checks format validity
    **Invariant:** isValidDuration returns true for valid and false for invalid duration strings
    **Verified by:** Scenario covering valid and invalid inputs

    Scenario: Returns true for valid duration formats
      Then isValidDuration returns true for:
        | input |
        | 7d    |
        | 24h   |
        | 30m   |

    Scenario: Returns false for invalid duration formats
      Then isValidDuration returns false for:
        | input   |
        |         |
        | invalid |
        | 0d      |
        | 60s     |

  Rule: Pattern definition validation catches invalid configurations
    **Invariant:** validatePatternDefinition returns valid=false with appropriate error codes for invalid inputs
    **Verified by:** Scenarios covering name, trigger, window, and valid definition cases

    Scenario: Returns invalid when name is missing
      When I validate a pattern with no name
      Then the validation result is invalid with code "PATTERN_NAME_REQUIRED"

    Scenario: Returns invalid when name is empty string
      When I validate a pattern with name ""
      Then the validation result is invalid with code "PATTERN_NAME_REQUIRED"

    Scenario: Returns invalid when name is whitespace only
      When I validate a pattern with name "   "
      Then the validation result is invalid with code "PATTERN_NAME_REQUIRED"

    Scenario: Returns invalid when trigger is missing
      When I validate a pattern with no trigger
      Then the validation result is invalid with code "TRIGGER_REQUIRED"

    Scenario: Returns invalid when trigger is not a function
      When I validate a pattern with trigger as a non-function
      Then the validation result is invalid with code "TRIGGER_REQUIRED"

    Scenario: Returns invalid when duration format is invalid
      When I validate a pattern with duration "invalid"
      Then the validation result is invalid with code "INVALID_DURATION_FORMAT"

    Scenario: Returns invalid when duration is empty
      When I validate a pattern with duration ""
      Then the validation result is invalid with code "INVALID_DURATION_FORMAT"

    Scenario: Returns invalid when eventLimit is non-positive
      When I validate a pattern with eventLimit 0
      Then the validation result is invalid with code "INVALID_EVENT_LIMIT"

    Scenario: Returns invalid when eventLimit is negative
      When I validate a pattern with eventLimit -10
      Then the validation result is invalid

    Scenario: Returns invalid when eventLimit is not an integer
      When I validate a pattern with eventLimit 50.5
      Then the validation result is invalid

    Scenario: Returns invalid when minEvents is non-positive
      When I validate a pattern with minEvents 0
      Then the validation result is invalid with code "INVALID_MIN_EVENTS"

    Scenario: Returns invalid when loadBatchSize is non-positive
      When I validate a pattern with loadBatchSize 0
      Then the validation result is invalid with code "INVALID_LOAD_BATCH_SIZE"

    Scenario: Returns valid for minimal definition
      When I validate a pattern with name "test-pattern" and duration "7d" and a trigger
      Then the validation result is valid

    Scenario: Returns valid for complete definition
      When I validate a complete test pattern definition
      Then the validation result is valid

    Scenario: Returns valid for definition with all window options
      When I validate a pattern with all window options
      Then the validation result is valid

  Rule: definePattern factory validates and returns definitions
    **Invariant:** definePattern returns the definition when valid and throws with error codes when invalid
    **Verified by:** Scenarios covering valid return, and error throwing for invalid name, trigger, and duration

    Scenario: Returns the definition when valid
      When I define a valid test pattern
      Then the returned definition is the same object

    Scenario: Throws error when name is missing
      Then definePattern with empty name throws "Pattern name is required"

    Scenario: Throws error when trigger is missing
      Then definePattern with no trigger throws "Pattern trigger function is required"

    Scenario: Throws error when duration is invalid
      Then definePattern with duration "invalid" throws "Duration must be in format"

    Scenario: Includes error code in thrown error message
      Then definePattern with empty name throws "PATTERN_NAME_REQUIRED"

  Rule: Window boundary calculation subtracts parsed duration from now
    **Invariant:** calculateWindowBoundary(window, now) === now - parseDuration(window.duration)
    **Verified by:** Scenarios covering days, hours, minutes, default now, and invalid duration

    Scenario: Calculates boundary for days
      When I calculate the window boundary for "7d" at timestamp 1000000000
      Then the boundary is 1000000000 minus 7 days in milliseconds

    Scenario: Calculates boundary for hours
      When I calculate the window boundary for "24h" at timestamp 1000000000
      Then the boundary is 1000000000 minus 24 hours in milliseconds

    Scenario: Calculates boundary for minutes
      When I calculate the window boundary for "30m" at timestamp 1000000000
      Then the boundary is 1000000000 minus 30 minutes in milliseconds

    Scenario: Uses Date.now when now is not provided
      When I calculate the window boundary for "7d" without providing now
      Then the boundary is approximately Date.now minus 7 days

    Scenario: Throws error for invalid duration format
      Then calculateWindowBoundary with duration "invalid" throws "Invalid duration format"

  Rule: Event filtering applies time window and optional event limit
    **Invariant:** filterEventsInWindow returns only events with timestamp >= boundary, limited by eventLimit
    **Verified by:** Scenarios covering inclusion, exclusion, boundary edge, limit, empty results

    Scenario: Includes events within the window
      Given events at offsets 100 and 200 from the 1h boundary at timestamp 1000000000
      When I filter events in a 1h window at timestamp 1000000000
      Then 2 events are returned

    Scenario: Excludes events outside the window
      Given events at offsets -100 and 100 from the 1h boundary at timestamp 1000000000
      When I filter events in a 1h window at timestamp 1000000000
      Then 1 event is returned with eventId "evt2"

    Scenario: Includes events exactly at the boundary
      Given an event exactly at the 1h boundary at timestamp 1000000000
      When I filter events in a 1h window at timestamp 1000000000
      Then 1 event is returned

    Scenario: Applies event limit and takes most recent
      Given 3 events at offsets 100 200 300 from the 1h boundary at timestamp 1000000000
      When I filter events in a 1h window with eventLimit 2 at timestamp 1000000000
      Then 2 events are returned containing eventIds "evt2" and "evt3"

    Scenario: Does not limit when under event limit
      Given events at offsets 100 and 200 from the 1h boundary at timestamp 1000000000
      When I filter events in a 1h window with eventLimit 10 at timestamp 1000000000
      Then 2 events are returned

    Scenario: Returns empty array when no events match
      Given events at offsets -1000 and -2000 from the 1h boundary at timestamp 1000000000
      When I filter events in a 1h window at timestamp 1000000000
      Then 0 events are returned

    Scenario: Handles empty events array
      When I filter an empty array in a 1h window at timestamp 1000000000
      Then 0 events are returned

  Rule: hasMinimumEvents checks count against window minEvents
    **Invariant:** hasMinimumEvents returns true when events.length >= (window.minEvents or 1)
    **Verified by:** Scenarios covering meets, exceeds, below, default, and empty

    Scenario: Returns true when events count meets minEvents
      Then hasMinimumEvents with 3 events and minEvents 3 is true

    Scenario: Returns true when events count exceeds minEvents
      Then hasMinimumEvents with 3 events and minEvents 2 is true

    Scenario: Returns false when events count is below minEvents
      Then hasMinimumEvents with 2 events and minEvents 5 is false

    Scenario: Defaults to minEvents of 1
      Then hasMinimumEvents with 1 event and no minEvents is true

    Scenario: Returns false for empty events when minEvents is default
      Then hasMinimumEvents with 0 events and no minEvents is false

  Rule: countThreshold trigger fires when event count meets threshold
    **Invariant:** countThreshold(n) returns true when events.length >= n
    **Verified by:** Scenarios covering meets, exceeds, and below threshold

    Scenario: Returns true when event count meets threshold
      Then countThreshold 3 with 3 events returns true

    Scenario: Returns true when event count exceeds threshold
      Then countThreshold 2 with 3 events returns true

    Scenario: Returns false when event count is below threshold
      Then countThreshold 5 with 2 events returns false

  Rule: eventTypePresent trigger checks for specific event types
    **Invariant:** eventTypePresent returns true when at least minCount events of specified types exist
    **Verified by:** Scenarios covering present, absent, multiple types, and minCount

    Scenario: Returns true when event type is present
      Given events with types "OrderCreated" and "OrderCancelled"
      When I check eventTypePresent for "OrderCancelled"
      Then the trigger returns true

    Scenario: Returns false when event type is not present
      Given events with types "OrderCreated" and "OrderShipped"
      When I check eventTypePresent for "OrderCancelled"
      Then the trigger returns false

    Scenario: Returns true when any of multiple event types is present
      Given events with types "OrderRefunded"
      When I check eventTypePresent for "OrderCancelled" or "OrderRefunded"
      Then the trigger returns true

    Scenario: Respects minCount parameter
      Given 2 events of type "OrderCancelled"
      When I check eventTypePresent for "OrderCancelled" with minCount 3
      Then the trigger returns false

    Scenario: Returns true when minCount is met
      Given 3 events of type "OrderCancelled"
      When I check eventTypePresent for "OrderCancelled" with minCount 3
      Then the trigger returns true

  Rule: multiStreamPresent trigger checks for events from distinct streams
    **Invariant:** multiStreamPresent(n) returns true when unique stream count >= n
    **Verified by:** Scenarios covering meets, below, and duplicate streams

    Scenario: Returns true when minimum streams are present
      Given events from streams "stream-1" and "stream-2"
      When I check multiStreamPresent with minimum 2
      Then the trigger returns true

    Scenario: Returns false when below minimum streams
      Given events from streams "stream-1" and "stream-2"
      When I check multiStreamPresent with minimum 3
      Then the trigger returns false

    Scenario: Counts unique streams correctly
      Given 3 events all from stream "stream-1"
      When I check multiStreamPresent with minimum 2
      Then the trigger returns false

  Rule: PatternTriggers.all combines triggers with AND logic
    **Invariant:** all() returns true only when every trigger returns true
    **Verified by:** Scenarios covering all-true, any-false, none-true, empty, and event passing

    Scenario: Returns true when ALL triggers match
      Then all() with two true triggers returns true

    Scenario: Returns false when ANY trigger does not match
      Then all() with one true and one false trigger returns false

    Scenario: Returns false when NO triggers match
      Then all() with two false triggers returns false

    Scenario: Returns true for empty triggers array
      Then all() with no triggers returns true

    Scenario: Passes events to each trigger
      Then all() passes the events array to each trigger

  Rule: PatternTriggers.any combines triggers with OR logic
    **Invariant:** any() returns true when at least one trigger returns true
    **Verified by:** Scenarios covering any-true, all-true, none-true, empty, and short-circuit

    Scenario: Returns true when ANY trigger matches
      Then any() with one false and one true trigger returns true

    Scenario: Returns true when ALL triggers match
      Then any() with two true triggers returns true

    Scenario: Returns false when NO triggers match
      Then any() with two false triggers returns false

    Scenario: Returns false for empty triggers array
      Then any() with no triggers returns false

    Scenario: Short-circuits on first match
      Then any() calls the first trigger

  Rule: Complex trigger combinations compose correctly
    **Invariant:** Nested all/any with countThreshold and eventTypePresent yield correct results
    **Verified by:** Scenarios covering all+count+type and any+count+type combinations

    Scenario: Combines count threshold with event type using all
      Given 3 events where one is "OrderCancelled"
      When I check all(countThreshold 3, eventTypePresent "OrderCancelled")
      Then the trigger returns true

    Scenario: Fails all when event type missing despite count met
      Given 3 events with no "OrderCancelled"
      When I check all(countThreshold 3, eventTypePresent "OrderCancelled")
      Then the trigger returns false

    Scenario: Combines any with count thresholds - alert present
      Given 5 events where first is "HighPriorityAlert"
      When I check any(countThreshold 10, eventTypePresent "HighPriorityAlert")
      Then the trigger returns true

    Scenario: Combines any with count thresholds - neither condition met
      Given 5 regular events
      When I check any(countThreshold 10, eventTypePresent "HighPriorityAlert")
      Then the trigger returns false
