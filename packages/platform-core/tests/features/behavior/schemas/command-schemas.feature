Feature: Command Schemas

  Zod schemas for command metadata, command factory, and command result
  discriminated unions used throughout the platform.

  Rule: CommandMetadataSchema validates required fields and timestamp constraints
    Invariant: Metadata must include commandId, commandType, correlationId, and a positive integer timestamp
    Verified by: Scenarios below

    Scenario: Complete metadata is accepted
      Given a metadata object with commandId "cmd_123", commandType "TestCommand", correlationId "corr_456", and a valid timestamp
      When the metadata is validated against CommandMetadataSchema
      Then the validation succeeds

    Scenario: Metadata with optional userId is accepted
      Given a metadata object with commandId "cmd_123", commandType "TestCommand", correlationId "corr_456", userId "user_789", and a valid timestamp
      When the metadata is validated against CommandMetadataSchema
      Then the validation succeeds

    Scenario: Metadata with invalid timestamps is rejected
      Given metadata objects with the following timestamps:
        | timestamp |
        | 1234.56   |
        | -1000     |
        | 0         |
      When each metadata object is validated against CommandMetadataSchema
      Then each validation fails

    Scenario: Metadata missing required fields is rejected
      Given a metadata object with only commandId "cmd_123"
      When the metadata is validated against CommandMetadataSchema
      Then the validation fails

  Rule: createCommandSchema produces schemas that enforce commandType literal and payload shape
    Invariant: Factory-created schemas must reject wrong commandType, invalid payload, missing payload fields, and missing targetContext
    Verified by: Scenarios below

    Scenario: Complete command is accepted
      Given a TestCommand schema created with createCommandSchema and payload field "foo:string"
      When a valid command is parsed with commandType "TestCommand" and payload foo "bar"
      Then the validation succeeds

    Scenario: Command with optional payload fields is accepted
      Given a TestCommand schema created with createCommandSchema and payload field "foo:string"
      When a valid command is parsed with commandType "TestCommand" and payload foo "bar" and bar 42
      Then the validation succeeds

    Scenario: Command with wrong commandType literal is rejected
      Given a TestCommand schema created with createCommandSchema and payload field "foo:string"
      When a command is parsed with commandType "WrongType" and payload foo "bar"
      Then the validation fails

    Scenario: Command with invalid payload type is rejected
      Given a TestCommand schema created with createCommandSchema and payload field "foo:string"
      When a command is parsed with payload foo as number 123
      Then the validation fails

    Scenario: Command with missing required payload field is rejected
      Given a TestCommand schema created with createCommandSchema and payload field "foo:string"
      When a command is parsed with an empty payload object
      Then the validation fails

    Scenario: Command missing targetContext is rejected
      Given a TestCommand schema created with createCommandSchema and payload field "foo:string"
      When a command is parsed without targetContext
      Then the validation fails

    Scenario: Schema provides type inference for commandType literal
      Given a TestCommand schema created with createCommandSchema and payload field "foo:string"
      When a valid command is parsed with commandType "TestCommand" and payload foo "bar"
      Then the parsed commandType equals "TestCommand"

  Rule: CommandSuccessResultSchema validates success results with version and optional data
    Invariant: Success results require a version field; data is optional
    Verified by: Scenarios below

    Scenario: Success with version and data is accepted
      Given a success result with version 1 and data id "123"
      When the result is validated against CommandSuccessResultSchema
      Then the validation succeeds

    Scenario: Success with undefined data is accepted
      Given a success result with version 5 and undefined data
      When the result is validated against CommandSuccessResultSchema
      Then the validation succeeds

    Scenario: Success without version is rejected
      Given a success result without version and data id "123"
      When the result is validated against CommandSuccessResultSchema
      Then the validation fails

  Rule: CommandRejectedResultSchema validates rejected results with code and reason
    Invariant: Rejected results require code and reason; context is optional
    Verified by: Scenarios below

    Scenario: Rejected with code and reason is accepted
      Given a rejected result with code "VALIDATION_ERROR" and reason "Invalid input data"
      When the result is validated against CommandRejectedResultSchema
      Then the validation succeeds

    Scenario: Rejected with optional context is accepted
      Given a rejected result with code "BUSINESS_RULE_VIOLATION", reason "Cannot cancel completed order", and context
      When the result is validated against CommandRejectedResultSchema
      Then the validation succeeds

    Scenario: Rejected without reason is rejected
      Given a rejected result with code "VALIDATION_ERROR" and no reason
      When the result is validated against CommandRejectedResultSchema
      Then the validation fails

  Rule: CommandConflictResultSchema validates conflict results with CONCURRENT_MODIFICATION code
    Invariant: Conflict results require code "CONCURRENT_MODIFICATION" and currentVersion
    Verified by: Scenarios below

    Scenario: Conflict with CONCURRENT_MODIFICATION code is accepted
      Given a conflict result with code "CONCURRENT_MODIFICATION" and currentVersion 5
      When the result is validated against CommandConflictResultSchema
      Then the validation succeeds

    Scenario: Conflict with wrong code is rejected
      Given a conflict result with code "OTHER_CODE" and currentVersion 5
      When the result is validated against CommandConflictResultSchema
      Then the validation fails

    Scenario: Conflict without currentVersion is rejected
      Given a conflict result with code "CONCURRENT_MODIFICATION" and no currentVersion
      When the result is validated against CommandConflictResultSchema
      Then the validation fails

  Rule: CommandErrorResultSchema validates error results requiring a message
    Invariant: Error results must include a message field
    Verified by: Scenarios below

    Scenario: Error with message is accepted
      Given an error result with message "Unexpected database error"
      When the result is validated against CommandErrorResultSchema
      Then the validation succeeds

    Scenario: Error without message is rejected
      Given an error result with no message
      When the result is validated against CommandErrorResultSchema
      Then the validation fails

  Rule: CommandResultSchema discriminated union correctly routes by status field
    Invariant: The union discriminates on status and preserves type-specific fields
    Verified by: Scenarios below

    Scenario: Union discriminates success and preserves version
      Given a result with status "success", version 1, and data null
      When the result is validated against CommandResultSchema
      Then the validation succeeds
      And the parsed result has status "success" and version 1

    Scenario: Union discriminates rejected and preserves code and reason
      Given a result with status "rejected", code "ERROR", and reason "Something went wrong"
      When the result is validated against CommandResultSchema
      Then the validation succeeds
      And the parsed result has status "rejected", code "ERROR", and reason "Something went wrong"

    Scenario: Union discriminates conflict and preserves currentVersion
      Given a result with status "conflict", code "CONCURRENT_MODIFICATION", and currentVersion 10
      When the result is validated against CommandResultSchema
      Then the validation succeeds
      And the parsed result has status "conflict" and currentVersion 10

    Scenario: Union discriminates error and preserves message
      Given a result with status "error" and message "Internal error"
      When the result is validated against CommandResultSchema
      Then the validation succeeds
      And the parsed result has status "error" and message "Internal error"

    Scenario: Union rejects unknown status
      Given a result with status "unknown" and data object
      When the result is validated against CommandResultSchema
      Then the validation fails
