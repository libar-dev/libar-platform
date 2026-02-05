"use client";

import { ApprovalCard } from "@/components/molecules/approval-card";
import type { PendingApproval, ApprovalStatus } from "@/hooks/use-pending-approvals";

/**
 * Props for the ApprovalList component
 */
export interface ApprovalListProps {
  /** List of approvals to display */
  approvals: PendingApproval[];
  /** Callback when an approval card is clicked */
  onApprovalClick?: (approvalId: string) => void;
  /** Optional title for the list */
  title?: string;
  /** Optional filter by status */
  filterStatus?: ApprovalStatus;
  /** Show empty state message */
  emptyMessage?: string;
}

/**
 * ApprovalList displays a list of approval cards.
 * Used in the agent admin pages for human-in-loop review.
 *
 * @example
 * ```tsx
 * function ApprovalsPage() {
 *   const { approvals } = usePendingApprovals({ status: "pending" });
 *
 *   return (
 *     <ApprovalList
 *       approvals={approvals}
 *       title="Pending Approvals"
 *       onApprovalClick={(id) => navigate(`/admin/agents/approvals/${id}`)}
 *       emptyMessage="No pending approvals. Great work!"
 *     />
 *   );
 * }
 * ```
 */
export function ApprovalList({
  approvals,
  onApprovalClick,
  title,
  filterStatus,
  emptyMessage = "No approvals found",
}: ApprovalListProps) {
  // Apply filter if specified
  const filteredApprovals = filterStatus
    ? approvals.filter((a) => a.status === filterStatus)
    : approvals;

  if (filteredApprovals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredApprovals.map((approval) => (
          <ApprovalCard key={approval.approvalId} approval={approval} onClick={onApprovalClick} />
        ))}
      </div>
    </div>
  );
}
