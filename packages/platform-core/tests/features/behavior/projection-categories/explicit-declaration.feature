@architect
@architect-pattern:ProjectionCategoriesExecutableTests
@architect-implements:ProjectionCategories
@architect-status:active
@architect-phase:15
@architect-product-area:PlatformCore
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

  @acceptance-criteria @validation
  Scenario: assertValidCategory throws on invalid input
    When I call assertValidCategory with "invalid"
    Then an error is thrown
    And error message contains "INVALID_CATEGORY"

  # ============================================================================
  # Documentation-only Rules (preserved invariants — not bound to step callbacks)
  # ============================================================================

  Rule: Projections must declare explicit category

    **Invariant:** Category must be specified at projection definition time.
    Projections without explicit category fail registration with CATEGORY_REQUIRED.

    **Rationale:** Implicit categories (guessed from naming or usage) lead to
    inconsistent behavior. Explicit declaration forces developers to think about
    the projection's purpose and enables compile-time validation.

    **Verified by:** Missing category returns CATEGORY_REQUIRED error,
    Null category returns CATEGORY_REQUIRED error,
    Valid category passes validation,
    assertValidCategory returns category on valid input

  Rule: Invalid categories are rejected at registration

    **Invariant:** Any category value not in the closed set
    {logic, view, reporting, integration} fails registration with INVALID_CATEGORY.
    Categorisation is case-sensitive.

    **Rationale:** A closed enum prevents drift and typos that would silently
    misroute projections (e.g. "viewModel" not enabling reactive subscriptions).
    Case sensitivity prevents convention divergence ("View" vs "view").

    **Verified by:** Invalid category returns INVALID_CATEGORY error,
    assertValidCategory throws on invalid input
