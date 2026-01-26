@libar-docs
@libar-docs-status:roadmap
@libar-docs-implements:IntegrationPatterns21a
@libar-docs-phase:21
@libar-docs-product-area:PlatformCore
@integration
Feature: Context Map Documentation

  As a platform developer
  I want BC relationships documented in a Context Map
  So that integration points are explicit and maintainable

  This feature validates the Context Map documentation and
  relationship type definitions for bounded contexts.

  Background: Integration Module
    Given the integration module is imported from platform-core
    And the Context Map registry is available

  # ============================================================================
  # Relationship Types
  # ============================================================================

  Rule: Context Map supports DDD relationship types

    Standard DDD integration patterns for BC relationships.

    @acceptance-criteria @happy-path
    Scenario: Register Upstream/Downstream relationship
      Given BC "Orders" publishes events
      And BC "Inventory" consumes those events
      When I register the relationship as "Upstream/Downstream"
      Then Context Map shows Orders as upstream
      And Context Map shows Inventory as downstream

    @acceptance-criteria @happy-path
    Scenario: Register Customer/Supplier relationship
      Given BC "Shipping" needs data from BC "Orders"
      And Shipping's needs drive Orders' API
      When I register the relationship as "Customer/Supplier"
      Then Context Map shows Orders as supplier
      And Context Map shows Shipping as customer

    @acceptance-criteria @happy-path
    Scenario: Register Conformist relationship
      Given BC "Analytics" adopts EventStore schema
      When I register the relationship as "Conformist"
      Then Context Map shows Analytics conforms to EventStore

    @acceptance-criteria @happy-path
    Scenario: Register ACL relationship
      Given BC "Payments" translates ExternalGateway responses
      When I register the relationship as "ACL"
      Then Context Map shows Payments has ACL for ExternalGateway

    # Research gap: Additional Context Map relationship types

    @acceptance-criteria @happy-path
    Scenario: Register Partnership relationship
      Given BC "Orders" and BC "Inventory" collaborate on shared model
      When I register the relationship as "Partnership"
      Then Context Map shows bidirectional partnership
      And both BCs are listed as collaborators

    @acceptance-criteria @happy-path
    Scenario: Register Shared Kernel relationship
      Given BC "Core" provides shared types to "Orders" and "Inventory"
      When I register the relationships as "Shared Kernel"
      Then Context Map shows Core as shared kernel provider
      And dependents include Orders and Inventory

    @acceptance-criteria @happy-path
    Scenario: Register Open Host Service relationship
      Given BC "Orders" exposes public API for external consumers
      When I register the relationship as "Open Host Service"
      Then Context Map shows Orders as OHS provider
      And external consumers are documented

  # ============================================================================
  # Topology Queries
  # ============================================================================

  Rule: Context Map enables topology queries

    Query BC relationships for documentation and validation.

    @acceptance-criteria @happy-path
    Scenario: Query all relationships for a BC
      Given Orders has relationships with Inventory, Shipping, and Payments
      When I query relationships for "Orders"
      Then I receive all 3 relationships
      And each includes type and direction

    @acceptance-criteria @happy-path
    Scenario: Query upstream BCs
      Given Analytics consumes from Orders, Inventory, and Payments
      When I query upstream BCs for "Analytics"
      Then I receive ["Orders", "Inventory", "Payments"]

    @acceptance-criteria @edge-case
    Scenario: Query BC with no relationships
      Given BC "Isolated" has no registered relationships
      When I query relationships for "Isolated"
      Then I receive an empty array

  # ============================================================================
  # Validation
  # ============================================================================

  Rule: Context Map validates relationship consistency

    Prevent conflicting or invalid relationships.

    @acceptance-criteria @validation
    Scenario: Duplicate relationship is rejected
      Given relationship "Orders → Inventory" already exists
      When I attempt to register "Orders → Inventory" again
      Then an error is thrown with code "DUPLICATE_RELATIONSHIP"

    @acceptance-criteria @validation
    Scenario: Self-referential relationship is rejected
      When I attempt to register "Orders → Orders"
      Then an error is thrown with code "SELF_REFERENCE"
