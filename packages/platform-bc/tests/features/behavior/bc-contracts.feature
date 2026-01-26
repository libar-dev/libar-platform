@libar-docs
@libar-docs-phase:19
@libar-docs-product-area:PlatformBC
@testing-infrastructure
Feature: Bounded Context Contract Helper Functions

  The @libar-dev/platform-bc package provides type-safe helper functions
  for defining bounded context contracts. These helpers preserve literal
  types for type-safe registries and provide runtime validators for
  category values.

  Key APIs:
  - defineCommand: Preserves commandType as literal type
  - defineEvent: Preserves eventType as literal type
  - defineProjection: Preserves projectionName and eventSubscriptions
  - defineUpcaster: Creates typed CMS upcaster contracts
  - defineQuery: Preserves queryName and resultType
  - defineProcessManager: Validates trigger type requirements

  Category validators:
  - isEventCategory: Validates event category strings
  - isProjectionCategory: Validates projection category strings
  - isLogicProjection, isViewProjection, etc.: Category-specific checks
  - isClientExposed: Checks if projection is client-accessible

  # ==========================================================================
  # defineCommand - Type Preservation
  # ==========================================================================

  @happy-path
  Scenario: defineCommand preserves literal commandType
    Given a command definition with commandType "CreateOrder"
    When I call defineCommand with the definition
    Then the result commandType should be "CreateOrder"
    And the result should preserve the createsAggregate flag as true

  @happy-path
  Scenario: defineCommand includes all metadata fields
    Given a command definition with multiple producesEvents
    When I call defineCommand with the definition
    Then the result should have producesEvents with 2 items
    And the result should have errorCodes with 1 item

  # ==========================================================================
  # defineEvent - Type Preservation
  # ==========================================================================

  @happy-path
  Scenario: defineEvent preserves literal eventType
    Given an event definition with eventType "OrderCreated"
    When I call defineEvent with the definition
    Then the result eventType should be "OrderCreated"
    And the result category should be "domain"

  @happy-path
  Scenario: defineEvent supports all event categories
    Given an event definition with category "integration"
    When I call defineEvent with the definition
    Then the result category should be "integration"

  # ==========================================================================
  # defineProjection - Type Preservation
  # ==========================================================================

  @happy-path
  Scenario: defineProjection preserves literal projectionName
    Given a projection definition with projectionName "orderSummary"
    When I call defineProjection with the definition
    Then the result projectionName should be "orderSummary"
    And the result type should be "primary"

  @happy-path
  Scenario: defineProjection preserves eventSubscriptions tuple
    Given a projection definition with 3 event subscriptions
    When I call defineProjection with the definition
    Then the result should have eventSubscriptions with 3 items

  # ==========================================================================
  # Category Validators - isProjectionCategory
  # ==========================================================================

  @validation
  Scenario Outline: isProjectionCategory validates category strings
    When I check isProjectionCategory with value "<value>"
    Then the result should be <expected>

    Examples:
      | value       | expected |
      | logic       | true     |
      | view        | true     |
      | reporting   | true     |
      | integration | true     |
      | invalid     | false    |
      | Logic       | false    |

  # ==========================================================================
  # Category-Specific Validators
  # ==========================================================================

  @validation
  Scenario: isLogicProjection returns true only for logic category
    Given a projection category "logic"
    When I check isLogicProjection
    Then the result should be true

  @validation
  Scenario: isViewProjection returns true only for view category
    Given a projection category "view"
    When I check isViewProjection
    Then the result should be true

  @validation
  Scenario: isClientExposed returns true only for view category
    Given a projection category "view"
    When I check isClientExposed
    Then the result should be true

  @validation
  Scenario: isClientExposed returns false for non-view categories
    Given a projection category "reporting"
    When I check isClientExposed
    Then the result should be false

  # ==========================================================================
  # defineProcessManager - Validation
  # ==========================================================================

  @validation
  Scenario: defineProcessManager validates time-triggered requires cronConfig
    Given a process manager definition with triggerType "time" without cronConfig
    When I call defineProcessManager expecting an error
    Then it should throw an error containing "requires cronConfig"

  @validation
  Scenario: defineProcessManager validates event-triggered requires subscriptions
    Given a process manager definition with triggerType "event" without subscriptions
    When I call defineProcessManager expecting an error
    Then it should throw an error containing "requires at least one event subscription"
