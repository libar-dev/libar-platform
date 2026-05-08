# ProjectionCategoriesExecutableTests

**Purpose:** Active work details for ProjectionCategoriesExecutableTests

---

## Progress

**Progress:** [░░░░░░░░░░░░░░░░░░░░] 0/3 (0%)

| Status      | Count |
| ----------- | ----- |
| ✅ Completed | 0     |
| 🚧 Active   | 3     |
| 📋 Planned  | 0     |
| **Total**   | 3     |

---

## 🚧 Active Work

### 🚧 Projection Categories Executable Tests

As a platform developer
  I want projections classified into four distinct categories
  So that I can route queries and optimize projection behavior

#### Acceptance Criteria

**PROJECTION_CATEGORIES tuple contains all valid categories**

- When I access PROJECTION_CATEGORIES
- Then it contains exactly "logic", "view", "reporting", "integration"
- And it is a readonly tuple

**isProjectionCategory validates category strings**

- When I call isProjectionCategory with "<value>"
- Then I receive <result>

**Category helper functions identify correct categories**

- Given a projection category "<category>"
- Then isLogicProjection returns <isLogic>
- And isViewProjection returns <isView>
- And isReportingProjection returns <isReporting>
- And isIntegrationProjection returns <isIntegration>

**isClientExposed returns correct exposure status**

- Given a projection category "<category>"
- When I call isClientExposed
- Then I receive <exposed>

---

### 🚧 Projection Categories Executable Tests

As a platform developer
  I want projections to require explicit category declaration
  So that all projections have clear query routing semantics

#### Acceptance Criteria

**Missing category returns CATEGORY_REQUIRED error**

- When I validate a projection category with undefined
- Then validation fails
- And error code is "CATEGORY_REQUIRED"
- And error message contains "required"
- And suggested categories are provided

**Null category returns CATEGORY_REQUIRED error**

- When I validate a projection category with null
- Then validation fails
- And error code is "CATEGORY_REQUIRED"
- And suggested categories are provided

**Valid category passes validation**

- When I validate a projection category with "<category>"
- Then validation succeeds
- And returned category is "<category>"

**assertValidCategory returns category on valid input**

- When I call assertValidCategory with "view"
- Then I receive "view"
- And no error is thrown

**Invalid category returns INVALID_CATEGORY error**

- When I validate a projection category with "<invalid_value>"
- Then validation fails
- And error code is "INVALID_CATEGORY"
- And error message contains "<invalid_value>"
- And suggested categories are provided

**assertValidCategory throws on invalid input**

- When I call assertValidCategory with "invalid"
- Then an error is thrown
- And error message contains "INVALID_CATEGORY"

---

### 🚧 Projection Categories Executable Tests

As a platform developer
  I want to query projections by category from the registry
  So that I can target specific projection types for different purposes

#### Acceptance Criteria

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

[← Back to Current Work](../CURRENT-WORK.md)
