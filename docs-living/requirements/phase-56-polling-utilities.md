# ✅ Polling Utilities

**Purpose:** Detailed requirements for the Polling Utilities feature

---

## Overview

| Property       | Value                                   |
| -------------- | --------------------------------------- |
| Status         | completed                               |
| Product Area   | PlatformCore                            |
| Business Value | enable async condition waiting in tests |
| Phase          | 56                                      |

## Description

As a developer writing integration tests
I want async polling utilities
So that I can wait for eventual consistency patterns

The polling module provides utilities for waiting on async conditions,
essential when testing projections processed via Workpool or other
eventually consistent patterns.

## Acceptance Criteria

**Sleep for specified duration**

- When I call sleep(50)
- Then the function resolves after approximately 50ms
- And no error is thrown

**Sleep returns a promise**

- When I call sleep(10)
- Then I receive a Promise
- And I can await the result

**waitUntil returns truthy result immediately**

- Given a check function that returns truthy on first call
- When I call waitUntil with the check function
- Then I receive the truthy value
- And the check was called once

**waitUntil polls until condition is met**

- Given a check function that returns truthy after 3 calls
- When I call waitUntil with the check function
- Then I receive the truthy value
- And the check was called 3 times

**waitUntil throws on timeout**

- Given a check function that always returns falsy
- When I call waitUntil with timeoutMs 100 and pollIntervalMs 20
- Then an error is thrown with message containing "within 100ms"

**waitUntil uses custom timeout message**

- Given a check function that always returns falsy
- When I call waitUntil with message "Order to be confirmed"
- Then an error is thrown with message containing "Order to be confirmed"

**waitUntil respects pollIntervalMs**

- Given a check function that tracks call timestamps
- When I call waitUntil with pollIntervalMs 50
- Then calls are spaced approximately 50ms apart

**waitFor resolves when predicate returns true**

- Given a predicate that returns true after 2 calls
- When I call waitFor with the predicate
- Then the function resolves without error
- And the predicate was called 2 times

**waitFor throws on timeout**

- Given a predicate that always returns false
- When I call waitFor with timeoutMs 100
- Then an error is thrown with message containing "100ms"

**Default timeout is 30 seconds**

- Then DEFAULT_TIMEOUT_MS equals 30000

**Default poll interval is 100ms**

- Then DEFAULT_POLL_INTERVAL_MS equals 100

## Deliverables

- sleep() function (Complete)
- waitUntil() polling utility (Complete)
- waitFor() boolean predicate polling (Complete)
- DEFAULT_TIMEOUT_MS constant (Complete)
- DEFAULT_POLL_INTERVAL_MS constant (Complete)
- Behavior test feature file (Complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
