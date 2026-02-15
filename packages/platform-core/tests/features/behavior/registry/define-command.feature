@acceptance-criteria
Feature: defineCommand Helpers

  As a platform developer
  I want helper functions that reduce boilerplate for defining commands
  So that aggregate, process, and system commands can be defined concisely

  The defineAggregateCommand, defineProcessCommand, and defineSystemCommand
  helpers create fully-configured CommandConfig objects with correct metadata,
  handler argument mapping, partition key generation, and optional auto-registration.

  Background:
    Given the module is imported from platform-core

  # ============================================================================
  # defineAggregateCommand
  # ============================================================================

  Rule: defineAggregateCommand creates a correctly structured command config

    **Invariant:** The returned config preserves commandType, boundedContext, and projection name.
    **Verified by:** Equality assertions on config fields.

    @happy-path
    Scenario: Config has correct commandType, boundedContext, and projection name
      When an aggregate command "CreateOrder" is defined in context "orders" with projection "orderSummary"
      Then the config commandType is "CreateOrder"
      And the config boundedContext is "orders"
      And the config projection name is "orderSummary"

  Rule: defineAggregateCommand generates toHandlerArgs that adds commandId and correlationId

    **Invariant:** toHandlerArgs spreads original args and appends commandId and correlationId.
    **Verified by:** Deep equality on the returned handler args object.

    Scenario: toHandlerArgs merges original args with commandId and correlationId
      Given an aggregate command "CreateOrder" is defined with an orderId field
      When toHandlerArgs is called with orderId "ord_123", commandId "cmd_456", correlationId "corr_789"
      Then the handler args equal orderId "ord_123", commandId "cmd_456", correlationId "corr_789"

  Rule: defineAggregateCommand generates default partition key from aggregateIdField

    **Invariant:** The default partition key uses the aggregateIdField name and value from args.
    **Verified by:** Deep equality on the returned partition key object.

    Scenario: Default partition key uses aggregateIdField
      Given an aggregate command "CreateOrder" is defined with aggregateIdField "orderId"
      When getPartitionKey is called with orderId "ord_123"
      Then the partition key is name "orderId" and value "ord_123"

  Rule: defineAggregateCommand allows custom partition key override

    **Invariant:** A custom getPartitionKey function overrides the default aggregate-based key.
    **Verified by:** Deep equality on the returned partition key object using the custom field.

    Scenario: Custom partition key overrides the default
      Given an aggregate command "CreateOrder" is defined with a custom partition key on "customerId"
      When getPartitionKey is called with orderId "ord_123" and customerId "cust_456"
      Then the partition key is name "customerId" and value "cust_456"

  Rule: defineAggregateCommand sets correct metadata for aggregate commands

    **Invariant:** Metadata contains category, targetAggregate, description, schemaVersion, and tags.
    **Verified by:** Equality assertions on each metadata field.

    Scenario: Metadata reflects aggregate category and custom options
      When an aggregate command "CreateOrder" is defined with description "Creates a new order", schemaVersion 2, and tags "orders,create"
      Then the metadata category is "aggregate"
      And the metadata targetAggregate type is "Order" with idField "orderId"
      And the metadata description is "Creates a new order"
      And the metadata schemaVersion is 2
      And the metadata tags are "orders,create"

  Rule: defineAggregateCommand auto-registers with global registry by default

    **Invariant:** Commands auto-register unless autoRegister is explicitly false.
    **Verified by:** Registry.has() check after definition.

    Scenario: Command is auto-registered by default
      When an aggregate command "CreateOrder" is defined without autoRegister option
      Then the global registry has "CreateOrder"

    Scenario: Command is not registered when autoRegister is false
      When an aggregate command "CreateOrder" is defined with autoRegister false
      Then the global registry does not have "CreateOrder"

  Rule: defineAggregateCommand handles secondary projections

    **Invariant:** Secondary projections are preserved in the config when provided.
    **Verified by:** Length and name assertions on secondaryProjections array.

    Scenario: Secondary projections are included in config
      When an aggregate command "CreateOrder" is defined with a secondary projection "orderStats"
      Then the config has 1 secondary projection
      And the first secondary projection name is "orderStats"

  Rule: defineAggregateCommand handles saga routing

    **Invariant:** Saga route config is preserved including router and getEventType.
    **Verified by:** Defined check and getEventType invocation.

    Scenario: Saga route is included in config
      When an aggregate command "CreateOrder" is defined with a saga route returning "OrderCreated"
      Then the config saga route is defined
      And the saga route getEventType returns "OrderCreated"

  Rule: defineAggregateCommand preserves sagaRoute.onComplete for dead letter tracking

    **Invariant:** The onComplete handler reference is preserved on the saga route.
    **Verified by:** Reference equality assertion on sagaRoute.onComplete.

    Scenario: sagaRoute.onComplete is preserved
      When an aggregate command "CreateOrder" is defined with a saga route that has an onComplete handler
      Then the config saga route onComplete is the same reference as the provided handler

  Rule: defineAggregateCommand handles failed projection

    **Invariant:** Failed projection config is preserved when provided.
    **Verified by:** Defined check and name assertion on failedProjection.

    Scenario: Failed projection is included in config
      When an aggregate command "CreateOrder" is defined with a failed projection "orderFailures"
      Then the config failed projection is defined
      And the config failed projection name is "orderFailures"

  Rule: defineAggregateCommand defaults schemaVersion to 1

    **Invariant:** When schemaVersion is not provided, it defaults to 1.
    **Verified by:** Equality assertion on metadata.schemaVersion.

    Scenario: SchemaVersion defaults to 1
      When an aggregate command "CreateOrder" is defined without specifying schemaVersion
      Then the metadata schemaVersion is 1

  # ============================================================================
  # defineProcessCommand
  # ============================================================================

  Rule: defineProcessCommand creates a process command with correct metadata

    **Invariant:** The metadata category is "process" with targetProcess set and no targetAggregate.
    **Verified by:** Equality and undefined assertions on metadata fields.

    Scenario: Process command has correct category and target
      When a process command "StartOrderFulfillment" is defined for process "OrderFulfillment"
      Then the process metadata category is "process"
      And the process metadata targetProcess is "OrderFulfillment"
      And the process metadata targetAggregate is undefined

  Rule: defineProcessCommand uses processIdField for default partition key

    **Invariant:** The default partition key uses the processIdField name and value from args.
    **Verified by:** Deep equality on the returned partition key object.

    Scenario: Partition key uses processIdField
      Given a process command "StartOrderFulfillment" is defined with processIdField "processId"
      When the process getPartitionKey is called with processId "proc_123"
      Then the process partition key is name "processId" and value "proc_123"

  Rule: defineProcessCommand auto-registers with correct category info

    **Invariant:** Auto-registered process commands appear in registry with process category.
    **Verified by:** Registry has(), list(), and category/targetProcess assertions.

    Scenario: Process command auto-registers with category and target info
      When a process command "StartOrderFulfillment" is defined for process "OrderFulfillment" with auto-register
      Then the global registry has "StartOrderFulfillment"
      And the registry entry for "StartOrderFulfillment" has category "process" and targetProcess "OrderFulfillment"

  # ============================================================================
  # defineSystemCommand
  # ============================================================================

  Rule: defineSystemCommand creates a system command with correct metadata

    **Invariant:** The metadata category is "system" with subsystem and description set.
    **Verified by:** Equality assertions on metadata fields.

    Scenario: System command has correct category, subsystem, and description
      When a system command "CleanupExpiredCommands" is defined with subsystem "cleanup" and description "Cleans up expired command records"
      Then the system metadata category is "system"
      And the system metadata subsystem is "cleanup"
      And the system metadata description is "Cleans up expired command records"

  Rule: defineSystemCommand generates toHandlerArgs correctly

    **Invariant:** toHandlerArgs spreads original args and appends commandId and correlationId.
    **Verified by:** Deep equality on the returned handler args object.

    Scenario: System toHandlerArgs merges args with commandId and correlationId
      Given a system command "CleanupExpiredCommands" is defined
      When system toHandlerArgs is called with olderThanMs 86400000, commandId "cmd_123", correlationId "corr_456"
      Then the system handler args equal olderThanMs 86400000, commandId "cmd_123", correlationId "corr_456"

  Rule: defineSystemCommand works without projection

    **Invariant:** System commands do not require a projection; the config omits the projection property.
    **Verified by:** commandType assertion and "projection" in config check.

    Scenario: System command without projection has no projection property
      When a system command "CleanupExpiredCommands" is defined without a projection
      Then the system config commandType is "CleanupExpiredCommands"
      And the system config does not have a projection property

  Rule: defineSystemCommand supports optional projection

    **Invariant:** Projection is included in the config when provided.
    **Verified by:** Equality assertion on projection name.

    Scenario: System command with projection includes it in config
      When a system command "CleanupExpiredCommands" is defined with projection "cleanupStats"
      Then the system config projection name is "cleanupStats"

  Rule: defineSystemCommand uses system partition key when no custom key specified

    **Invariant:** The default partition key for system commands uses name "system" and value as the commandType.
    **Verified by:** Deep equality on the returned partition key object.

    Scenario: System partition key defaults to system/commandType
      Given a system command "CleanupExpiredCommands" is defined with a projection
      When the system getPartitionKey is called with olderThanMs 86400000
      Then the system partition key is name "system" and value "CleanupExpiredCommands"

  Rule: defineSystemCommand registers only when projection is provided

    **Invariant:** System commands without projections are not registered even with autoRegister true.
    **Verified by:** Registry has() checks for with and without projection.

    Scenario: System command without projection is not registered even with autoRegister true
      When a system command "CleanupExpiredCommandsNoProj" is defined with autoRegister true but no projection
      Then the global registry does not have "CleanupExpiredCommandsNoProj"
      When a system command "CleanupExpiredCommandsWithProj" is defined with autoRegister true and projection "cleanupStats"
      Then the global registry has "CleanupExpiredCommandsWithProj"

  Rule: defineSystemCommand defaults schemaVersion to 1

    **Invariant:** When schemaVersion is not provided, it defaults to 1.
    **Verified by:** Equality assertion on metadata.schemaVersion.

    Scenario: System schemaVersion defaults to 1
      When a system command "CleanupExpiredCommands" is defined without specifying schemaVersion
      Then the system metadata schemaVersion is 1
