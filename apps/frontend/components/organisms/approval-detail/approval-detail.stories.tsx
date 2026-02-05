import type { Story, StoryDefault } from "@ladle/react";
import { ApprovalDetail } from "./approval-detail";
import { mockApprovals } from "@/components/__fixtures__/approvals";
import type { PendingApprovalFixture } from "@/components/__fixtures__/approvals";

const meta: StoryDefault = {
  title: "Organisms/ApprovalDetail",
};
export default meta;

/**
 * Note: ApprovalDetail uses useApprovalActions hook internally for mutation state.
 * In Ladle, the mutations will log to console but won't actually execute.
 * Loading and error states require integration/E2E testing to verify.
 *
 * Stories below focus on the different visual states based on approval status.
 */

// Cast fixture type to component's expected type
const toApproval = (fixture: PendingApprovalFixture) =>
  fixture as unknown as Parameters<typeof ApprovalDetail>[0]["approval"];

export const PendingAction: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.pending)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed - would navigate back")}
    />
  </div>
);
PendingAction.meta = {
  description:
    "Pending approval ready for review. Shows action panel with approve/reject buttons and optional note field.",
};

export const HighConfidencePending: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.pendingHighConfidence)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
HighConfidencePending.meta = {
  description: "High confidence (95%) pending approval - outline badge variant",
};

export const LowConfidencePending: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.pendingLowConfidence)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
LowConfidencePending.meta = {
  description: "Low confidence (55%) pending approval - destructive badge variant for visibility",
};

export const AlreadyApproved: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.approved)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
AlreadyApproved.meta = {
  description:
    "Already approved - shows reviewer info (who, when, note) and no action panel since already reviewed",
};

export const AlreadyRejected: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.rejected)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
AlreadyRejected.meta = {
  description:
    "Already rejected - shows reviewer info and rejection note, no action panel available",
};

export const Expired: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.expired)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
Expired.meta = {
  description: "Expired approval - no action panel shown since past expiration time",
};

export const ExpiringSoon: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.pendingExpiringSoon)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
ExpiringSoon.meta = {
  description: "Pending approval expiring soon - shows amber warning text for expiration time",
};

export const LongReasonText: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.withLongReason)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
LongReasonText.meta = {
  description: "Approval with verbose analysis/reason text - tests text wrapping and readability",
};

export const ManyTriggeringEvents: Story = () => (
  <div className="mx-auto max-w-3xl">
    <ApprovalDetail
      approval={toApproval(mockApprovals.withManyEvents)}
      userId="admin-user-current"
      onActionComplete={() => console.log("Action completed")}
    />
  </div>
);
ManyTriggeringEvents.meta = {
  description:
    "Approval triggered by 12 events - tests badge wrapping in triggering events section",
};

export const ComplexPayload: Story = () => {
  const approvalWithComplexPayload = {
    ...mockApprovals.pending,
    action: {
      type: "InitiateCustomerWorkflow",
      payload: {
        customerId: "cust-enterprise-007",
        workflow: {
          type: "retention",
          steps: ["email", "sms", "call"],
          timing: { emailDelay: "1h", smsDelay: "24h", callDelay: "72h" },
        },
        metadata: {
          source: "churn-prediction-model",
          version: "2.3.1",
          confidenceFactors: {
            orderHistory: 0.85,
            supportInteractions: 0.72,
            engagementScore: 0.68,
          },
        },
      },
    },
  };

  return (
    <div className="mx-auto max-w-3xl">
      <ApprovalDetail
        approval={toApproval(approvalWithComplexPayload)}
        userId="admin-user-current"
        onActionComplete={() => console.log("Action completed")}
      />
    </div>
  );
};
ComplexPayload.meta = {
  description:
    "Approval with complex nested payload - tests JSON display in payload section with proper formatting",
};

/**
 * Note about Loading and Error states:
 *
 * The ApprovalDetail component handles loading/error states internally via useApprovalActions hook:
 * - Loading: Buttons show "Approving..." / "Rejecting..." text, both buttons disabled
 * - Error: Alert banner with role="alert" appears below the action panel
 * - Screen reader: Live region announces loading status
 *
 * These states cannot be demonstrated in static Ladle stories as they depend on
 * mutation execution. To verify these states:
 * 1. Use integration tests with mocked backend
 * 2. Test manually with actual Convex backend
 * 3. E2E tests (see agent-approvals.feature)
 */
