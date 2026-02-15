Feature: Projection Registry CRUD and Lookup

  The ProjectionRegistry provides CRUD operations and lookup capabilities
  for managing projection definitions across bounded contexts.

  # ============================================================================
  # Rule: Registration
  # ============================================================================

  Rule: Registry accepts and stores projection definitions
    Invariant: Each projection name must be unique within the registry
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Register a single projection
      Given an empty projection registry
      When I register the "orderSummary" projection
      Then the registry has "orderSummary"
      And the registry size is 1

    @acceptance-criteria @happy-path
    Scenario: Register multiple projections
      Given an empty projection registry
      When I register all standard projections
      Then the registry size is 3

    @acceptance-criteria @validation
    Scenario: Duplicate projection name throws error
      Given a registry with the "orderSummary" projection
      When I attempt to register "orderSummary" again
      Then it throws "Projection \"orderSummary\" is already registered"

  # ============================================================================
  # Rule: Get
  # ============================================================================

  Rule: Registry returns projection definitions by name
    Invariant: get returns the exact definition that was registered
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Get returns projection by name
      Given a registry with "orderSummary" and "productCatalog" projections
      When I get the "orderSummary" projection
      Then the projection name is "orderSummary"
      And the target table is "orderSummaries"

    @acceptance-criteria @validation
    Scenario: Get returns undefined for unknown projection
      Given a registry with "orderSummary" and "productCatalog" projections
      When I get the "unknownProjection" projection
      Then the result is undefined

  # ============================================================================
  # Rule: Has
  # ============================================================================

  Rule: Registry checks existence of projection definitions
    Invariant: has returns true only for registered projections
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Has returns true for registered projection
      Given a registry with the "orderSummary" projection
      When I check if the registry has "orderSummary"
      Then the result is true

    @acceptance-criteria @validation
    Scenario: Has returns false for unregistered projection
      Given an empty projection registry
      When I check if the registry has "unknownProjection"
      Then the result is false

  # ============================================================================
  # Rule: List
  # ============================================================================

  Rule: Registry lists all registered projection definitions
    Invariant: list returns all and only registered projections
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: List returns empty array for empty registry
      Given an empty projection registry
      When I list all projections
      Then the list is empty

    @acceptance-criteria @happy-path
    Scenario: List returns all registered projections
      Given a registry with "orderSummary" and "productCatalog" projections
      When I list all projections
      Then the list has 2 projections
      And the list contains all of:
        | name           |
        | orderSummary   |
        | productCatalog |

  # ============================================================================
  # Rule: Size
  # ============================================================================

  Rule: Registry reports its size accurately
    Invariant: size reflects the exact number of registered projections
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: Size is 0 for empty registry
      Given an empty projection registry
      Then the registry size is 0

    @acceptance-criteria @happy-path
    Scenario: Size reflects registration count
      Given a registry with "orderSummary" and "productCatalog" projections
      Then the registry size is 2

  # ============================================================================
  # Rule: GetByEventType
  # ============================================================================

  Rule: Registry looks up projections by event type subscription
    Invariant: getByEventType returns all projections subscribed to that event
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: GetByEventType returns multiple matching projections
      Given a registry with all standard projections
      When I get projections by event type "OrderCreated"
      Then the event lookup returns 2 projections
      And the event lookup contains all of:
        | name               |
        | orderSummary       |
        | orderWithInventory |

    @acceptance-criteria @happy-path
    Scenario: GetByEventType returns single context-specific projection
      Given a registry with all standard projections
      When I get projections by event type "ProductCreated"
      Then the event lookup returns 1 projection
      And the first event lookup result is "productCatalog"

    @acceptance-criteria @validation
    Scenario: GetByEventType returns empty for unknown event
      Given a registry with all standard projections
      When I get projections by event type "UnknownEvent"
      Then the event lookup returns 0 projections

  # ============================================================================
  # Rule: GetAllEventTypes
  # ============================================================================

  Rule: Registry aggregates all subscribed event types
    Invariant: getAllEventTypes returns sorted unique event types
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: GetAllEventTypes returns empty for empty registry
      Given an empty projection registry
      When I get all event types
      Then the event types list is empty

    @acceptance-criteria @happy-path
    Scenario: GetAllEventTypes returns sorted unique event types
      Given a registry with all standard projections
      When I get all event types
      Then the event types are sorted
      And the event types are unique
      And the event types include all of:
        | eventType      |
        | OrderCreated   |
        | ProductCreated |
        | StockReserved  |

  # ============================================================================
  # Rule: GetByContext
  # ============================================================================

  Rule: Registry filters projections by bounded context
    Invariant: getByContext returns only projections in the specified context
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: GetByContext filters by orders context
      Given a registry with all standard projections
      When I get projections by context "orders"
      Then the context lookup returns 1 projection
      And the first context lookup result is "orderSummary"

    @acceptance-criteria @happy-path
    Scenario: GetByContext filters by inventory context
      Given a registry with all standard projections
      When I get projections by context "inventory"
      Then the context lookup returns 1 projection
      And the first context lookup result is "productCatalog"

    @acceptance-criteria @happy-path
    Scenario: GetByContext filters by cross-context
      Given a registry with all standard projections
      When I get projections by context "cross-context"
      Then the context lookup returns 1 projection
      And the first context lookup result is "orderWithInventory"

    @acceptance-criteria @validation
    Scenario: GetByContext returns empty for unknown context
      Given a registry with all standard projections
      When I get projections by context "unknown"
      Then the context lookup returns 0 projections

  # ============================================================================
  # Rule: GetRebuildOrder
  # ============================================================================

  Rule: Registry determines projection rebuild ordering
    Invariant: Primary projections are rebuilt before cross-context projections
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: GetRebuildOrder returns empty for empty registry
      Given an empty projection registry
      When I get the rebuild order
      Then the rebuild order is empty

    @acceptance-criteria @happy-path
    Scenario: GetRebuildOrder places primary before cross-context
      Given a registry with projections registered in reverse order
      When I get the rebuild order
      Then "orderSummary" appears before "orderWithInventory"
      And "productCatalog" appears before "orderWithInventory"
      And the rebuild order has 3 projections

  # ============================================================================
  # Rule: GetByCategory
  # ============================================================================

  Rule: Registry filters projections by category with indexed lookup
    Invariant: getByCategory returns all projections of the requested category
    Verified by: Scenarios below

    @acceptance-criteria @happy-path
    Scenario: GetByCategory returns view projections
      Given a registry with all five category projections
      When I get projections by category "view"
      Then the category lookup returns 2 projections
      And the category lookup contains all of:
        | name           |
        | orderSummary   |
        | productCatalog |

    @acceptance-criteria @happy-path
    Scenario: GetByCategory returns logic projections
      Given a registry with all five category projections
      When I get projections by category "logic"
      Then the category lookup returns 1 projection
      And the first category lookup result is "orderExistence"

    @acceptance-criteria @happy-path
    Scenario: GetByCategory returns reporting projections
      Given a registry with all five category projections
      When I get projections by category "reporting"
      Then the category lookup returns 1 projection
      And the first category lookup result is "dailySales"

    @acceptance-criteria @happy-path
    Scenario: GetByCategory returns integration projections
      Given a registry with all five category projections
      When I get projections by category "integration"
      Then the category lookup returns 1 projection
      And the first category lookup result is "orderWithInventory"

    @acceptance-criteria @validation
    Scenario: GetByCategory returns empty when no projections match
      Given a registry with the "orderSummary" projection
      When I get projections by category "logic"
      Then the category lookup returns 0 projections

    @acceptance-criteria @happy-path
    Scenario: GetByCategory verifies all results have requested category
      Given a registry with all five category projections
      When I get projections by category "view"
      Then all returned projections have category "view"

    @acceptance-criteria @happy-path
    Scenario: GetByCategory works regardless of registration order
      Given a registry with projections registered in non-category-grouped order
      When I get projections by category "view"
      Then the category lookup returns 2 projections
      And the category lookup names sorted are "orderSummary" and "productCatalog"

    @acceptance-criteria @happy-path
    Scenario: Category index is maintained incrementally
      Given an empty projection registry
      When I register "orderSummary" with category "view"
      Then the category lookup for "view" returns 1 projection
      When I register "orderExistence" with category "logic"
      Then the category counts are:
        | category | count |
        | view     | 1     |
        | logic    | 1     |
      When I register "productCatalog" with category "view"
      Then the category lookup for "view" returns 2 projections
