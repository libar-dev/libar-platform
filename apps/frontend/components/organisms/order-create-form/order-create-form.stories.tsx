import type { Story, StoryDefault } from "@ladle/react";
import { OrderCreateForm } from "./order-create-form";
import { productList } from "@/components/__fixtures__/products";

const meta: StoryDefault = {
  title: "Organisms/OrderCreateForm",
};
export default meta;

const orderFormProducts = productList.map((p) => ({
  productId: p.productId,
  productName: p.productName,
  sku: p.sku,
  unitPrice: p.unitPrice,
  availableQuantity: p.availableQuantity,
  reservedQuantity: p.reservedQuantity,
}));

export const Default: Story = () => (
  <OrderCreateForm
    products={orderFormProducts}
    onSubmit={async (items) => {
      console.log("Creating order with items:", items);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }}
    onCancel={() => console.log("Cancelled")}
  />
);
Default.meta = {
  description: "Order creation form with product catalog and cart",
};

export const EmptyProducts: Story = () => (
  <OrderCreateForm
    products={[]}
    onSubmit={async (items) => console.log("Creating order:", items)}
    onCancel={() => console.log("Cancelled")}
  />
);
EmptyProducts.meta = {
  description: "Order form when no products are available",
};

export const Submitting: Story = () => (
  <OrderCreateForm
    products={orderFormProducts}
    onSubmit={async (items) => console.log("Creating order:", items)}
    onCancel={() => console.log("Cancelled")}
    isSubmitting
  />
);
Submitting.meta = {
  description: "Order form in submitting state",
};

export const WithoutCancel: Story = () => (
  <OrderCreateForm
    products={orderFormProducts}
    onSubmit={async (items) => {
      console.log("Creating order with items:", items);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }}
  />
);
WithoutCancel.meta = {
  description: "Order form without cancel button",
};
