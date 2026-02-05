@admin @agents @approvals
Feature: Agent Approval Workflow
  As an admin user
  I want to review and act on AI agent recommendations
  So that automated actions require human oversight before execution

  # ===========================================================================
  # E2E Test Gaps - Critical Integration Flows
  # ===========================================================================
  # @e2e-required: Full flow from order cancellations -> agent detection -> approval -> command emission
  #   Setup: Create customer, place 3+ orders, cancel each order
  #   Expected: Agent detects churn pattern, creates pending approval, admin approves, command emitted
  #   Timing: May take 5-30s for Workpool to process events
  #
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
  # @e2e-required: Agent pattern detection with projection-based lookup
  #   Verify: customerCancellations projection is updated on OrderCancelled events
  #   Verify: Agent uses O(1) projection lookup instead of N+1 event queries
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
