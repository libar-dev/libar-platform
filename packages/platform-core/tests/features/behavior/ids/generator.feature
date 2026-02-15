@acceptance-criteria
Feature: ID Generation Utilities

  As a platform developer
  I want prefixed ID generation with validation
  So that IDs follow a consistent format across bounded contexts

  Pure functions for generating and parsing domain IDs:
  generateId, parseId, generateCorrelationId, generateCommandId,
  generateEventId, and generateIntegrationEventId.

  # ============================================================================
  # generateId
  # ============================================================================

  Rule: generateId produces IDs in {context}_{type}_{uuid} format

    **Invariant:** Generated IDs match the pattern {context}_{type}_{uuid} with a valid UUID v7.
    **Verified by:** Regex matching on generated IDs.

    @happy-path
    Scenario: Generated ID matches the expected format
      When generateId is called with context "orders" and type "order"
      Then the result matches pattern "^orders_order_[0-9a-f-]{36}$"

    @happy-path
    Scenario: Each call produces a unique ID
      When generateId is called twice with context "orders" and type "order"
      Then the two IDs are different

    @happy-path
    Scenario: Generated ID starts with the provided context and type
      When generateId is called with context "inventory" and type "product"
      Then the result starts with "inventory_product_"

    @happy-path
    Scenario: Lowercase alphanumeric values are accepted for context and type
      When generateId is called with the following inputs:
        | context    | type     | expectedPrefix       |
        | orders123  | order    | orders123_order_     |
        | orders     | order123 | orders_order123_     |
      Then each result starts with its expected prefix

  Rule: generateId rejects invalid context and type values

    **Invariant:** Context and type must be non-empty lowercase alphanumeric strings without underscores.
    **Verified by:** Error assertions on invalid inputs.

    @validation
    Scenario: Empty context or type throws an error
      Then generateId throws for invalid inputs:
        | context | type  | errorPattern          |
        |         | order | context cannot be empty |
        | orders  |       | type cannot be empty    |

    @validation
    Scenario: Context with disallowed characters throws an error
      Then generateId throws for invalid inputs:
        | context         | type  | errorPattern    |
        | orders_context  | order | Invalid context |
        | Orders          | order | Invalid context |
        | orders!         | order | Invalid context |
        | my orders       | order | Invalid context |

    @validation
    Scenario: Type with underscore throws an error
      Then generateId throws for invalid inputs:
        | context | type       | errorPattern |
        | orders  | order_type | Invalid type |

  # ============================================================================
  # parseId
  # ============================================================================

  Rule: parseId decomposes valid IDs into context, type, and uuid

    **Invariant:** A valid three-part ID is parsed into its constituent components.
    **Verified by:** Equality checks on parsed components.

    @happy-path
    Scenario: A well-formed ID is parsed into its components
      Given the ID string "orders_order_0190a7c4-1234-7abc-8def-1234567890ab"
      When parseId is called
      Then the parsed result is:
        | field   | value                                |
        | context | orders                               |
        | type    | order                                |
        | uuid    | 0190a7c4-1234-7abc-8def-1234567890ab |

    @happy-path
    Scenario: An ID produced by generateId is parseable
      Given an ID generated with context "inventory" and type "product"
      When parseId is called
      Then the parsed context is "inventory"
      And the parsed type is "product"
      And the parsed uuid matches "^[0-9a-f-]{36}$"

    @happy-path
    Scenario: UUID portion containing underscores is preserved
      Given the ID string "orders_order_uuid_with_extra_parts"
      When parseId is called
      Then the parsed result is:
        | field   | value                  |
        | context | orders                 |
        | type    | order                  |
        | uuid    | uuid_with_extra_parts  |

  Rule: parseId returns null for malformed IDs

    **Invariant:** IDs with fewer than three parts, empty segments, or empty input return null.
    **Verified by:** Null checks on parse results.

    @validation
    Scenario: IDs with fewer than three parts return null
      Then parseId returns null for all of:
        | input        |
        | orders       |
        | orders_order |
        |              |

    @validation
    Scenario: IDs with empty context or type return null
      Then parseId returns null for all of:
        | input        |
        | _order_uuid  |
        | orders__uuid |

  # ============================================================================
  # generateCorrelationId
  # ============================================================================

  Rule: generateCorrelationId produces corr_-prefixed unique IDs

    **Invariant:** Correlation IDs have the corr_ prefix and a UUID v7 suffix.
    **Verified by:** Regex matching and uniqueness check.

    @happy-path
    Scenario: Correlation ID has the expected format and is unique per call
      When generateCorrelationId is called twice
      Then both results match pattern "^corr_[0-9a-f-]{36}$"
      And the two results are different

  # ============================================================================
  # generateCommandId
  # ============================================================================

  Rule: generateCommandId produces cmd_-prefixed unique IDs

    **Invariant:** Command IDs have the cmd_ prefix and a UUID v7 suffix.
    **Verified by:** Regex matching and uniqueness check.

    @happy-path
    Scenario: Command ID has the expected format and is unique per call
      When generateCommandId is called twice
      Then both results match pattern "^cmd_[0-9a-f-]{36}$"
      And the two results are different

  # ============================================================================
  # generateEventId
  # ============================================================================

  Rule: generateEventId produces context-prefixed event IDs

    **Invariant:** Event IDs have the {context}_event_ prefix and a UUID v7 suffix.
    **Verified by:** Regex and prefix checks plus uniqueness.

    @happy-path
    Scenario: Event ID has the expected format and uses the provided context
      When generateEventId is called with context "orders"
      Then the result matches pattern "^orders_event_[0-9a-f-]{36}$"
      When generateEventId is called with context "inventory"
      Then the result starts with "inventory_event_"

    @happy-path
    Scenario: Event IDs are unique per call
      When generateEventId is called twice with context "orders"
      Then the two results are different

    @validation
    Scenario: Empty context throws an error
      Then generateEventId with empty context throws "context cannot be empty"

  # ============================================================================
  # generateIntegrationEventId
  # ============================================================================

  Rule: generateIntegrationEventId produces int_evt_-prefixed unique IDs

    **Invariant:** Integration event IDs have the int_evt_ prefix and a UUID v7 suffix.
    **Verified by:** Regex matching and uniqueness check.

    @happy-path
    Scenario: Integration event ID has the expected format and is unique per call
      When generateIntegrationEventId is called twice
      Then both results match pattern "^int_evt_[0-9a-f-]{36}$"
      And the two results are different

  # ============================================================================
  # UUID v7 Format
  # ============================================================================

  Rule: Generated UUIDs conform to UUID v7 and are time-ordered

    **Invariant:** The UUID portion of generated IDs follows UUID v7 format (version nibble = 7) and lexicographic order reflects generation order.
    **Verified by:** Regex on version nibble and sort-order comparison.

    @happy-path
    Scenario: UUID portion has version 7 indicator
      When generateId is called with context "test" and type "item"
      Then the UUID portion matches "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$"

    @happy-path
    Scenario: Ten sequential IDs are lexicographically sorted
      When 10 IDs are generated sequentially with context "test" and type "item"
      Then the IDs are in lexicographic order
