import type { Story, StoryDefault } from "@ladle/react";
import { OrderItemRow } from "./order-item-row";
import { mockOrderItems } from "@/components/__fixtures__/orders";

const meta: StoryDefault = {
  title: "Molecules/OrderItemRow",
};
export default meta;

export const Default: Story = () => (
  <div className="w-[500px] border rounded-lg p-4">
    <OrderItemRow item={mockOrderItems[0]!} readOnly />
  </div>
);
Default.meta = {
  description: "Order item row in read-only mode",
};

export const Editable: Story = () => (
  <div className="w-[500px] border rounded-lg p-4">
    <OrderItemRow
      item={mockOrderItems[0]!}
      onQuantityChange={(qty) => console.log("Quantity:", qty)}
      onRemove={() => console.log("Removed")}
    />
  </div>
);
Editable.meta = {
  description: "Order item row with editable quantity and remove button",
};

export const HighQuantity: Story = () => (
  <div className="w-[500px] border rounded-lg p-4">
    <OrderItemRow
      item={{ ...mockOrderItems[3]!, quantity: 25 }}
      onQuantityChange={(qty) => console.log("Quantity:", qty)}
      onRemove={() => console.log("Removed")}
    />
  </div>
);
HighQuantity.meta = {
  description: "Order item row with high quantity value",
};

export const ReadOnly: Story = () => (
  <div className="w-[500px] border rounded-lg p-4">
    <OrderItemRow item={mockOrderItems[1]!} readOnly />
  </div>
);
ReadOnly.meta = {
  description: "Order item row in explicit read-only mode",
};

export const MultipleItems: Story = () => (
  <div className="w-[500px] border rounded-lg p-4">
    {mockOrderItems.slice(0, 4).map((item) => (
      <OrderItemRow
        key={item.productId}
        item={item}
        onQuantityChange={(qty) => console.log("Quantity:", item.productId, qty)}
        onRemove={() => console.log("Remove:", item.productId)}
      />
    ))}
  </div>
);
MultipleItems.meta = {
  description: "Multiple order item rows in a list",
};
