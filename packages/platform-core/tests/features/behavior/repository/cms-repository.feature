@unit @repository
Feature: CMS Repository

  Factory-created typed repositories for CMS persistence:
  - createCMSRepository: Factory for typed repositories with upcast support
  - NotFoundError: Entity not found errors with table and ID metadata
  - VersionConflictError: OCC failures with version mismatch details

  Rule: load retrieves and upcasts a CMS entity by ID

    **Invariant:** load always queries the configured table and index, applies upcast, and returns the full load result including document ID and CMS data.
    **Verified by:** Query parameter assertions, upcast invocation, and result field checks.

    @acceptance-criteria @happy-path
    Scenario: Load and upcast CMS by entity ID
      Given a raw CMS document exists with testId "test_456" and docId "doc_123"
      When I load the entity with ID "test_456"
      Then the load result has all expected fields:
        | field  | value    |
        | _id    | doc_123  |
        | testId | test_456 |
      And the query was called with table "testCMS" and index "by_testId"
      And the upcast function was called with the raw document

    @validation
    Scenario: Load throws NotFoundError for missing entity
      Given no CMS document exists for the query
      When I attempt to load the entity with ID "nonexistent"
      Then a NotFoundError is thrown with message "testCMS not found: nonexistent"

    Scenario: Load returns upcast metadata
      Given a raw CMS document exists with testId "test_456" and docId "doc_123"
      And the upcast function returns wasUpcasted true and originalStateVersion 1
      When I load the entity with ID "test_456"
      Then the load result wasUpcasted is true
      And the load result originalStateVersion is 1

    Scenario: Load propagates upcast errors
      Given a raw CMS document exists with testId "test_456" and docId "doc_123"
      And the upcast function throws "Upcast failed: invalid state"
      When I attempt to load the entity with ID "test_456"
      Then an error is thrown with message "Upcast failed: invalid state"

  Rule: tryLoad returns null instead of throwing for missing entities

    **Invariant:** tryLoad returns a load result when the entity exists, null when it does not, and propagates upcast errors.
    **Verified by:** Null checks, result field assertions, and error propagation.

    @acceptance-criteria @happy-path
    Scenario: tryLoad returns CMS when entity exists
      Given a raw CMS document exists with testId "test_456" and docId "doc_123"
      When I tryLoad the entity with ID "test_456"
      Then the tryLoad result is not null
      And the tryLoad result has docId "doc_123" and testId "test_456"

    Scenario: tryLoad returns null when entity does not exist
      Given no CMS document exists for the query
      When I tryLoad the entity with ID "nonexistent"
      Then the tryLoad result is null

    @validation
    Scenario: tryLoad resolves to null without throwing
      Given no CMS document exists for the query
      When I tryLoad the entity with ID "nonexistent"
      Then the tryLoad promise resolves to null

    Scenario: tryLoad propagates upcast errors
      Given a raw CMS document exists with testId "test_456" and docId "doc_123"
      And the upcast function throws "Invalid CMS state during upcast"
      When I attempt to tryLoad the entity with ID "test_456"
      Then an error is thrown with message "Invalid CMS state during upcast"

  Rule: exists checks entity presence without upcast overhead

    **Invariant:** exists returns a boolean indicating entity presence and never calls the upcast function.
    **Verified by:** Boolean return assertions, query parameter checks, and upcast call count verification.

    @acceptance-criteria @happy-path
    Scenario: exists returns true when entity exists
      Given a raw CMS document exists with testId "test_456" and docId "doc_123"
      When I check if entity "test_456" exists
      Then the exists result is true
      And the query was called with table "testCMS" and index "by_testId"

    Scenario: exists returns false when entity does not exist
      Given no CMS document exists for the query
      When I check if entity "nonexistent" exists
      Then the exists result is false

    @validation
    Scenario: exists does not call upcast function
      Given a raw CMS document exists with testId "test_456" and docId "doc_123"
      When I check if entity "test_456" exists
      Then the upcast function was not called

  Rule: loadMany retrieves multiple entities in parallel with null for missing

    **Invariant:** loadMany returns an array matching input ID order, with null entries for missing entities, and upcasts all found entities.
    **Verified by:** Array length, order preservation, null placement, and upcast call count.

    @acceptance-criteria @happy-path
    Scenario: loadMany loads multiple entities in parallel
      Given raw CMS documents exist for IDs:
        | testId | docId |
        | test_1 | doc_1 |
        | test_2 | doc_2 |
      When I loadMany with IDs "test_1,test_2"
      Then the loadMany result has length 2
      And the loadMany results match:
        | index | docId | testId |
        | 0     | doc_1 | test_1 |
        | 1     | doc_2 | test_2 |

    Scenario: loadMany returns null for missing entities
      Given raw CMS documents exist with gaps:
        | testId | docId | exists |
        | test_1 | doc_1 | true   |
        | missing|       | false  |
        | test_3 | doc_1 | true   |
      When I loadMany with IDs "test_1,missing,test_3"
      Then the loadMany result has length 3
      And the loadMany result at index 0 is not null
      And the loadMany result at index 1 is null
      And the loadMany result at index 2 is not null

    Scenario: loadMany returns empty array for empty input
      When I loadMany with an empty ID list
      Then the loadMany result is an empty array
      And the query was not called

    Scenario: loadMany upcasts all loaded entities
      Given raw CMS documents exist for IDs:
        | testId | docId |
        | test_1 | doc_1 |
        | test_2 | doc_2 |
      When I loadMany with IDs "test_1,test_2"
      Then the upcast function was called 2 times

    Scenario: loadMany preserves order of input IDs
      Given raw CMS documents exist for IDs:
        | testId | docId |
        | a      | doc_a |
        | b      | doc_b |
        | c      | doc_c |
      When I loadMany with IDs "a,b,c"
      Then the loadMany results are in order:
        | index | testId |
        | 0     | a      |
        | 1     | b      |
        | 2     | c      |

    @validation
    Scenario: loadMany propagates upcast errors for any entity
      Given raw CMS documents exist for IDs:
        | testId | docId |
        | test_1 | doc_1 |
        | test_2 | doc_2 |
      And the upcast function succeeds then throws "Upcast failed for second entity"
      When I attempt to loadMany with IDs "test_1,test_2"
      Then an error is thrown with message "Upcast failed for second entity"

  Rule: insert persists a new CMS record and returns the document ID

    **Invariant:** insert writes the CMS record to the configured table and returns the generated document ID.
    **Verified by:** Insert call arguments and return value assertion.

    @acceptance-criteria @happy-path
    Scenario: insert creates CMS record and returns document ID
      Given a new CMS record with testId "test_789" and name "New Entity"
      When I insert the CMS record
      Then the insert returns document ID "doc_789"
      And the insert was called with table "testCMS"

  Rule: update patches CMS with optimistic concurrency control

    **Invariant:** update patches the document only when the expected version matches, throwing NotFoundError for missing documents and VersionConflictError for version mismatches.
    **Verified by:** Patch call arguments, NotFoundError, and VersionConflictError assertions.

    @acceptance-criteria @happy-path
    Scenario: update patches CMS when version matches
      Given a stored document "doc_123" with version 5
      When I update document "doc_123" with name "Updated" at version 5
      Then the patch was called with the update fields

    @validation
    Scenario: update throws NotFoundError for missing document
      Given no stored document exists for ID "nonexistent"
      When I attempt to update document "nonexistent" at version 1
      Then a NotFoundError is thrown

    Scenario: update throws VersionConflictError on version mismatch
      Given a stored document "doc_123" with version 10
      When I attempt to update document "doc_123" at version 5
      Then a VersionConflictError is thrown with message "expected 5, got 10"

  Rule: NotFoundError has correct properties and type guard

    **Invariant:** NotFoundError captures table name and entity ID, extends Error, and its static type guard correctly identifies instances.
    **Verified by:** Property checks, instanceof assertion, and type guard true/false cases.

    @acceptance-criteria @happy-path
    Scenario: NotFoundError has correct properties
      When I create a NotFoundError with table "orderCMS" and id "order_123"
      Then the NotFoundError has all expected properties:
        | property | value                          |
        | name     | NotFoundError                  |
        | table    | orderCMS                       |
        | id       | order_123                      |
        | message  | orderCMS not found: order_123  |

    Scenario: NotFoundError is instanceof Error
      When I create a NotFoundError with table "testCMS" and id "test_1"
      Then the NotFoundError is an instance of Error

    Scenario: isNotFoundError type guard returns true for NotFoundError
      When I create a NotFoundError with table "testCMS" and id "test_1"
      Then isNotFoundError returns true

    @validation
    Scenario: isNotFoundError type guard returns false for non-NotFoundError values
      Then isNotFoundError returns false for:
        | value        |
        | regularError |
        | null         |
        | string       |

  Rule: VersionConflictError has correct properties and type guard

    **Invariant:** VersionConflictError captures table, ID, expected and actual versions, extends Error, and its static type guard correctly identifies instances.
    **Verified by:** Property checks, instanceof assertion, and type guard true/false cases.

    @acceptance-criteria @happy-path
    Scenario: VersionConflictError has correct properties
      When I create a VersionConflictError with table "orderCMS" id "order_123" expected 5 actual 10
      Then the VersionConflictError has all expected properties:
        | property        | value                                                     |
        | name            | VersionConflictError                                      |
        | table           | orderCMS                                                  |
        | id              | order_123                                                 |
        | expectedVersion | 5                                                         |
        | actualVersion   | 10                                                        |
        | message         | Version conflict for orderCMS order_123: expected 5, got 10 |

    Scenario: VersionConflictError is instanceof Error
      When I create a VersionConflictError with table "testCMS" id "test_1" expected 1 actual 2
      Then the VersionConflictError is an instance of Error

    Scenario: isVersionConflictError type guard returns true for VersionConflictError
      When I create a VersionConflictError with table "testCMS" id "test_1" expected 1 actual 2
      Then isVersionConflictError returns true

    @validation
    Scenario: isVersionConflictError type guard returns false for other errors
      Then isVersionConflictError returns false for:
        | value          |
        | regularError   |
        | notFoundError  |
