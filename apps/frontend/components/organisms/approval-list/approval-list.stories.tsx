import type { Story, StoryDefault } from "@ladle/react";
import { ApprovalList } from "./approval-list";
import { approvalList, approvalsByStatus } from "@/components/__fixtures__/approvals";

const meta: StoryDefault = {
  title: "Organisms/ApprovalList",
};
export default meta;

export const WithApprovals: Story = () => (
  <ApprovalList approvals={approvalList} onApprovalClick={(id) => console.log("Navigate to:", id)} />
);
WithApprovals.meta = {
  description: "Approval list with multiple approvals of different statuses",
};

export const EmptyState: Story = () => (
  <ApprovalList
    approvals={[]}
    emptyMessage="No pending approvals. Great work!"
    onApprovalClick={(id) => console.log("Navigate to:", id)}
  />
);
EmptyState.meta = {
  description: "Approval list with no approvals - shows empty state message",
};

export const MixedStatuses: Story = () => (
  <ApprovalList
    approvals={approvalList}
    title="All Approvals"
    onApprovalClick={(id) => console.log("Navigate to:", id)}
  />
);
MixedStatuses.meta = {
  description: "Approval list with title and mixed statuses (pending, approved, rejected, expired)",
};

export const PendingOnly: Story = () => (
  <ApprovalList
    approvals={approvalList}
    title="Pending Approvals"
    filterStatus="pending"
    emptyMessage="No pending approvals to review"
    onApprovalClick={(id) => console.log("Navigate to:", id)}
  />
);
PendingOnly.meta = {
  description: "Approval list filtered to show only pending approvals",
};

export const ApprovedOnly: Story = () => (
  <ApprovalList
    approvals={approvalList}
    title="Approved Actions"
    filterStatus="approved"
    emptyMessage="No approved actions yet"
    onApprovalClick={(id) => console.log("Navigate to:", id)}
  />
);
ApprovedOnly.meta = {
  description: "Approval list filtered to show only approved approvals",
};

export const RejectedOnly: Story = () => (
  <ApprovalList
    approvals={approvalList}
    title="Rejected Actions"
    filterStatus="rejected"
    emptyMessage="No rejected actions"
    onApprovalClick={(id) => console.log("Navigate to:", id)}
  />
);
RejectedOnly.meta = {
  description: "Approval list filtered to show only rejected approvals",
};

export const WithTitle: Story = () => (
  <ApprovalList
    approvals={approvalsByStatus.pending}
    title="Agent Actions Awaiting Review"
    onApprovalClick={(id) => console.log("Navigate to:", id)}
  />
);
WithTitle.meta = {
  description: "Approval list with custom title heading",
};

export const CustomEmptyMessage: Story = () => (
  <ApprovalList
    approvals={[]}
    title="Pending Reviews"
    emptyMessage="All agent actions have been reviewed. Check back later for new recommendations."
    onApprovalClick={(id) => console.log("Navigate to:", id)}
  />
);
CustomEmptyMessage.meta = {
  description: "Empty approval list with custom message",
};

export const NonInteractive: Story = () => (
  <ApprovalList approvals={approvalsByStatus.pending} title="View-only Approvals" />
);
NonInteractive.meta = {
  description: "Approval list without click handler (view-only mode)",
};
