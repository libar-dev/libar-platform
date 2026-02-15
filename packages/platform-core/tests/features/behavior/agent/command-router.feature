Feature: Agent Command Router

  Pure functions for agent command routing: getRoute() looks up routes by
  commandType, validateRoutes() checks route map integrity, and
  COMMAND_ROUTING_ERROR_CODES enumerates all routing error codes.

  Rule: getRoute returns matching route or undefined
    **Invariant:** getRoute(routes, key) returns the route when key exists, undefined otherwise
    **Verified by:** Scenarios covering existing key, missing key, and empty map

    @acceptance-criteria @happy-path
    Scenario: Returns the route when commandType exists in the map
      Given a valid route map with "CancelOrder" and "SuggestCustomerOutreach" routes
      When I get the route for "CancelOrder"
      Then the route is defined
      And the route has the following properties:
        | property       | value       |
        | commandType    | CancelOrder |
        | boundedContext | orders      |
      And the route toOrchestratorArgs is a function

    Scenario: Returns undefined when commandType does not exist in the map
      Given a valid route map with "CancelOrder" and "SuggestCustomerOutreach" routes
      When I get the route for "NonExistentCommand"
      Then the route is undefined

    Scenario: Returns undefined for empty route map
      Given an empty route map
      When I get the route for "AnyCommand"
      Then the route is undefined

  Rule: validateRoutes produces success or error results per route
    **Invariant:** Each route yields success when valid; specific error code when missing commandType, boundedContext, or toOrchestratorArgs
    **Verified by:** Scenarios covering all-valid, each error type, empty map, and mixed routes

    Scenario: Produces success results for valid routes
      Given a valid route map with "CancelOrder" and "SuggestCustomerOutreach" routes
      When I validate the routes
      Then the validation results count is 2
      And all results are successful
      And the successful command types include:
        | commandType              |
        | CancelOrder              |
        | SuggestCustomerOutreach  |

    Scenario: Returns COMMAND_NOT_REGISTERED error for missing commandType
      Given a route map with a "BadRoute" entry that has empty commandType
      When I validate the routes
      Then the validation results count is 1
      And the first result is a failure with code "COMMAND_NOT_REGISTERED"
      And the failure message contains "BadRoute"
      And the failure message contains "missing commandType"

    Scenario: Returns UNKNOWN_ROUTE error for missing boundedContext
      Given a route map with a "NoBCRoute" entry that has empty boundedContext
      When I validate the routes
      Then the validation results count is 1
      And the first result is a failure with code "UNKNOWN_ROUTE"
      And the failure message contains "NoBCRoute"
      And the failure message contains "missing boundedContext"

    Scenario: Returns INVALID_TRANSFORM error for missing toOrchestratorArgs
      Given a route map with a "NoTransformRoute" entry that has undefined toOrchestratorArgs
      When I validate the routes
      Then the validation results count is 1
      And the first result is a failure with code "INVALID_TRANSFORM"
      And the failure message contains "NoTransformRoute"
      And the failure message contains "missing toOrchestratorArgs"

    Scenario: Returns empty array for empty route map
      Given an empty route map
      When I validate the routes
      Then the validation results are empty

    Scenario: Validates mixed valid and invalid routes independently
      Given a route map with a valid "ValidRoute" and an invalid "InvalidRoute" with empty commandType
      When I validate the routes
      Then the validation results count is 2
      And the success count is 1
      And the failure count is 1

  Rule: COMMAND_ROUTING_ERROR_CODES contains all expected codes
    **Invariant:** Error codes object has exactly 4 string entries where each value matches its key
    **Verified by:** Scenarios verifying presence, count, and value-key correspondence

    Scenario: Contains all expected error codes
      Then COMMAND_ROUTING_ERROR_CODES contains the following codes:
        | code                   |
        | UNKNOWN_ROUTE          |
        | DUPLICATE_ROUTE        |
        | COMMAND_NOT_REGISTERED |
        | INVALID_TRANSFORM      |

    Scenario: Has exactly 4 error codes
      Then COMMAND_ROUTING_ERROR_CODES has exactly 4 entries

    Scenario: Values are string constants matching their keys
      Then every COMMAND_ROUTING_ERROR_CODES value is a non-empty string matching its key
