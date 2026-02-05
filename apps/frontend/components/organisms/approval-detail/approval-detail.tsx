"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatRelativeTime } from "@/lib/formatters";
import { useApprovalActions } from "@/hooks/use-approval-actions";
import type { PendingApproval, ApprovalStatus } from "@/hooks/use-pending-approvals";

/**
 * Props for the ApprovalDetail component
 */
export interface ApprovalDetailProps {
  /** Approval data to display */
  approval: PendingApproval;
  /** Current user ID for reviewer tracking */
  userId: string;
  /** Callback after successful action */
  onActionComplete?: () => void;
}

/**
 * Status display configuration for consistent styling
 */
const statusConfig: Record<
  ApprovalStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending Review", variant: "default" },
  approved: { label: "Approved", variant: "outline" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired: { label: "Expired", variant: "secondary" },
};

/**
 * Confidence badge colors based on thresholds.
 */
function getConfidenceVariant(
  confidence: number
): "default" | "secondary" | "destructive" | "outline" {
  if (confidence >= 0.9) return "outline";
  if (confidence >= 0.7) return "default";
  return "destructive";
}

/**
 * Format confidence as percentage.
 */
function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}

/**
 * Calculate time remaining until expiration.
 */
function getExpirationText(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining <= 0) return "Expired";

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} days remaining`;
  }
  if (hours > 0) {
    return `${hours} hours, ${minutes} minutes remaining`;
  }
  return `${minutes} minutes remaining`;
}

/**
 * ApprovalDetail displays full approval information with approve/reject actions.
 * Used in the approval detail page for human-in-loop review.
 *
 * @example
 * ```tsx
 * function ApprovalPage({ approvalId }: { approvalId: string }) {
 *   const { approval } = useApprovalDetail(approvalId);
 *   const userId = "current-user-id";
 *
 *   if (!approval) {
 *     return <div>Approval not found</div>;
 *   }
 *
 *   return (
 *     <ApprovalDetail
 *       approval={approval}
 *       userId={userId}
 *       onActionComplete={() => navigate("/admin/agents/approvals")}
 *     />
 *   );
 * }
 * ```
 */
export function ApprovalDetail({ approval, userId, onActionComplete }: ApprovalDetailProps) {
  const [reviewNote, setReviewNote] = useState("");
  const { approve, reject } = useApprovalActions();

  const config = statusConfig[approval.status];
  const isPending = approval.status === "pending";
  const isExpired = approval.expiresAt <= Date.now();
  const canTakeAction = isPending && !isExpired;

  const handleApprove = async () => {
    const result = await approve.execute({
      approvalId: approval.approvalId,
      reviewerId: userId,
      reviewNote: reviewNote || undefined,
    });
    if (result?.success && onActionComplete) {
      onActionComplete();
    }
  };

  const handleReject = async () => {
    const result = await reject.execute({
      approvalId: approval.approvalId,
      reviewerId: userId,
      reviewNote: reviewNote || undefined,
    });
    if (result?.success && onActionComplete) {
      onActionComplete();
    }
  };

  const isLoading = approve.state === "pending" || reject.state === "pending";

  return (
    <div className="space-y-6">
      {/* Main approval info */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle data-testid="action-type">{approval.action.type}</CardTitle>
              <CardDescription className="font-mono" data-testid="approval-id">
                {approval.approvalId}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant={config.variant} data-testid="status">
                {config.label}
              </Badge>
              <Badge variant={getConfidenceVariant(approval.confidence)} data-testid="confidence">
                {formatConfidence(approval.confidence)} confidence
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Agent info */}
          <div>
            <h4 className="mb-1 text-sm font-medium text-muted-foreground">Agent</h4>
            <p className="font-mono text-sm" data-testid="agent-id">
              {approval.agentId}
            </p>
          </div>

          {/* Reason / Analysis */}
          <div>
            <h4 className="mb-1 text-sm font-medium text-muted-foreground">Reason</h4>
            <p className="text-sm" data-testid="reason">
              {approval.reason}
            </p>
          </div>

          {/* Action payload */}
          <div>
            <h4 className="mb-1 text-sm font-medium text-muted-foreground">Action Payload</h4>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs" data-testid="payload">
              {JSON.stringify(approval.action.payload, null, 2)}
            </pre>
          </div>

          {/* Triggering events */}
          <div>
            <h4 className="mb-1 text-sm font-medium text-muted-foreground">
              Triggering Events ({approval.triggeringEventIds.length})
            </h4>
            <div className="flex flex-wrap gap-1">
              {approval.triggeringEventIds.map((eventId) => (
                <Badge key={eventId} variant="secondary" className="font-mono text-xs">
                  {eventId.length > 12 ? `${eventId.slice(0, 12)}...` : eventId}
                </Badge>
              ))}
            </div>
          </div>

          {/* Timing info */}
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Created: </span>
              <span data-testid="created-at">{formatRelativeTime(approval.createdAt)}</span>
            </div>
            {isPending && (
              <div>
                <span className="text-muted-foreground">Expires: </span>
                <span
                  className={isExpired ? "text-destructive" : "text-amber-600"}
                  data-testid="expires-at"
                >
                  {getExpirationText(approval.expiresAt)}
                </span>
              </div>
            )}
          </div>

          {/* Review info (if already reviewed) */}
          {approval.reviewerId && (
            <div className="rounded border p-3">
              <h4 className="mb-2 text-sm font-medium">Review</h4>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Reviewer: </span>
                  <span className="font-mono">{approval.reviewerId}</span>
                </p>
                {approval.reviewedAt && (
                  <p>
                    <span className="text-muted-foreground">Reviewed: </span>
                    {formatRelativeTime(approval.reviewedAt)}
                  </p>
                )}
                {approval.reviewNote && (
                  <p>
                    <span className="text-muted-foreground">Note: </span>
                    {approval.reviewNote}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action panel (only for pending approvals) */}
      {canTakeAction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Take Action</CardTitle>
            <CardDescription>
              Review the information above and approve or reject this agent action.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="review-note">Review Note (optional)</Label>
                <Textarea
                  id="review-note"
                  placeholder="Add context for your decision..."
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isLoading}
              data-testid="reject-button"
            >
              {reject.state === "pending" ? "Rejecting..." : "Reject"}
            </Button>
            <Button onClick={handleApprove} disabled={isLoading} data-testid="approve-button">
              {approve.state === "pending" ? "Approving..." : "Approve"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Error messages */}
      {approve.error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {approve.error}
        </div>
      )}
      {reject.error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {reject.error}
        </div>
      )}
    </div>
  );
}
