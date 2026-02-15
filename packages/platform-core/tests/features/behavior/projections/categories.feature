Feature: Projection Categories Edge Cases and Schema Validation

  Covers Zod schema validation, type guard edge cases for non-string types,
  validation error constants, and validateProjectionCategory edge cases
  that complement the core category-definitions and explicit-declaration features.

  # ============================================================================
  # Rule: Zod Schema Validation
  # ============================================================================

  Rule: ProjectionCategorySchema accepts only the four canonical categories
    Invariant: The Zod schema must accept exactly logic, view, reporting, integration
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: ProjectionCategorySchema accepts all valid categories
      When I parse each valid category through ProjectionCategorySchema
      Then all parse results succeed for:
        | category    |
        | logic       |
        | view        |
        | reporting   |
        | integration |

    @acceptance-criteria @validation
    Scenario: ProjectionCategorySchema rejects invalid values
      When I parse each invalid value through ProjectionCategorySchema
      Then all parse results fail for:
        | value     |
        | custom    |
        | VIEW      |
        | Logic     |
        | viewModel |
        | read      |
        |           |

    @acceptance-criteria @validation
    Scenario: ProjectionCategorySchema rejects non-string types
      When I parse non-string types through ProjectionCategorySchema
      Then the schema rejects the number 123
      And the schema rejects null

  # ============================================================================
  # Rule: Type Guard Edge Cases
  # ============================================================================

  Rule: isProjectionCategory returns false for all non-string types
    Invariant: Non-string values must never pass the type guard
    Verified by: Scenarios below

    @acceptance-criteria @validation
    Scenario: isProjectionCategory rejects objects
      When I call isProjectionCategory with an empty object
      Then the type guard returns false

    @acceptance-criteria @validation
    Scenario: isProjectionCategory rejects arrays
      When I call isProjectionCategory with an array containing "view"
      Then the type guard returns false

    @acceptance-criteria @validation
    Scenario: isProjectionCategory rejects booleans
      When I call isProjectionCategory with boolean values
      Then the type guard returns false for both true and false

    @acceptance-criteria @validation
    Scenario: isProjectionCategory rejects whitespace-padded strings
      When I call isProjectionCategory with whitespace-padded values
      Then the type guard rejects space-padded view and tab-padded logic

  # ============================================================================
  # Rule: Validation Error Constants
  # ============================================================================

  Rule: PROJECTION_VALIDATION_ERRORS exposes known error codes
    Invariant: Error constants must match their string values
    Verified by: Scenario below

    @acceptance-criteria @happy-path
    Scenario: PROJECTION_VALIDATION_ERRORS has expected error codes
      Then CATEGORY_REQUIRED error code equals "CATEGORY_REQUIRED"
      And INVALID_CATEGORY error code equals "INVALID_CATEGORY"

  # ============================================================================
  # Rule: Validate Projection Category Edge Cases
  # ============================================================================

  Rule: validateProjectionCategory returns INVALID_CATEGORY for non-string types
    Invariant: Non-string non-nullish values produce INVALID_CATEGORY errors
    Verified by: Scenarios below

    @acceptance-criteria @validation
    Scenario: validateProjectionCategory rejects non-string types
      When I validate non-string types as projection categories
      Then all produce INVALID_CATEGORY errors:
        | type      |
        | object    |
        | array     |
        | boolean   |
        | number    |
        | whitespace|

  # ============================================================================
  # Rule: assertValidCategory Throws for Undefined
  # ============================================================================

  Rule: assertValidCategory throws CATEGORY_REQUIRED for undefined input
    Invariant: Undefined input must produce CATEGORY_REQUIRED, not INVALID_CATEGORY
    Verified by: Scenario below

    @acceptance-criteria @validation
    Scenario: assertValidCategory throws CATEGORY_REQUIRED for undefined
      When I call assertValidCategory with undefined
      Then the error message contains "CATEGORY_REQUIRED"
