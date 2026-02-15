Feature: MiddlewarePipeline orchestration

  Verifies middleware pipeline registration, ordering, before/after hook
  execution, short-circuiting, error handling, and lifecycle operations.

  Rule: use() adds middleware and supports chaining
    **Invariant:** Each call to use() increases pipeline size and returns the pipeline for chaining.
    **Verified by:** Adding middlewares and checking size plus return value.

    Scenario: Adding middleware increases size and returns pipeline for chaining
      Given a new middleware pipeline
      When I add a middleware named "a" with order 10
      Then the pipeline size is 1
      When I chain a middleware named "b" with order 20
      Then use returns the pipeline instance
      And the pipeline size is 2

  Rule: remove() removes middleware by name
    **Invariant:** remove() returns true and decreases size for existing middleware, false for non-existent.
    **Verified by:** Adding middlewares, removing one, then attempting to remove a non-existent one.

    Scenario: Removing an existing middleware returns true and decreases size
      Given a new middleware pipeline
      And middleware "a" with order 10 is registered
      And middleware "b" with order 20 is registered
      When I remove the middleware named "a"
      Then the remove result is true
      And the pipeline size is 1

    Scenario: Removing a non-existent middleware returns false
      Given a new middleware pipeline
      When I remove the middleware named "nonexistent"
      Then the remove result is false

  Rule: has() checks middleware existence
    **Invariant:** has() returns true for registered names, false for unregistered names.
    **Verified by:** Checking presence of registered and unregistered middleware names.

    Scenario: has returns true for existing middleware
      Given a new middleware pipeline
      And middleware "test" with order 10 is registered
      Then has "test" returns true

    Scenario: has returns false for non-existent middleware
      Given a new middleware pipeline
      Then has "nonexistent" returns false

  Rule: getMiddlewareNames returns names sorted by order
    **Invariant:** Names are returned sorted by the middleware order property, not insertion order.
    **Verified by:** Adding middlewares out of order and verifying sorted name output.

    Scenario: Names are returned sorted by order
      Given a new middleware pipeline
      And middleware "c" with order 30 is registered
      And middleware "a" with order 10 is registered
      And middleware "b" with order 20 is registered
      Then getMiddlewareNames returns:
        | name |
        | a    |
        | b    |
        | c    |

  Rule: execute() runs handler when no middlewares are registered
    **Invariant:** An empty pipeline delegates directly to the handler.
    **Verified by:** Executing with no middlewares and checking the handler result.

    Scenario: Handler executes directly with empty pipeline
      Given a new middleware pipeline
      When I execute with no middlewares and a success handler
      Then the execution result status is "success"

  Rule: Before hooks execute in ascending order
    **Invariant:** Before hooks run in order of the middleware order property (lowest first).
    **Verified by:** Recording execution order from two before hooks.

    Scenario: Before hooks run in order 10 then 20
      Given a new middleware pipeline
      And a before-hook middleware "first" with order 10 that records its name
      And a before-hook middleware "second" with order 20 that records its name
      When I execute the pipeline with a success handler
      Then the recorded execution order is:
        | name   |
        | first  |
        | second |

  Rule: After hooks execute in reverse order
    **Invariant:** After hooks run in reverse order of the middleware order property (highest first).
    **Verified by:** Recording execution order from two after hooks.

    Scenario: After hooks run in order 20 then 10
      Given a new middleware pipeline
      And an after-hook middleware "first" with order 10 that records its name
      And an after-hook middleware "second" with order 20 that records its name
      When I execute the pipeline with a success handler
      Then the recorded execution order is:
        | name   |
        | second |
        | first  |

  Rule: Before hook short-circuits on continue false
    **Invariant:** When a before hook returns continue:false, subsequent middlewares and the handler are skipped.
    **Verified by:** A validator middleware returning continue:false and verifying auth middleware never runs.

    Scenario: Short-circuit prevents subsequent middleware execution
      Given a new middleware pipeline
      And a before-hook middleware "validator" with order 10 that short-circuits with VALIDATION_ERROR
      And a before-hook middleware "auth" with order 20 that records its name
      When I execute the pipeline with a success handler
      Then the execution result status is "rejected"
      And the recorded execution order contains only:
        | name      |
        | validator |

  Rule: Context passes between before hooks
    **Invariant:** Each before hook can enrich the context, and subsequent hooks receive the enriched version.
    **Verified by:** An enricher middleware adding a custom property and a checker middleware reading it.

    Scenario: Enricher middleware passes custom context to subsequent middleware
      Given a new middleware pipeline
      And a before-hook middleware "enricher" with order 10 that sets custom.enriched to true
      And a before-hook middleware "checker" with order 20 that captures the context
      When I execute the pipeline with a success handler
      Then the captured context has custom.enriched set to true

  Rule: Before hook errors produce MIDDLEWARE_ERROR rejection
    **Invariant:** An error thrown in a before hook results in a rejected result with code MIDDLEWARE_ERROR.
    **Verified by:** A failing before hook and checking the result code and reason.

    Scenario: Throwing before hook produces middleware error
      Given a new middleware pipeline
      And a before-hook middleware "failing" with order 10 that throws "Middleware failed"
      When I execute the pipeline with a success handler
      Then the execution result status is "rejected"
      And the rejection code is "MIDDLEWARE_ERROR"
      And the rejection reason is "Middleware failed"

  Rule: Handler errors produce HANDLER_ERROR rejection
    **Invariant:** An error thrown in the handler results in a rejected result with code HANDLER_ERROR.
    **Verified by:** A failing handler and checking the result code and reason.

    Scenario: Throwing handler produces handler error
      Given a new middleware pipeline
      When I execute the pipeline with a handler that throws "Handler failed"
      Then the execution result status is "rejected"
      And the rejection code is "HANDLER_ERROR"
      And the rejection reason is "Handler failed"

  Rule: After hook errors do not prevent other after hooks or change result
    **Invariant:** After hooks continue executing even if one throws, and the result remains unchanged.
    **Verified by:** A failing after hook followed by a succeeding after hook, verifying both run and result is success.

    Scenario: Failing after hook does not prevent other after hooks
      Given a new middleware pipeline
      And an after-hook middleware "failing" with order 10 that throws in after
      And an after-hook middleware "succeeding" with order 20 that records its name in after
      When I execute the pipeline with a success handler
      Then both after hooks were called
      And the execution result status is "success"

  Rule: Short-circuit runs after hooks only for already-executed middlewares
    **Invariant:** On short-circuit, only middlewares whose before hook already ran get their after hook called.
    **Verified by:** Three middlewares where the second short-circuits; only the first after hook runs.

    Scenario: Only pre-short-circuit middleware after hooks run
      Given a new middleware pipeline
      And a middleware "first" with order 10 and both hooks that records in after
      And a middleware "shortcircuit" with order 20 that short-circuits and records in after
      And a middleware "third" with order 30 and both hooks that records in after
      When I execute the pipeline with a success handler
      Then the after hooks called are only:
        | name  |
        | first |

  Rule: clear() removes all middlewares
    **Invariant:** After clear, pipeline size is zero.
    **Verified by:** Adding middlewares, clearing, and checking size.

    Scenario: Clear empties the pipeline
      Given a new middleware pipeline
      And middleware "a" with order 10 is registered
      And middleware "b" with order 20 is registered
      When I clear the pipeline
      Then the pipeline size is 0

  Rule: clone() creates an independent copy
    **Invariant:** A cloned pipeline has the same middlewares, but mutations to the clone do not affect the original.
    **Verified by:** Cloning, adding to the clone, and verifying original is unchanged.

    Scenario: Clone has same middlewares but is independent
      Given a new middleware pipeline
      And middleware "a" with order 10 is registered
      And middleware "b" with order 20 is registered
      When I clone the pipeline
      Then the cloned pipeline size is 2
      And the cloned pipeline middleware names are:
        | name |
        | a    |
        | b    |
      When I add a middleware named "c" with order 30 to the clone
      Then the original pipeline size is 2
      And the cloned pipeline size is 3

  Rule: createMiddlewarePipeline factory creates instances
    **Invariant:** The factory function returns a MiddlewarePipeline instance with or without options.
    **Verified by:** Creating pipelines with and without options and checking instanceof.

    Scenario: Factory creates pipeline without options
      When I create a pipeline via factory
      Then the result is a MiddlewarePipeline instance

    Scenario: Factory creates pipeline with debug option
      When I create a pipeline via factory with debug true
      Then the result is a MiddlewarePipeline instance
