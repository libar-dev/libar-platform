@acceptance-criteria
Feature: Command Category Utilities

  As a platform developer
  I want command taxonomy utilities with type-safe categories
  So that commands are correctly classified and validated at runtime

  Command categories classify commands as aggregate, process, system, or batch.
  Utilities provide type guards, normalizers, classification helpers, and Zod
  schemas that enforce the taxonomy at runtime.

  # ============================================================================
  # COMMAND_CATEGORIES Constant
  # ============================================================================

  Rule: COMMAND_CATEGORIES contains all four command categories in order

    **Invariant:** The constant is a tuple of exactly four categories in a fixed order.
    **Verified by:** Length check and element equality assertions.

    @happy-path
    Scenario: COMMAND_CATEGORIES has exactly four entries in the correct order
      Given the COMMAND_CATEGORIES constant
      Then it has length 4
      And the categories in order are:
        | index | category  |
        | 0     | aggregate |
        | 1     | process   |
        | 2     | system    |
        | 3     | batch     |

  # ============================================================================
  # CommandCategorySchema (Zod)
  # ============================================================================

  Rule: CommandCategorySchema validates category strings via Zod

    **Invariant:** Only the four lowercase category strings pass validation.
    **Verified by:** Parsing valid values succeeds; parsing invalid values throws.

    @happy-path
    Scenario: Schema accepts valid category strings
      When the following values are parsed with CommandCategorySchema:
        | value     |
        | aggregate |
        | process   |
        | system    |
        | batch     |
      Then each parse returns the input value unchanged

    @validation
    Scenario: Schema rejects invalid category values
      When the following invalid values are parsed with CommandCategorySchema:
        | value     | type   |
        | invalid   | string |
        | AGGREGATE | string |
        |           | string |
        | null      | null   |
        | 123       | number |
      Then each parse throws a validation error

  # ============================================================================
  # DEFAULT_COMMAND_CATEGORY
  # ============================================================================

  Rule: Default command category provides a sensible fallback

    **Invariant:** DEFAULT_COMMAND_CATEGORY is "aggregate".
    **Verified by:** Direct equality assertion.

    @happy-path
    Scenario: DEFAULT_COMMAND_CATEGORY is aggregate
      Then DEFAULT_COMMAND_CATEGORY equals "aggregate"

  # ============================================================================
  # isCommandCategory Type Guard
  # ============================================================================

  Rule: isCommandCategory returns true only for valid category strings

    **Invariant:** Only the four lowercase category strings pass the type guard.
    **Verified by:** Boolean return value assertions for valid and invalid inputs.

    @happy-path
    Scenario: Type guard accepts all valid categories
      When isCommandCategory is called with the following values:
        | value     |
        | aggregate |
        | process   |
        | system    |
        | batch     |
      Then each call returns true

    @validation
    Scenario: Type guard rejects invalid values
      When isCommandCategory is called with the following invalid values:
        | value     | type      |
        | invalid   | string    |
        | AGGREGATE | string    |
        | null      | null      |
        | undefined | undefined |
        | 123       | number    |
        |           | string    |
      Then each call returns false

  # ============================================================================
  # normalizeCommandCategory
  # ============================================================================

  Rule: normalizeCommandCategory returns the category unchanged or falls back to aggregate

    **Invariant:** Valid categories pass through; invalid values yield "aggregate".
    **Verified by:** Return value equality assertions.

    @happy-path
    Scenario: Valid categories are returned unchanged
      When normalizeCommandCategory is called with valid categories:
        | input     | expected  |
        | aggregate | aggregate |
        | process   | process   |
        | system    | system    |
        | batch     | batch     |
      Then each call returns the expected category

    @validation
    Scenario: Invalid values normalize to aggregate
      When normalizeCommandCategory is called with invalid values:
        | value     | type      |
        | undefined | undefined |
        | null      | null      |
        | invalid   | string    |
        | 123       | number    |
      Then each call returns "aggregate"

  # ============================================================================
  # Category Classification Helpers
  # ============================================================================

  Rule: isAggregateCommand returns true only for aggregate category

    **Invariant:** Only "aggregate" returns true from isAggregateCommand.
    **Verified by:** Boolean return value for each category.

    @happy-path
    Scenario: Classification of categories as aggregate
      When isAggregateCommand is called with each category:
        | category  | expected |
        | aggregate | true     |
        | process   | false    |
        | system    | false    |
        | batch     | false    |
      Then each call returns the expected aggregate classification

  Rule: isProcessCommand returns true only for process category

    **Invariant:** Only "process" returns true from isProcessCommand.
    **Verified by:** Boolean return value for each category.

    @happy-path
    Scenario: Classification of categories as process
      When isProcessCommand is called with each category:
        | category  | expected |
        | process   | true     |
        | aggregate | false    |
        | system    | false    |
        | batch     | false    |
      Then each call returns the expected process classification

  Rule: isSystemCommand returns true only for system category

    **Invariant:** Only "system" returns true from isSystemCommand.
    **Verified by:** Boolean return value for each category.

    @happy-path
    Scenario: Classification of categories as system
      When isSystemCommand is called with each category:
        | category  | expected |
        | system    | true     |
        | aggregate | false    |
        | process   | false    |
        | batch     | false    |
      Then each call returns the expected system classification

  Rule: isBatchCommand returns true only for batch category

    **Invariant:** Only "batch" returns true from isBatchCommand.
    **Verified by:** Boolean return value for each category.

    @happy-path
    Scenario: Classification of categories as batch
      When isBatchCommand is called with each category:
        | category  | expected |
        | batch     | true     |
        | aggregate | false    |
        | process   | false    |
        | system    | false    |
      Then each call returns the expected batch classification

  # ============================================================================
  # AggregateTargetSchema (Zod)
  # ============================================================================

  Rule: AggregateTargetSchema validates aggregate target objects

    **Invariant:** Both type and idField must be non-empty strings.
    **Verified by:** Parsing valid targets succeeds; invalid targets throw.

    @happy-path
    Scenario: Schema accepts valid aggregate targets
      When an aggregate target with type "Order" and idField "orderId" is parsed
      Then the parsed result equals the input target

    @validation
    Scenario: Schema rejects invalid aggregate targets
      When the following invalid aggregate targets are parsed:
        | type  | idField | missing |
        |       | orderId | none    |
        | Order |         | none    |
        |       |         | type    |
        |       |         | idField |
      Then each parse throws a validation error
