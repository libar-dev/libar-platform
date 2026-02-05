"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { ApprovalDetail } from "@/components/organisms/approval-detail";
import { Button } from "@/components/ui/button";
import { useApprovalDetail } from "@/hooks/use-approval-detail";
import type { PendingApproval } from "@/hooks/use-pending-approvals";
import { ArrowLeft } from "lucide-react";

// Query reference for SSR preloading
const getApprovalByIdQuery = makeFunctionReference<"query">(
  "queries/agent:getApprovalById"
) as FunctionReference<"query", "public", { approvalId: string }, PendingApproval | null>;

export const Route = createFileRoute("/admin/agents/approvals/$approvalId")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(getApprovalByIdQuery, { approvalId: params.approvalId })
    );
  },
  component: ApprovalDetailPage,
});

/**
 * Approval detail page - review and take action on a specific approval.
 */
function ApprovalDetailPage() {
  const { approvalId } = Route.useParams();
  const navigate = useNavigate();
  const { approval } = useApprovalDetail(approvalId);

  // TODO: Get actual user ID from auth context
  const userId = "reviewer-1";

  const handleActionComplete = () => {
    navigate({ to: "/admin/agents" });
  };

  if (!approval) {
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
              The approval with ID "{approvalId}" could not be found.
            </p>
            <Link to="/admin/agents" className="mt-4">
              <Button variant="outline">Return to Agent Dashboard</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

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
          approval={approval}
          userId={userId}
          onActionComplete={handleActionComplete}
        />
      </div>
    </AppLayout>
  );
}
