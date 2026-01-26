import type { Story, StoryDefault } from "@ladle/react";
import { OrderList } from "./order-list";
import { orderList, ordersByStatus } from "@/components/__fixtures__/orders";

const meta: StoryDefault = {
  title: "Organisms/OrderList",
};
export default meta;

export const Default: Story = () => (
  <OrderList orders={orderList} onOrderClick={(id) => console.log("Navigate to:", id)} />
);
Default.meta = {
  description: "Order list with all orders",
};

export const Empty: Story = () => (
  <OrderList orders={[]} onOrderClick={(id) => console.log("Navigate to:", id)} />
);
Empty.meta = {
  description: "Order list with no orders",
};

export const Loading: Story = () => (
  <OrderList orders={undefined} isLoading onOrderClick={(id) => console.log("Navigate to:", id)} />
);
Loading.meta = {
  description: "Order list in loading state with skeleton",
};

export const DraftOrders: Story = () => (
  <OrderList orders={ordersByStatus.draft} onOrderClick={(id) => console.log("Navigate to:", id)} />
);
DraftOrders.meta = {
  description: "Order list filtered to draft orders only",
};

export const SubmittedOrders: Story = () => (
  <OrderList
    orders={ordersByStatus.submitted}
    onOrderClick={(id) => console.log("Navigate to:", id)}
  />
);
SubmittedOrders.meta = {
  description: "Order list filtered to submitted orders only",
};
