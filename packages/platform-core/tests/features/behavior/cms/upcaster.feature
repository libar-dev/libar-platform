@acceptance-criteria
Feature: CMS Upcaster Utilities

  As a platform developer
  I want CMS schema evolution utilities with chain-based migration
  So that CMS state can be transparently upgraded to the latest schema version

  CMS upcasters provide chain-based migration for schema evolution:
  createUpcaster builds a migration chain, upcastIfNeeded provides simple
  single-version migration, and helper migrations (addCMSFieldMigration,
  renameCMSFieldMigration, removeCMSFieldMigration) provide common field
  transformations.

  Background:
    Given the module is imported from platform-core

  # ============================================================================
  # createUpcaster
  # ============================================================================

  Rule: createUpcaster returns state at current version without migration

    **Invariant:** CMS state already at the current schema version is returned unchanged.
    **Verified by:** wasUpcasted is false and cms is identical to input.

    @happy-path
    Scenario: State at current version is returned as-is
      Given a CMS upcaster from version 1 to version 2
      And a v2 CMS state with id "test_1" and name "Test" and description "Already at v2"
      When the CMS upcaster is applied
      Then the result was not upcasted
      And the original state version is 2
      And the CMS state equals the input state

  Rule: createUpcaster applies a single migration step

    **Invariant:** CMS state one version behind is migrated exactly once.
    **Verified by:** wasUpcasted is true and new fields are present.

    @happy-path
    Scenario: State is migrated from v1 to v2
      Given a CMS upcaster from version 1 to version 2
      And a v1 CMS state with id "test_1" and name "Test"
      When the CMS upcaster is applied
      Then the result was upcasted
      And the original state version is 1
      And the CMS stateVersion is 2
      And the CMS description is "Migrated from v1"

  Rule: createUpcaster applies multiple migration steps in order

    **Invariant:** CMS state multiple versions behind is migrated through each step sequentially.
    **Verified by:** wasUpcasted is true and all intermediate fields are present.

    @happy-path
    Scenario: State is migrated from v1 to v3
      Given a CMS upcaster from version 1 to version 3
      And a v1 CMS state with id "test_1" and name "Test"
      When the CMS upcaster is applied
      Then the result was upcasted
      And the original state version is 1
      And the CMS stateVersion is 3
      And the CMS description is "Added in v2"
      And the CMS priority is "medium"

  Rule: createUpcaster handles legacy version 0 state

    **Invariant:** CMS state without stateVersion is treated as version 0 and migrated through all steps.
    **Verified by:** originalStateVersion is 0 and final stateVersion matches current.

    @happy-path
    Scenario: Legacy state without stateVersion is treated as version 0
      Given a CMS upcaster from version 0 to version 2 with legacy support
      And a legacy CMS state with id "legacy_1" and name "Legacy"
      When the CMS upcaster is applied
      Then the result was upcasted
      And the original state version is 0
      And the CMS stateVersion is 2

  Rule: createUpcaster rejects invalid inputs and configurations

    **Invariant:** Null/undefined input, incomplete chains, and future versions produce errors.
    **Verified by:** Error type and message assertions.

    @validation
    Scenario: Null input throws CMSUpcasterError
      Given a CMS upcaster from version 1 to version 1 with no migrations
      When the CMS upcaster is applied to null
      Then it throws a CMSUpcasterError
      And the error message contains "Cannot upcast null"

    @validation
    Scenario: Undefined input throws CMSUpcasterError
      Given a CMS upcaster from version 1 to version 1 with no migrations
      When the CMS upcaster is applied to undefined
      Then it throws a CMSUpcasterError
      And the error message contains "Cannot upcast null or undefined"

    @validation
    Scenario: Incomplete migration chain throws at creation time
      When a CMS upcaster is created with current version 3 but only a v1 migration
      Then it throws an error containing "Missing migration for version 2"

    @validation
    Scenario: Future state version throws CMSUpcasterError
      Given a CMS upcaster from version 1 to version 1 with no migrations
      And a CMS state with stateVersion 5
      When the CMS upcaster is applied expecting an error
      Then it throws a CMSUpcasterError
      And the error message contains "is newer than current schema version 1"

    @validation
    Scenario: Migration function error propagates mid-chain
      Given a CMS upcaster from v1 to v3 where v2-to-v3 migration throws
      And a v1 CMS state with id "test_1" and name "Test"
      When the CMS upcaster is applied expecting an error
      Then the error message contains "Migration v2->v3 failed: data corruption detected"

    @validation
    Scenario: First migration function error propagates
      Given a CMS upcaster from v1 to v2 where v1 migration throws
      And a v1 CMS state with id "test_1" and name "Test"
      When the CMS upcaster is applied expecting an error
      Then the error message contains "Invalid v1 state structure"

  # ============================================================================
  # upcastIfNeeded
  # ============================================================================

  Rule: upcastIfNeeded returns state at current version without migration

    **Invariant:** CMS state already at the target version is returned unchanged.
    **Verified by:** wasUpcasted is false and description is unchanged.

    @happy-path
    Scenario: State at current version is returned as-is via upcastIfNeeded
      Given a v2 CMS state with id "test_1" and description "Current version"
      When upcastIfNeeded is called with target version 2
      Then the result was not upcasted
      And the original state version is 2
      And the CMS description is "Current version"

  Rule: upcastIfNeeded applies migration when state is behind

    **Invariant:** CMS state behind the target version is migrated via the provided function.
    **Verified by:** wasUpcasted is true and migrated fields are present.

    @happy-path
    Scenario: State is migrated via upcastIfNeeded
      Given a v1 CMS state with id "test_1" and name "Test"
      When upcastIfNeeded is called with target version 2 and migration
      Then the result was upcasted
      And the original state version is 1
      And the CMS description is "Migrated"
      And the CMS stateVersion is 2

  Rule: upcastIfNeeded supports validation function

    **Invariant:** A validate function can accept or reject the state after migration check.
    **Verified by:** Successful validation passes; failing validation throws CMSUpcasterError.

    @happy-path
    Scenario: Validation passes when state is valid
      Given a v2 CMS state with id "test_1" and description "Valid"
      When upcastIfNeeded is called with target version 2 and validation
      Then the result was not upcasted
      And the CMS state equals the input state

    @validation
    Scenario: Validation fails when state is invalid
      Given a v2 CMS state without description field
      When upcastIfNeeded is called with target version 2 and validation expecting error
      Then it throws a CMSUpcasterError
      And the error message contains "fails validation"

  Rule: upcastIfNeeded rejects future state versions

    **Invariant:** State versions ahead of the target version produce errors.
    **Verified by:** Error type and message assertions.

    @validation
    Scenario: Future state version throws CMSUpcasterError via upcastIfNeeded
      Given a CMS state with stateVersion 5
      When upcastIfNeeded is called with target version 2 expecting error
      Then it throws a CMSUpcasterError
      And the error message contains "is newer than expected version"

  # ============================================================================
  # CMSUpcasterError
  # ============================================================================

  Rule: CMSUpcasterError captures error metadata

    **Invariant:** Error instances have name, code, message, and optional context.
    **Verified by:** Property assertions on constructed error instances.

    @happy-path
    Scenario: Error has correct name
      Given a CMSUpcasterError with code "NULL_STATE" and message "Test error"
      Then the error name is "CMSUpcasterError"

    @happy-path
    Scenario: Error has correct code
      Given a CMSUpcasterError with code "MISSING_MIGRATION" and message "Test error"
      Then the error code is "MISSING_MIGRATION"

    @happy-path
    Scenario: Error has correct message
      Given a CMSUpcasterError with code "INVALID_STATE" and message "Custom message"
      Then the error message text is "Custom message"

    @happy-path
    Scenario: Error stores context when provided
      Given a CMSUpcasterError with code "INVALID_STATE" and message "Error" and context:
        | key             | value |
        | stateVersion    | 5     |
        | expectedVersion | 2     |
      Then the error context matches:
        | key             | value |
        | stateVersion    | 5     |
        | expectedVersion | 2     |

    @happy-path
    Scenario: Error has undefined context when not provided
      Given a CMSUpcasterError with code "NULL_STATE" and message "Error"
      Then the error context is undefined

    @happy-path
    Scenario: Error is instanceof Error
      Given a CMSUpcasterError with code "NULL_STATE" and message "Error"
      Then the error is an instance of Error

  # ============================================================================
  # createUpcaster with validate
  # ============================================================================

  Rule: createUpcaster supports post-migration validation

    **Invariant:** A validate function can accept or reject the migrated CMS state.
    **Verified by:** Successful validation passes; failing validation throws CMSUpcasterError.

    @happy-path
    Scenario: Validation passes for current version state
      Given a CMS upcaster with validation that checks description is a string
      And a v2 CMS state with id "test_1" and description "Valid"
      When the CMS upcaster is applied
      Then the result was not upcasted
      And the CMS state equals the input state

    @validation
    Scenario: Validation fails for current version state with empty description
      Given a CMS upcaster with validation that checks description is non-empty
      And a v2 CMS state with id "test_1" and description ""
      When the CMS upcaster is applied expecting an error
      Then it throws a CMSUpcasterError
      And the error message contains "fails validation"

    @happy-path
    Scenario: Validation passes after upcasting from v1
      Given a CMS upcaster with validation that checks description is a string
      And a v1 CMS state with id "test_1" and name "Test"
      When the CMS upcaster is applied
      Then the result was upcasted
      And the CMS description is "Migrated successfully"

    @validation
    Scenario: Validation fails after upcasting produces invalid state
      Given a CMS upcaster with validation that checks description is non-empty and migration produces empty
      And a v1 CMS state with id "test_1" and name "Test"
      When the CMS upcaster is applied expecting an error
      Then it throws a CMSUpcasterError
      And the error message contains "Upcasted CMS failed validation"

  # ============================================================================
  # addCMSFieldMigration
  # ============================================================================

  Rule: addCMSFieldMigration adds a field with a static or computed default

    **Invariant:** The new field is present in the CMS state and stateVersion is bumped.
    **Verified by:** Field value and stateVersion assertions.

    @happy-path
    Scenario: Static default value is added
      Given an addCMSFieldMigration for "priority" with default "standard" to version 2
      And a base CMS state with id "test_1" and name "Test" at version 1
      When the CMS field migration is applied
      Then the CMS field "priority" is "standard"
      And the CMS field "name" is "Test"
      And the CMS stateVersion is 2

    @happy-path
    Scenario: Computed default value is added
      Given an addCMSFieldMigration for "createdAt" with computed value 1704067200000 to version 2
      And a base CMS state with id "test_1" at version 1
      When the CMS field migration is applied
      Then the CMS field "createdAt" is 1704067200000
      And the CMS stateVersion is 2

    @happy-path
    Scenario: Computed default accesses state
      Given an addCMSFieldMigration for "displayName" computed from orderId to version 2
      And a base CMS state with orderId "order_123" at version 1
      When the CMS field migration is applied
      Then the CMS field "displayName" is "Order order_123"

    @happy-path
    Scenario: Existing fields are preserved
      Given an addCMSFieldMigration for "newField" with default "value" to version 2
      And a base CMS state with existingField "existing" and anotherField 42 at version 1 with version 5
      When the CMS field migration is applied
      Then the CMS field "existingField" is "existing"
      And the CMS field "anotherField" is 42
      And the CMS version is 5

  # ============================================================================
  # renameCMSFieldMigration
  # ============================================================================

  Rule: renameCMSFieldMigration renames a field in the CMS state

    **Invariant:** The old field is removed and the new field has the original value.
    **Verified by:** Presence/absence and value assertions.

    @happy-path
    Scenario: Field is renamed
      Given a renameCMSFieldMigration from "userId" to "customerId" at version 2
      And a CMS state with userId "user_123" and name "Test" at version 1
      When the CMS rename migration is applied
      Then the CMS field "customerId" is "user_123"
      And the CMS field "userId" is undefined
      And the CMS field "name" is "Test"
      And the CMS stateVersion is 2

    @happy-path
    Scenario: Other fields are preserved when renaming
      Given a renameCMSFieldMigration from "oldName" to "newName" at version 2
      And a CMS state with oldName "value" and otherField1 "keep1" and otherField2 42 at version 1 with version 3
      When the CMS rename migration is applied
      Then the CMS field "otherField1" is "keep1"
      And the CMS field "otherField2" is 42
      And the CMS version is 3

    @happy-path
    Scenario: Undefined value in renamed field is handled
      Given a renameCMSFieldMigration from "optionalField" to "renamedOptional" at version 2
      And a base CMS state at version 1
      When the CMS rename migration is applied
      Then the CMS field "renamedOptional" is undefined
      And the CMS stateVersion is 2

  # ============================================================================
  # removeCMSFieldMigration
  # ============================================================================

  Rule: removeCMSFieldMigration removes a field from the CMS state

    **Invariant:** The specified field is removed and other fields are preserved.
    **Verified by:** Presence/absence and value assertions.

    @happy-path
    Scenario: Specified field is removed
      Given a removeCMSFieldMigration for "deprecatedField" at version 2
      And a CMS state with deprecatedField "old value" and keepField "keep me" at version 1
      When the CMS remove migration is applied
      Then the CMS field "deprecatedField" is undefined
      And the CMS field "keepField" is "keep me"
      And the CMS stateVersion is 2

    @happy-path
    Scenario: Other fields are preserved when removing
      Given a removeCMSFieldMigration for "toRemove" at version 2
      And a CMS state with toRemove "bye" and field1 "a" and field2 "b" and nested data at version 1 with version 5
      When the CMS remove migration is applied
      Then the CMS field "field1" is "a"
      And the CMS field "field2" is "b"
      And the CMS nested field equals data 123
      And the CMS version is 5

    @happy-path
    Scenario: Non-existent field is handled gracefully
      Given a removeCMSFieldMigration for "nonExistent" at version 2
      And a CMS state with existingField "value" at version 1
      When the CMS remove migration is applied
      Then the CMS field "existingField" is "value"
      And the CMS stateVersion is 2

  # ============================================================================
  # Helper migrations integration with createUpcaster
  # ============================================================================

  Rule: Helper migrations integrate with createUpcaster chain

    **Invariant:** addCMSFieldMigration and renameCMSFieldMigration work within createUpcaster chains.
    **Verified by:** wasUpcasted, field values, and stateVersion assertions.

    @happy-path
    Scenario: addCMSFieldMigration works in migration chain
      Given a CMS upcaster using addCMSFieldMigration for description
      And a v1 CMS state with id "test_1" and name "Test"
      When the CMS upcaster is applied
      Then the result was upcasted
      And the CMS description is "Added via helper"
      And the CMS stateVersion is 2

    @happy-path
    Scenario: Multiple helper migrations are chained
      Given a CMS upcaster chaining rename and add helper migrations
      And a CMS state with userId "user_456" at version 1
      When the CMS upcaster is applied
      Then the result was upcasted
      And the original state version is 1
      And the CMS field "customerId" is "user_456"
      And the CMS field "userId" is undefined
      And the CMS field "priority" is "normal"
      And the CMS stateVersion is 3
