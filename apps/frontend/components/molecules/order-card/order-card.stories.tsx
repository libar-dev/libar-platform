import type { Story, StoryDefault } from "@ladle/react";
import { OrderCard } from "./order-card";
import { mockOrders, orderList } from "@/components/__fixtures__/orders";

const meta: StoryDefault = {
  title: "Molecules/OrderCard",
};
export default meta;

export const Draft: Story = () => (
  <div className="w-[350px]">
    <OrderCard order={mockOrders.draft} />
  </div>
);
Draft.meta = {
  description: "Order card in draft status",
};

export const Submitted: Story = () => (
  <div className="w-[350px]">
    <OrderCard order={mockOrders.submitted} />
  </div>
);
Submitted.meta = {
  description: "Order card in submitted status",
};

export const Confirmed: Story = () => (
  <div className="w-[350px]">
    <OrderCard order={mockOrders.confirmed} />
  </div>
);
Confirmed.meta = {
  description: "Order card in confirmed status",
};

export const Cancelled: Story = () => (
  <div className="w-[350px]">
    <OrderCard order={mockOrders.cancelled} />
  </div>
);
Cancelled.meta = {
  description: "Order card in cancelled status",
};

export const Interactive: Story = () => (
  <div className="w-[350px]">
    <OrderCard order={mockOrders.submitted} onClick={(id) => console.log("Navigate to:", id)} />
  </div>
);
Interactive.meta = {
  description: "Order card with click handler (hover to see effect)",
};

export const Variants: Story = () => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {orderList.map((order) => (
      <OrderCard
        key={order.orderId}
        order={order}
        onClick={(id) => console.log("Navigate to:", id)}
      />
    ))}
  </div>
);
Variants.meta = {
  description: "Multiple order cards showing different statuses",
};
