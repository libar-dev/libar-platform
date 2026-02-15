@unit @decider
Feature: Decider Handler Factory

  Factory functions that wrap pure decider functions with infrastructure
  concerns (load, persist, event building):
  - createDeciderHandler: For existing entity updates
  - createEntityDeciderHandler: For entity creation (null state support)

  Rule: createDeciderHandler success path loads state, calls decider, applies update, and returns success

    **Invariant:** A successful decider handler call loads state by entityId, invokes the pure decider with state/command/context, applies the state update with incremented version, and returns a success result.
    **Verified by:** Mock verification of loadState, decider, applyUpdate calls, and result structure assertions.

    @acceptance-criteria @happy-path
    Scenario: Handler calls loadState with correct entityId
      Given a decider handler configured with a success decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then loadState was called with entityId "test-1"

    Scenario: Handler calls decider with state, command input, and context
      Given a decider handler configured with a mock decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1" and newValue 101
      Then the mock decider was called with the CMS state
      And the mock decider received command input with entityId "test-1" and newValue 101
      And the mock decider received context with commandId "cmd-1" and correlationId "corr-1"

    Scenario: Handler calls applyUpdate with correct parameters
      Given a decider handler configured with a success decider
      And loadState returns a CMS with id "test-1" and version 5
      When the handler processes a command with entityId "test-1" and newValue 200
      Then applyUpdate was called with docId "doc-1" and stateUpdate value 200 and version 6

    Scenario: Handler returns success result with correct structure
      Given a decider handler configured with a success decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then the result status is "success"
      And the result has all success fields:
        | field                             | expected        |
        | version                           | 2               |
        | data.id                           | test-1          |
        | data.newValue                     | 101             |
        | event.eventType                   | TestSucceeded   |
        | event.streamType                  | Test            |
        | event.metadata.correlationId.contains | corr-1      |
        | event.metadata.causationId.contains   | cmd-1       |

    Scenario: Handler increments version correctly from existing version
      Given a decider handler configured with a success decider
      And loadState returns a CMS with id "test-1" and version 10
      When the handler processes a command with entityId "test-1"
      Then the result status is "success"
      And the result version is 11

  Rule: createDeciderHandler rejected path returns rejection without applying update

    **Invariant:** When the decider returns a rejected result, the handler must not call applyUpdate and must return a rejected result with the rejection details.
    **Verified by:** Verifying applyUpdate is not called and rejection code/reason/context are preserved.

    @acceptance-criteria @happy-path
    Scenario: Handler returns rejected result without calling applyUpdate
      Given a decider handler configured with a rejected decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then the result status is "rejected"
      And applyUpdate was not called

    @validation
    Scenario: Rejected result includes rejection details
      Given a decider handler configured with a rejected decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then the rejected result has all details:
        | field   | expected               |
        | code    | TEST_REJECTED          |
        | reason  | Test rejection message |
      And the rejected result context has reason "test"

  Rule: createDeciderHandler failed path returns failure with event without applying update

    **Invariant:** When the decider returns a failed result (business failure with event), the handler must not call applyUpdate and must return the failure event and current version.
    **Verified by:** Verifying applyUpdate is not called and failure event/expectedVersion/context are preserved.

    @acceptance-criteria @happy-path
    Scenario: Handler returns failed result without calling applyUpdate
      Given a decider handler configured with a failed decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then the result status is "failed"
      And applyUpdate was not called

    Scenario: Failed result includes failure event and details
      Given a decider handler configured with a failed decider
      And loadState returns a CMS with id "test-1" and version 3
      When the handler processes a command with entityId "test-1"
      Then the failed result has all details:
        | field             | expected                  |
        | reason            | Business failure occurred |
        | event.eventType   | TestFailed                |
        | expectedVersion   | 3                         |
      And the failed result context has additionalInfo "test"

  Rule: createDeciderHandler error handling propagates or delegates errors

    **Invariant:** Infrastructure errors are either propagated directly or delegated to a custom error handler. If the error handler returns undefined, the original error is rethrown.
    **Verified by:** Verifying error propagation, custom handler invocation, and rethrow on undefined return.

    @acceptance-criteria @happy-path
    Scenario: Handler propagates loadState errors
      Given a decider handler configured with a success decider
      And loadState rejects with error "Entity not found"
      When the handler processes a command expecting an error
      Then the error message is "Entity not found"

    Scenario: Handler uses custom error handler when provided
      Given a decider handler configured with a success decider and a custom error handler returning rejection "NOT_FOUND"
      And loadState rejects with error "Not found"
      When the handler processes a command with entityId "test-1"
      Then the custom error handler was called
      And the result status is "rejected"
      And the result rejection code is "NOT_FOUND"

    @validation
    Scenario: Handler rethrows when custom error handler returns nothing
      Given a decider handler configured with a success decider and a custom error handler returning undefined
      And loadState rejects with error "Unknown error"
      When the handler processes a command expecting an error
      Then the error message is "Unknown error"

  Rule: createDeciderHandler logging emits debug and error messages

    **Invariant:** The handler logs debug messages on success, rejection, and logs errors on exceptions.
    **Verified by:** Verifying logger.debug and logger.error calls with correct message patterns.

    @acceptance-criteria @happy-path
    Scenario: Handler logs debug on success
      Given a decider handler configured with a success decider and a logger
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then the logger debug was called with messages:
        | message                         |
        | [TestHandler] Starting command  |
        | [TestHandler] Command succeeded |

    Scenario: Handler logs debug on rejection
      Given a decider handler configured with a rejected decider and a logger
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then the logger debug was called with message "[TestHandler] Command rejected" with code "TEST_REJECTED"

    Scenario: Handler logs error on exception
      Given a decider handler configured with a success decider and a logger
      And loadState rejects with error "Test error"
      When the handler processes a command with entityId "test-1" ignoring error
      Then the logger error was called with message "[TestHandler] Command error" with entityId "test-1"

  Rule: createDeciderHandler event metadata generates unique IDs and correct fields

    **Invariant:** Each handler invocation produces a unique eventId, includes the configured schemaVersion, and builds the correct streamId from entityId.
    **Verified by:** Asserting uniqueness, schemaVersion propagation, and streamId content.

    @acceptance-criteria @happy-path
    Scenario: Handler generates unique eventId per invocation
      Given a decider handler configured with a success decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes two commands
      Then the two events have different eventIds

    Scenario: Handler includes schemaVersion in event metadata
      Given a decider handler configured with a success decider and schemaVersion 3
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "test-1"
      Then the event metadata schemaVersion is 3

    Scenario: Handler builds correct streamId from entityId
      Given a decider handler configured with a success decider
      And loadState returns a CMS with id "test-1" and version 1
      When the handler processes a command with entityId "my-entity-123"
      Then the event streamId contains "my-entity-123"

  Rule: createEntityDeciderHandler entity creation calls tryLoadState and insert for new entities

    **Invariant:** For entity creation, tryLoadState is called to check existence. When null (entity does not exist), the decider receives null state and insert is called with version 1.
    **Verified by:** Mock verification of tryLoadState, decider args, insert call, and result version.

    @acceptance-criteria @happy-path
    Scenario: Entity handler calls tryLoadState with correct entityId
      Given an entity decider handler configured for creation
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then tryLoadState was called with entityId "test-1"

    Scenario: Entity handler calls decider with null state when entity does not exist
      Given an entity decider handler configured with a mock decider
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then the entity mock decider was called with null state
      And the entity mock decider received command input with entityId "test-1"
      And the entity mock decider received context with commandId "cmd-1" and correlationId "corr-1"

    Scenario: Entity handler calls insert for new entities
      Given an entity decider handler configured for creation
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1" and newValue 200
      Then insert was called with entityId "test-1" and stateUpdate value 200 and status "active" and version 1

    Scenario: Entity handler returns success with version 1 for new entities
      Given an entity decider handler configured for creation
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then the result status is "success"
      And the entity result has all success fields:
        | field           | expected      |
        | version         | 1             |
        | data.id         | test-1        |
        | data.newValue   | 100           |
        | event.eventType | TestSucceeded |

    Scenario: Entity handler generates correct event metadata for new entities
      Given an entity decider handler configured for creation
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then the entity event has correct metadata:
        | field                                    | expected  |
        | event.streamType                         | Test      |
        | event.streamId.contains                  | test-1    |
        | event.metadata.correlationId.contains    | corr-1    |
        | event.metadata.causationId.contains      | cmd-1     |
        | event.metadata.schemaVersion             | 1         |

  Rule: createEntityDeciderHandler entity already exists returns rejection

    **Invariant:** When tryLoadState returns an existing entity, the decider receives the existing state and should reject. Insert must not be called.
    **Verified by:** Verifying decider receives existing state, rejection is returned, and insert is not called.

    @acceptance-criteria @happy-path
    Scenario: Entity handler calls decider with existing state when entity exists
      Given an entity decider handler configured with an existence-checking mock decider
      And tryLoadState returns an existing CMS with id "test-1"
      When the entity handler processes a command with entityId "test-1"
      Then the existence mock decider was called with the existing CMS state
      And the existence mock decider received command input with entityId "test-1"

    Scenario: Entity handler returns rejection when entity already exists
      Given an entity decider handler configured for creation
      And tryLoadState returns an existing CMS with id "test-1"
      When the entity handler processes a command with entityId "test-1"
      Then the result status is "rejected"
      And the result rejection code is "ENTITY_ALREADY_EXISTS"

    @validation
    Scenario: Entity handler does not call insert when entity already exists
      Given an entity decider handler configured for creation
      And tryLoadState returns an existing CMS with id "test-1"
      When the entity handler processes a command with entityId "test-1"
      Then insert was not called

  Rule: createEntityDeciderHandler failed path returns failure without insert

    **Invariant:** When the entity decider returns a failed result for a non-existent entity, expectedVersion is 0 and insert is not called.
    **Verified by:** Verifying expectedVersion, event type, and insert not called.

    @acceptance-criteria @happy-path
    Scenario: Entity handler returns failed result with version 0 for non-existent entity
      Given an entity decider handler configured with a failed entity decider
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then the result status is "failed"
      And the entity failed result has expectedVersion 0
      And the entity failed result event type is "TestFailed"

    @validation
    Scenario: Entity handler does not call insert on business failure
      Given an entity decider handler configured with a failed entity decider
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then insert was not called

  Rule: createEntityDeciderHandler error handling propagates or delegates errors

    **Invariant:** Infrastructure errors from tryLoadState or insert are either propagated directly or delegated to a custom error handler.
    **Verified by:** Verifying error propagation for both tryLoadState and insert, plus custom handler invocation.

    @acceptance-criteria @happy-path
    Scenario: Entity handler propagates tryLoadState errors
      Given an entity decider handler configured for creation
      And tryLoadState rejects with error "Database error"
      When the entity handler processes a command expecting an error
      Then the error message is "Database error"

    Scenario: Entity handler propagates insert errors
      Given an entity decider handler configured for creation
      And tryLoadState returns null
      And insert rejects with error "Insert constraint violation"
      When the entity handler processes a command expecting an error
      Then the error message is "Insert constraint violation"

    Scenario: Entity handler uses custom error handler when provided
      Given an entity decider handler configured for creation with a custom error handler returning rejection "CONSTRAINT_ERROR"
      And tryLoadState rejects with error "Constraint violation"
      When the entity handler processes a command with entityId "test-1"
      Then the custom error handler was called
      And the result status is "rejected"
      And the result rejection code is "CONSTRAINT_ERROR"

  Rule: createEntityDeciderHandler logging emits debug messages

    **Invariant:** The entity handler logs debug messages on creation success and rejection.
    **Verified by:** Verifying logger.debug calls with correct message patterns.

    @acceptance-criteria @happy-path
    Scenario: Entity handler logs debug on entity creation success
      Given an entity decider handler configured for creation with a logger
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then the entity logger debug was called with messages:
        | message                           |
        | [CreateEntity] Starting command   |
        | [CreateEntity] Command succeeded  |

    Scenario: Entity handler logs debug on rejection
      Given an entity decider handler configured for creation with a logger
      And tryLoadState returns an existing CMS with id "test-1"
      When the entity handler processes a command with entityId "test-1"
      Then the entity logger debug was called with message "[CreateEntity] Command rejected" with code "ENTITY_ALREADY_EXISTS"

  Rule: createEntityDeciderHandler event metadata for entity creation

    **Invariant:** Each entity creation produces a unique eventId and includes the configured schemaVersion.
    **Verified by:** Asserting eventId uniqueness and schemaVersion propagation.

    @acceptance-criteria @happy-path
    Scenario: Entity handler generates unique eventId for each creation
      Given an entity decider handler configured for creation
      And tryLoadState returns null
      When the entity handler processes two creation commands with different entityIds
      Then the two entity events have different eventIds

    Scenario: Entity handler includes schemaVersion in metadata
      Given an entity decider handler configured for creation with schemaVersion 5
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then the entity event metadata schemaVersion is 5

  Rule: createEntityDeciderHandler preValidate hook short-circuits before loading state

    **Invariant:** When a preValidate hook is configured and returns a rejection, the handler short-circuits without calling tryLoadState, decider, or insert. When preValidate returns undefined, normal flow continues.
    **Verified by:** Verifying short-circuit behavior, argument passing, logging, and fallback when not configured.

    @acceptance-criteria @happy-path
    Scenario: PreValidate rejection short-circuits handler
      Given an entity decider handler configured with preValidate returning rejection "SKU_ALREADY_EXISTS"
      When the entity handler processes a command with entityId "test-1"
      Then the result status is "rejected"
      And the result rejection code is "SKU_ALREADY_EXISTS"
      And tryLoadState was not called
      And the entity mock decider was not called
      And insert was not called

    Scenario: PreValidate returning undefined allows normal flow
      Given an entity decider handler configured with preValidate returning undefined
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then preValidate was called with entityId "test-1"
      And tryLoadState was called
      And insert was called
      And the result status is "success"

    Scenario: PreValidate receives correct arguments
      Given an entity decider handler configured with preValidate returning undefined
      And tryLoadState returns null
      When the entity handler processes a command with entityId "my-product" and newValue 500
      Then preValidate was called with entityId "my-product" and newValue 500

    Scenario: PreValidate failure is logged
      Given an entity decider handler configured with preValidate returning rejection "VALIDATION_FAILED" and a logger
      When the entity handler processes a command with entityId "test-1"
      Then the entity logger debug was called with messages:
        | message                                  |
        | [CreateEntity] Starting command          |
        | [CreateEntity] Pre-validation failed     |

    @validation
    Scenario: Handler works normally without preValidate configured
      Given an entity decider handler configured for creation without preValidate
      And tryLoadState returns null
      When the entity handler processes a command with entityId "test-1"
      Then tryLoadState was called
      And the result status is "success"
