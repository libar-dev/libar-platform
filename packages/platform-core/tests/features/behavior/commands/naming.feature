@acceptance-criteria
Feature: Command Naming Policy

  As a platform developer
  I want command naming conventions enforced at runtime
  So that commands follow consistent Verb+Noun PascalCase patterns across bounded contexts

  Command names must follow DDD/CQRS conventions: imperative voice, PascalCase,
  with a recognized verb prefix (Create, Submit, Cancel, Update, Add, Remove, etc.).
  The naming policy provides validation, suggestion generation, prefix extraction,
  and formatting utilities.

  # ============================================================================
  # COMMAND_NAME_PREFIXES Constant
  # ============================================================================

  Rule: COMMAND_NAME_PREFIXES contains all recognized verb prefixes

    **Invariant:** The constant includes CREATE, SUBMIT, CANCEL, UPDATE, ADD, REMOVE, CONFIRM, RESERVE, RELEASE, and EXPIRE.
    **Verified by:** Membership check for each expected prefix.

    @happy-path
    Scenario: COMMAND_NAME_PREFIXES includes all standard prefixes
      Given the COMMAND_NAME_PREFIXES constant
      Then it contains all of the following prefixes:
        | prefix  |
        | CREATE  |
        | SUBMIT  |
        | CANCEL  |
        | UPDATE  |
        | ADD     |
        | REMOVE  |
        | CONFIRM |
        | RESERVE |
        | RELEASE |
        | EXPIRE  |

  # ============================================================================
  # CommandNamingPolicy Pattern Matching
  # ============================================================================

  Rule: CREATE pattern matches PascalCase names starting with Create

    **Invariant:** Only names matching /^Create[A-Z][a-zA-Z]*$/ pass the CREATE pattern.
    **Verified by:** Regex test for valid and invalid inputs.

    @happy-path
    Scenario: CREATE pattern accepts valid Create-prefixed names
      When the CREATE pattern is tested against the following names:
        | name          | expected |
        | CreateOrder   | true     |
        | CreateProduct | true     |
        | createOrder   | false    |
      Then each pattern test returns the expected result

  Rule: ADD pattern matches PascalCase names starting with Add

    **Invariant:** Only names matching /^Add[A-Z][a-zA-Z]*$/ pass the ADD pattern.
    **Verified by:** Regex test for valid inputs.

    @happy-path
    Scenario: ADD pattern accepts valid Add-prefixed names
      When the ADD pattern is tested against the following names:
        | name         | expected |
        | AddOrderItem | true     |
        | AddToCart    | true     |
      Then each pattern test returns the expected result

  Rule: UPDATE pattern matches names starting with Update, Change, or Modify

    **Invariant:** Names matching /^(Update|Change|Modify)[A-Z][a-zA-Z]*$/ pass the UPDATE pattern.
    **Verified by:** Regex test for all three verb variants.

    @happy-path
    Scenario: UPDATE pattern accepts Update, Change, and Modify prefixes
      When the UPDATE pattern is tested against the following names:
        | name           | expected |
        | UpdateAddress  | true     |
        | ChangePassword | true     |
        | ModifyOrder    | true     |
      Then each pattern test returns the expected result

  # ============================================================================
  # isValidCommandName
  # ============================================================================

  Rule: isValidCommandName returns true only for names matching any recognized prefix pattern

    **Invariant:** A name is valid iff it matches at least one CommandNamingPolicy regex.
    **Verified by:** Boolean assertions for a comprehensive set of valid and invalid names.

    @happy-path
    Scenario: Valid command names are accepted
      When isValidCommandName is called with the following names:
        | name               | expected |
        | CreateOrder        | true     |
        | AddOrderItem       | true     |
        | RemoveOrderItem    | true     |
        | SubmitOrder        | true     |
        | CancelOrder        | true     |
        | ConfirmOrder       | true     |
        | ReserveStock       | true     |
        | ReleaseReservation | true     |
        | ExpireReservation  | true     |
        | UpdateProfile      | true     |
        | DeleteUser         | true     |
      Then each validity check returns the expected result

    @validation
    Scenario: Invalid command names are rejected
      When isValidCommandName is called with the following names:
        | name         | expected |
        | OrderCreate  | false    |
        | createOrder  | false    |
        | create_order | false    |
        | create-order | false    |
        |              | false    |
        | Order        | false    |
      Then each validity check returns the expected result

  # ============================================================================
  # validateCommandName
  # ============================================================================

  Rule: validateCommandName returns structured validation results with matched prefix

    **Invariant:** Valid names include the matched prefix; invalid names include suggestions.
    **Verified by:** Field assertions on the returned validation result object.

    @happy-path
    Scenario: Valid names return matched prefix and valid flag
      When validateCommandName is called with the following valid names:
        | name           | expectedPrefix |
        | CreateOrder    | CREATE         |
        | AddOrderItem   | ADD            |
        | ChangePassword | UPDATE         |
      Then each validation result is valid with the expected prefix
      And no validation result contains suggestions

    @validation
    Scenario: Invalid name returns suggestions and error message
      When validateCommandName is called with "OrderCreate"
      Then the validation result is invalid
      And the validation message contains "does not follow naming conventions"
      And the suggestions include "CreateOrder"

  # ============================================================================
  # generateNameSuggestions
  # ============================================================================

  Rule: generateNameSuggestions produces corrective suggestions for invalid names

    **Invariant:** Suggestions are valid command names, limited to at most 3 results.
    **Verified by:** Content and length assertions on the returned array.

    @happy-path
    Scenario: Inverted name receives corrected suggestion
      When generateNameSuggestions is called with "OrderCreate"
      Then the suggestions include "CreateOrder"

    @validation
    Scenario: Suggestions are limited to at most 3
      When generateNameSuggestions is called with "SomeRandomName"
      Then the suggestion count is at most 3

  # ============================================================================
  # getCommandPrefix
  # ============================================================================

  Rule: getCommandPrefix extracts the matched prefix or returns undefined

    **Invariant:** Returns the matching prefix key for valid names; undefined otherwise.
    **Verified by:** Equality assertions for known valid names and undefined checks for invalid.

    @happy-path
    Scenario: Known names return their prefix
      When getCommandPrefix is called with the following names:
        | name           | expectedPrefix |
        | CreateOrder    | CREATE         |
        | AddOrderItem   | ADD            |
        | ChangePassword | UPDATE         |
      Then each prefix extraction returns the expected prefix

    @validation
    Scenario: Invalid or empty names return undefined
      When getCommandPrefix is called with the following names:
        | name        | expectedPrefix |
        | OrderCreate | undefined      |
        |             | undefined      |
      Then each prefix extraction returns the expected prefix

  # ============================================================================
  # formatCommandName
  # ============================================================================

  Rule: formatCommandName converts various input formats to valid PascalCase command names

    **Invariant:** Output always matches a recognized naming pattern, adding a prefix if needed.
    **Verified by:** String equality assertions for each input/output pair.

    @happy-path
    Scenario: Various input formats produce correct PascalCase names
      When formatCommandName is called with the following inputs:
        | name         | prefix  | expected         |
        | create_order | Create  | CreateOrder      |
        | add-item     | Add     | AddItem          |
        | CreateOrder  |         | CreateOrder      |
        | Order        | Create  | CreateOrder      |
        | Something    |         | ExecuteSomething |
      Then each format call returns the expected output
