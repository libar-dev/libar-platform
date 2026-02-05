import type { Story, StoryDefault } from "@ladle/react";
import { AppLayout } from "@/components/templates/app-layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ApprovalList } from "@/components/organisms/approval-list";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/formatters";
import {
  approvalsByStatus,
  approvalList,
  checkpointList,
  mockAgentCheckpoints,
  type AgentCheckpointFixture,
} from "@/components/__fixtures__/approvals";

const meta: StoryDefault = {
  title: "Pages/AdminAgents",
};
export default meta;

/**
 * Helper component to render agent monitoring cards (mimics actual page)
 */
function AgentMonitoringCards({ agents }: { agents: AgentCheckpointFixture[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No active agents. Agents will appear here once they start processing events.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {agents.map((agent) => (
        <Card key={agent.agentId}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">{agent.agentId}</CardTitle>
                <CardDescription className="font-mono text-xs">{agent.subscriptionId}</CardDescription>
              </div>
              <Badge variant={agent.status === "active" ? "outline" : "secondary"}>{agent.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Events Processed</span>
                <p className="font-medium">{agent.eventsProcessed.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Last Position</span>
                <p className="font-mono font-medium">
                  {agent.lastProcessedPosition === -1 ? "N/A" : agent.lastProcessedPosition}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Last Updated</span>
                <p className="font-medium">{formatRelativeTime(agent.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Admin Agents page - with pending approvals
 */
export const WithPendingApprovals: Story = () => {
  const pendingApprovals = approvalsByStatus.pending;
  const agents = [mockAgentCheckpoints.activeChurnRisk, mockAgentCheckpoints.activeFraudDetection];

  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin - Agent BC</h1>
          <p className="text-muted-foreground">Review agent decisions and monitor agent health</p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Approvals</CardDescription>
              <CardTitle className="text-3xl">{pendingApprovals.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Actions requiring review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Agents</CardDescription>
              <CardTitle className="text-3xl">{agents.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Currently processing events</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Events Processed</CardDescription>
              <CardTitle className="text-3xl">
                {agents.reduce((sum, a) => sum + a.eventsProcessed, 0).toLocaleString()}
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
            <TabsTrigger value="approvals">
              Pending Approvals
              {pendingApprovals.length > 0 && (
                <Badge variant="default" className="ml-2">
                  {pendingApprovals.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            <ApprovalList
              approvals={pendingApprovals}
              onApprovalClick={(id) => console.log("Navigate to:", id)}
              emptyMessage="No pending approvals. All agent actions have been reviewed."
            />
          </TabsContent>

          <TabsContent value="monitoring">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Agents</h2>
              <AgentMonitoringCards agents={agents} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
WithPendingApprovals.meta = {
  description: "Admin agents page with multiple pending approvals requiring review",
};

/**
 * Admin Agents page - empty state (no pending approvals)
 */
export const EmptyApprovals: Story = () => {
  const agents = [mockAgentCheckpoints.activeChurnRisk];

  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin - Agent BC</h1>
          <p className="text-muted-foreground">Review agent decisions and monitor agent health</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Approvals</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Actions requiring review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Agents</CardDescription>
              <CardTitle className="text-3xl">{agents.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Currently processing events</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Events Processed</CardDescription>
              <CardTitle className="text-3xl">
                {agents.reduce((sum, a) => sum + a.eventsProcessed, 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Total across all agents</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="approvals" className="space-y-6">
          <TabsList>
            <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            <ApprovalList
              approvals={[]}
              emptyMessage="No pending approvals. All agent actions have been reviewed."
            />
          </TabsContent>

          <TabsContent value="monitoring">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Agents</h2>
              <AgentMonitoringCards agents={agents} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
EmptyApprovals.meta = {
  description: "Admin agents page with no pending approvals - shows empty state message",
};

/**
 * Admin Agents page - Monitoring tab active
 */
export const MonitoringTab: Story = () => {
  const pendingApprovals = approvalsByStatus.pending;
  const agents = checkpointList;

  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin - Agent BC</h1>
          <p className="text-muted-foreground">Review agent decisions and monitor agent health</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Approvals</CardDescription>
              <CardTitle className="text-3xl">{pendingApprovals.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Actions requiring review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Agents</CardDescription>
              <CardTitle className="text-3xl">{agents.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Currently processing events</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Events Processed</CardDescription>
              <CardTitle className="text-3xl">
                {agents.reduce((sum, a) => sum + a.eventsProcessed, 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Total across all agents</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="monitoring" className="space-y-6">
          <TabsList>
            <TabsTrigger value="approvals">
              Pending Approvals
              {pendingApprovals.length > 0 && (
                <Badge variant="default" className="ml-2">
                  {pendingApprovals.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            <ApprovalList
              approvals={pendingApprovals}
              onApprovalClick={(id) => console.log("Navigate to:", id)}
            />
          </TabsContent>

          <TabsContent value="monitoring">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Agents</h2>
              <AgentMonitoringCards agents={agents} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
MonitoringTab.meta = {
  description: "Admin agents page with Monitoring tab active showing all agent checkpoints",
};

/**
 * Admin Agents page - No active agents
 */
export const NoActiveAgents: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin - Agent BC</h1>
          <p className="text-muted-foreground">Review agent decisions and monitor agent health</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Approvals</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Actions requiring review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Agents</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Currently processing events</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Events Processed</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Total across all agents</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="monitoring" className="space-y-6">
          <TabsList>
            <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            <ApprovalList approvals={[]} emptyMessage="No pending approvals." />
          </TabsContent>

          <TabsContent value="monitoring">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Agents</h2>
              <AgentMonitoringCards agents={[]} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
NoActiveAgents.meta = {
  description: "Admin agents page with no active agents - initial state before any events",
};

/**
 * Admin Agents page - Error state
 */
export const ErrorState: Story = () => {
  return (
    <AppLayout activeNav="agents">
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <h2 className="text-lg font-semibold text-destructive">Failed to Load Agents</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred while loading the agents page.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => console.log("Retry clicked")}>
          Try Again
        </Button>
      </div>
    </AppLayout>
  );
};
ErrorState.meta = {
  description: "Admin agents page error fallback - shown when data loading fails",
};

/**
 * Admin Agents page - Mixed approval statuses (showing history)
 */
export const MixedApprovalStatuses: Story = () => {
  const agents = [mockAgentCheckpoints.activeChurnRisk, mockAgentCheckpoints.activeFraudDetection];

  return (
    <AppLayout activeNav="agents">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin - Agent BC</h1>
          <p className="text-muted-foreground">Review agent decisions and monitor agent health</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Approvals</CardDescription>
              <CardTitle className="text-3xl">{approvalsByStatus.pending.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Actions requiring review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Agents</CardDescription>
              <CardTitle className="text-3xl">{agents.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Currently processing events</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Events Processed</CardDescription>
              <CardTitle className="text-3xl">
                {agents.reduce((sum, a) => sum + a.eventsProcessed, 0).toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Total across all agents</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="approvals" className="space-y-6">
          <TabsList>
            <TabsTrigger value="approvals">
              Pending Approvals
              <Badge variant="default" className="ml-2">
                {approvalsByStatus.pending.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            {/* Show all approvals including history */}
            <ApprovalList
              approvals={approvalList}
              onApprovalClick={(id) => console.log("Navigate to:", id)}
              title="All Approvals (including history)"
            />
          </TabsContent>

          <TabsContent value="monitoring">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Active Agents</h2>
              <AgentMonitoringCards agents={agents} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
MixedApprovalStatuses.meta = {
  description:
    "Admin agents page showing approval history with mixed statuses (pending, approved, rejected, expired)",
};
