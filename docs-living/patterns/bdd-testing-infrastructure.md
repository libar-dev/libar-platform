# ✅ Bdd Testing Infrastructure

**Purpose:** Detailed documentation for the Bdd Testing Infrastructure pattern

---

## Overview

| Property | Value     |
| -------- | --------- |
| Status   | completed |
| Category | DDD       |
| Phase    | 19        |

## Description

**Problem:** Domain logic tests require infrastructure (Docker, database).
Duplicate step definitions cause conflicts. Platform packages lack BDD tests.

**Solution:** Behavior-Driven Development using Gherkin as exclusive testing approach:

- Pure deciders map perfectly to Given/When/Then
- No Docker needed for domain logic tests
- Living documentation for domain experts
- Step definition organization prevents conflicts

**Why It Matters for Convex-Native ES:**
| Benefit | How |
| Living documentation | Feature files describe behavior in business terms |
| No infrastructure overhead | Pure deciders test without Docker/database |
| Domain expert readability | Gherkin scenarios are human-readable specs |
| Step reuse | Organized step definitions prevent conflicts |
| Fast feedback | Unit-level BDD tests run in milliseconds |

**Key Concepts:**
| Concept | Description |
| Pure Deciders | Business logic in pure functions enables infrastructure-free testing |
| Step Organization | Separate files per domain prevent pattern conflicts |
| Docker Restart | Clean state pattern for integration tests |
| Test Namespace | Unique prefix per test prevents entity collisions |
| Given/When/Then | State → Command → Outcome mapping for deciders |

**Migration from .test.ts to .feature:**
| From | To |
| describe/it blocks with expect assertions | Scenario with Given/When/Then steps |
| decideSubmitOrder(null, command, context) | Given no existing order, When SubmitOrder command |
| expect(result.isSuccess).toBe(true) | Then the result should be success |
| expect(result.event.type).toBe(...) | And OrderSubmitted event should be emitted |

## Dependencies

- Depends on: DeciderPattern

## Acceptance Criteria

**Decider test follows BDD pattern**

- Given a decider for "SubmitOrder"
- When writing tests for the decider
- Then tests must be in .feature file format
- And steps must use Given (state) / When (command) / Then (outcome)

**Decider test requires no infrastructure**

- Given a pure decider function
- When running the test
- Then no database connection should be needed
- And no Docker containers should be required
- And test should complete in under 100ms

**Step definitions are domain-scoped**

- Given step definitions for "orders" domain
- And step definitions for "inventory" domain
- When both are loaded
- Then no pattern conflicts should occur
- And each domain has its own step file

**Duplicate step patterns cause conflict error**

- Given step definitions with pattern "Given an order"
- And another step file with same pattern "Given an order"
- When both are loaded
- Then vitest-cucumber should report pattern conflict
- And error should identify the duplicate pattern

**Integration test validates command lifecycle**

- Given a system with unique test namespace
- When I execute "SubmitOrder" command
- Then the command should succeed
- And projection should reflect submitted state
- And event should be in event store

**Platform package has feature tests**

- Given @libar-dev/platform-decider package
- When checking test coverage
- Then tests/features/ directory should exist
- And public API behaviors should have scenarios

## Business Rules

**All domain logic tests must be Gherkin**

Deciders, FSM, invariants use Given/When/Then format exclusively.

_Verified by: Decider test follows BDD pattern_

**Deciders enable perfect test isolation**

Pure functions = no mocking, no ctx, no database.

_Verified by: Decider test requires no infrastructure_

**Step definitions must be organized to prevent conflicts**

Separate step files per domain area, namespaced patterns.

_Verified by: Step definitions are domain-scoped, Duplicate step patterns cause conflict error_

**Integration tests use action-focused steps**

Command lifecycle tests validate full flow with assertions.

_Verified by: Integration test validates command lifecycle_

**Platform packages must have feature coverage**

libar-dev/platform-\* packages need BDD tests for public APIs.

_Verified by: Platform package has feature tests_

---

[← Back to Pattern Registry](../PATTERNS.md)
