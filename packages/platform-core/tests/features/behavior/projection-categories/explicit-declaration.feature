@libar-docs-implements:ProjectionCategories
@libar-docs-status:active
@libar-docs-phase:15
@libar-docs-product-area:PlatformCore
Feature: Explicit Category Declaration

  As a platform developer
  I want projections to require explicit category declaration
  So that all projections have clear query routing semantics

  Background: Validation context
    Given the projection validation module is available
    And valid categories are "logic", "view", "reporting", "integration"

  # ============================================================================
  # Category Required Validation
  # ============================================================================

  @acceptance-criteria @validation
  Scenario: Missing category returns CATEGORY_REQUIRED error
    When I validate a projection category with undefined
    Then validation fails
    And error code is "CATEGORY_REQUIRED"
    And error message contains "required"
    And suggested categories are provided

  @acceptance-criteria @validation
  Scenario: Null category returns CATEGORY_REQUIRED error
    When I validate a projection category with null
    Then validation fails
    And error code is "CATEGORY_REQUIRED"
    And suggested categories are provided

  # ============================================================================
  # Invalid Category Validation
  # ============================================================================

  @acceptance-criteria @validation
  Scenario Outline: Invalid category returns INVALID_CATEGORY error
    When I validate a projection category with "<invalid_value>"
    Then validation fails
    And error code is "INVALID_CATEGORY"
    And error message contains "<invalid_value>"
    And suggested categories are provided

    Examples:
      | invalid_value |
      | custom        |
      | VIEW          |
      | Logic         |
      | viewModel     |
      | read          |

  # ============================================================================
  # Valid Category Validation
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario Outline: Valid category passes validation
    When I validate a projection category with "<category>"
    Then validation succeeds
    And returned category is "<category>"

    Examples:
      | category    |
      | logic       |
      | view        |
      | reporting   |
      | integration |

  # ============================================================================
  # Assert Function
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: assertValidCategory returns category on valid input
    When I call assertValidCategory with "view"
    Then I receive "view"
    And no error is thrown

  @acceptance-criteria @validation
  Scenario: assertValidCategory throws on invalid input
    When I call assertValidCategory with "invalid"
    Then an error is thrown
    And error message contains "INVALID_CATEGORY"
