@acceptance-criteria
Feature: Query Factory

  As a platform developer
  I want factory functions for query descriptors and pagination
  So that read model queries are created with correct types, configurations, and pagination defaults

  Query descriptor factories produce typed descriptors for single, list, count,
  and paginated read model queries. A query registry groups descriptors by
  bounded context. Pagination options enforce page size limits.

  # ============================================================================
  # createReadModelQuery
  # ============================================================================

  Rule: createReadModelQuery produces descriptors with correct result type and config

    **Invariant:** The descriptor carries the specified result type and all config fields.
    **Verified by:** Creating single, list, and count descriptors and asserting fields.

    @happy-path
    Scenario: Single result query descriptor has correct result type and config
      Given a read model query descriptor for "getOrderById" with result type "single"
      Then the descriptor has result type "single"
      And the descriptor config has all expected fields:
        | field            | value           |
        | queryName        | getOrderById    |
        | description      | Gets a single order by its ID |
        | sourceProjection | orderSummary    |
        | targetTable      | orderSummaries  |

    @happy-path
    Scenario: List result query descriptor has correct result type
      Given a read model query descriptor for "getOrdersByCustomer" with result type "list"
      Then the descriptor has result type "list"
      And the descriptor config queryName is "getOrdersByCustomer"

    @happy-path
    Scenario: Count result query descriptor has correct result type
      Given a read model query descriptor for "countPendingOrders" with result type "count"
      Then the descriptor has result type "count"
      And the descriptor config queryName is "countPendingOrders"

  # ============================================================================
  # createPaginatedQuery
  # ============================================================================

  Rule: createPaginatedQuery produces paginated descriptors with default page sizes

    **Invariant:** Without custom sizes, defaults from pagination constants are used.
    **Verified by:** Creating a descriptor without custom sizes and asserting defaults.

    @happy-path
    Scenario: Paginated query descriptor uses default page sizes
      Given a paginated query descriptor for "listOrders" with index "by_customer"
      Then the descriptor has result type "paginated"
      And the descriptor config queryName is "listOrders"
      And the descriptor config paginationIndex is "by_customer"
      And the descriptor defaults use standard pagination constants

  Rule: createPaginatedQuery accepts custom page sizes

    **Invariant:** Custom page sizes override defaults in both config and defaults.
    **Verified by:** Providing custom sizes and asserting they appear in the descriptor.

    @happy-path
    Scenario: Paginated query descriptor uses custom page sizes
      Given a paginated query descriptor for "listProducts" with custom page size 50 and max 200
      Then the descriptor has custom page sizes:
        | field        | value |
        | pageSize     | 50    |
        | maxPageSize  | 200   |

  Rule: createPaginatedQuery applies defaults to config when not provided

    **Invariant:** Config fields defaultPageSize and maxPageSize are populated from constants.
    **Verified by:** Creating without custom sizes and asserting config fields.

    @happy-path
    Scenario: Config receives default pagination values
      Given a paginated query descriptor for "listItems" with index "by_created" and no custom sizes
      Then the descriptor config has default pagination values

  # ============================================================================
  # createQueryRegistry
  # ============================================================================

  Rule: createQueryRegistry creates a registry with context and projection

    **Invariant:** Registry carries the bounded context name and source projection.
    **Verified by:** Creating an empty registry and asserting fields.

    @happy-path
    Scenario: Empty registry has correct context and projection
      Given a query registry for context "orders" and projection "orderSummary" with no queries
      Then the registry context is "orders"
      And the registry sourceProjection is "orderSummary"
      And the registry has 0 queries

  Rule: createQueryRegistry indexes multiple query descriptors

    **Invariant:** All registered queries are accessible by key with correct result types.
    **Verified by:** Registering two queries and asserting keys and result types.

    @happy-path
    Scenario: Registry with multiple queries provides keyed access
      Given a query registry with a "single" query "getById" and a "paginated" query "list"
      Then the registry has 2 queries
      And the registry query result types are:
        | key     | resultType |
        | getById | single     |
        | list    | paginated  |

  Rule: createQueryRegistry provides type-safe access to query descriptors

    **Invariant:** Accessing a registered query returns its config.
    **Verified by:** Accessing a query by key and asserting its queryName.

    @happy-path
    Scenario: Type-safe access to registered query descriptor
      Given a query registry with a single query "getById"
      Then the registry query "getById" has queryName "getById"

  # ============================================================================
  # getPaginationOptions
  # ============================================================================

  Rule: getPaginationOptions returns defaults when no options provided

    **Invariant:** Without caller options, the descriptor defaults are used.
    **Verified by:** Calling with undefined and asserting default page size and no cursor.

    @happy-path
    Scenario: No options returns descriptor defaults
      Given a paginated query with default page size 25 and max 100
      When getPaginationOptions is called with no options
      Then the pagination page size is 25
      And the pagination cursor is undefined

  Rule: getPaginationOptions respects provided page size within limits

    **Invariant:** A valid page size within [1, max] is used as-is.
    **Verified by:** Providing page size 50 within max 100.

    @happy-path
    Scenario: Provided page size within limits is used
      Given a paginated query with default page size 25 and max 100
      When getPaginationOptions is called with page size 50
      Then the pagination page size is 50

  Rule: getPaginationOptions caps page size at max

    **Invariant:** Page size exceeding max is clamped to max.
    **Verified by:** Providing page size 500 with max 100.

    @validation
    Scenario: Page size exceeding max is clamped
      Given a paginated query with default page size 25 and max 100
      When getPaginationOptions is called with page size 500
      Then the pagination page size is 100

  Rule: getPaginationOptions enforces minimum page size of 1

    **Invariant:** Page sizes of 0 or negative are clamped to 1.
    **Verified by:** Providing 0 and -10 and asserting both produce 1.

    @validation
    Scenario: Zero and negative page sizes are clamped to 1
      Given a paginated query with default page size 25 and max 100
      When getPaginationOptions is called with each page size:
        | pageSize |
        | 0        |
        | -10      |
      Then each result has page size 1

  Rule: getPaginationOptions passes through cursor

    **Invariant:** The cursor value is forwarded unchanged.
    **Verified by:** Providing a cursor and asserting it appears in options.

    @happy-path
    Scenario: Cursor is passed through to options
      Given a paginated query with default page size 25 and max 100
      When getPaginationOptions is called with page size 20 and cursor "abc123"
      Then the pagination cursor is "abc123"

  Rule: getPaginationOptions returns undefined cursor when not provided

    **Invariant:** Without a cursor, the field is undefined.
    **Verified by:** Calling with page size only and asserting cursor is undefined.

    @happy-path
    Scenario: Cursor is undefined when not provided
      Given a paginated query with default page size 25 and max 100
      When getPaginationOptions is called with page size 20
      Then the pagination cursor is undefined

  # ============================================================================
  # Type Safety
  # ============================================================================

  Rule: Query descriptors preserve TypeScript result types

    **Invariant:** ReadModelQueryDescriptor and PaginatedQueryDescriptor carry correct resultType.
    **Verified by:** Creating typed descriptors and asserting resultType.

    @happy-path
    Scenario: Read model and paginated descriptors preserve result types
      Given a typed single ReadModelQueryDescriptor for "getOrder"
      And a typed PaginatedQueryDescriptor for "listProducts"
      Then the single descriptor has result type "single"
      And the paginated descriptor has result type "paginated"
