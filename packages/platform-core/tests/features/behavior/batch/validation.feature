@acceptance-criteria
Feature: Batch Validation

  As a platform developer
  I want pre-flight validation for batch command execution
  So that invalid batches are rejected before processing begins

  Batch validation ensures commands are well-formed, respects mode constraints
  (partial vs atomic), enforces single-aggregate scope for atomic mode, and
  filters by bounded context when specified.

  # ============================================================================
  # validateBatch - Empty Batch
  # ============================================================================

  Rule: Empty batches are always rejected

    **Invariant:** A batch with zero commands is never valid, and oversized batches are rejected before deeper validation.
    **Verified by:** Validating an empty array returns EMPTY_BATCH; exact max succeeds; max+1 returns BATCH_TOO_LARGE.

    @happy-path
    Scenario: Rejects empty batch
      Given an empty batch of commands
      When the batch is validated in "partial" mode
      Then validation fails with error code "EMPTY_BATCH"

    @validation
    Scenario: Accepts batch exactly at max size
      Given a batch of 3 generic test commands
      When the batch is validated in "partial" mode with max batch size 3
      Then validation succeeds

    @validation
    Scenario: Rejects batch exceeding max size
      Given a batch of 4 generic test commands
      When the batch is validated in "partial" mode with max batch size 3
      Then validation fails with error code "BATCH_TOO_LARGE"

  # ============================================================================
  # validateBatch - Partial Mode
  # ============================================================================

  Rule: Partial mode accepts valid commands without cross-aggregate constraints

    **Invariant:** Partial mode validates command structure only, not aggregate targeting.
    **Verified by:** Valid commands pass; cross-context commands pass in partial mode.

    @happy-path
    Scenario: Accepts valid commands without registry
      Given a batch of commands:
        | commandType | args                  |
        | CreateOrder | {"orderId": "ord_1"}  |
        | CreateOrder | {"orderId": "ord_2"}  |
      When the batch is validated in "partial" mode without registry
      Then validation succeeds

    Scenario: Accepts commands in different bounded contexts
      Given a batch of commands:
        | commandType  | args                     |
        | CreateOrder  | {"orderId": "ord_1"}     |
        | ReserveStock | {"productId": "prod_1"}  |
      And a registry with entries:
        | commandType  | category  | boundedContext | aggregateType | idField   |
        | CreateOrder  | aggregate | orders         | Order         | orderId   |
        | ReserveStock | aggregate | inventory      | Stock         | productId |
      When the batch is validated in "partial" mode with registry
      Then validation succeeds

  # ============================================================================
  # validateBatch - Atomic Mode Without Registry
  # ============================================================================

  Rule: Atomic mode without registry requires explicit aggregate options

    **Invariant:** Atomic mode must know which aggregate to scope to.
    **Verified by:** Missing aggregateId or aggregateIdField yields MISSING_AGGREGATE_ID.

    @validation
    Scenario: Requires aggregateId option
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
      When the batch is validated in "atomic" mode without options
      Then validation fails with error code "MISSING_AGGREGATE_ID"

    Scenario: Requires aggregateIdField option
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
      When the batch is validated in "atomic" mode with only aggregateId "ord_1"
      Then validation fails with error code "MISSING_AGGREGATE_ID"

    @happy-path
    Scenario: Accepts when all commands target same aggregate
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_2"}   |
      When the batch is validated in "atomic" mode with aggregateId "ord_1" and field "orderId"
      Then validation succeeds

    Scenario: Rejects when commands target different aggregates
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
        | AddOrderItem | {"orderId": "ord_2", "productId": "prod_2"}   |
      When the batch is validated in "atomic" mode with aggregateId "ord_1" and field "orderId"
      Then validation fails with error code "CROSS_AGGREGATE_ATOMIC" at command index 1

  # ============================================================================
  # validateBatch - Atomic Mode With Registry
  # ============================================================================

  Rule: Atomic mode with registry enforces single-aggregate scope via metadata

    **Invariant:** All commands must target the same aggregate type and instance.
    **Verified by:** Cross-type, cross-instance, wrong-category, and unregistered commands are rejected.

    @happy-path
    Scenario: Accepts commands targeting same aggregate with explicit aggregateId
      Given a batch of commands:
        | commandType     | args                                          |
        | AddOrderItem    | {"orderId": "ord_1", "productId": "prod_1"}   |
        | AddOrderItem    | {"orderId": "ord_1", "productId": "prod_2"}   |
        | RemoveOrderItem | {"orderId": "ord_1", "itemId": "item_1"}      |
      And the standard atomic registry
      When the batch is validated in "atomic" mode with explicit aggregateId "ord_1" and registry
      Then validation succeeds

    Scenario: Infers aggregate ID from first command when not specified
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_2"}   |
      And the standard atomic registry
      When the batch is validated in "atomic" mode with registry only
      Then validation succeeds

    @validation
    Scenario: Rejects when commands target different aggregate instances
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
        | AddOrderItem | {"orderId": "ord_2", "productId": "prod_2"}   |
      And the standard atomic registry
      When the batch is validated in "atomic" mode with registry only
      Then validation fails with error code "CROSS_AGGREGATE_ATOMIC"

    Scenario: Rejects when commands target different aggregate types
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
        | ReserveStock | {"productId": "prod_1", "quantity": "1"}       |
      And the standard atomic registry
      When the batch is validated in "atomic" mode with registry only
      Then validation fails with error code "CROSS_AGGREGATE_ATOMIC"

    Scenario: Rejects non-aggregate commands in atomic mode
      Given a batch of commands:
        | commandType      | args                                          |
        | AddOrderItem     | {"orderId": "ord_1", "productId": "prod_1"}   |
        | SendNotification | {"message": "hello"}                           |
      And the standard atomic registry
      When the batch is validated in "atomic" mode with registry only
      Then validation fails with error code "WRONG_CATEGORY"

    Scenario: Rejects unregistered commands
      Given a batch of commands:
        | commandType    | args                      |
        | AddOrderItem   | {"orderId": "ord_1"}      |
        | UnknownCommand | {}                         |
      And the standard atomic registry
      When the batch is validated in "atomic" mode with registry only
      Then validation fails with error code "UNREGISTERED_COMMAND" at command index 1

  # ============================================================================
  # validateBatch - Bounded Context Filtering
  # ============================================================================

  Rule: Bounded context option filters commands to a single context

    **Invariant:** Commands from the wrong bounded context are rejected.
    **Verified by:** Matching context passes; mismatched context yields WRONG_BOUNDED_CONTEXT.

    @happy-path
    Scenario: Accepts commands matching specified bounded context
      Given a batch of commands:
        | commandType | args                  |
        | CreateOrder | {"orderId": "ord_1"}  |
      And a registry with entries:
        | commandType  | category  | boundedContext | aggregateType | idField   |
        | CreateOrder  | aggregate | orders         | Order         | orderId   |
        | ReserveStock | aggregate | inventory      | Stock         | productId |
      When the batch is validated in "partial" mode with boundedContext "orders" and registry
      Then validation succeeds

    @validation
    Scenario: Rejects commands from wrong bounded context
      Given a batch of commands:
        | commandType  | args                     |
        | CreateOrder  | {"orderId": "ord_1"}     |
        | ReserveStock | {"productId": "prod_1"}  |
      And a registry with entries:
        | commandType  | category  | boundedContext | aggregateType | idField   |
        | CreateOrder  | aggregate | orders         | Order         | orderId   |
        | ReserveStock | aggregate | inventory      | Stock         | productId |
      When the batch is validated in "partial" mode with boundedContext "orders" and registry
      Then validation fails with error code "WRONG_BOUNDED_CONTEXT" at command index 1

  # ============================================================================
  # extractAggregateId
  # ============================================================================

  Rule: extractAggregateId extracts string IDs from command args

    **Invariant:** Only string-valued fields are extracted; missing or non-string fields return undefined.
    **Verified by:** String value extracted, missing field returns undefined, non-string returns undefined.

    @happy-path
    Scenario: Extracts ID from command args
      Given a command "AddOrderItem" with args {"orderId": "ord_123", "productId": "prod_456"}
      When extractAggregateId is called with field "orderId"
      Then the extracted ID is "ord_123"

    @validation
    Scenario: Returns undefined for missing field
      Given a command "AddOrderItem" with args {"productId": "prod_456"}
      When extractAggregateId is called with field "orderId"
      Then the extracted ID is undefined

    Scenario: Returns undefined for non-string value
      Given a command "AddOrderItem" with args {"orderId": 123}
      When extractAggregateId is called with field "orderId"
      Then the extracted ID is undefined

  # ============================================================================
  # groupByAggregateId
  # ============================================================================

  Rule: groupByAggregateId groups commands by their aggregate ID field

    **Invariant:** Commands are partitioned by their aggregate ID value; missing IDs use a placeholder.
    **Verified by:** Group counts and sizes match expected partitioning.

    @happy-path
    Scenario: Groups commands by aggregate ID
      Given a batch of commands:
        | commandType  | args                                          |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_1"}   |
        | AddOrderItem | {"orderId": "ord_2", "productId": "prod_2"}   |
        | AddOrderItem | {"orderId": "ord_1", "productId": "prod_3"}   |
      When groupByAggregateId is called with field "orderId"
      Then there are 2 groups
      And group "ord_1" has 2 commands
      And group "ord_2" has 1 command

    Scenario: Uses placeholder for missing IDs
      Given a batch of commands:
        | commandType  | args                      |
        | AddOrderItem | {"orderId": "ord_1"}      |
        | AddOrderItem | {"productId": "prod_1"}   |
      When groupByAggregateId is called with field "orderId"
      Then there are 2 groups
      And group "ord_1" has 1 command
      And group "__no_id__" has 1 command
