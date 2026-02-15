Feature: Agent Commands Module

  Pure functions for agent command emission: validation, factory functions,
  type guards, and decision-to-command conversion.

  Background:
    Given the module is imported from platform-core

  Rule: COMMAND_EMISSION_ERROR_CODES contains all expected codes
    **Invariant:** Error codes object has exactly 5 string entries where each value matches its key
    **Verified by:** Scenarios verifying presence and count

    @acceptance-criteria @happy-path
    Scenario: Contains all expected error codes
      Then COMMAND_EMISSION_ERROR_CODES contains the following codes:
        | code                 |
        | REASON_REQUIRED      |
        | CONFIDENCE_REQUIRED  |
        | EVENTS_REQUIRED      |
        | INVALID_COMMAND_TYPE |
        | INVALID_CONFIDENCE   |

    Scenario: Has exactly 5 error codes
      Then COMMAND_EMISSION_ERROR_CODES has exactly 5 entries

  Rule: EmittedAgentCommandMetadataSchema validates metadata
    **Invariant:** Schema accepts valid metadata with required fields, rejects missing or out-of-range values
    **Verified by:** Scenarios covering valid metadata, optional fields, and each rejection case

    Scenario: Accepts valid metadata
      When I parse valid metadata through the schema
      Then the schema result is successful

    Scenario: Accepts metadata with optional patternId
      When I parse metadata with patternId "pattern-1" through the schema
      Then the schema result is successful

    Scenario: Accepts metadata with optional analysis
      When I parse metadata with analysis through the schema
      Then the schema result is successful

    Scenario: Rejects metadata with empty agentId
      When I parse metadata with empty agentId through the schema
      Then the schema result is a failure

    Scenario: Rejects metadata with empty decisionId
      When I parse metadata with empty decisionId through the schema
      Then the schema result is a failure

    Scenario: Rejects metadata with confidence below 0
      When I parse metadata with confidence -0.1 through the schema
      Then the schema result is a failure

    Scenario: Rejects metadata with confidence above 1
      When I parse metadata with confidence 1.5 through the schema
      Then the schema result is a failure

    Scenario: Rejects metadata with empty reason
      When I parse metadata with empty reason through the schema
      Then the schema result is a failure

    Scenario: Rejects metadata with empty eventIds array
      When I parse metadata with empty eventIds through the schema
      Then the schema result is a failure

    Scenario: Accepts confidence at boundaries 0 and 1
      When I parse metadata with confidence 0 through the schema
      Then the schema result is successful
      And I parse metadata with confidence 1 and it is also successful

  Rule: EmittedAgentCommandSchema validates commands
    **Invariant:** Schema accepts valid commands with any payload type, rejects empty type or invalid metadata
    **Verified by:** Scenarios covering valid commands, payload variety, and rejection cases

    Scenario: Accepts valid command
      When I parse a valid command through the command schema
      Then the command schema result is successful

    Scenario: Rejects command with empty type
      When I parse a command with empty type through the command schema
      Then the command schema result is a failure

    Scenario: Accepts command with any payload type
      Then the command schema accepts all payload types:
        | payloadDescription |
        | null               |
        | string             |
        | number             |
        | array              |

    Scenario: Rejects command with invalid metadata
      When I parse a command with invalid metadata through the command schema
      Then the command schema result is a failure

  Rule: validateAgentCommand validates command arguments
    **Invariant:** Returns valid:true for complete args, valid:false with specific error codes for each missing/invalid field
    **Verified by:** Scenarios covering type, confidence, reason, and eventIds validation

    Scenario: Returns invalid when type is undefined
      When I validate a command without type
      Then validation result is invalid with code "INVALID_COMMAND_TYPE"
      And validation message contains "non-empty string"

    Scenario: Returns invalid when type is empty string
      When I validate a command with empty type
      Then validation result is invalid with code "INVALID_COMMAND_TYPE"

    Scenario: Returns invalid when type is whitespace only
      When I validate a command with whitespace-only type
      Then validation result is invalid with code "INVALID_COMMAND_TYPE"

    Scenario: Returns invalid when confidence is undefined
      When I validate a command without confidence
      Then validation result is invalid with code "CONFIDENCE_REQUIRED"
      And validation message contains "Confidence score is required"

    Scenario: Returns invalid when confidence is below 0
      When I validate a command with confidence -0.1
      Then validation result is invalid with code "INVALID_CONFIDENCE"
      And validation message contains "between 0 and 1"

    Scenario: Returns invalid when confidence is above 1
      When I validate a command with confidence 1.5
      Then validation result is invalid with code "INVALID_CONFIDENCE"

    Scenario: Accepts confidence at boundary values
      Then validation accepts confidence at boundaries:
        | confidence |
        | 0          |
        | 1          |

    Scenario: Returns invalid when reason is undefined
      When I validate a command without reason
      Then validation result is invalid with code "REASON_REQUIRED"

    Scenario: Returns invalid when reason is empty string
      When I validate a command with empty reason
      Then validation result is invalid with code "REASON_REQUIRED"

    Scenario: Returns invalid when reason is whitespace only
      When I validate a command with whitespace-only reason
      Then validation result is invalid with code "REASON_REQUIRED"

    Scenario: Returns invalid when eventIds is undefined
      When I validate a command without eventIds
      Then validation result is invalid with code "EVENTS_REQUIRED"
      And validation message contains "At least one triggering event"

    Scenario: Returns invalid when eventIds is empty array
      When I validate a command with empty eventIds
      Then validation result is invalid with code "EVENTS_REQUIRED"

    Scenario: Accepts single event ID
      When I validate a command with a single event ID
      Then the validation result is valid

    Scenario: Accepts multiple event IDs
      When I validate a command with multiple event IDs
      Then the validation result is valid

    Scenario: Returns valid for complete command args
      When I validate a complete command
      Then the validation result is valid

  Rule: createEmittedAgentCommand factory creates commands
    **Invariant:** Factory creates commands with all required fields, generates unique decisionId, copies arrays, and throws on invalid input
    **Verified by:** Scenarios covering creation, optional fields, array isolation, and validation errors

    Scenario: Creates command with all required fields
      When I create an emitted agent command with standard args
      Then the created command has all expected fields

    Scenario: Generates unique decisionId
      When I create an emitted agent command with standard args
      Then the decisionId matches the pattern "dec_DIGITS_HEX"

    Scenario: Includes patternId when provided in options
      When I create an emitted agent command with patternId "churn-risk"
      Then the created command metadata patternId is "churn-risk"

    Scenario: Does not include patternId when not provided
      When I create an emitted agent command without options
      Then the created command metadata patternId is undefined

    Scenario: Includes analysis when provided in options
      When I create an emitted agent command with analysis data
      Then the created command metadata analysis matches the provided data

    Scenario: Does not include analysis when not provided
      When I create an emitted agent command without options
      Then the created command metadata analysis is undefined

    Scenario: Includes both patternId and analysis when provided
      When I create an emitted agent command with patternId "pattern-1" and analysis
      Then the created command metadata patternId is "pattern-1"
      And the created command metadata analysis matches the combined data

    Scenario: Copies eventIds array without reference sharing
      When I create an emitted agent command and mutate the original eventIds
      Then the created command eventIds are unchanged

    Scenario: Throws error for empty type
      Then creating a command with empty type throws "Command type must be a non-empty string"

    Scenario: Throws error for invalid confidence
      Then creating a command with confidence 1.5 throws "Confidence must be between 0 and 1"

    Scenario: Throws error for empty reason
      Then creating a command with empty reason throws "Reason is required"

    Scenario: Throws error for empty eventIds
      Then creating a command with empty eventIds throws "At least one triggering event"

    Scenario: Includes error code in thrown message
      Then creating a command with empty type throws error code "INVALID_COMMAND_TYPE"

  Rule: createCommandFromDecision converts decisions to commands
    **Invariant:** Converts decisions with non-null command to EmittedAgentCommand, returns null for null command
    **Verified by:** Scenarios covering conversion, null command, optional fields, and field mapping

    Scenario: Creates command from decision with command
      When I create a command from a standard test decision
      Then the decision-created command has all expected fields

    Scenario: Returns null when decision has no command
      When I create a command from a decision with null command
      Then the result is null

    Scenario: Includes patternId when provided
      When I create a command from a decision with patternId "churn-risk"
      Then the decision-created command metadata patternId is "churn-risk"

    Scenario: Includes analysis when provided
      When I create a command from a decision with analysis data
      Then the decision-created command metadata analysis matches the provided analysis

    Scenario: Maps all decision fields correctly
      When I create a command from a decision with specific fields
      Then the decision-created command maps all fields correctly

  Rule: isEmittedAgentCommand type guard validates objects
    **Invariant:** Returns true for valid EmittedAgentCommand objects, false for everything else
    **Verified by:** Scenarios covering valid commands, optional fields, null, undefined, primitives, and partial objects

    Scenario: Returns true for valid command
      Then isEmittedAgentCommand returns true for a valid command

    Scenario: Returns true for command with optional fields
      Then isEmittedAgentCommand returns true for a command with optional fields

    Scenario: Returns false for non-command values
      Then isEmittedAgentCommand returns false for:
        | valueDescription        |
        | null                    |
        | undefined               |
        | string primitive        |
        | number primitive        |
        | boolean primitive       |
        | object without type     |
        | object with empty type  |
        | object invalid metadata |
        | object missing metadata |

  Rule: hasPatternId type guard checks for patternId presence
    **Invariant:** Returns true when metadata.patternId is defined, false otherwise
    **Verified by:** Scenarios covering present, absent, and explicitly undefined patternId

    Scenario: Returns true when command has patternId
      Then hasPatternId returns true for a command with patternId "churn-risk"

    Scenario: Returns false when command has no patternId
      Then hasPatternId returns false for a command without patternId

    Scenario: Returns false when patternId is undefined explicitly
      Then hasPatternId returns false for a command with explicit undefined patternId

  Rule: hasAnalysisData type guard checks for analysis presence
    **Invariant:** Returns true when metadata.analysis is not undefined (including null), false otherwise
    **Verified by:** Scenarios covering present, absent, explicitly undefined, and null analysis

    Scenario: Returns true when command has analysis
      Then hasAnalysisData returns true for a command with analysis

    Scenario: Returns false when command has no analysis
      Then hasAnalysisData returns false for a command without analysis

    Scenario: Returns false when analysis is undefined explicitly
      Then hasAnalysisData returns false for a command with explicit undefined analysis

    Scenario: Returns true for null analysis
      Then hasAnalysisData returns true for a command with null analysis

  Rule: End-to-end command creation flow validates and verifies
    **Invariant:** Validation, creation, type guard, and schema all agree on command validity
    **Verified by:** Scenarios covering full validate-create-verify flow and decision-based flow

    Scenario: Validates, creates, and verifies command
      When I validate args, create a command, and verify with type guard and schema
      Then all steps succeed

    Scenario: Creates command from decision and verifies
      When I create a command from a decision with options and verify
      Then the command passes type guard and has patternId and analysis
