@libar-docs-implements:DynamicConsistencyBoundaries
@libar-docs-status:active
@libar-docs-phase:16
@libar-docs-product-area:PlatformCore
Feature: DCB Scope Key Utilities

  As a platform developer
  I want standardized scope key creation and parsing utilities
  So that I can ensure tenant isolation in DCB operations

  Background: Scope key format specification
    Given the scope key format is "tenant:${tenantId}:${scopeType}:${scopeId}"
    And the tenant prefix is "tenant:" for mandatory tenant isolation

  # ============================================================================
  # Scope Key Creation
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Create valid scope key from components
    When I call createScopeKey with tenantId "t123", scopeType "reservation", scopeId "res_456"
    Then I receive scope key "tenant:t123:reservation:res_456"
    And the result is a branded DCBScopeKey type

  @acceptance-criteria @happy-path
  Scenario: Scope ID may contain colons for composite identifiers
    When I call createScopeKey with tenantId "t1", scopeType "order", scopeId "ord:2024:001"
    Then I receive scope key "tenant:t1:order:ord:2024:001"

  @acceptance-criteria @edge-case
  Scenario Outline: createScopeKey throws on invalid input
    When I call createScopeKey with tenantId "<tenantId>", scopeType "<scopeType>", scopeId "<scopeId>"
    Then an error is thrown with message containing "<errorPart>"

    Examples:
      | tenantId | scopeType   | scopeId | errorPart            |
      |          | reservation | res_1   | tenantId is required |
      | t1       |             | res_1   | scopeType is required|
      | t1       | reservation |         | scopeId is required  |
      | t:1      | reservation | res_1   | tenantId cannot contain colons |
      | t1       | res:type    | res_1   | scopeType cannot contain colons |

  # ============================================================================
  # Safe Creation (tryCreateScopeKey)
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: tryCreateScopeKey returns scope key for valid input
    When I call tryCreateScopeKey with tenantId "tenant_1", scopeType "order", scopeId "ord_789"
    Then I receive scope key "tenant:tenant_1:order:ord_789"

  @acceptance-criteria @edge-case
  Scenario: tryCreateScopeKey returns null for invalid input
    When I call tryCreateScopeKey with tenantId "", scopeType "order", scopeId "ord_1"
    Then I receive null

  # ============================================================================
  # Scope Key Parsing
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Parse valid scope key into components
    When I call parseScopeKey with "tenant:t1:order:ord_123"
    Then I receive parsed scope key with:
      | property   | value               |
      | tenantId   | t1                  |
      | scopeType  | order               |
      | scopeId    | ord_123             |
      | raw        | tenant:t1:order:ord_123 |

  @acceptance-criteria @happy-path
  Scenario: Parse scope key with composite scopeId containing colons
    When I call parseScopeKey with "tenant:t1:reservation:res:2024:summer:001"
    Then I receive parsed scope key with:
      | property   | value                             |
      | tenantId   | t1                                |
      | scopeType  | reservation                       |
      | scopeId    | res:2024:summer:001               |
      | raw        | tenant:t1:reservation:res:2024:summer:001 |

  @acceptance-criteria @edge-case
  Scenario Outline: parseScopeKey returns null for invalid format
    When I call parseScopeKey with "<input>"
    Then I receive null

    Examples:
      | input                          |
      |                                |
      | invalid                        |
      | t1:reservation:res_1           |
      | reservation:res_1              |
      | tenant::order:ord_1            |
      | tenant:t1::ord_1               |
      | tenant:t1:order:               |

  # ============================================================================
  # Scope Key Validation
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: validateScopeKey returns null for valid scope key
    When I call validateScopeKey with "tenant:t1:reservation:res_123"
    Then I receive null indicating valid

  @acceptance-criteria @edge-case
  Scenario: validateScopeKey returns SCOPE_KEY_EMPTY error for empty string
    When I call validateScopeKey with ""
    Then I receive validation error with code "SCOPE_KEY_EMPTY"
    And the error message contains "cannot be empty"

  @acceptance-criteria @edge-case
  Scenario: validateScopeKey returns error for missing tenant prefix
    When I call validateScopeKey with "reservation:res_123"
    Then I receive validation error with code "INVALID_SCOPE_KEY_FORMAT"
    And the error message contains "tenant:"

  @acceptance-criteria @edge-case
  Scenario: validateScopeKey returns error for malformed scope key
    When I call validateScopeKey with "tenant:t1:reservation"
    Then I receive validation error with code "INVALID_SCOPE_KEY_FORMAT"

  # ============================================================================
  # Type Guards
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario Outline: isValidScopeKey type guard
    When I call isValidScopeKey with "<input>"
    Then I receive <result>

    Examples:
      | input                        | result |
      | tenant:t1:order:ord_1        | true   |
      | tenant:t1:res:r:2024:001     | true   |
      | invalid                      | false  |
      | t1:order:ord_1               | false  |
      |                              | false  |

  @acceptance-criteria @edge-case
  Scenario: assertValidScopeKey throws on invalid input
    When I call assertValidScopeKey with "invalid_scope"
    Then an error is thrown with message containing "INVALID_SCOPE_KEY_FORMAT"

  @acceptance-criteria @happy-path
  Scenario: assertValidScopeKey succeeds on valid input
    When I call assertValidScopeKey with "tenant:t1:order:ord_1"
    Then no error is thrown

  # ============================================================================
  # Tenant Operations
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario Outline: isScopeTenant checks tenant membership
    Given a valid scope key "tenant:t1:order:ord_123"
    When I call isScopeTenant with tenantId "<checkTenant>"
    Then I receive <result>

    Examples:
      | checkTenant | result |
      | t1          | true   |
      | t2          | false  |
      | tenant_1    | false  |

  @acceptance-criteria @happy-path
  Scenario: extractTenantId returns tenant ID from scope key
    Given a valid scope key "tenant:tenant_abc:reservation:res_001"
    When I call extractTenantId
    Then I receive "tenant_abc"

  @acceptance-criteria @happy-path
  Scenario: extractScopeType returns scope type from scope key
    Given a valid scope key "tenant:t1:reservation:res_001"
    When I call extractScopeType
    Then I receive "reservation"

  @acceptance-criteria @happy-path
  Scenario: extractScopeId returns scope ID from scope key
    Given a valid scope key "tenant:t1:order:ord:2024:001"
    When I call extractScopeId
    Then I receive "ord:2024:001"
