# ✅ Test Environment Guards

**Purpose:** Detailed requirements for the Test Environment Guards feature

---

## Overview

| Property       | Value                                |
| -------------- | ------------------------------------ |
| Status         | completed                            |
| Product Area   | PlatformCore                         |
| Business Value | prevent test utilities in production |
| Phase          | 58                                   |

## Description

As a platform developer
I want environment guards for test-only functions
So that test utilities cannot be called in production

The guards module provides security functions that prevent test-only
utilities (like createTestEntity) from being called in production.
This is critical for preventing accidental data manipulation in
live environments.

## Acceptance Criteria

**Allow execution when **CONVEX_TEST_MODE** is true**

- Given globalThis.**CONVEX_TEST_MODE** is true
- When I call ensureTestEnvironment()
- Then no error is thrown

**Allow execution when IS_TEST env is set**

- Given process.env.IS_TEST is "true"
- When I call ensureTestEnvironment()
- Then no error is thrown

**Allow execution when process is undefined**

- Given process is undefined
- When I call ensureTestEnvironment()
- Then no error is thrown

**Allow execution in self-hosted environment**

- Given process.env exists
- And CONVEX_CLOUD_URL is not set
- When I call ensureTestEnvironment()
- Then no error is thrown

**Block execution in cloud production**

- Given process.env.CONVEX_CLOUD_URL is set
- And IS_TEST is not set
- And **CONVEX_TEST_MODE** is not true
- When I call ensureTestEnvironment()
- Then an error is thrown with message containing "SECURITY"
- And the error message contains "Test-only function"

**isTestEnvironment returns true in test mode**

- Given globalThis.**CONVEX_TEST_MODE** is true
- When I call isTestEnvironment()
- Then I receive true

**isTestEnvironment returns true with IS_TEST env**

- Given process.env.IS_TEST is "true"
- When I call isTestEnvironment()
- Then I receive true

**isTestEnvironment returns false in production**

- Given process.env.CONVEX_CLOUD_URL is set
- And IS_TEST is not set
- When I call isTestEnvironment()
- Then I receive false

**isTestEnvironment is a safe boolean check**

- When I call isTestEnvironment()
- Then I receive a boolean value
- And no error is ever thrown from this function

## Deliverables

- ensureTestEnvironment() guard (Complete)
- isTestEnvironment() check (Complete)
- Production detection logic (Complete)
- Behavior test feature file (Complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
