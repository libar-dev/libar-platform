@acceptance-criteria
Feature: Pagination Helpers

  As a platform developer
  I want cursor-based pagination utilities for read model queries
  So that query results are paginated with consistent defaults, cursor encoding, and page size validation

  Pagination helpers provide constants, normalization, empty pages, paged results,
  cursor encoding/decoding, page size validation, and effective page size calculation.

  # ============================================================================
  # Constants
  # ============================================================================

  Rule: Pagination constants define reasonable defaults

    **Invariant:** DEFAULT_PAGE_SIZE is 20 and MAX_PAGE_SIZE is 100.
    **Verified by:** Asserting constant values directly.

    @happy-path
    Scenario: Pagination constants have expected values
      Then the pagination constants are:
        | constant         | value |
        | DEFAULT_PAGE_SIZE | 20   |
        | MAX_PAGE_SIZE     | 100  |

  # ============================================================================
  # normalizePaginationOptions
  # ============================================================================

  Rule: normalizePaginationOptions clamps page size and passes through cursor

    **Invariant:** Page size is clamped to [1, maxPageSize], floats are floored, cursor passes through unchanged.
    **Verified by:** Normalizing various option combinations and asserting output.

    @happy-path
    Scenario: Returns defaults when no options provided
      Given a pagination config with defaultPageSize 20 and maxPageSize 100
      When I normalize pagination options with no input
      Then the normalized pageSize is 20
      And the normalized cursor is undefined

    @happy-path
    Scenario: Uses provided page size within limits
      Given a pagination config with defaultPageSize 20 and maxPageSize 100
      When I normalize pagination options with pageSize 50
      Then the normalized pageSize is 50

    @validation
    Scenario: Caps page size at max
      Given a pagination config with defaultPageSize 20 and maxPageSize 100
      When I normalize pagination options with pageSize 200
      Then the normalized pageSize is 100

    @validation
    Scenario: Enforces minimum page size of 1 for boundary values
      Given a pagination config with defaultPageSize 20 and maxPageSize 100
      When I normalize pagination options with pageSize values:
        | pageSize |
        | 0        |
        | -5       |
      Then all normalized pageSizes are 1

    @happy-path
    Scenario: Passes through cursor
      Given a pagination config with defaultPageSize 20 and maxPageSize 100
      When I normalize pagination options with cursor "abc123"
      Then the normalized cursor is "abc123"

    @happy-path
    Scenario: Works with custom config values
      Given a pagination config with defaultPageSize 10 and maxPageSize 50
      When I normalize pagination options with various inputs:
        | pageSize    | expectedPageSize |
        | __default__ | 10               |
        | 100         | 50               |

    @validation
    Scenario: Rounds floating-point page sizes down
      Given a pagination config with defaultPageSize 20 and maxPageSize 100
      When I normalize pagination options with float pageSize values:
        | pageSize | expected |
        | 10.5     | 10       |
        | 1.1      | 1        |
        | 99.9     | 99       |

  # ============================================================================
  # createEmptyPage
  # ============================================================================

  Rule: createEmptyPage creates a done page with no items

    **Invariant:** An empty page has zero items, null cursor, and isDone true.
    **Verified by:** Creating empty pages and asserting structure.

    @happy-path
    Scenario: Creates an empty page with correct structure
      When I create an empty page
      Then the page has 0 items
      And the page continueCursor is null
      And the page isDone is true

    @happy-path
    Scenario: Preserves type information with empty array
      When I create an empty page
      Then the page items is an array with length 0

  # ============================================================================
  # createPagedResult
  # ============================================================================

  Rule: createPagedResult creates a page with items and continuation state

    **Invariant:** When cursor is non-null isDone is false; when cursor is null isDone is true.
    **Verified by:** Creating paged results with and without cursors.

    @happy-path
    Scenario: Creates a page with items and cursor
      Given items with ids "1", "2", "3"
      When I create a paged result with pageSize 3 and cursor "next-cursor"
      Then the page has 3 items
      And the page continueCursor is "next-cursor"
      And the page isDone is false

    @happy-path
    Scenario: Creates a done page when cursor is null
      Given items with ids "1", "2"
      When I create a paged result with pageSize 3 and null cursor
      Then the page items match the input items
      And the page continueCursor is null
      And the page isDone is true

    @happy-path
    Scenario: Handles empty items array with null cursor
      When I create a paged result with no items and null cursor
      Then the page has 0 items
      And the page isDone is true

  # ============================================================================
  # encodeCursor / decodeCursor
  # ============================================================================

  Rule: encodeCursor and decodeCursor round-trip arbitrary position data

    **Invariant:** Any JSON-serializable position encodes to base64 and decodes back identically.
    **Verified by:** Round-tripping various data shapes through encode/decode.

    @happy-path
    Scenario: Encodes and decodes simple position data
      Given a cursor position with offset 20 and lastId "abc123"
      When I encode and decode the cursor position
      Then the decoded position matches the original

    @happy-path
    Scenario: Encodes and decodes complex position data
      Given a cursor position with globalPosition, streamId, and timestamp
      When I encode and decode the cursor position
      Then the decoded position matches the original

    @happy-path
    Scenario: Produces base64-encoded string
      Given a cursor position with offset 0
      When I encode the cursor position
      Then the encoded cursor is valid base64

    @happy-path
    Scenario: Round-trips various data shapes
      When I encode and decode each data shape:
        | shape          |
        | empty-object   |
        | nested-objects |
        | arrays         |
        | special-chars  |
      Then all decoded shapes match their originals

  Rule: decodeCursor returns null for invalid or missing input

    **Invariant:** Invalid, empty, undefined, or malformed cursors return null.
    **Verified by:** Decoding various invalid inputs and asserting null.

    @validation
    Scenario: Returns null for invalid cursor inputs
      When I decode invalid cursor values:
        | input                | description                  |
        | __undefined__        | undefined cursor             |
        | __empty__            | empty string cursor          |
        | X                    | invalid base64 length        |
        | not-valid-base64!@#$ | invalid base64 characters    |
        | __invalid_json__     | valid base64 but invalid JSON |
      Then all decoded results are null

    @validation
    Scenario: Returns null for base64 with invalid characters in middle or end
      When I decode cursors with invalid base64 characters:
        | cursor                |
        | eyJ!ZXkiOiJ2YWx1ZSJ9 |
        | eyJrZXkiOiJ2YWx1ZSJ! |
      Then all decoded results are null

    @validation
    Scenario: Returns null for truncated UTF-8 sequences
      When I decode the cursor "wA=="
      Then the decoded result is null

  # ============================================================================
  # isValidPageSize
  # ============================================================================

  Rule: isValidPageSize validates integer page sizes within bounds

    **Invariant:** Only positive integers up to maxPageSize are valid.
    **Verified by:** Testing valid and invalid page sizes.

    @happy-path
    Scenario: Returns true for valid page sizes
      Then these page sizes are valid:
        | size |
        | 1    |
        | 20   |
        | 100  |

    @validation
    Scenario: Returns false for invalid page sizes
      Then these page sizes are invalid:
        | size  | reason                 |
        | 0     | zero                   |
        | -1    | negative               |
        | -100  | negative               |
        | 101   | exceeds max            |
        | 1000  | exceeds max            |
        | 10.5  | non-integer            |
        | NaN   | not a number           |

    @happy-path
    Scenario: Respects custom max page size
      Then page size 50 is valid with max 50
      And page size 51 is invalid with max 50

  # ============================================================================
  # getEffectivePageSize
  # ============================================================================

  Rule: getEffectivePageSize returns clamped page size with defaults

    **Invariant:** Requested size is clamped to [1, max], undefined falls back to default, floats are floored.
    **Verified by:** Calling with various inputs and asserting output.

    @happy-path
    Scenario: Returns requested size when valid
      Then effective page size for requested 50 is 50

    @happy-path
    Scenario: Returns default when not specified
      Then effective page size for undefined is DEFAULT_PAGE_SIZE

    @validation
    Scenario: Caps at max and enforces minimum
      Then these effective page sizes are correct:
        | requested | expected |
        | 200       | 100      |
        | 0         | 1        |
        | -10       | 1        |

    @happy-path
    Scenario: Uses custom default and max sizes
      Then these effective page sizes with custom config are correct:
        | requested   | defaultSize | maxSize | expected |
        | __undefined__ | 30          | 100     | 30       |
        | 100         | 20          | 50      | 50       |
        | __undefined__ | 15          | 75      | 15       |
        | 100         | 15          | 75      | 75       |
        | 30          | 15          | 75      | 30       |

    @validation
    Scenario: Rounds floating-point sizes down
      Then these effective page sizes are correct:
        | requested | expected |
        | 10.5      | 10       |
        | 10.9      | 10       |
        | 1.1       | 1        |

  # ============================================================================
  # Pagination Workflow
  # ============================================================================

  Rule: Pagination workflow supports multi-page traversal and edge cases

    **Invariant:** A complete pagination flow produces correct cursor state across pages.
    **Verified by:** Simulating first page, cursor decode, and last page.

    @happy-path
    Scenario: Simulates complete pagination flow
      Given items for page 1 with ids "1", "2", "3" and encoded cursor offset 3
      When I create a paged result for page 1
      Then page 1 isDone is false
      And the decoded cursor offset is 3
      When I create a final page with item id "4"
      Then page 2 isDone is true
      And page 2 continueCursor is null

    @happy-path
    Scenario: Handles empty result set
      When I create an empty page
      Then the page has 0 items
      And the page isDone is true

    @happy-path
    Scenario: Handles exact page size match with continuation
      Given items for page 1 with ids "1", "2", "3" and encoded cursor offset 3
      When I create a paged result for page 1
      Then the page has 3 items
      And page 1 isDone is false
