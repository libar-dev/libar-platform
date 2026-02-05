"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useMounted } from "@/hooks";
import {
  statusConfig,
  getConfidenceVariant,
  getConfidenceLabel,
  formatConfidence,
  formatExpirationTime,
  truncateId,
  type ApprovalStatus,
} from "@/lib/approval-utils";

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
  const mounted = useMounted();
  const config = statusConfig[approval.status];

  const handleClick = () => {
    if (onClick) {
      onClick(approval.approvalId);
    }
  };

  const isInteractive = !!onClick;
  const isPending = approval.status === "pending";

  // Build accessible label for screen readers
  const accessibleLabel = `Review ${approval.action.type} action from ${approval.agentId}, ${getConfidenceLabel(approval.confidence)} confidence at ${formatConfidence(approval.confidence)}`;

  return (
    <Card
      size="sm"
      data-testid={`approval-card-${approval.approvalId}`}
      className={cn(
        isInteractive &&
          "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/50 focus:ring-2 focus:ring-primary/50 focus:outline-none"
      )}
      onClick={isInteractive ? handleClick : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? accessibleLabel : undefined}
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
              {getConfidenceLabel(approval.confidence)}: {formatConfidence(approval.confidence)}
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
                {mounted ? formatExpirationTime(approval.expiresAt, true) : "\u00A0"}
              </span>
            )}
            <span className="text-xs text-muted-foreground" data-testid="created-time">
              {mounted ? formatRelativeTime(approval.createdAt) : "\u00A0"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
