import type { Story, StoryDefault } from "@ladle/react";
import { Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/templates/app-layout";
import { ApprovalDetail } from "@/components/organisms/approval-detail";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { mockApprovals, type PendingApprovalFixture } from "@/components/__fixtures__/approvals";

const meta: StoryDefault = {
  title: "Pages/AgentApprovalDetail",
};
export default meta;

// Cast fixture type to component's expected type
const toApproval = (fixture: PendingApprovalFixture) =>
  fixture as unknown as Parameters<typeof ApprovalDetail>[0]["approval"];

/**
 * Approval detail page - pending approval ready for review
 */
export const PendingApproval: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        {/* Back navigation */}
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        {/* Approval Detail */}
        <ApprovalDetail
          approval={toApproval(mockApprovals.pending)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed - would navigate back")}
        />
      </div>
    </AppLayout>
  );
};
PendingApproval.meta = {
  description: "Approval detail page for a pending approval - shows action panel with approve/reject buttons",
};

/**
 * Approval detail page - high confidence pending approval
 */
export const HighConfidencePending: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.pendingHighConfidence)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
HighConfidencePending.meta = {
  description: "Approval detail page with high confidence (95%) - outline badge variant",
};

/**
 * Approval detail page - low confidence requiring careful review
 */
export const LowConfidencePending: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.pendingLowConfidence)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
LowConfidencePending.meta = {
  description: "Approval detail page with low confidence (55%) - destructive badge signals need for careful review",
};

/**
 * Approval detail page - already approved
 */
export const AlreadyApproved: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.approved)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
AlreadyApproved.meta = {
  description: "Approval detail page for already approved action - shows review info, no action panel",
};

/**
 * Approval detail page - already rejected
 */
export const AlreadyRejected: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.rejected)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
AlreadyRejected.meta = {
  description: "Approval detail page for already rejected action - shows rejection note and review info",
};

/**
 * Approval detail page - expired approval
 */
export const ExpiredApproval: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.expired)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
ExpiredApproval.meta = {
  description: "Approval detail page for expired approval - no action can be taken",
};

/**
 * Approval detail page - expiring soon (urgent)
 */
export const ExpiringSoon: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.pendingExpiringSoon)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
ExpiringSoon.meta = {
  description: "Approval detail page for approval expiring soon - amber warning text indicates urgency",
};

/**
 * Approval detail page - approval not found
 */
export const NotFound: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-semibold">Approval Not Found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The approval with ID "apr-nonexistent-123" could not be found.
          </p>
          <Link to="/admin/agents" className="mt-4">
            <Button variant="outline">Return to Agent Dashboard</Button>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
};
NotFound.meta = {
  description: "Approval detail page when approval ID is not found",
};

/**
 * Approval detail page - error state
 */
export const ErrorState: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <h2 className="text-lg font-semibold text-destructive">Failed to Load Approval</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            An unexpected error occurred while loading the approval.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => console.log("Retry clicked")}>
            Try Again
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};
ErrorState.meta = {
  description: "Approval detail page error fallback - shown when data loading fails",
};

/**
 * Approval detail page - with long reason text
 */
export const LongReasonText: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.withLongReason)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
LongReasonText.meta = {
  description: "Approval detail page with verbose analysis text - tests text wrapping and readability",
};

/**
 * Approval detail page - with many triggering events
 */
export const ManyTriggeringEvents: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/agents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Agents
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Approval</h1>
          <p className="text-muted-foreground">
            Review the agent decision and approve or reject the action.
          </p>
        </div>

        <ApprovalDetail
          approval={toApproval(mockApprovals.withManyEvents)}
          userId="admin-user-current"
          onActionComplete={() => console.log("Action completed")}
        />
      </div>
    </AppLayout>
  );
};
ManyTriggeringEvents.meta = {
  description: "Approval detail page with 12 triggering events - tests badge wrapping in events section",
};
