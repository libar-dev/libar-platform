"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ApprovalList } from "@/components/organisms/approval-list";
import { usePendingApprovals, type PendingApproval } from "@/hooks/use-pending-approvals";
import { useActiveAgents, type AgentCheckpoint } from "@/hooks/use-active-agents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Query references for SSR preloading
const getPendingApprovalsQuery = makeFunctionReference<"query">(
  "queries/agent:getPendingApprovals"
) as FunctionReference<"query", "public", { status?: string; limit?: number }, PendingApproval[]>;

const getActiveAgentsQuery = makeFunctionReference<"query">(
  "queries/agent:getActiveAgents"
) as FunctionReference<"query", "public", Record<string, never>, AgentCheckpoint[]>;

export const Route = createFileRoute("/admin/agents")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(getPendingApprovalsQuery, { status: "pending", limit: 100 })
      ),
      context.queryClient.ensureQueryData(convexQuery(getActiveAgentsQuery, {})),
    ]);
  },
  component: AdminAgentsPage,
});

/**
 * Format relative time for agent status display.
 */
function formatAgentTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Admin Agents page - manage agent approvals and monitor status.
 *
 * Provides:
 * - Pending Approvals tab: Review and approve/reject agent actions
 * - Monitoring tab: View active agent checkpoints and health
 */
function AdminAgentsPage() {
  const navigate = useNavigate();
  const { approvals: pendingApprovals } = usePendingApprovals({ status: "pending" });
  const { agents } = useActiveAgents();

  const handleApprovalClick = (approvalId: string) => {
    navigate({ to: `/admin/agents/approvals/${approvalId}` });
  };

  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        {/* Page Header */}
        <div data-testid="admin-agents-page-header">
          <h1 className="text-3xl font-bold tracking-tight">Admin - Agent BC</h1>
          <p className="text-muted-foreground">
            Review agent decisions and monitor agent health
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Approvals</CardDescription>
              <CardTitle className="text-3xl" data-testid="pending-count">
                {pendingApprovals.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Actions requiring review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Agents</CardDescription>
              <CardTitle className="text-3xl" data-testid="active-agents-count">
                {agents.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Currently processing events</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Events Processed</CardDescription>
              <CardTitle className="text-3xl" data-testid="events-processed-count">
                {agents.reduce((sum, a) => sum + a.eventsProcessed, 0)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Total across all agents</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="approvals" className="space-y-6">
          <TabsList>
            <TabsTrigger value="approvals" data-testid="tab-approvals">
              Pending Approvals
              {pendingApprovals.length > 0 && (
                <Badge variant="default" className="ml-2">
                  {pendingApprovals.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="monitoring" data-testid="tab-monitoring">
              Monitoring
            </TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            <ApprovalList
              approvals={pendingApprovals}
              onApprovalClick={handleApprovalClick}
              emptyMessage="No pending approvals. All agent actions have been reviewed."
            />
          </TabsContent>

          <TabsContent value="monitoring">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Agents</h2>
              {agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No active agents. Agents will appear here once they start processing events.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {agents.map((agent) => (
                    <Card key={agent.agentId}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base" data-testid="agent-id">
                              {agent.agentId}
                            </CardTitle>
                            <CardDescription className="font-mono text-xs">
                              {agent.subscriptionId}
                            </CardDescription>
                          </div>
                          <Badge
                            variant={agent.status === "active" ? "outline" : "secondary"}
                            data-testid="agent-status"
                          >
                            {agent.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Events Processed</span>
                            <p className="font-medium" data-testid="events-processed">
                              {agent.eventsProcessed.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Last Position</span>
                            <p className="font-mono font-medium" data-testid="last-position">
                              {agent.lastProcessedPosition === -1
                                ? "N/A"
                                : agent.lastProcessedPosition}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Last Updated</span>
                            <p className="font-medium" data-testid="last-updated">
                              {formatAgentTime(agent.updatedAt)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
