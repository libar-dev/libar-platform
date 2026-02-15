@acceptance-criteria
Feature: Event Category Utilities

  As a platform developer
  I want event taxonomy utilities with type-safe categories
  So that events are correctly classified and validated at runtime

  Event categories classify events as domain, integration, trigger, or fat.
  Utilities provide type guards, normalizers, and classification helpers
  that enforce the taxonomy at runtime.

  # ============================================================================
  # EVENT_CATEGORIES Constant
  # ============================================================================

  Rule: EVENT_CATEGORIES contains all four event categories in order

    **Invariant:** The constant is a tuple of exactly four categories in a fixed order.
    **Verified by:** Length check and element equality assertions.

    @happy-path
    Scenario: EVENT_CATEGORIES has exactly four entries in the correct order
      Given the EVENT_CATEGORIES constant
      Then it has length 4
      And the categories in order are:
        | index | category    |
        | 0     | domain      |
        | 1     | integration |
        | 2     | trigger     |
        | 3     | fat         |

  # ============================================================================
  # EventCategorySchema (Zod)
  # ============================================================================

  Rule: EventCategorySchema validates category strings via Zod

    **Invariant:** Only the four lowercase category strings pass validation.
    **Verified by:** Parsing valid values succeeds; parsing invalid values throws.

    @happy-path
    Scenario: Schema accepts valid category strings
      When the following values are parsed with EventCategorySchema:
        | value       |
        | domain      |
        | integration |
        | trigger     |
        | fat         |
      Then each parse returns the input value unchanged

    @validation
    Scenario: Schema rejects invalid category values
      When the following values are parsed with EventCategorySchema:
        | value   | type   |
        | invalid | string |
        | DOMAIN  | string |
        |         | string |
        | null    | null   |
        | 123     | number |
      Then each parse throws a validation error

  # ============================================================================
  # Defaults
  # ============================================================================

  Rule: Default constants provide sensible fallbacks

    **Invariant:** DEFAULT_EVENT_CATEGORY is "domain" and DEFAULT_SCHEMA_VERSION is 1.
    **Verified by:** Direct equality assertions.

    @happy-path
    Scenario: DEFAULT_EVENT_CATEGORY is domain
      Then DEFAULT_EVENT_CATEGORY equals "domain"

    @happy-path
    Scenario: DEFAULT_SCHEMA_VERSION is 1
      Then DEFAULT_SCHEMA_VERSION equals 1

  # ============================================================================
  # isEventCategory Type Guard
  # ============================================================================

  Rule: isEventCategory returns true only for valid category strings

    **Invariant:** Only the four lowercase category strings pass the type guard.
    **Verified by:** Boolean return value assertions for valid and invalid inputs.

    @happy-path
    Scenario: Type guard accepts all valid categories
      When isEventCategory is called with the following values:
        | value       | expected |
        | domain      | true     |
        | integration | true     |
        | trigger     | true     |
        | fat         | true     |
      Then each call returns the expected boolean

    @validation
    Scenario: Type guard rejects invalid values
      When isEventCategory is called with the following invalid values:
        | value     | type      | expected |
        | invalid   | string    | false    |
        | DOMAIN    | string    | false    |
        | null      | null      | false    |
        | undefined | undefined | false    |
        | 123       | number    | false    |
        |           | string    | false    |
      Then each call returns the expected boolean result

  # ============================================================================
  # normalizeCategory
  # ============================================================================

  Rule: normalizeCategory returns the category unchanged or falls back to domain

    **Invariant:** Valid categories pass through; invalid values yield "domain".
    **Verified by:** Return value equality assertions.

    @happy-path
    Scenario: Valid categories are returned unchanged
      When normalizeCategory is called with valid categories:
        | input       | expected    |
        | domain      | domain      |
        | integration | integration |
        | trigger     | trigger     |
        | fat         | fat         |
      Then each call returns the expected result

    @validation
    Scenario: Invalid values normalize to domain
      When normalizeCategory is called with invalid values:
        | value     | type      |
        | undefined | undefined |
        | null      | null      |
        | invalid   | string    |
        | 123       | number    |
      Then each call returns "domain"

  # ============================================================================
  # normalizeSchemaVersion
  # ============================================================================

  Rule: normalizeSchemaVersion returns valid positive integers or falls back to 1

    **Invariant:** Positive integers pass through; all other values yield 1.
    **Verified by:** Return value equality assertions.

    @happy-path
    Scenario: Positive integers are returned unchanged
      When normalizeSchemaVersion is called with:
        | input | expected |
        | 1     | 1        |
        | 2     | 2        |
        | 100   | 100      |
      Then each call returns the expected version number

    @validation
    Scenario: Invalid values normalize to 1
      When normalizeSchemaVersion is called with invalid values:
        | value     | type      |
        | undefined | undefined |
        | null      | null      |
        | 0         | number    |
        | -1        | number    |
        | -100      | number    |
        | 1.5       | number    |
        | 2.9       | number    |
        | 1         | string    |
      Then each call returns 1

  # ============================================================================
  # isExternalCategory
  # ============================================================================

  Rule: isExternalCategory identifies trigger and fat as external

    **Invariant:** Only "trigger" and "fat" are external categories.
    **Verified by:** Boolean return value for each category.

    @happy-path
    Scenario: Classification of categories as external or internal
      When isExternalCategory is called with each category:
        | category    | expected |
        | trigger     | true     |
        | fat         | true     |
        | domain      | false    |
        | integration | false    |
      Then each call returns the expected classification

  # ============================================================================
  # isCrossContextCategory
  # ============================================================================

  Rule: isCrossContextCategory identifies integration as cross-context

    **Invariant:** Only "integration" is a cross-context category.
    **Verified by:** Boolean return value for each category.

    @happy-path
    Scenario: Classification of categories as cross-context
      When isCrossContextCategory is called with each category:
        | category    | expected |
        | integration | true     |
        | domain      | false    |
        | trigger     | false    |
        | fat         | false    |
      Then each call returns the expected cross-context classification
