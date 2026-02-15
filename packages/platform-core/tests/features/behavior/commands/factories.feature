@acceptance-criteria
Feature: Command Category Factories

  As a platform developer
  I want category-specific factory functions for command schemas
  So that commands are created with the correct category, validated fields, and typed payloads

  Factories produce Zod schemas pre-configured with a fixed command category.
  Each factory enforces literal command types, required base fields, and
  category-specific extensions (aggregate target, process type, batch config).

  # ============================================================================
  # createAggregateCommandSchema
  # ============================================================================

  Rule: createAggregateCommandSchema produces schemas with aggregate category and literal command type

    **Invariant:** Parsed commands always carry category "aggregate" and the literal commandType.
    **Verified by:** Parsing a valid command and asserting category and commandType fields.

    @happy-path
    Scenario: Schema assigns aggregate category and preserves command type
      Given an aggregate command schema for "CreateOrder" with payload fields "orderId,customerId"
      When a valid command is parsed with commandType "CreateOrder"
      Then the parsed command has category "aggregate"
      And the parsed command has commandType "CreateOrder"

  Rule: createAggregateCommandSchema includes aggregate target when provided

    **Invariant:** When aggregateTarget config is supplied, it appears on parsed commands.
    **Verified by:** Parsing and asserting aggregateTarget equality.

    @happy-path
    Scenario: Aggregate target is present on parsed command
      Given an aggregate command schema for "AddOrderItem" with aggregate target type "Order" and idField "orderId"
      When a valid command is parsed with commandType "AddOrderItem"
      Then the parsed command has aggregateTarget type "Order" and idField "orderId"

  Rule: createAggregateCommandSchema makes aggregate target optional when not configured

    **Invariant:** Without aggregateTarget config, the field is undefined on parsed commands.
    **Verified by:** Parsing and asserting aggregateTarget is undefined.

    @happy-path
    Scenario: Aggregate target is undefined when not configured
      Given an aggregate command schema for "CreateOrder" with payload fields "orderId"
      When a valid command is parsed with commandType "CreateOrder"
      Then the parsed command has undefined aggregateTarget

  Rule: createAggregateCommandSchema enforces literal command type

    **Invariant:** A mismatched commandType causes a Zod parse error.
    **Verified by:** Attempting to parse with a wrong commandType and expecting a throw.

    @validation
    Scenario: Schema rejects a mismatched command type
      Given an aggregate command schema for "CreateOrder" with payload fields "orderId"
      When a command with commandType "WrongType" is parsed
      Then the parse throws a validation error

  Rule: createAggregateCommandSchema rejects commands missing required base fields

    **Invariant:** commandId, correlationId, timestamp, targetContext, and payload are all required.
    **Verified by:** Omitting each field individually and expecting a throw.

    @validation
    Scenario: Schema rejects commands missing required fields
      Given an aggregate command schema for "CreateOrder" with payload fields "orderId"
      When commands are parsed with the following missing fields:
        | missingField  |
        | commandId     |
        | correlationId |
        | timestamp     |
        | targetContext  |
        | payload       |
      Then each parse throws a validation error

  # ============================================================================
  # createProcessCommandSchema
  # ============================================================================

  Rule: createProcessCommandSchema produces schemas with process category

    **Invariant:** Parsed commands always carry category "process".
    **Verified by:** Parsing a valid command and asserting category field.

    @happy-path
    Scenario: Schema assigns process category and preserves command type
      Given a process command schema for "StartOrderFulfillment" with payload fields "orderId,warehouseId"
      When a valid process command is parsed with commandType "StartOrderFulfillment"
      Then the parsed command has category "process"
      And the parsed command has commandType "StartOrderFulfillment"

  Rule: createProcessCommandSchema includes process type when provided

    **Invariant:** When processType is supplied, it appears on parsed commands.
    **Verified by:** Parsing and asserting processType equality.

    @happy-path
    Scenario: Process type is present on parsed command
      Given a process command schema for "StartOrderFulfillment" with processType "OrderFulfillmentSaga"
      When a valid process command is parsed with commandType "StartOrderFulfillment"
      Then the parsed command has processType "OrderFulfillmentSaga"

  Rule: createProcessCommandSchema makes process type optional when not configured

    **Invariant:** Without processType, the field is undefined on parsed commands.
    **Verified by:** Parsing and asserting processType is undefined.

    @happy-path
    Scenario: Process type is undefined when not configured
      Given a process command schema for "StartProcess" with payload fields "id"
      When a valid process command is parsed with commandType "StartProcess"
      Then the parsed command has undefined processType

  # ============================================================================
  # createSystemCommandSchema
  # ============================================================================

  Rule: createSystemCommandSchema produces schemas with system category

    **Invariant:** Parsed commands always carry category "system".
    **Verified by:** Parsing a valid command and asserting category field.

    @happy-path
    Scenario: Schema assigns system category and preserves command type
      Given a system command schema for "CleanupExpiredCommands" with payload fields "olderThanDays:number"
      When a valid system command is parsed with commandType "CleanupExpiredCommands"
      Then the parsed command has category "system"
      And the parsed command has commandType "CleanupExpiredCommands"

  Rule: createSystemCommandSchema defaults requiresIdempotency to false

    **Invariant:** Without explicit config, requiresIdempotency is false.
    **Verified by:** Parsing and asserting requiresIdempotency is false.

    @happy-path
    Scenario: requiresIdempotency defaults to false
      Given a system command schema for "RunHealthCheck" with empty payload
      When a valid system command is parsed with commandType "RunHealthCheck"
      Then the parsed command has requiresIdempotency false

  Rule: createSystemCommandSchema allows overriding requiresIdempotency

    **Invariant:** When requiresIdempotency is set to true, it appears on parsed commands.
    **Verified by:** Parsing and asserting requiresIdempotency is true.

    @happy-path
    Scenario: requiresIdempotency can be set to true
      Given a system command schema for "MigrateData" with requiresIdempotency true
      When a valid system command is parsed with commandType "MigrateData"
      Then the parsed command has requiresIdempotency true

  # ============================================================================
  # createBatchCommandSchema
  # ============================================================================

  Rule: createBatchCommandSchema produces schemas with batch category and items array

    **Invariant:** Parsed commands carry category "batch" and a typed items array.
    **Verified by:** Parsing a valid batch command and asserting category and items length.

    @happy-path
    Scenario: Schema assigns batch category with items
      Given a batch command schema for "BulkCreateOrders" with item fields "customerId,productId"
      When a valid batch command is parsed with 2 items
      Then the parsed command has category "batch"
      And the parsed command has 2 items

  Rule: createBatchCommandSchema includes batch config when provided

    **Invariant:** When batchConfig is supplied, it appears on parsed commands.
    **Verified by:** Parsing and asserting batchConfig equality.

    @happy-path
    Scenario: Batch config is present on parsed command
      Given a batch command schema for "BulkUpdateProducts" with batchConfig maxItems 100 and continueOnError true
      When a valid batch command is parsed with 1 item
      Then the parsed command has batchConfig maxItems 100 and continueOnError true

  Rule: createBatchCommandSchema validates items against item schema

    **Invariant:** Items that fail the item payload schema cause a Zod parse error.
    **Verified by:** Providing an invalid item and expecting a throw.

    @validation
    Scenario: Schema rejects items that fail item schema validation
      Given a batch command schema for "BulkProcess" with item fields "id,value:positive-number"
      When a batch command is parsed with an invalid item value -5
      Then the parse throws a validation error

  Rule: createBatchCommandSchema allows empty items array

    **Invariant:** An empty items array is valid.
    **Verified by:** Parsing with empty items and asserting the array is empty.

    @happy-path
    Scenario: Empty items array is accepted
      Given a batch command schema for "BulkProcess" with item fields "id"
      When a valid batch command is parsed with 0 items
      Then the parsed command has 0 items

  # ============================================================================
  # getCommandCategoryFromSchema
  # ============================================================================

  Rule: getCommandCategoryFromSchema extracts category from factory-created schemas

    **Invariant:** Each factory's schema returns the correct category string.
    **Verified by:** Creating one schema per factory and asserting extracted category.

    @happy-path
    Scenario: Category is extracted from each factory schema
      Given a schema from each command category factory:
        | factory   | expected  |
        | aggregate | aggregate |
        | process   | process   |
        | system    | system    |
        | batch     | batch     |
      Then each extraction returns the expected category

  Rule: getCommandCategoryFromSchema returns undefined for non-command schemas

    **Invariant:** Schemas without a category field return undefined.
    **Verified by:** Calling with non-object and plain object schemas.

    @validation
    Scenario: Non-command schemas return undefined
      Given getCommandCategoryFromSchema is called on non-command schemas:
        | schemaType     |
        | string         |
        | number         |
        | plain-object   |
      Then each extraction returns undefined
