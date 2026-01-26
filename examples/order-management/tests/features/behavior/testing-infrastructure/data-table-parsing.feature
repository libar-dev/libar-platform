@libar-docs-pattern:DataTableParsing
@testing-infrastructure
Feature: Gherkin DataTable Parsing Utilities

  As a BDD test author
  I want DataTable parsing helpers
  So that I can easily extract structured data from Gherkin tables

  The platform-core/testing module provides utilities for parsing Gherkin
  DataTables into usable TypeScript objects. These utilities handle the
  vertical "field | value" format commonly used in BDD scenarios.

  Background:
    Given the platform-core testing module is imported

  # ============================================================================
  # Table Parsing
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Parse vertical DataTable to object
    Given a DataTable with field-value rows
    When I call tableRowsToObject(rows)
    Then I receive an object with keys from field column and values from value column

  @acceptance-criteria @happy-path
  Scenario: Parse DataTable preserves all string values
    Given a DataTable with field-value rows including "isActive" as "true"
    When I call tableRowsToObject(rows)
    Then all values are strings
    And isActive is the string "true" not boolean true

  # ============================================================================
  # Type Conversion
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Parse integer value from string
    When I call parseTableValue("42", "int")
    Then I receive the number 42

  @acceptance-criteria @happy-path
  Scenario: Parse float value from string
    When I call parseTableValue("3.14", "float")
    Then I receive the number 3.14

  @acceptance-criteria @happy-path
  Scenario: Parse boolean true from string
    When I call parseTableValue("true", "boolean")
    Then I receive the boolean true

  @acceptance-criteria @happy-path
  Scenario: Parse boolean false from string
    When I call parseTableValue("false", "boolean")
    Then I receive the boolean false

  @acceptance-criteria @validation
  Scenario: Parse invalid integer throws error
    When I call parseTableValue("not-a-number", "int")
    Then an error is thrown with message containing "Invalid integer"

  # ============================================================================
  # Field Extraction
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Get required field succeeds when present
    Given a parsed object with orderId "order-123" and status "draft"
    When I call getRequiredField(obj, "orderId")
    Then I receive "order-123"

  @acceptance-criteria @validation
  Scenario: Get required field throws for missing field
    Given a parsed object with only status "draft"
    When I call getRequiredField(obj, "orderId")
    Then an error is thrown with message containing "orderId"
    And the error message indicates the field is required

  @acceptance-criteria @happy-path
  Scenario: Get optional field returns value when present
    Given a parsed object with notes "Some notes"
    When I call getOptionalField(obj, "notes")
    Then I receive "Some notes"

  @acceptance-criteria @happy-path
  Scenario: Get optional field returns undefined for missing
    Given a parsed object with only status "draft"
    When I call getOptionalField(obj, "notes")
    Then I receive undefined

  @acceptance-criteria @happy-path
  Scenario: Get optional field with default value
    Given a parsed object with only status "draft"
    When I call getOptionalField(obj, "priority", "normal")
    Then I receive "normal"
