# ✅ BDD World

**Purpose:** Detailed requirements for the BDD World feature

---

## Overview

| Property       | Value                                |
| -------------- | ------------------------------------ |
| Status         | completed                            |
| Product Area   | PlatformCore                         |
| Business Value | manage scenario context across steps |
| Phase          | 57                                   |

## Description

As a BDD test author
I want world/state management utilities
So that I can manage scenario context across steps

The "World" in BDD testing is the shared context across all steps within
a single scenario. This module provides base interfaces and factory
functions for creating test worlds for both unit and integration tests.

## Acceptance Criteria

**Create base unit test world**

- Given a mock ConvexTest instance
- When I call createBaseUnitTestWorld(t)
- Then I receive a BaseUnitTestWorld object
- And the world.t is the mock instance
- And the world.lastResult is null
- And the world.lastError is null
- And the world.scenario is an empty object

**Unit test world supports scenario context**

- Given a BaseUnitTestWorld instance
- When I set world.scenario.orderId to "order-123"
- Then world.scenario.orderId is "order-123"

**Unit test world tracks last result**

- Given a BaseUnitTestWorld instance
- When I set world.lastResult to a success object
- Then world.lastResult contains the success object

**Unit test world tracks last error**

- Given a BaseUnitTestWorld instance
- When I set world.lastError to an Error
- Then world.lastError is the Error instance

**Create base integration test world**

- Given a mock ConvexTestingHelper instance
- When I call createBaseIntegrationTestWorld(t)
- Then I receive a BaseIntegrationTestWorld object
- And the world.t is the mock instance
- And the world.backendUrl is set

**Integration test world uses custom backend URL**

- Given a mock ConvexTestingHelper instance
- When I call createBaseIntegrationTestWorld(t, "http://custom:3210")
- Then world.backendUrl is "http://custom:3210"

**Integration test world defaults to localhost**

- Given a mock ConvexTestingHelper instance
- And no CONVEX_URL environment variable is set
- When I call createBaseIntegrationTestWorld(t)
- Then world.backendUrl contains "127.0.0.1:3210"

**Reset world state clears all fields**

- Given a BaseUnitTestWorld instance with populated state
- When I call resetWorldState(world)
- Then world.lastResult is null
- And world.lastError is null
- And world.scenario is an empty object

**Reset preserves test backend reference**

- Given a BaseUnitTestWorld instance with a mock t
- When I call resetWorldState(world)
- Then world.t is still the original mock instance

## Deliverables

- BaseUnitTestWorld interface (Complete)
- BaseIntegrationTestWorld interface (Complete)
- createBaseUnitTestWorld() factory (Complete)
- createBaseIntegrationTestWorld() factory (Complete)
- resetWorldState() utility (Complete)
- Behavior test feature file (Complete)

---

[← Back to Product Requirements](../PRODUCT-REQUIREMENTS.md)
