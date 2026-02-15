Feature: Cost Budget

  Pure functions for agent cost tracking: checkBudget() evaluates spend
  against budget limits, estimateCost() computes token costs, and
  DEFAULT_MODEL_COSTS provides per-model pricing data.

  Rule: Budget checks allow or deny based on remaining budget
    **Invariant:** checkBudget returns allowed=true when currentSpend + estimatedCost <= dailyBudget
    **Verified by:** Scenarios below covering under-budget, over-budget, exact-budget, and already-at-budget cases

    @acceptance-criteria @happy-path
    Scenario: Allowed when current spend plus estimated cost is under budget
      Given a cost tracker with currentSpend 5 and dailyBudget 10 and alertThreshold 0.8
      When I check the budget with estimatedCost 1
      Then the result allowed is true
      And the remaining budget is 4

    Scenario: Denied when estimated cost would exceed budget
      Given a cost tracker with currentSpend 9.5 and dailyBudget 10 and alertThreshold 0.8
      When I check the budget with estimatedCost 1
      Then the result allowed is false
      And the denial has the following properties:
        | property     | value           |
        | reason       | budget_exceeded |
        | currentSpend | 9.5             |
        | dailyBudget  | 10              |

    Scenario: Denied when current spend already equals budget
      Given a cost tracker with currentSpend 10 and dailyBudget 10 and alertThreshold 0.8
      When I check the budget with estimatedCost 0.01
      Then the result allowed is false

    Scenario: Allowed when estimated cost exactly reaches budget
      Given a cost tracker with currentSpend 5 and dailyBudget 10 and alertThreshold 0.8
      When I check the budget with estimatedCost 5
      Then the result allowed is true
      And the remaining budget is 0

  Rule: Alert threshold flags when spend ratio meets or exceeds threshold
    **Invariant:** atAlertThreshold is true when currentSpend / dailyBudget >= alertThreshold
    **Verified by:** Scenarios covering above-threshold, below-threshold, and exact-boundary cases

    Scenario: Sets atAlertThreshold when spend exceeds alert threshold
      Given a cost tracker with currentSpend 8.5 and dailyBudget 10 and alertThreshold 0.8
      When I check the budget with estimatedCost 0.5
      Then the result allowed is true
      And the atAlertThreshold flag is true

    Scenario: Does not set atAlertThreshold when below threshold
      Given a cost tracker with currentSpend 5 and dailyBudget 10 and alertThreshold 0.8
      When I check the budget with estimatedCost 1
      Then the result allowed is true
      And the atAlertThreshold flag is false

    Scenario: Sets atAlertThreshold at exact threshold boundary
      Given a cost tracker with currentSpend 8 and dailyBudget 10 and alertThreshold 0.8
      When I check the budget with estimatedCost 0.5
      Then the result allowed is true
      And the atAlertThreshold flag is true

  Rule: Cost estimation performs token-cost multiplication
    **Invariant:** estimateCost(tokens, costPerToken) === tokens * costPerToken
    **Verified by:** Scenarios covering normal, zero, large, and very small inputs

    Scenario: Simple multiplication of tokens and cost per token
      When I estimate cost for 1000 tokens at 0.000003 per token
      Then the estimated cost is 0.003

    Scenario: Returns 0 for 0 tokens
      When I estimate cost for 0 tokens at 0.000003 per token
      Then the estimated cost is 0

    Scenario: Handles large token counts
      When I estimate cost for 1000000 tokens at 0.000003 per token
      Then the estimated cost is approximately 3.0

    Scenario: Handles very small cost per token
      When I estimate cost for 100 tokens at 0.00000015 per token
      Then the estimated cost is approximately 0.000015

  Rule: Default model costs contain expected entries
    **Invariant:** DEFAULT_MODEL_COSTS has entries for Claude, GPT-4o, and GPT-4o-mini with positive input/output costs
    **Verified by:** Scenarios verifying each model entry and relative pricing

    Scenario: Claude model entry has positive input and output costs with output greater than input
      When I look up the "anthropic/claude-sonnet-4-5-20250929" model costs
      Then the model entry is defined
      And the input cost is greater than 0
      And the output cost is greater than 0
      And the output cost is greater than the input cost

    Scenario: GPT-4o model entry has positive input and output costs
      When I look up the "openai/gpt-4o" model costs
      Then the model entry is defined
      And the input cost is greater than 0
      And the output cost is greater than 0

    Scenario: GPT-4o-mini model entry is cheaper than GPT-4o
      When I look up the "openai/gpt-4o-mini" model costs
      Then the model entry is defined
      And the input cost is greater than 0
      And the output cost is greater than 0
      And the input cost is less than the "openai/gpt-4o" input cost
