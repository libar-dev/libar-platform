# 🚧 Projection Categories Executable Tests

**Purpose:** Detailed documentation for the Projection Categories Executable Tests pattern

---

## Overview

| Property | Value  |
| -------- | ------ |
| Status   | active |
| Category | DDD    |
| Phase    | 15     |

## Description

As a platform developer
  I want to query projections by category from the registry
  So that I can target specific projection types for different purposes

## Acceptance Criteria

**getByCategory returns all view projections**

- When I call getByCategory with "view"
- Then I receive 2 projections
- And the result contains "orderSummary"
- And the result contains "productCatalog"

**getByCategory returns all logic projections**

- When I call getByCategory with "logic"
- Then I receive 1 projection
- And the result contains "orderExistence"

**getByCategory returns all reporting projections**

- When I call getByCategory with "reporting"
- Then I receive 1 projection
- And the result contains "dailySales"

**getByCategory returns all integration projections**

- When I call getByCategory with "integration"
- Then I receive 1 projection
- And the result contains "orderStatusFeed"

**getByCategory returns empty array for category with no projections**

- Given an empty projection registry
- When I call getByCategory with "view"
- Then I receive 0 projections

**Target view projections for reactive layer**

- When I call getByCategory with "view"
- Then all returned projections have category "view"
- And these are candidates for reactive subscriptions

**Target integration projections for EventBus routing**

- When I call getByCategory with "integration"
- Then all returned projections have category "integration"
- And these are candidates for EventBus publication

---

[← Back to Pattern Registry](../PATTERNS.md)
