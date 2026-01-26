import type { Story, StoryDefault } from "@ladle/react";
import { AppLayout } from "@/components/templates/app-layout";
import { OrderList } from "@/components/organisms/order-list";
import { Button } from "@/components/ui/button";
import { orderList, ordersByStatus } from "@/components/__fixtures__/orders";

const meta: StoryDefault = {
  title: "Pages/Orders",
};
export default meta;

/**
 * Orders page - view all orders
 */
export const Default: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      {/* Page Header with New Order Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">View and manage customer orders</p>
        </div>
        <Button data-testid="new-order-button">New Order</Button>
      </div>

      {/* Order List */}
      <OrderList orders={orderList} onOrderClick={(id) => console.log("Navigate to order:", id)} />
    </div>
  </AppLayout>
);
Default.meta = {
  description: "Orders page with order list and new order button",
};

/**
 * Orders page - filtered to draft orders
 */
export const DraftOrders: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Showing draft orders only</p>
        </div>
        <Button>New Order</Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button className="border-b-2 border-primary px-3 py-1 text-sm font-medium">
          Draft ({ordersByStatus.draft.length})
        </button>
        <button className="px-3 py-1 text-sm text-muted-foreground">
          Submitted ({ordersByStatus.submitted.length})
        </button>
        <button className="px-3 py-1 text-sm text-muted-foreground">
          Confirmed ({ordersByStatus.confirmed.length})
        </button>
        <button className="px-3 py-1 text-sm text-muted-foreground">
          Cancelled ({ordersByStatus.cancelled.length})
        </button>
      </div>

      <OrderList
        orders={ordersByStatus.draft}
        onOrderClick={(id) => console.log("Navigate to order:", id)}
      />
    </div>
  </AppLayout>
);
DraftOrders.meta = {
  description: "Orders page filtered to show only draft orders",
};

/**
 * Orders page - loading state
 */
export const Loading: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">View and manage customer orders</p>
        </div>
        <Button>New Order</Button>
      </div>

      <OrderList orders={undefined} isLoading={true} />
    </div>
  </AppLayout>
);
Loading.meta = {
  description: "Orders page in loading state",
};

/**
 * Orders page - empty state
 */
export const Empty: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">No orders yet</p>
        </div>
        <Button>Create Your First Order</Button>
      </div>

      <OrderList orders={[]} />
    </div>
  </AppLayout>
);
Empty.meta = {
  description: "Orders page with no orders",
};
