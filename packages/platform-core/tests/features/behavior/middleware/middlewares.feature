Feature: Built-in middlewares

  Verifies all 5 built-in middlewares: structure validation, domain validation,
  authorization, logging, and rate limiting. Each middleware has a fixed order
  and specific before/after hook behavior.

  Rule: Structure validation middleware validates command args against Zod schemas
    **Invariant:** Commands with matching schemas are validated; unregistered commands pass through.
    **Verified by:** Checking valid payloads pass, invalid payloads are rejected, and unregistered commands skip validation.

    Scenario: Structure validation has correct order
      Given the structure validation order constant
      Then the order value is 10

    Scenario: Valid payload passes structure validation
      Given a structure validation middleware with a CreateOrder schema requiring orderId and customerId
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

    Scenario: Invalid payload is rejected by structure validation
      Given a structure validation middleware with a CreateOrder schema requiring orderId, customerId, and amount
      When the middleware processes a CreateOrder command missing the amount field
      Then the before hook returns continue false
      And the result status is "rejected"

    Scenario: Unregistered command skips structure validation
      Given a structure validation middleware with no schemas
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

  Rule: Registry validation middleware uses schemas from a command registry
    **Invariant:** Registered commands are validated against registry schemas; unregistered commands pass through.
    **Verified by:** Providing a mock registry and checking validation behavior.

    Scenario: Registry validation validates against registry schema
      Given a registry validation middleware with a CreateOrder registration
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

    Scenario: Registry validation skips unregistered commands
      Given a registry validation middleware with no registrations
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

  Rule: Domain validation middleware runs async validators and rejects on error messages
    **Invariant:** Validators returning undefined pass; validators returning a string reject with that reason.
    **Verified by:** Testing pass, reject, and skip scenarios.

    Scenario: Domain validation has correct order
      Given the domain validation order constant
      Then the order value is 20

    Scenario: Domain validation passes when validator returns undefined
      Given a domain validation middleware where CreateOrder validator returns undefined
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

    Scenario: Domain validation rejects when validator returns error message
      Given a domain validation middleware where CreateOrder validator returns "Order already exists"
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue false
      And the result status is "rejected"
      And the result reason is "Order already exists"

    Scenario: Domain validation skips commands without validators
      Given a domain validation middleware with no validators
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

  Rule: combineDomainValidators runs all validators and returns first error
    **Invariant:** Combined validators short-circuit on the first error; all-pass returns undefined.
    **Verified by:** Combining multiple validators and checking the result.

    Scenario: Combined validators return first error
      Given a combined validator with validators returning undefined, "Error from second", "Error from third"
      When the combined validator runs
      Then the combined result is "Error from second"

    Scenario: Combined validators return undefined when all pass
      Given a combined validator with all validators returning undefined
      When the combined validator runs
      Then the combined result is undefined

  Rule: CommonValidators provide reusable field-level validation helpers
    **Invariant:** Each helper validates its field and returns an error message or undefined.
    **Verified by:** Testing each helper with valid and invalid inputs.

    Scenario: requiredString validates non-empty strings
      Given a requiredString validator for field "name"
      Then validating the field produces expected results:
        | fieldValue | expectedResult |
        | test       | undefined      |
        | empty      | name is required |
        | number     | name is required |

    Scenario: positiveNumber validates positive numbers
      Given a positiveNumber validator for field "quantity"
      Then validating the number field produces expected results:
        | fieldValue | expectedResult                    |
        | 5          | undefined                         |
        | 0          | quantity must be a positive number |
        | -1         | quantity must be a positive number |

    Scenario: numberRange validates within range
      Given a numberRange validator for field "score" with min 0 and max 100
      Then validating the number field in range produces expected results:
        | fieldValue | expectedResult                 |
        | 50         | undefined                      |
        | -1         | score must be between 0 and 100 |
        | 101        | score must be between 0 and 100 |

    Scenario: startsWithPrefix validates prefix
      Given a startsWithPrefix validator for field "orderId" with prefix "ord_"
      Then validating the prefix field produces expected results:
        | fieldValue | expectedResult                  |
        | ord_123    | undefined                       |
        | 123        | orderId must start with 'ord_'  |

  Rule: Authorization middleware checks permissions and supports skipping
    **Invariant:** Allowed checkers pass; denied checkers reject with UNAUTHORIZED code; skipped commands bypass.
    **Verified by:** Testing allow, deny, and skip scenarios.

    Scenario: Authorization has correct order
      Given the authorization order constant
      Then the order value is 30

    Scenario: Authorization allows when checker returns allowed true
      Given an authorization middleware that always allows
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

    Scenario: Authorization rejects when checker returns allowed false
      Given an authorization middleware that denies with reason "Access denied"
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue false
      And the result status is "rejected"
      And the result code is "UNAUTHORIZED"
      And the result reason is "Access denied"

    Scenario: Authorization skips configured commands
      Given an authorization middleware that denies but skips CreateOrder
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true
      And the checker was not called

  Rule: createRoleBasedChecker creates role-based authorization checkers
    **Invariant:** Users with required roles are allowed; users without are denied; unauthenticated users are denied.
    **Verified by:** Testing role matching, role mismatch, no auth, and no roles configured.

    Scenario: Role-based checker allows user with required role
      Given a role-based checker requiring "user" or "admin" for CreateOrder
      When checking authorization for a user with role "user"
      Then the authorization result is allowed

    Scenario: Role-based checker rejects user without required role
      Given a role-based checker requiring "admin" for CreateOrder
      When checking authorization for a user with role "user"
      Then the authorization result is not allowed

    Scenario: Role-based checker requires authentication
      Given a role-based checker requiring "user" for CreateOrder
      When checking authorization with no user role
      Then the authorization result is not allowed
      And the authorization reason is "Authentication required"

    Scenario: Role-based checker allows when no roles specified
      Given a role-based checker with no role requirements
      When checking authorization for a user with role "user"
      Then the authorization result is allowed

  Rule: Logging middleware logs command lifecycle events
    **Invariant:** Before hook logs command start; after hook logs success or error.
    **Verified by:** Checking mock logger for expected messages after before and after hooks.

    Scenario: Logging has correct order
      Given the logging order constant
      Then the order value is 40

    Scenario: Logging middleware logs before and after execution
      Given a logging middleware with a mock logger
      When the before hook runs for a CreateOrder command
      And the after hook runs with a success result
      Then the logger contains message "Command started: CreateOrder"
      And the logger contains message "Command succeeded: CreateOrder"

    Scenario: Logging middleware logs errors for failed commands
      Given a logging middleware with a mock logger
      When the after hook runs with a failed result
      Then the logger has error-level entries

  Rule: createNoOpLogger creates a silent logger
    **Invariant:** All log methods exist and do not throw.
    **Verified by:** Calling all 6 log levels without errors.

    Scenario: NoOp logger does not throw on any level
      Given a no-op logger
      Then calling all log levels does not throw

  Rule: createJsonLogger outputs structured JSON logs
    **Invariant:** Output is valid JSON with level, message, and optional context fields.
    **Verified by:** Parsing output and checking fields.

    Scenario: JSON logger outputs correctly formatted logs
      Given a JSON logger without timestamps
      When logging an info message "test message" with context key "value"
      Then the JSON output has level "info" and message "test message" and key "value"

    Scenario: JSON logger includes timestamp when configured
      Given a JSON logger with timestamps
      When logging an info message "test"
      Then the JSON output has a timestamp field

  Rule: Rate limit middleware enforces rate limits and supports skipping
    **Invariant:** Allowed requests pass; exceeded requests are rejected with RATE_LIMITED; skipped commands bypass.
    **Verified by:** Testing allow, deny, and skip scenarios.

    Scenario: Rate limit has correct order
      Given the rate limit order constant
      Then the order value is 50

    Scenario: Rate limit allows when not exceeded
      Given a rate limit middleware that always allows
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true

    Scenario: Rate limit rejects when exceeded
      Given a rate limit middleware that always denies with retryAfterMs 1000
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue false
      And the result status is "rejected"
      And the result code is "RATE_LIMITED"

    Scenario: Rate limit skips configured commands
      Given a rate limit middleware that denies but skips CreateOrder
      When the middleware processes a valid CreateOrder command
      Then the before hook returns continue true
      And the rate limit checker was not called

  Rule: RateLimitKeys provides key generation strategies
    **Invariant:** Each key strategy generates a deterministic key from context.
    **Verified by:** Generating keys and checking format.

    Scenario: byUserId generates correct key
      Given a byUserId key generator
      When generating a key for user "user_123"
      Then the generated key is "user:user_123"

    Scenario: byUserId handles anonymous users
      Given a byUserId key generator for anonymous users
      When generating a key with no user
      Then the generated key is "user:anonymous"

    Scenario: byCommandType generates correct key
      Given a byCommandType key generator
      When generating a key for command type "CreateOrder"
      Then the generated key is "command:CreateOrder"

    Scenario: byUserAndCommand generates composite key
      Given a byUserAndCommand key generator
      When generating a key for user "user_123" and command "CreateOrder"
      Then the generated key is "user:user_123:CreateOrder"

  Rule: Middleware ordering constants follow the correct pipeline sequence
    **Invariant:** Structure < Domain < Authorization < Logging < Rate Limit.
    **Verified by:** Comparing all order constants.

    Scenario: All middleware orders follow correct sequence
      Given all middleware order constants
      Then the orders follow the sequence:
        | middleware           | order |
        | structureValidation  | 10    |
        | domainValidation     | 20    |
        | authorization        | 30    |
        | logging              | 40    |
        | rateLimit            | 50    |
