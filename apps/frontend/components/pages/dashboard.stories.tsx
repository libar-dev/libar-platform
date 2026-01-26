import type { Story, StoryDefault } from "@ladle/react";
import { AppLayout } from "@/components/templates/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const meta: StoryDefault = {
  title: "Pages/Dashboard",
};
export default meta;

/**
 * Dashboard page - main entry point showing stats and quick actions
 */
export const Default: Story = () => (
  <AppLayout activeNav="dashboard">
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to the Order Management System</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">+2 new this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">156</div>
            <p className="text-xs text-muted-foreground">+12 today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">8</div>
            <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button>New Order</Button>
          <Button variant="outline">View Products</Button>
          <Button variant="outline">Manage Stock</Button>
          <Button variant="secondary">Admin Panel</Button>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">Order #ord-abc123 confirmed</p>
                <p className="text-sm text-muted-foreground">2 minutes ago</p>
              </div>
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                Confirmed
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">Stock added: Ergonomic Keyboard (+50)</p>
                <p className="text-sm text-muted-foreground">15 minutes ago</p>
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                Stock
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">New product: USB-C Hub</p>
                <p className="text-sm text-muted-foreground">1 hour ago</p>
              </div>
              <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700">
                Product
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </AppLayout>
);
Default.meta = {
  description: "Dashboard page with stats, quick actions, and recent activity",
};

/**
 * Dashboard with low stock warning
 */
export const WithLowStockWarning: Story = () => (
  <AppLayout activeNav="dashboard">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to the Order Management System</p>
      </div>

      {/* Warning Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <svg
            className="h-5 w-5 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <h3 className="font-medium text-amber-800">Low Stock Alert</h3>
            <p className="text-sm text-amber-700">
              3 products are running low on stock. Consider restocking soon.
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              View Low Stock Items
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">24</div>
            <p className="text-xs text-red-500">3 low stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">156</div>
            <p className="text-xs text-muted-foreground">+12 today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">8</div>
            <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </AppLayout>
);
WithLowStockWarning.meta = {
  description: "Dashboard showing low stock warning banner",
};
