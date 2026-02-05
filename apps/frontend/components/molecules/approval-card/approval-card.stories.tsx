import type { Story, StoryDefault } from "@ladle/react";
import { ApprovalCard } from "./approval-card";
import { mockApprovals, approvalList } from "@/components/__fixtures__/approvals";

const meta: StoryDefault = {
  title: "Molecules/ApprovalCard",
};
export default meta;

export const Pending: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.pending} />
  </div>
);
Pending.meta = {
  description: "Approval card in pending status (medium confidence)",
};

export const HighConfidence: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.pendingHighConfidence} />
  </div>
);
HighConfidence.meta = {
  description: "Approval card with high confidence (>=90%) - outline badge variant",
};

export const MediumConfidence: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.pending} />
  </div>
);
MediumConfidence.meta = {
  description: "Approval card with medium confidence (70-89%) - default badge variant",
};

export const LowConfidence: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.pendingLowConfidence} />
  </div>
);
LowConfidence.meta = {
  description: "Approval card with low confidence (<70%) - destructive badge variant",
};

export const Approved: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.approved} />
  </div>
);
Approved.meta = {
  description: "Approval card in approved status",
};

export const Rejected: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.rejected} />
  </div>
);
Rejected.meta = {
  description: "Approval card in rejected status",
};

export const Expired: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.expired} />
  </div>
);
Expired.meta = {
  description: "Approval card in expired status (no expiration time shown)",
};

export const ExpiringSoon: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.pendingExpiringSoon} />
  </div>
);
ExpiringSoon.meta = {
  description: "Approval card expiring soon (<1 hour remaining)",
};

export const LongActionType: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.withLongActionType} />
  </div>
);
LongActionType.meta = {
  description: "Approval card with a long action type name (tests text wrapping)",
};

export const Interactive: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard
      approval={mockApprovals.pending}
      onClick={(id) => console.log("Navigate to:", id)}
    />
  </div>
);
Interactive.meta = {
  description:
    "Interactive approval card with click handler. Hover to see ring effect, click to trigger action. Supports keyboard navigation (Enter/Space).",
};

export const NonInteractive: Story = () => (
  <div className="w-[380px]">
    <ApprovalCard approval={mockApprovals.pending} />
  </div>
);
NonInteractive.meta = {
  description: "Non-interactive approval card (no onClick handler)",
};

export const AllVariants: Story = () => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {approvalList.map((approval) => (
      <ApprovalCard
        key={approval.approvalId}
        approval={approval}
        onClick={(id) => console.log("Navigate to:", id)}
      />
    ))}
  </div>
);
AllVariants.meta = {
  description: "Multiple approval cards showing all different states and scenarios",
};
