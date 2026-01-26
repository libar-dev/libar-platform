@libar-docs-implements:DynamicConsistencyBoundaries
@libar-docs-status:active
@libar-docs-phase:16
@libar-docs-product-area:PlatformCore
Feature: DCB Execution with OCC

  As a platform developer
  I want executeWithDCB to enforce scope-level OCC
  So that cross-entity invariants are protected from concurrent modifications

  Background: DCB execution context
    Given a mock mutation context
    And a scope key "tenant:t1:reservation:res_123"
    And entities with streamIds "product_1" and "product_2"

  # ============================================================================
  # Basic Execution (No OCC)
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: Successful execution without scopeOperations
    Given a decider that succeeds with event type "ItemsReserved"
    And no scopeOperations are provided
    When I execute the DCB operation
    Then the result status is "success"
    And the result contains event type "ItemsReserved"
    And the result scopeVersion is 1

  @acceptance-criteria @happy-path
  Scenario: Successful execution includes schemaVersion and category in events
    Given a decider that succeeds with event type "ItemsReserved"
    And schemaVersion is 2
    And eventCategory is "domain"
    When I execute the DCB operation
    Then the result status is "success"
    And the generated event has schemaVersion 2
    And the generated event has category "domain"

  @acceptance-criteria @edge-case
  Scenario: Rejected decider result returns rejection
    Given a decider that rejects with code "INSUFFICIENT_STOCK" and message "Not enough stock"
    When I execute the DCB operation
    Then the result status is "rejected"
    And the rejection code is "INSUFFICIENT_STOCK"
    And the rejection reason is "Not enough stock"

  @acceptance-criteria @edge-case
  Scenario: Failed decider result returns failure with event
    Given a decider that fails with event type "ReservationFailed" and reason "Stock unavailable"
    When I execute the DCB operation
    Then the result status is "failed"
    And the failure reason is "Stock unavailable"
    And the result contains event type "ReservationFailed"

  # ============================================================================
  # OCC Pre-Check (Version Validation)
  # ============================================================================

  @acceptance-criteria @happy-path
  Scenario: OCC pre-check passes when expectedVersion matches scope version
    Given scopeOperations that return scope with currentVersion 0
    And expectedVersion is 0
    And a decider that succeeds
    And scopeOperations commitScope succeeds with newVersion 1
    When I execute the DCB operation
    Then the result status is "success"

  @acceptance-criteria @edge-case
  Scenario: OCC pre-check detects stale expectedVersion
    Given scopeOperations that return scope with currentVersion 5
    And expectedVersion is 3
    When I execute the DCB operation
    Then the result status is "conflict"
    And the conflict currentVersion is 5

  @acceptance-criteria @edge-case
  Scenario: OCC pre-check detects scope not found when expectedVersion > 0
    Given scopeOperations that return null scope
    And expectedVersion is 1
    When I execute the DCB operation
    Then the result status is "conflict"
    And the conflict currentVersion is 0

  @acceptance-criteria @happy-path
  Scenario: OCC pre-check allows new scope with expectedVersion 0
    Given scopeOperations that return null scope
    And expectedVersion is 0
    And a decider that succeeds
    And scopeOperations commitScope succeeds with newVersion 1
    When I execute the DCB operation
    Then the result status is "success"

  # ============================================================================
  # OCC Commit (Final Check)
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: OCC commit detects concurrent modification
    Given scopeOperations that return scope with currentVersion 0
    And expectedVersion is 0
    And a decider that succeeds
    And scopeOperations commitScope returns conflict with currentVersion 1
    When I execute the DCB operation
    Then the result status is "conflict"
    And the conflict currentVersion is 1

  @acceptance-criteria @happy-path
  Scenario: OCC commit tracks updated stream IDs
    Given scopeOperations that return scope with currentVersion 0
    And expectedVersion is 0
    And a decider that succeeds with updates to "product_1" and "product_2"
    And scopeOperations commitScope is called
    When I execute the DCB operation
    Then commitScope was called with streamIds "product_1" and "product_2"

  # ============================================================================
  # Scope Key Validation
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Invalid scope key returns rejection
    Given an invalid scope key "invalid_key"
    When I execute the DCB operation
    Then the result status is "rejected"
    And the rejection code contains "INVALID_SCOPE_KEY_FORMAT"

  # ============================================================================
  # Entity Loading
  # ============================================================================

  @acceptance-criteria @edge-case
  Scenario: Missing entities returns rejection
    Given entities where "product_1" exists but "product_2" does not
    When I execute the DCB operation
    Then the result status is "rejected"
    And the rejection code is "ENTITIES_NOT_FOUND"
    And the rejection reason contains "product_2"
