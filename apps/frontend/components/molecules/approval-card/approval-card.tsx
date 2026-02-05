"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/hooks/use-pending-approvals";

/**
 * Approval data required for the ApprovalCard component
 */
export interface ApprovalCardApproval {
  approvalId: string;
  agentId: string;
  action: {
    type: string;
    payload: unknown;
  };
  confidence: number;
  reason: string;
  status: ApprovalStatus;
  expiresAt: number;
  createdAt: number;
}

/**
 * Props for the ApprovalCard component
 */
export interface ApprovalCardProps {
  /** Approval data to display */
  approval: ApprovalCardApproval;
  /** Callback when the card is clicked */
  onClick?: (approvalId: string) => void;
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
  if (confidence >= 0.9) return "outline"; // High confidence
  if (confidence >= 0.7) return "default"; // Medium confidence
  return "destructive"; // Low confidence
}

/**
 * Format confidence as percentage.
 */
function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}

/**
 * Truncates ID for display.
 */
function truncateId(id: string, length = 8): string {
  if (id.length <= length + 3) return id;
  return `${id.slice(0, length)}...`;
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
    return `${days}d left`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  return `${minutes}m left`;
}

/**
 * ApprovalCard displays a pending approval summary.
 * Used in approval list views for human-in-loop workflow.
 *
 * @example
 * ```tsx
 * <ApprovalCard
 *   approval={{
 *     approvalId: "apr_001",
 *     agentId: "churn-risk-agent",
 *     action: { type: "SuggestCustomerOutreach", payload: {} },
 *     confidence: 0.75,
 *     reason: "Customer cancelled 3 orders in 30 days",
 *     status: "pending",
 *     expiresAt: Date.now() + 86400000,
 *     createdAt: Date.now() - 3600000,
 *   }}
 *   onClick={(id) => console.log("Navigate to:", id)}
 * />
 * ```
 */
export function ApprovalCard({ approval, onClick }: ApprovalCardProps) {
  const config = statusConfig[approval.status];

  const handleClick = () => {
    if (onClick) {
      onClick(approval.approvalId);
    }
  };

  const isInteractive = !!onClick;
  const isPending = approval.status === "pending";

  return (
    <Card
      size="sm"
      data-testid={`approval-card-${approval.approvalId}`}
      className={cn(
        isInteractive && "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/50"
      )}
      onClick={isInteractive ? handleClick : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle data-testid="action-type" className="text-sm">
              {approval.action.type}
            </CardTitle>
            <span className="font-mono text-xs text-muted-foreground" data-testid="agent-id">
              {approval.agentId}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={config.variant} data-testid="approval-status">
              {config.label}
            </Badge>
            <Badge variant={getConfidenceVariant(approval.confidence)} data-testid="confidence">
              {formatConfidence(approval.confidence)} confidence
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground" data-testid="reason">
          {approval.reason}
        </p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground" data-testid="approval-id">
            {truncateId(approval.approvalId)}
          </span>
          <div className="flex items-center gap-2">
            {isPending && (
              <span className="text-xs text-amber-600" data-testid="expiration">
                {getExpirationText(approval.expiresAt)}
              </span>
            )}
            <span className="text-xs text-muted-foreground" data-testid="created-time">
              {formatRelativeTime(approval.createdAt)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
