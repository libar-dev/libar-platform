@admin @agents @approvals
Feature: Agent Approval Workflow
  As an admin user
  I want to review and act on AI agent recommendations
  So that automated actions require human oversight before execution

  # ===========================================================================
  # E2E Test Coverage and Gaps
  # ===========================================================================
  #
  # COVERED BY SPECS:
  # ✓ Full flow from order cancellations -> agent detection -> approval -> command emission
  #   See: full-order-journey.feature "Full agent trigger journey - Churn risk detection"
  #
  # ✓ Decision History tab - agent audit trail visibility
  #   See: "Agent Decision History Tab" section below
  #
  # ✓ Customer Risk Preview - customers approaching threshold
  #   See: "Customer Risk Preview" section below
  #
  # ✓ Low Stock Alert Agent (SuggestRestock):
  #   - Approval detail with product context
  #   - Approve/reject restock suggestion
  #   - Stock level preview (products approaching threshold)
  #   See: "Low Stock Alert Agent Scenarios" section below
  #   See: full-order-journey.feature "Full agent trigger journey - Low stock alert detection"
  #
  # ✓ High-Value Order Agent (FlagForVIPReview):
  #   - Approval detail with order context
  #   - Approve/reject VIP review flag
  #   See: "High-Value Order Agent Scenarios" section below
  #   See: full-order-journey.feature "Full agent trigger journey - High-value order detection"
  #
  # ✓ Order Consolidation Agent (SuggestOrderConsolidation):
  #   - Approval detail with order list
  #   - Approve/reject consolidation suggestion
  #   See: "Order Consolidation Agent Scenarios" section below
  #   See: full-order-journey.feature "Full agent trigger journey - Order consolidation suggestion"
  #
  # ✓ Multi-agent filtering in Decision History
  #   See: "Multi-Agent Decision History" section below
  #
  # REMAINING E2E GAPS:
  # @e2e-required: Real-time approval list updates when new approval created
  #   Setup: Admin viewing approval list, trigger new cancellation in separate tab
  #   Expected: New approval card appears without page refresh (reactive query)
  #
  # @e2e-required: Concurrent review prevention
  #   Setup: Two admins viewing same approval detail simultaneously
  #   Expected: First to act succeeds, second sees "already reviewed" or stale state
  #
  # @e2e-required: Expiration cron integration
  #   Setup: Create approval with short expiration (e.g., 1 minute)
  #   Expected: Cron job marks approval as expired, UI reflects expired state
  #
  # ===========================================================================

  Background:
    Given I am logged in as an admin
    And I am on the agents admin page

  # ===========================================================================
  # Dashboard - Summary Stats
  # ===========================================================================

  @happy-path
  Scenario: View agents dashboard with pending approvals
    Given there are pending agent approvals in the system
    When I view the agents dashboard
    Then I should see the pending approvals count
    And I should see the active agents count
    And I should see the total events processed count

  @empty-state
  Scenario: View agents dashboard with no pending approvals
    Given there are no pending approvals
    When I view the agents dashboard
    Then I should see the pending approvals count as "0"
    And the "Pending Approvals" tab should not show a badge

  @navigation
  Scenario: Navigate to approval detail from dashboard
    Given there is a pending approval "SuggestCustomerOutreach" from "churn-risk-agent"
    When I click on the approval card
    Then I should be navigated to the approval detail page
    And I should see the action type "SuggestCustomerOutreach"

  # ===========================================================================
  # Approval List - Filtering and Display
  # ===========================================================================

  @happy-path
  Scenario: View approval list with pending approvals
    Given there are multiple pending approvals
    When I view the "Pending Approvals" tab
    Then I should see approval cards in a grid layout
    And each card should display the action type
    And each card should display the agent ID
    And each card should display the confidence level with text label
    And each card should display the expiration time

  @filtering
  Scenario: Filter approvals by status
    Given there are approvals with mixed statuses
    When I filter approvals by "approved" status
    Then I should only see approvals with "Approved" status badge
    And the count should match the filter

  @navigation
  Scenario: Click approval card to navigate to detail
    Given there is a pending approval
    When I click on an approval card
    Then I should be navigated to "/admin/agents/approvals/{approvalId}"

  # ===========================================================================
  # Approval Detail - Information Display
  # ===========================================================================

  @happy-path
  Scenario: View pending approval detail
    Given there is a pending approval with confidence 0.75
    When I view the approval detail
    Then I should see the action type
    And I should see the agent ID
    And I should see the confidence badge showing "Medium: 75%"
    And I should see the reason/analysis text
    And I should see the action payload in JSON format
    And I should see the triggering event IDs
    And I should see the creation time
    And I should see the expiration countdown

  Scenario: View already approved approval
    Given there is an approved approval with reviewer "admin-001"
    When I view the approval detail
    Then I should see the "Approved" status badge
    And I should see the reviewer ID "admin-001"
    And I should see the review timestamp
    And I should see the review note if present
    And I should not see the action panel

  Scenario: View already rejected approval
    Given there is a rejected approval
    When I view the approval detail
    Then I should see the "Rejected" status badge
    And I should see the reviewer information
    And I should not see the action panel

  Scenario: View expired approval
    Given there is an expired approval
    When I view the approval detail
    Then I should see the "Expired" status badge
    And I should not see the action panel
    And I should see a visual indicator that no action can be taken

  @confidence-display
  Scenario: Confidence conveyed via text label (WCAG 1.4.1)
    Given there is a pending approval with confidence 0.55
    When I view the approval detail
    Then the confidence badge should show "Low: 55%"
    And the confidence level should be conveyed through text, not color alone

  # ===========================================================================
  # Approve/Reject Actions
  # ===========================================================================

  @happy-path
  Scenario: Approve pending action with note
    Given there is a pending approval that I can act on
    When I enter a review note "Verified customer history, proceeding with outreach"
    And I click "Approve"
    Then I should see the button text change to "Approving..."
    And both action buttons should be disabled
    And I should be redirected to the approvals list
    And I should see a success indication

  @happy-path
  Scenario: Reject pending action with note
    Given there is a pending approval that I can act on
    When I enter a review note "False positive - customer already retained"
    And I click "Reject"
    Then I should see the button text change to "Rejecting..."
    And I should be redirected to the approvals list

  Scenario: Approve without note
    Given there is a pending approval
    When I click "Approve" without entering a note
    Then the action should still succeed
    And the review note should be empty in the audit record

  @error-handling
  Scenario: Error during approve action
    Given there is a pending approval
    And the backend will return an error
    When I click "Approve"
    Then I should see an error alert
    And the alert should have role="alert" for screen reader announcement
    And the buttons should become enabled again

  Scenario: Cannot act on expired approvals
    Given there is an approval that just expired
    When I view the approval detail
    Then I should not see the "Take Action" panel
    And I should see the "Expired" status

  # ===========================================================================
  # Agent Monitoring Tab
  # ===========================================================================

  @happy-path
  Scenario: View active agents in monitoring tab
    Given there are active agents processing events
    When I click the "Monitoring" tab
    Then I should see agent checkpoint cards
    And each card should display the agent ID
    And each card should display events processed count
    And each card should display last processed position
    And each card should display status badge
    And each card should display last updated time

  Scenario: View agent checkpoint details
    Given there is an agent "churn-risk-agent" with 1247 events processed
    When I view the monitoring tab
    Then I should see "churn-risk-agent" card
    And the events processed should show "1,247"
    And the status should show "Active"

  @empty-state
  Scenario: No active agents
    Given there are no agent checkpoints
    When I view the monitoring tab
    Then I should see an empty state message

  # ===========================================================================
  # Agent Decision History Tab (Audit Trail)
  # ===========================================================================
  # The Decision History tab displays past agent decisions from agentAuditEvents.
  # This provides visibility into what the agent has detected and decided,
  # even when no approvals are pending.
  # ===========================================================================

  @happy-path @audit
  Scenario: View agent decision history
    Given the agent has made decisions in the past
    When I click the "Decision History" tab
    Then I should see a list of past agent decisions
    And each decision should display the event type
    And each decision should display the timestamp
    And each decision should display the confidence level
    And each decision should display the action taken

  @audit @detail
  Scenario: View decision detail with reasoning
    Given the agent has made a decision with ID "dec_123"
    When I click on the decision in the history list
    Then I should see the full reasoning text
    And I should see the triggering event IDs
    And I should see whether approval was required

  @empty-state @audit
  Scenario: Empty decision history
    Given the agent has not made any decisions yet
    When I view the "Decision History" tab
    Then I should see an empty state message
    And the message should explain what will appear here

  # ===========================================================================
  # Customer Risk Preview (Pattern Detection Progress)
  # ===========================================================================
  # The Risk Preview shows customers approaching the churn detection threshold.
  # This uses the customerCancellations projection to display:
  # - Customers with 1+ cancellations (sorted by count descending)
  # - Progress toward threshold (e.g., "2/3 cancellations")
  # ===========================================================================

  @happy-path @risk-preview
  Scenario: View customers approaching churn threshold
    Given customers exist with the following cancellation counts:
      | customerId     | cancellations | threshold |
      | cust_alice     | 2             | 3         |
      | cust_bob       | 1             | 3         |
      | cust_charlie   | 0             | 3         |
    When I view the "Risk Preview" section
    Then I should see customers ordered by proximity to threshold
    And I should see "cust_alice" with progress "2/3"
    And I should see "cust_bob" with progress "1/3"
    And I should not see "cust_charlie" (no cancellations)

  @risk-preview @progress
  Scenario: Customer risk progress indicator
    Given customer "cust_at_risk" has 2 of 3 cancellations
    When I view the risk preview
    Then the progress bar for "cust_at_risk" should show approximately 66%
    And the progress should be accessible (not color-only per WCAG 1.4.1)

  @empty-state @risk-preview
  Scenario: No customers approaching threshold
    Given no customers have any cancellations
    When I view the risk preview
    Then I should see a message indicating no customers are at risk
    And the message should explain what will appear here

  # ===========================================================================
  # Low Stock Alert Agent Scenarios
  # ===========================================================================
  # The Low Stock Alert agent monitors inventory events and detects when
  # product available quantity drops below threshold (default: 5 units).
  # Subscribes to: StockReserved, StockAdded
  # Action: SuggestRestock
  # ===========================================================================

  @agent-bc @low-stock-agent @navigation
  Scenario: Navigate to low stock restock approval detail
    Given there is a pending approval "SuggestRestock" from "low-stock-alert-agent"
    When I click on the approval card
    Then I should be navigated to the approval detail page
    And I should see the action type "SuggestRestock"
    And I should see the product ID in the payload
    And I should see the recommended restock quantity

  @agent-bc @low-stock-agent @detail
  Scenario: View low stock alert approval with product context
    Given there is a pending approval "SuggestRestock" with confidence 0.85
    When I view the approval detail
    Then I should see the action type "SuggestRestock"
    And I should see the agent ID "low-stock-alert-agent"
    And I should see the confidence badge showing "High: 85%"
    And I should see the reason explaining low stock detected
    And the payload should include "productId"
    And the payload should include "currentQuantity"
    And the payload should include "recommendedQuantity"
    And the payload should include "threshold"

  @agent-bc @low-stock-agent @happy-path
  Scenario: Approve low stock restock suggestion
    Given there is a pending approval "SuggestRestock" that I can act on
    When I enter a review note "Approved - ordering 50 units from supplier"
    And I click "Approve"
    Then I should see the button text change to "Approving..."
    And I should be redirected to the approvals list
    And I should see a success indication

  @agent-bc @low-stock-agent @happy-path
  Scenario: Reject low stock restock suggestion
    Given there is a pending approval "SuggestRestock" that I can act on
    When I enter a review note "Product being discontinued - no restock needed"
    And I click "Reject"
    Then I should see the button text change to "Rejecting..."
    And I should be redirected to the approvals list

  # ===========================================================================
  # High-Value Order Agent Scenarios
  # ===========================================================================
  # The High-Value Order agent monitors submitted orders and flags those
  # exceeding the value threshold (default: $500) for VIP review.
  # Subscribes to: OrderSubmitted
  # Action: FlagForVIPReview
  # ===========================================================================

  @agent-bc @high-value-agent @navigation
  Scenario: Navigate to high-value order VIP review approval detail
    Given there is a pending approval "FlagForVIPReview" from "high-value-order-agent"
    When I click on the approval card
    Then I should be navigated to the approval detail page
    And I should see the action type "FlagForVIPReview"
    And I should see the order ID in the payload
    And I should see the order total amount

  @agent-bc @high-value-agent @detail
  Scenario: View high-value order approval with order context
    Given there is a pending approval "FlagForVIPReview" with confidence 0.95
    When I view the approval detail
    Then I should see the action type "FlagForVIPReview"
    And I should see the agent ID "high-value-order-agent"
    And I should see the confidence badge showing "High: 95%"
    And I should see the reason explaining high-value order detected
    And the payload should include "orderId"
    And the payload should include "customerId"
    And the payload should include "totalAmount"
    And the payload should include "threshold"

  @agent-bc @high-value-agent @happy-path
  Scenario: Approve VIP review for high-value order
    Given there is a pending approval "FlagForVIPReview" that I can act on
    When I enter a review note "VIP customer - expediting order processing"
    And I click "Approve"
    Then I should see the button text change to "Approving..."
    And I should be redirected to the approvals list
    And I should see a success indication

  @agent-bc @high-value-agent @happy-path
  Scenario: Reject VIP review flag
    Given there is a pending approval "FlagForVIPReview" that I can act on
    When I enter a review note "Standard processing sufficient - not a VIP account"
    And I click "Reject"
    Then I should see the button text change to "Rejecting..."
    And I should be redirected to the approvals list

  # ===========================================================================
  # Order Consolidation Suggestion Agent Scenarios
  # ===========================================================================
  # The Order Consolidation agent monitors submitted orders and suggests
  # combining orders when a customer submits 3+ orders within 1 hour.
  # Subscribes to: OrderSubmitted
  # Action: SuggestOrderConsolidation
  # ===========================================================================

  @agent-bc @consolidation-agent @navigation
  Scenario: Navigate to order consolidation suggestion approval detail
    Given there is a pending approval "SuggestOrderConsolidation" from "order-consolidation-agent"
    When I click on the approval card
    Then I should be navigated to the approval detail page
    And I should see the action type "SuggestOrderConsolidation"
    And I should see the customer ID in the payload
    And I should see the list of order IDs to consolidate

  @agent-bc @consolidation-agent @detail
  Scenario: View order consolidation approval with order list
    Given there is a pending approval "SuggestOrderConsolidation" with confidence 0.80
    When I view the approval detail
    Then I should see the action type "SuggestOrderConsolidation"
    And I should see the agent ID "order-consolidation-agent"
    And I should see the confidence badge showing "High: 80%"
    And I should see the reason explaining multiple recent orders detected
    And the payload should include "customerId"
    And the payload should include "orderIds"
    And the payload should include "orderCount"
    And the payload should include "windowHours"
    And the payload should include "potentialSavings"

  @agent-bc @consolidation-agent @happy-path
  Scenario: Approve order consolidation suggestion
    Given there is a pending approval "SuggestOrderConsolidation" that I can act on
    When I enter a review note "Customer contacted - consolidating orders for single shipment"
    And I click "Approve"
    Then I should see the button text change to "Approving..."
    And I should be redirected to the approvals list
    And I should see a success indication

  @agent-bc @consolidation-agent @happy-path
  Scenario: Reject order consolidation suggestion
    Given there is a pending approval "SuggestOrderConsolidation" that I can act on
    When I enter a review note "Customer requested separate deliveries to different addresses"
    And I click "Reject"
    Then I should see the button text change to "Rejecting..."
    And I should be redirected to the approvals list

  # ===========================================================================
  # Multi-Agent Decision History
  # ===========================================================================
  # Cross-cutting scenarios for viewing and filtering decisions from
  # multiple agent types in the Decision History tab.
  # ===========================================================================

  @agent-bc @audit @multi-agent
  Scenario: View decision history filtered by agent type
    Given decisions exist from multiple agents:
      | agentId                    | actionType                 | count |
      | churn-risk-agent           | SuggestCustomerOutreach    | 3     |
      | low-stock-alert-agent      | SuggestRestock             | 2     |
      | high-value-order-agent     | FlagForVIPReview           | 4     |
      | order-consolidation-agent  | SuggestOrderConsolidation  | 1     |
    When I click the "Decision History" tab
    Then I should see decisions from all agent types
    And I should be able to filter by agent ID

  @agent-bc @audit @low-stock-agent
  Scenario: View low stock agent decision in history
    Given the "low-stock-alert-agent" has made a decision
    When I click the "Decision History" tab
    And I click on the "SuggestRestock" decision
    Then I should see the full reasoning text
    And I should see the product ID that triggered the alert
    And I should see whether approval was required

  @agent-bc @audit @high-value-agent
  Scenario: View high-value order agent decision in history
    Given the "high-value-order-agent" has made a decision
    When I click the "Decision History" tab
    And I click on the "FlagForVIPReview" decision
    Then I should see the full reasoning text
    And I should see the order total that triggered the flag
    And I should see whether approval was required

  @agent-bc @audit @consolidation-agent
  Scenario: View order consolidation agent decision in history
    Given the "order-consolidation-agent" has made a decision
    When I click the "Decision History" tab
    And I click on the "SuggestOrderConsolidation" decision
    Then I should see the full reasoning text
    And I should see the number of orders in the consolidation window
    And I should see whether approval was required

  # ===========================================================================
  # Stock Level Preview (Low Stock Alert Agent)
  # ===========================================================================
  # Shows products approaching the low stock threshold, similar to
  # Customer Risk Preview but for inventory.
  # ===========================================================================

  @agent-bc @stock-preview @low-stock-agent
  Scenario: View products approaching low stock threshold
    Given products exist with the following stock levels:
      | productId      | availableQuantity | threshold |
      | prod_widget    | 3                 | 5         |
      | prod_gadget    | 8                 | 5         |
      | prod_gizmo     | 50                | 5         |
    When I view the "Stock Preview" section
    Then I should see products ordered by proximity to threshold
    And I should see "prod_widget" with status "Critical (3/5)"
    And I should see "prod_gadget" with status "Warning (8/5)"
    And I should not see "prod_gizmo" (well above threshold)

  @agent-bc @stock-preview @progress
  Scenario: Stock level progress indicator
    Given product "prod_at_risk" has 2 of 5 stock threshold
    When I view the stock preview
    Then the progress bar for "prod_at_risk" should show critical level
    And the progress should be accessible (not color-only per WCAG 1.4.1)

  # ===========================================================================
  # Accessibility
  # ===========================================================================

  @accessibility
  Scenario: Approval card is keyboard accessible
    Given there are pending approvals
    When I focus on an approval card using Tab key
    Then the card should have visible focus indicator
    And I should be able to activate it with Enter key
    And I should be able to activate it with Space key

  @accessibility
  Scenario: Screen reader announces action status changes
    Given I am on an approval detail page
    When I click "Approve"
    Then the screen reader should announce "Approving action..."
    And when the action completes, appropriate feedback should be provided

  @accessibility
  Scenario: Confidence level conveyed via text not just color
    Given there are approvals with different confidence levels
    When I view the approval cards
    Then each confidence badge should include text "High", "Medium", or "Low"
    And the text should be readable without relying on color perception

  @accessibility
  Scenario: Focus trap in action buttons
    Given I am on an approval detail page with action panel
    When I Tab through the page
    Then focus should move through the review note textarea
    And focus should move to the Reject button
    And focus should move to the Approve button

  # ===========================================================================
  # Error Handling
  # ===========================================================================

  @error-handling
  Scenario: Handle approval not found
    Given I navigate to an approval that does not exist
    When the page loads
    Then I should see "Approval not found" message
    And I should see a link to go back to the approvals list

  @error-handling
  Scenario: Handle network error loading approvals
    Given the backend is temporarily unavailable
    When I try to load the approvals list
    Then I should see an error message
    And I should see a "Retry" button
    When I click "Retry" and the backend recovers
    Then the approvals should load successfully

  @error-handling
  Scenario: Route-level error boundary
    Given the approval detail page encounters an unexpected error
    When the error is caught by the error boundary
    Then I should see a user-friendly error message
    And I should see a way to navigate back or retry

  # ===========================================================================
  # Known Gaps and Limitations (for documentation)
  # ===========================================================================
  #
  # 1. Authentication: useReviewerId() returns placeholder; needs Convex Auth/Clerk
  # 2. No loading skeletons during Suspense
  # 3. No optimistic updates for approve/reject
  # 4. No toast notifications for success/error feedback
  # 5. Pagination limited to 100 items (hardcoded)
  # 6. No sorting options beyond creation time
  # 7. No search by agent ID or action type
  # 8. No bulk approve/reject functionality
  # 9. Frontend unit tests not running (TanStack Start/Vitest config issue)
  # ===========================================================================
