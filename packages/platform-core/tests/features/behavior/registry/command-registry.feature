@acceptance-criteria
Feature: CommandRegistry

  As a platform developer
  I want a central registry for command definitions
  So that commands can be looked up, validated, and filtered at runtime

  The CommandRegistry implements the singleton pattern, provides CRUD operations
  for command registrations, Zod-based payload validation, and query methods
  for filtering by category, bounded context, and tag.

  # ============================================================================
  # Singleton Pattern
  # ============================================================================

  Rule: CommandRegistry implements the singleton pattern

    **Invariant:** Multiple getInstance calls return the same instance; reset creates a new one.
    **Verified by:** Reference equality and inequality assertions.

    @happy-path
    Scenario: getInstance returns the same instance on multiple calls
      Given a fresh CommandRegistry instance
      When getInstance is called again
      Then both instances are the same object

    Scenario: Reset creates a new instance
      Given a fresh CommandRegistry instance
      When the registry is reset and a new instance is obtained
      Then the new instance is a different object

  # ============================================================================
  # Command Registration
  # ============================================================================

  Rule: Commands can be registered and duplicate registration is rejected

    **Invariant:** Each commandType may be registered at most once.
    **Verified by:** has() returns true after registration; duplicate throws with context info.

    @happy-path
    Scenario: Register a command successfully
      Given a fresh CommandRegistry instance
      When a "CreateOrder" command is registered
      Then the registry has "CreateOrder"

    @validation
    Scenario: Duplicate registration throws an error
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered in context "orders"
      When a duplicate "CreateOrder" command is registered in context "other"
      Then the registration throws a duplicate error mentioning "orders"

    Scenario: Different command types can be registered
      Given a fresh CommandRegistry instance
      When "CreateOrder" and "CancelOrder" commands are both registered
      Then the registry size is 2

  # ============================================================================
  # Unregister
  # ============================================================================

  Rule: Commands can be unregistered from the registry

    **Invariant:** Unregistering a registered command removes it; unregistering a missing command returns false.
    **Verified by:** has() and unregister return value assertions.

    @happy-path
    Scenario: Unregister removes a registered command
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered
      When "CreateOrder" is unregistered
      Then unregister returned true
      And the registry does not have "CreateOrder"

    @validation
    Scenario: Unregister returns false for non-existent command
      Given a fresh CommandRegistry instance
      When "NonExistent" is unregistered
      Then unregister returned false

  # ============================================================================
  # getConfig
  # ============================================================================

  Rule: getConfig returns the command configuration or undefined

    **Invariant:** getConfig returns config for registered commands, undefined for unknown commands.
    **Verified by:** Defined/undefined checks and commandType field assertion.

    @happy-path
    Scenario: getConfig returns config for a registered command
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered
      When getConfig is called for "CreateOrder"
      Then the config is defined with commandType "CreateOrder"

    @validation
    Scenario: getConfig returns undefined for a non-existent command
      Given a fresh CommandRegistry instance
      When getConfig is called for "NonExistent"
      Then the config is undefined

  # ============================================================================
  # getRegistration
  # ============================================================================

  Rule: getRegistration returns the full registration or undefined

    **Invariant:** getRegistration returns full metadata for registered commands, undefined for unknown.
    **Verified by:** Defined/undefined checks and metadata field assertions.

    @happy-path
    Scenario: getRegistration returns full registration for a registered command
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered with description "Creates an order"
      When getRegistration is called for "CreateOrder"
      Then the registration is defined with commandType "CreateOrder" and description "Creates an order"

    @validation
    Scenario: getRegistration returns undefined for a non-existent command
      Given a fresh CommandRegistry instance
      When getRegistration is called for "NonExistent"
      Then the registration result is undefined

  # ============================================================================
  # has
  # ============================================================================

  Rule: has checks whether a command is registered

    **Invariant:** has returns true for registered commands, false for unknown.
    **Verified by:** Boolean return value assertions.

    @happy-path
    Scenario: has returns true for a registered command
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered
      Then the registry has "CreateOrder"

    @validation
    Scenario: has returns false for a non-existent command
      Given a fresh CommandRegistry instance
      Then the registry does not have "NonExistent"

  # ============================================================================
  # Validate
  # ============================================================================

  Rule: validate checks command payloads against registered Zod schemas

    **Invariant:** Valid payloads pass; invalid payloads return errors; unknown commands return UNKNOWN_COMMAND.
    **Verified by:** valid flag, data equality, and error code assertions.

    @happy-path
    Scenario: Validate returns valid for correct payload
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered with orderId and customerId schema
      When "CreateOrder" is validated with orderId "ord_123" and customerId "cust_456"
      Then validation is valid with matching data

    @validation
    Scenario: Validate returns invalid for incorrect payload
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered with orderId and customerId schema
      When "CreateOrder" is validated with only orderId "ord_123"
      Then validation is invalid with errors

    Scenario: Validate returns UNKNOWN_COMMAND for non-existent command
      Given a fresh CommandRegistry instance
      When "NonExistent" is validated with empty payload
      Then validation is invalid with error code "UNKNOWN_COMMAND"

  # ============================================================================
  # List
  # ============================================================================

  Rule: list returns all registered commands as CommandInfo objects

    **Invariant:** list returns an empty array when empty, all commands otherwise with correct shape.
    **Verified by:** Length, commandType membership, and field assertions.

    @happy-path
    Scenario: list returns empty array when no commands are registered
      Given a fresh CommandRegistry instance
      Then list returns an empty array

    Scenario: list returns all registered commands
      Given a fresh CommandRegistry instance
      And "CreateOrder" and "CancelOrder" are registered for listing
      Then list returns 2 commands containing:
        | commandType |
        | CreateOrder |
        | CancelOrder |

    Scenario: list returns CommandInfo objects with correct shape
      Given a fresh CommandRegistry instance
      And a "CreateOrder" command is registered with full metadata
      Then the CommandInfo has the expected fields

  # ============================================================================
  # listByCategory
  # ============================================================================

  Rule: listByCategory filters commands by their category

    **Invariant:** Only commands matching the given category are returned.
    **Verified by:** Length and commandType assertions per category.

    @happy-path
    Scenario: Filter commands by category
      Given a fresh CommandRegistry instance
      And the following categorized commands are registered:
        | commandType      | category  |
        | CreateOrder      | aggregate |
        | StartFulfillment | process   |
        | CleanupExpired   | system    |
      Then listByCategory returns the expected results:
        | category  | count | commandType      |
        | aggregate | 1     | CreateOrder      |
        | process   | 1     | StartFulfillment |
        | system    | 1     | CleanupExpired   |
        | batch     | 0     |                  |

  # ============================================================================
  # listByContext
  # ============================================================================

  Rule: listByContext filters commands by bounded context

    **Invariant:** Only commands matching the given bounded context are returned.
    **Verified by:** Length and commandType assertions per context.

    @happy-path
    Scenario: Filter commands by bounded context
      Given a fresh CommandRegistry instance
      And commands are registered across contexts for context filtering
      Then listByContext "orders" returns 2 commands
      And listByContext "nonexistent" returns 0 commands

  # ============================================================================
  # listByTag
  # ============================================================================

  Rule: listByTag filters commands by tag

    **Invariant:** Only commands containing the given tag are returned.
    **Verified by:** Length and commandType assertions per tag.

    @happy-path
    Scenario: Filter commands by tag
      Given a fresh CommandRegistry instance
      And commands are registered with tags for tag filtering
      Then listByTag "orders" returns 2 commands
      And listByTag "inventory" returns 1 command with commandType "ReserveStock"
      And listByTag "nonexistent" returns 0 commands

  # ============================================================================
  # groupByContext
  # ============================================================================

  Rule: groupByContext groups commands by their bounded context

    **Invariant:** Returns a Map keyed by context with command arrays as values.
    **Verified by:** Map size and per-key length assertions.

    @happy-path
    Scenario: Group commands by bounded context
      Given a fresh CommandRegistry instance
      And commands are registered across contexts for grouping
      Then groupByContext returns a map with 2 keys
      And the "orders" group has 2 commands
      And the "inventory" group has 1 command

    Scenario: groupByContext returns empty map when no commands
      Given a fresh CommandRegistry instance
      Then groupByContext returns a map with 0 keys

  # ============================================================================
  # Size and Clear
  # ============================================================================

  Rule: size returns the number of registered commands

    **Invariant:** size returns 0 when empty, correct count after registration.
    **Verified by:** Numeric equality assertions.

    @happy-path
    Scenario: Size reflects registered command count
      Given a fresh CommandRegistry instance
      Then the registry size is 0
      When "CreateOrder" and "CancelOrder" are registered for size check
      Then the registry size is 2

  Rule: clear removes all registrations

    **Invariant:** After clear, size returns 0.
    **Verified by:** Size assertion after clear.

    @happy-path
    Scenario: Clear removes all registrations
      Given a fresh CommandRegistry instance
      And "CreateOrder" and "CancelOrder" are registered for clearing
      When the registry is cleared
      Then the registry size is 0

  # ============================================================================
  # globalRegistry
  # ============================================================================

  Rule: globalRegistry is a functional singleton instance

    **Invariant:** globalRegistry is defined and exposes the register function.
    **Verified by:** Defined check and typeof assertion on register method.

    @happy-path
    Scenario: globalRegistry is a functional registry instance
      Then globalRegistry is defined
      And globalRegistry exposes a register function
